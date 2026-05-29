import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";

export type LogEntry = {
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp: string;
};

const LS_KEY = "pterobot:logs";
const MAX_LOGS = 200;

function loadLogsFromStorage(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

function saveLogsToStorage(logs: LogEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(logs));
  } catch {
    // storage quota exceeded — clear and retry once
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }
}

function mergeLogs(existing: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  // Deduplicate by timestamp+message, keep chronological order
  const seen = new Set(existing.map((e) => `${e.timestamp}|${e.message}`));
  const merged = [...existing];
  for (const entry of incoming) {
    const key = `${entry.timestamp}|${entry.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }
  merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
}

export function useSocketEvents() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>(() => loadLogsFromStorage());
  const [otpRequired, setOtpRequired] = useState<{ phoneNumber: string } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Keep a ref so event handlers always write the latest logs to storage
  const logsRef = useRef<LogEntry[]>(logs);
  useEffect(() => {
    logsRef.current = logs;
    saveLogsToStorage(logs);
  }, [logs]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onScreenshot = (b64: string | null) => {
      setScreenshot(b64);
    };

    // Single new log entry arriving live
    const onLog = (entry: LogEntry) => {
      setLogs((prev) => {
        const merged = mergeLogs(prev, [entry]);
        return merged;
      });
    };

    // Full history replayed on (re)connect — merge with what we already have
    const onLogHistory = (history: LogEntry[]) => {
      setLogs((prev) => mergeLogs(prev, history));
    };

    const onOtpRequired = (data: { phoneNumber: string }) => {
      setOtpRequired(data);
    };

    const onTelegramError = (data: { message: string }) => {
      console.error("Telegram error from socket", data);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bot:screenshot", onScreenshot);
    socket.on("bot:log", onLog);
    socket.on("bot:log_history", onLogHistory);
    socket.on("telegram:otp_required", onOtpRequired);
    socket.on("telegram:error", onTelegramError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("bot:screenshot", onScreenshot);
      socket.off("bot:log", onLog);
      socket.off("bot:log_history", onLogHistory);
      socket.off("telegram:otp_required", onOtpRequired);
      socket.off("telegram:error", onTelegramError);
    };
  }, []);

  const clearOtpRequired = useCallback(() => setOtpRequired(null), []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    localStorage.removeItem(LS_KEY);
  }, []);

  return { screenshot, logs, otpRequired, socketConnected, clearOtpRequired, clearLogs };
}
