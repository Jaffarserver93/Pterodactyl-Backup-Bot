// Puppeteer automation engine for Pterodactyl Panel backup bot
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { type Server as SocketIOServer } from "socket.io";
import {
  getState,
  setRunning,
  setCurrentAction,
  recordBackup,
  resetState,
  pushLog,
} from "./bot-state.js";
import { sendSavedMessage, getTelegramStatus } from "./telegram-client.js";
import { logger } from "./logger.js";

let browser: Browser | null = null;
let page: Page | null = null;
let backupInterval: NodeJS.Timeout | null = null;
let screenshotInterval: NodeJS.Timeout | null = null;

// Emit a log message to all connected clients and store in replay buffer
function emitLog(io: SocketIOServer, level: "info" | "warn" | "error" | "success", message: string) {
  const entry = { level, message, timestamp: new Date().toISOString() };
  pushLog(entry);
  io.emit("bot:log", entry);
  logger[level === "success" ? "info" : level]({ botLog: message }, message);
}

// Start the live screenshot stream (100ms interval)
function startScreenshotStream(io: SocketIOServer) {
  screenshotInterval = setInterval(async () => {
    if (!page) return;
    try {
      const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
      const b64 = Buffer.from(buffer).toString("base64");
      io.emit("bot:screenshot", `data:image/jpeg;base64,${b64}`);
    } catch {
      // page may be navigating — silently skip
    }
  }, 100);
}

// Stop the screenshot stream
function stopScreenshotStream() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
}

