import { Router, type IRouter } from "express";
import { getIo } from "../socket.js";
import {
  initTelegramClient,
  submitOtp,
  getTelegramStatus,
  disconnectTelegram,
} from "../lib/telegram-client.js";
import {
  InitTelegramBody,
  InitTelegramResponse,
  VerifyTelegramOtpBody,
  VerifyTelegramOtpResponse,
  GetTelegramStatusResponse,
  DisconnectTelegramResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// POST /telegram/init — start MTProto auth flow
router.post("/telegram/init", async (req, res): Promise<void> => {
  const parsed = InitTelegramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { apiId, apiHash, phoneNumber } = parsed.data;
  const io = getIo();

  res.json(InitTelegramResponse.parse({ success: true, message: "Connecting to Telegram..." }));

  // Run auth flow in background; OTP prompt will emit a socket event
  initTelegramClient(apiId, apiHash, phoneNumber, () => {
    io.emit("telegram:otp_required", { phoneNumber });
    req.log.info("Telegram OTP required — notifying client");
  }).catch((err) => {
    io.emit("telegram:error", { message: (err as Error).message });
    req.log.error({ err }, "Telegram init error");
  });
});

// POST /telegram/verify — submit OTP code
router.post("/telegram/verify", async (req, res): Promise<void> => {
  const parsed = VerifyTelegramOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    submitOtp(parsed.data.code);
    res.json(VerifyTelegramOtpResponse.parse({ success: true, message: "OTP submitted" }));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /telegram/status
router.get("/telegram/status", async (_req, res): Promise<void> => {
  res.json(GetTelegramStatusResponse.parse(getTelegramStatus()));
});

// POST /telegram/disconnect — wipe session from memory
router.post("/telegram/disconnect", async (req, res): Promise<void> => {
  await disconnectTelegram();
  req.log.info("Telegram disconnected and session wiped");
  res.json(DisconnectTelegramResponse.parse({ success: true, message: "Telegram session wiped from memory" }));
});

export default router;
