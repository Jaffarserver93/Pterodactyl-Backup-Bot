// Socket.io singleton — initialized once in index.ts
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer;

export function setIo(instance: SocketIOServer): void {
  io = instance;
}

export function getIo(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
