import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger.js";
import { registerPresenceHandlers } from "./presenceHandlers.js";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? "*",
      credentials: true,
    },
  });

  // Auth middleware: client connects with `auth: { token: accessToken }`
  // (the same JWT access token used for regular API requests).
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    try {
      const payload = jwt.verify(token, process.env.ACCESS_SECRET!) as {
        id: string;
        email: string;
      };

      socket.userId = payload.id;
      socket.userEmail = payload.email;

      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`Socket connected: ${socket.userEmail} (${socket.id})`);

    // Personal room - lets us push events to a specific user by id
    // (e.g. "you're receiving a call") without tracking socket ids manually.
    socket.join(`user:${socket.userId}`);

    registerPresenceHandlers(io!, socket);

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.userEmail} (${socket.id})`);
    });
  });

  return io;
};

export const getSocketServer = (): SocketIOServer => {
  if (!io) {
    throw new Error("Socket.IO server has not been initialized yet");
  }

  return io;
};