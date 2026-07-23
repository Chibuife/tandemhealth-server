import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger.js";

const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not configured.");
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    logger.warn("Missing bearer token", { path: req.path });
    return res.status(401).json({ message: "Unauthorized: Missing bearer token" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    logger.warn("Malformed bearer token", { path: req.path });
    return res.status(401).json({ message: "Unauthorized: Invalid bearer token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id?: string;
      email?: string;
    };

    if (!decoded.id || !decoded.email) {
      logger.warn("Token missing required claims", { path: req.path });
      return res.status(403).json({ message: "Forbidden: Invalid token" });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
    };

    logger.info("Authenticated request", { userId: req.user.id, path: req.path });
    return next();
  } catch (error) {
    logger.warn("Invalid or expired token", { path: req.path });
    return res.status(403).json({ message: "Forbidden: Invalid token" });
  }
};