// Bot state — running/status is volatile; config is persisted to PostgreSQL

import { db } from "./db.js";
import { botConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export interface LogEntry {
  level: "info" | "warn" | "error" | "success";
  message: string;
  timestamp: string;
}

const LOG_BUFFER_MAX = 200;
const logBuffer: LogEntry[] = [];

export function pushLog(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
}

export function getLogBuffer(): readonly LogEntry[] {
  return logBuffer;
}

export interface BotConfig {
  panelUrl: string;
  username: string;
  password: string;
  serverId: string;
  backupIntervalMinutes: number;
}

export interface BotStateData {
  running: boolean;
  configured: boolean;
  config: BotConfig | null;
  lastBackupAt: string | null;
  backupCount: number;
  currentAction: string | null;
  startedAt: number | null;
}

// Single volatile state object (running/stats only — config is loaded from DB)
let state: BotStateData = {
  running: false,
  configured: false,
  config: null,
  lastBackupAt: null,
  backupCount: 0,
  currentAction: null,
  startedAt: null,
};

export function getState(): Readonly<BotStateData> {
  return state;
}

/** Load saved config from DB into memory on startup */
export async function loadConfigFromDb(): Promise<void> {
  try {
    const rows = await db.select().from(botConfigTable).where(eq(botConfigTable.id, 1));
    if (rows.length > 0) {
      const row = rows[0];
      state.config = {
        panelUrl: row.panelUrl,
        username: row.username,
        password: row.password,
        serverId: row.serverId,
        backupIntervalMinutes: row.backupIntervalMinutes,
      };
      state.configured = true;
    }
  } catch (err) {
    // Non-fatal — continue with no config
    console.error("Failed to load config from DB:", err);
  }
}

/** Save config to both memory and DB */
export async function setConfig(config: BotConfig): Promise<void> {
  state.config = config;
  state.configured = true;

  await db
    .insert(botConfigTable)
    .values({
      id: 1,
      panelUrl: config.panelUrl,
      username: config.username,
      password: config.password,
      serverId: config.serverId,
      backupIntervalMinutes: config.backupIntervalMinutes,
    })
    .onConflictDoUpdate({
      target: botConfigTable.id,
      set: {
        panelUrl: config.panelUrl,
        username: config.username,
        password: config.password,
        serverId: config.serverId,
        backupIntervalMinutes: config.backupIntervalMinutes,
      },
    });
}

export function setRunning(running: boolean): void {
  state.running = running;
  state.startedAt = running ? Date.now() : null;
}

export function setCurrentAction(action: string | null): void {
  state.currentAction = action;
}

export function recordBackup(): void {
  state.lastBackupAt = new Date().toISOString();
  state.backupCount += 1;
}

export function getUptime(): number | null {
  if (!state.startedAt) return null;
  return Math.floor((Date.now() - state.startedAt) / 1000);
}

export function resetState(): void {
  state = {
    running: false,
    configured: !!state.config,
    config: state.config,
    lastBackupAt: null,
    backupCount: 0,
    currentAction: null,
    startedAt: null,
  };
}
