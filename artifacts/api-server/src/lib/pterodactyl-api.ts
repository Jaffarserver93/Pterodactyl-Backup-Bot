// Pterodactyl Client API engine — no browser, no CAPTCHA
import { type Server as SocketIOServer } from "socket.io";
import {
  getState,
  setRunning,
  setCurrentAction,
  recordBackup,
  resetState,
  pushLog,
  type BotConfig,
} from "./bot-state.js";
import { sendBackupFile, sendSavedMessage, getTelegramStatus } from "./telegram-client.js";
import { logger } from "./logger.js";
import { createWriteStream, unlink } from "node:fs";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let backupInterval: NodeJS.Timeout | null = null;
let _running = false;

function emitLog(
  io: SocketIOServer,
  level: "info" | "warn" | "error" | "success",
  message: string,
) {
  const entry = { level, message, timestamp: new Date().toISOString() };
  pushLog(entry);
  io.emit("bot:log", entry);
  logger[level === "success" ? "info" : level]({ botLog: message }, message);
}

async function pteroFetch<T = unknown>(
  panelUrl: string,
  apiKey: string,
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const url = `${panelUrl}/api/client${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { errors?: { detail?: string }[] };
      detail = json.errors?.[0]?.detail ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(`Pterodactyl API ${method} ${path} → ${res.status}: ${detail}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

interface PteroBackup {
  attributes: {
    uuid: string;
    name: string;
    is_successful: boolean;
    is_locked: boolean;
    completed_at: string | null;
    bytes: number;
  };
}

const TELEGRAM_MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (regular account limit)

interface PteroBackupList {
  data: PteroBackup[];
  meta: { pagination: { total: number } };
}

async function runBackupCycle(
  io: SocketIOServer,
  config: BotConfig,
): Promise<void> {
  const { panelUrl, apiKey, serverId } = config;

  try {
    setCurrentAction("Creating backup...");
    emitLog(io, "info", "Creating backup via Pterodactyl API...");

    // Attempt to create backup; if at limit, delete oldest unlocked and retry once
    let createAttempt = 0;
    const tryCreate = async (): Promise<PteroBackup> => {
      try {
        return await pteroFetch<PteroBackup>(
          panelUrl,
          apiKey,
          `/servers/${serverId}/backups`,
          "POST",
          {},
        );
      } catch (err) {
        const msg = (err as Error).message;
        const atLimit = msg.includes("reached its limit") || msg.includes("limit of");
        if (atLimit && createAttempt === 0) {
          createAttempt++;
          emitLog(io, "info", "At backup limit — removing oldest unlocked backup...");
          const list = await pteroFetch<PteroBackupList>(
            panelUrl,
            apiKey,
            `/servers/${serverId}/backups`,
          );
          const unlocked = list.data.filter((b) => !b.attributes.is_locked);
          if (unlocked.length === 0) throw new Error("At backup limit but all backups are locked — cannot delete any");
          const oldest = unlocked[unlocked.length - 1];
          emitLog(io, "info", `Deleted: ${oldest.attributes.name}`);
          await pteroFetch(panelUrl, apiKey, `/servers/${serverId}/backups/${oldest.attributes.uuid}`, "DELETE");
          return tryCreate();
        }
        throw err;
      }
    };

    const created = await tryCreate();

    const backupName = created.attributes.name;
    const backupUuid = created.attributes.uuid;

    emitLog(io, "info", `Backup started: ${backupName} (${backupUuid.slice(0, 8)}...)`);
    setCurrentAction("Waiting for backup to complete...");

    // Poll until backup is completed (max 10 minutes)
    const startedAt = Date.now();
    const timeoutMs = 10 * 60 * 1000;
    let completed = false;

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((r) => setTimeout(r, 5000));

      const detail = await pteroFetch<PteroBackup>(
        panelUrl,
        apiKey,
        `/servers/${serverId}/backups/${backupUuid}`,
      );

      if (detail.attributes.completed_at !== null) {
        completed = true;
        if (!detail.attributes.is_successful) {
          throw new Error(`Backup ${backupName} completed but was not successful`);
        }
        break;
      }
    }

    if (!completed) {
      emitLog(io, "warn", `Backup ${backupName} still in progress after 10 min — will check next cycle`);
      return;
    }

    recordBackup();
    const state = getState();
    const timestamp = new Date().toISOString();
    emitLog(io, "success", `Backup complete: ${backupName}`);
    setCurrentAction("Uploading backup to Telegram...");

    // Send backup to Telegram Saved Messages (file upload or text fallback)
    const tgStatus = getTelegramStatus();
    if (tgStatus.authenticated) {
      // Re-fetch backup detail to get the final size (bytes is set once complete)
      const finalDetail = await pteroFetch<PteroBackup>(
        panelUrl,
        apiKey,
        `/servers/${serverId}/backups/${backupUuid}`,
      );
      const backupBytes = finalDetail.attributes.bytes ?? 0;
      const backupSizeMb = (backupBytes / 1024 / 1024).toFixed(1);

      const caption =
        `Pterodactyl Backup #${state.backupCount}\n` +
        `Server: ${serverId}\n` +
        `Name: ${backupName}\n` +
        `Size: ${backupSizeMb} MB\n` +
        `Time: ${timestamp}`;

      if (backupBytes > 0 && backupBytes <= TELEGRAM_MAX_BYTES) {
        // File is within Telegram's 2 GB limit — download and upload
        const tmpFile = join(tmpdir(), `pterobot-${backupUuid}.tar.gz`);
        try {
          emitLog(io, "info", `Backup size: ${backupSizeMb} MB — downloading for Telegram upload...`);

          const dlData = await pteroFetch<{ attributes: { url: string } }>(
            panelUrl,
            apiKey,
            `/servers/${serverId}/backups/${backupUuid}/download`,
          );
          const downloadUrl = dlData.attributes.url;

          const dlRes = await fetch(downloadUrl);
          if (!dlRes.ok || !dlRes.body) {
            throw new Error(`Download failed: ${dlRes.status} ${dlRes.statusText}`);
          }
          const fileStream = createWriteStream(tmpFile);
          await pipeline(dlRes.body as unknown as NodeJS.ReadableStream, fileStream);
          emitLog(io, "info", "Download complete — uploading to Telegram...");

          await sendBackupFile(tmpFile, caption);
          emitLog(io, "success", "Backup file uploaded to Telegram Saved Messages");
        } catch (err) {
          emitLog(io, "warn", `Telegram upload failed: ${(err as Error).message}`);
        } finally {
          unlink(tmpFile, () => {});
        }
      } else {
        // File is too large (>2 GB) or size unknown — send a text notification instead
        const sizeNote = backupBytes > TELEGRAM_MAX_BYTES
          ? `File too large to upload via Telegram (${backupSizeMb} MB > 2048 MB limit). Download it from your panel manually.`
          : `Backup complete — file size unavailable. Download it from your panel manually.`;
        const msg =
          `Pterodactyl Backup #${state.backupCount} — Complete\n\n` +
          `Server: ${serverId}\n` +
          `Name: ${backupName}\n` +
          `Size: ${backupSizeMb} MB\n` +
          `Time: ${timestamp}\n\n` +
          sizeNote;
        try {
          await sendSavedMessage(msg);
          emitLog(io, "info", `Telegram text notification sent (backup too large to upload: ${backupSizeMb} MB)`);
        } catch (err) {
          emitLog(io, "warn", `Telegram notification failed: ${(err as Error).message}`);
        }
      }
    }

    setCurrentAction("Idle — waiting for next backup cycle");
  } catch (err) {
    const message = (err as Error).message;
    emitLog(io, "error", `Backup cycle error: ${message}`);
    setCurrentAction("Error — retrying next cycle");
  }
}