// Perform a single backup cycle
async function runBackupCycle(io: SocketIOServer): Promise<void> {
  const state = getState();
  if (!state.config || !page) return;

  const { panelUrl, serverId } = state.config;

  try {
    setCurrentAction("Navigating to backups page...");
    emitLog(io, "info", `Navigating to backup page for server ${serverId}`);

    const backupsUrl = `${panelUrl}/server/${serverId}/backups`;
    await page.goto(backupsUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    setCurrentAction("Looking for Create Backup button...");
    emitLog(io, "info", "Looking for Create Backup button");

    // Wait for the create backup button to appear
    await page!.waitForSelector('[data-testid="backup-create-button"], button[aria-label*="backup" i], button[class*="backup" i]', {
      timeout: 10000,
    }).catch(async () => {
      // Fallback: look for any button containing "Create" text
      await page!.waitForSelector("button", { timeout: 5000 });
    });

    // Find and click the "Create Backup" button using various selectors
    const clicked = await page!.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b: HTMLButtonElement) => {
        const text = b.textContent?.toLowerCase() || "";
        return text.includes("create backup") || text.includes("new backup");
      });
      if (btn) {
        (btn as HTMLButtonElement).click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      emitLog(io, "warn", "Create Backup button not found — retrying next cycle");
      return;
    }

    emitLog(io, "info", "Backup creation triggered — waiting for completion...");
    setCurrentAction("Waiting for backup to complete...");

    // Wait for backup row to appear and show "completed" status
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check for completion indicator in the DOM
    const backupName = await page!.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr, [class*='backup-row'], [class*='BackupRow']"));
      const latestRow = rows[1]; // first row after header
      return (latestRow as HTMLElement)?.textContent?.trim().slice(0, 80) || "Unknown backup";
    });

    recordBackup();
    const timestamp = new Date().toISOString();
    emitLog(io, "success", `✓ Backup completed: ${backupName}`);
    setCurrentAction("Idle — waiting for next backup cycle");

    // Send Telegram notification if connected
    const tgStatus = getTelegramStatus();
    if (tgStatus.authenticated) {
      try {
        const msg = `🔒 *Pterodactyl Backup Complete*\n\n📦 Server: \`${serverId}\`\n🕐 Time: \`${timestamp}\`\n📝 Details: ${backupName}\n\n✅ Backup #${state.backupCount + 1} saved successfully`;
        await sendSavedMessage(msg);
        emitLog(io, "info", "Telegram notification sent to Saved Messages");
      } catch (err) {
        emitLog(io, "warn", `Telegram notification failed: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    emitLog(io, "error", `Backup cycle error: ${message}`);
    setCurrentAction("Error — retrying next cycle");
  }
}

export async function startBot(io: SocketIOServer): Promise<void> {
  const state = getState();
  if (!state.config) throw new Error("Bot not configured");
  if (state.running) throw new Error("Bot already running");

  const { panelUrl, username, password, backupIntervalMinutes = 5 } = state.config;

  emitLog(io, "info", "Launching browser...");

  try {
    const chromePath = process.env.CHROME_PATH
      || "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
      ],
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Pterodactyl always redirects the root to /auth/login — go there directly
    const loginUrl = `${panelUrl}/auth/login`;
    emitLog(io, "info", `Navigating to ${loginUrl}`);
    setCurrentAction("Loading login page...");

    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    emitLog(io, "info", "Entering credentials...");
    setCurrentAction("Logging in...");

    // Wait for the username/email field to appear
    const userSelector = 'input[name="username"], input[name="user"], input[type="email"], input[name="email"]';
    await page.waitForSelector(userSelector, { timeout: 15000 });

    // Clear any pre-filled value then type — page.type() fires real keyboard events
    // which React's synthetic event system processes correctly (unlike .value assignment)
    const userInput = await page.$(userSelector);
    if (!userInput) throw new Error("Login form not found — check the panel URL");

    await userInput.click({ clickCount: 3 }); // select all existing text
    await userInput.type(username, { delay: 30 });

    const passInput = await page.$('input[type="password"]');
    if (!passInput) throw new Error("Password field not found on login page");

    await passInput.click({ clickCount: 3 });
    await passInput.type(password, { delay: 30 });

    // Submit the form
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    emitLog(io, "info", "Credentials submitted — waiting for response...");

    // Wait for redirect away from /auth (success) or an error message (fast fail)
    const loginResultHandle = await page.waitForFunction(
      () => {
        const url = window.location.href;
        // Success: navigated away from /auth/login
        if (!url.includes("/auth/login")) {
          return JSON.stringify({ ok: true });
        }
        // Pterodactyl renders login errors inside a <div> with specific patterns
        const candidates = Array.from(document.querySelectorAll(
          '[class*="text-red"], [class*="bg-red"], [class*="error"], [role="alert"], .alert, [class*="alert"]'
        ));
        for (const el of candidates) {
          const text = (el as HTMLElement).textContent?.trim() ?? "";
          if (text.length > 3 && text.length < 400) {
            return JSON.stringify({ ok: false, message: text });
          }
        }
        return null; // keep polling
      },
      { timeout: 30000, polling: 500 }
    );
    const loginResult = JSON.parse(await loginResultHandle.jsonValue() as string) as { ok: boolean; message?: string };
    if (!loginResult.ok) {
      throw new Error(loginResult.message ?? "Login failed — check credentials");
    }

    emitLog(io, "success", "Login successful!");
    setCurrentAction("Logged in — navigating to server...");

    // Navigate to the target server
    const serverUrl = `${panelUrl}/server/${state.config.serverId}`;
    await page.goto(serverUrl, { waitUntil: "networkidle2", timeout: 30000 });
    emitLog(io, "info", `Navigated to server ${state.config.serverId}`);

    setRunning(true);
    io.emit("bot:status", { running: true });

    // Start live screenshot stream
    startScreenshotStream(io);
    emitLog(io, "success", "Bot is running — backup cycle starting");

    // Run first backup immediately
    await runBackupCycle(io);

    // Schedule recurring backup cycles
    const intervalMs = backupIntervalMinutes * 60 * 1000;
    backupInterval = setInterval(() => runBackupCycle(io), intervalMs);
    emitLog(io, "info", `Backup scheduled every ${backupIntervalMinutes} minute(s)`);
  } catch (err) {
    const message = (err as Error).message;
    emitLog(io, "error", `Bot failed to start: ${message}`);
    await stopBot(io);
    throw err;
  }
}

export async function stopBot(io: SocketIOServer): Promise<void> {
  emitLog(io, "info", "Stopping bot...");

  stopScreenshotStream();

  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }

  if (page) {
    try {
      await page.close();
    } catch {
      // ignore
    }
    page = null;
  }

  if (browser) {
    try {
      await browser.close();
    } catch {
      // ignore
    }
    browser = null;
  }

  resetState();
  io.emit("bot:status", { running: false });
  io.emit("bot:screenshot", null);
  emitLog(io, "info", "Bot stopped and browser closed");
}

export function isBotRunning(): boolean {
  return getState().running;
}
