import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import botRouter from "./bot.js";
import telegramRouter from "./telegram.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(telegramRouter);

export default router;