export async function startBot(io: SocketIOServer): Promise<void> {
  const state = getState();
  if (!state.config) throw new Error("Bot not configured");
  if (_running) throw new Error("Bot already running");

  const config = state.config;
  const { panelUrl, apiKey, serverId, backupIntervalMinutes = 5 } = config;

  emitLog(io, "info", "Connecting to Pterodactyl API...");
  setCurrentAction("Verifying API credentials...");

  // Verify credentials by fetching server info
  try {
    await pteroFetch(panelUrl, apiKey, `/servers/${serverId}`);
  } catch (err) {
    const message = (err as Error).message;
    emitLog(io, "error", `Failed to connect: ${message}`);
    throw new Error(message);
  }

  emitLog(io, "success", `Connected to server ${serverId}`);
  setCurrentAction("Running...");
  setRunning(true);
  _running = true;
  io.emit("bot:status", { running: true });

  emitLog(io, "success", "Bot is running — starting first backup cycle");

  // Run first backup immediately
  await runBackupCycle(io, config);

  // Schedule recurring cycles
  const intervalMs = backupIntervalMinutes * 60 * 1000;
  backupInterval = setInterval(() => runBackupCycle(io, config), intervalMs);
  emitLog(io, "info", `Next backup in ${backupIntervalMinutes} minute(s)`);
}

export async function stopBot(io: SocketIOServer): Promise<void> {
  emitLog(io, "info", "Stopping bot...");

  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }

  _running = false;
  resetState();
  io.emit("bot:status", { running: false });
  io.emit("bot:screenshot", null);
  emitLog(io, "info", "Bot stopped");
}

export function isBotRunning(): boolean {
  return _running;
}
