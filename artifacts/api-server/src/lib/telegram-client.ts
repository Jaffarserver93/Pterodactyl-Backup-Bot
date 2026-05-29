// Volatile in-memory Telegram MTProto client via GramJS
// All session data is stored in RAM only — cleared on server restart

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { logger } from "./logger.js";

interface TelegramState {
  client: TelegramClient | null;
  connected: boolean;
  authenticated: boolean;
  awaitingOtp: boolean;
  phoneNumber: string | null;
  apiId: number | null;
  apiHash: string | null;
  // Resolver function for the OTP code challenge
  otpResolver: ((code: string) => void) | null;
  otpRejector: ((err: Error) => void) | null;
}

// Volatile in-memory state — wiped on server restart
let telegramState: TelegramState = {
  client: null,
  connected: false,
  authenticated: false,
  awaitingOtp: false,
  phoneNumber: null,
  apiId: null,
  apiHash: null,
  otpResolver: null,
  otpRejector: null,
};

export function getTelegramStatus() {
  return {
    connected: telegramState.connected,
    authenticated: telegramState.authenticated,
    awaitingOtp: telegramState.awaitingOtp,
    phoneNumber: telegramState.phoneNumber,
  };
}

export async function initTelegramClient(
  apiId: number,
  apiHash: string,
  phoneNumber: string,
  onOtpRequired: () => void
): Promise<void> {
  // Clean up any existing client
  if (telegramState.client) {
    try {
      await telegramState.client.disconnect();
    } catch {
      // ignore errors during cleanup
    }
  }

  // Use a fresh in-memory session every time (volatile)
  const session = new StringSession("");

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  telegramState = {
    client,
    connected: false,
    authenticated: false,
    awaitingOtp: false,
    phoneNumber,
    apiId,
    apiHash,
    otpResolver: null,
    otpRejector: null,
  };

  logger.info({ phoneNumber }, "Connecting Telegram client");

  await client.connect();
  telegramState.connected = true;

  // Start authentication flow — this triggers OTP
  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => {
      throw new Error("2FA password not supported in this flow");
    },
    phoneCode: async () => {
      // Signal UI that OTP is needed
      telegramState.awaitingOtp = true;
      onOtpRequired();

      // Wait for OTP to be submitted via verifyOtp()
      return new Promise<string>((resolve, reject) => {
        telegramState.otpResolver = resolve;
        telegramState.otpRejector = reject;
      });
    },
    onError: (err) => {
      logger.error({ err }, "Telegram auth error");
    },
  });

  telegramState.authenticated = true;
  telegramState.awaitingOtp = false;
  telegramState.otpResolver = null;
  telegramState.otpRejector = null;

  logger.info("Telegram client authenticated successfully");
}

export function submitOtp(code: string): void {
  if (!telegramState.otpResolver) {
    throw new Error("No pending OTP challenge");
  }
  telegramState.otpResolver(code);
}

export async function sendSavedMessage(text: string): Promise<void> {
  const { client, authenticated } = telegramState;
  if (!client || !authenticated) {
    throw new Error("Telegram client not authenticated");
  }
  // Send to "Saved Messages" using InputPeerSelf
  await client.sendMessage("me", { message: text });
  logger.info("Telegram message sent to Saved Messages");
}

export async function disconnectTelegram(): Promise<void> {
  if (telegramState.client) {
    try {
      await telegramState.client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
  // Wipe all state from memory
  telegramState = {
    client: null,
    connected: false,
    authenticated: false,
    awaitingOtp: false,
    phoneNumber: null,
    apiId: null,
    apiHash: null,
    otpResolver: null,
    otpRejector: null,
  };
  logger.info("Telegram session wiped from memory");
}
