// Puppeteer automation engine for Pterodactyl Panel backup bot
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { type Server as SocketIOServer } from "socket.io";
import {
  getState,
  setRunning,
  setCurrentAction,
  recordBackup,
  resetState,
} from "./bot-state.js";
import { sendSavedMessage, getTelegramStatus } from "./telegram-client.js";
import { logger } from "./logger.js";

let browser: Browser | null = null;
let page: Page | null = null;
let backupInterval: NodeJS.Timeout | null = null;
let screenshotInterval: NodeJS.Timeout | null = null;

// Emit a log message to all connected clients
function emitLog(io: SocketIOServer, level: "info" | "warn" | "error" | "success", message: string) {
  const entry = { level, message, timestamp: new Date().toISOString() };
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
    await page.goto(backupsUrl, { waitUntil: "networkidle2", timeout: 30000 });

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
    const chromePath = "/home/runner/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome";
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

    emitLog(io, "info", `Navigating to ${panelUrl}`);
    setCurrentAction("Loading panel...");

    // Navigate to login page
    await page.goto(panelUrl, { waitUntil: "networkidle2", timeout: 30000 });

    emitLog(io, "info", "Entering credentials...");
    setCurrentAction("Logging in...");

    // Fill in login form via DOM manipulation
    await page.waitForSelector('input[type="email"], input[name="user"], input[name="username"], input[name="email"]', {
      timeout: 15000,
    });

    await page.evaluate((u: string, p: string) => {
      const emailInput = document.querySelector<HTMLInputElement>(
        'input[type="email"], input[name="user"], input[name="username"], input[name="email"]'
      );
      const passInput = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (emailInput) {
        emailInput.focus();
        emailInput.value = u;
        emailInput.dispatchEvent(new Event("input", { bubbles: true }));
        emailInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (passInput) {
        passInput.focus();
        passInput.value = p;
        passInput.dispatchEvent(new Event("input", { bubbles: true }));
        passInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, username, password);

    // Click submit button
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Wait for login to complete (URL should change away from /auth)
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

    const currentUrl = page.url();
    if (currentUrl.includes("auth") || currentUrl.includes("login")) {
      throw new Error("Login failed — check credentials");
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
