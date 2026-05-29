import { Router, type IRouter } from "express";
import { getIo } from "../socket.js";
import { setConfig, getState, getUptime } from "../lib/bot-state.js";
import { startBot, stopBot, isBotRunning } from "../lib/puppeteer-engine.js";
import {
  SaveConfigBody,
  GetBotStatusResponse,
  SaveConfigResponse,
  StartBotResponse,
  StopBotResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /bot/config — return saved config (password omitted)
router.get("/bot/config", async (_req, res): Promise<void> => {
  const state = getState();
  if (!state.config) {
    res.json({ config: null });
    return;
  }
  res.json({
    config: {
      panelUrl: state.config.panelUrl,
      username: state.config.username,
      serverId: state.config.serverId,
      backupIntervalMinutes: state.config.backupIntervalMinutes,
    },
  });
});

// POST /bot/config — save config to DB + memory
router.post("/bot/config", async (req, res): Promise<void> => {
  const parsed = SaveConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    await setConfig({
      panelUrl: parsed.data.panelUrl.replace(/\/$/, ""),
      username: parsed.data.username,
      password: parsed.data.password,
      serverId: parsed.data.serverId,
      backupIntervalMinutes: parsed.data.backupIntervalMinutes ?? 5,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to persist config to DB");
    res.status(500).json({ error: "Failed to save configuration" });
    return;
  }

  req.log.info("Bot config saved to DB");
  res.json(SaveConfigResponse.parse({ success: true, message: "Configuration saved" }));
});

// POST /bot/start — launch Puppeteer automation
router.post("/bot/start", async (req, res): Promise<void> => {
  if (isBotRunning()) {
    res.status(400).json({ error: "Bot is already running" });
    return;
  }

  const state = getState();
  if (!state.configured || !state.config) {
    res.status(400).json({ error: "Bot not configured — save config first" });
    return;
  }

  const io = getIo();

  // Acknowledge immediately; startup happens async
  res.json(StartBotResponse.parse({ success: true, message: "Bot is starting..." }));

  // Start in background so response is not blocked
  startBot(io).catch((err) => {
    req.log.error({ err }, "Failed to start bot");
  });
});

// POST /bot/stop — stop Puppeteer and close browser
router.post("/bot/stop", async (req, res): Promise<void> => {
  if (!isBotRunning()) {
    res.status(400).json({ error: "Bot is not running" });
    return;
  }

  const io = getIo();
  res.json(StopBotResponse.parse({ success: true, message: "Bot is stopping..." }));

  stopBot(io).catch((err) => {
    req.log.error({ err }, "Error stopping bot");
  });
});

// GET /bot/status
router.get("/bot/status", async (_req, res): Promise<void> => {
  const state = getState();
  res.json(
    GetBotStatusResponse.parse({
      running: state.running,
      configured: state.configured,
      lastBackupAt: state.lastBackupAt,
      backupCount: state.backupCount,
      currentAction: state.currentAction,
      uptime: getUptime(),
    })
  );
});

export default router;
