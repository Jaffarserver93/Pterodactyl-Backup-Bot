import { useEffect, useState, useCallback, useRef } from "react";
import { getSocket } from "@/lib/socket";

export type LogEntry = {
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  timestamp: string;
};

export function useSocketEvents() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [otpRequired, setOtpRequired] = useState<{ phoneNumber: string } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onScreenshot = (b64: string | null) => {
      setScreenshot(b64);
    };

    const onLog = (entry: LogEntry) => {
      setLogs((prev) => {
        const newLogs = [...prev, entry];
        if (newLogs.length > 50) {
          return newLogs.slice(newLogs.length - 50);
        }
        return newLogs;
      });
    };

    const onOtpRequired = (data: { phoneNumber: string }) => {
      setOtpRequired(data);
    };

    const onTelegramError = (data: { message: string }) => {
      // Could show toast here or handle locally
      console.error("Telegram error from socket", data);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bot:screenshot", onScreenshot);
    socket.on("bot:log", onLog);
    socket.on("telegram:otp_required", onOtpRequired);
    socket.on("telegram:error", onTelegramError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("bot:screenshot", onScreenshot);
      socket.off("bot:log", onLog);
      socket.off("telegram:otp_required", onOtpRequired);
      socket.off("telegram:error", onTelegramError);
    };
  }, []);

  const clearOtpRequired = useCallback(() => setOtpRequired(null), []);

  return { screenshot, logs, otpRequired, socketConnected, clearOtpRequired };
}
