// Volatile in-memory state — all data is wiped on server restart

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

// Single volatile state object
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

export function setConfig(config: BotConfig): void {
  state.config = config;
  state.configured = true;
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
