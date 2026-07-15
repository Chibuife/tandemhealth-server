import { Request, Response } from "express";
import { pool } from "../config/db/index.js";
import redisClient from "../config/redis/index.js";

export const live = (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

export const ready = async (_req: Request, res: Response) => {
  let postgres = "DOWN";

  try {
    await pool.query("SELECT 1");
    postgres = "UP";
  } catch {}

  let redis = "DOWN";

  try {
    await redisClient.ping();
    redis = "UP";
  } catch {}

  const healthy = postgres === "UP" && redis === "UP";

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "UP" : "DOWN",
    services: {
      postgres,
      redis,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};