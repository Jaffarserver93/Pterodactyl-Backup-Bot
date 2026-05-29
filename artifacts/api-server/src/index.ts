import http from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app.js";
import { setIo } from "./socket.js";
import { logger } from "./lib/logger.js";
import { getLogBuffer, loadConfigFromDb } from "./lib/bot-state.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create HTTP server so Socket.io can share the same port
const httpServer = http.createServer(app);

// Socket.io setup — allows connections from the Vite dev proxy
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

setIo(io);

io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "WebSocket client connected");
  // Replay buffered logs so the client can restore its terminal on reconnect
  const history = getLogBuffer();
  if (history.length > 0) {
    socket.emit("bot:log_history", history);
  }
  socket.on("disconnect", () => {
    logger.info({ socketId: socket.id }, "WebSocket client disconnected");
  });
});

httpServer.listen(port, async () => {
  logger.info({ port }, "Server listening");
  await loadConfigFromDb();
  logger.info("Config loaded from DB");
});
