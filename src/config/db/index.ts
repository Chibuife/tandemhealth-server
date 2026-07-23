import dotenv from "dotenv";
import { Pool } from "pg";
import { logger } from "../../utils/logger.js";

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  throw new Error("PostgreSQL environment variables are not configured.");
}

export const pool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT ?? 5432),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,

  // Pool configuration
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  // Optional
  allowExitOnIdle: false,
    ssl: {
    rejectUnauthorized: false,
  },
});

// Prevent registering listeners multiple times
let listenersRegistered = false;

const registerPoolListeners = () => {
  if (listenersRegistered) return;

  listenersRegistered = true;

  pool.on("connect", () => {
    logger.info("New PostgreSQL client connected");
  });

  pool.on("acquire", () => {
    logger.debug("PostgreSQL client acquired from pool");
  });

  pool.on("remove", () => {
    logger.info("PostgreSQL client removed from pool");
  });

  pool.on("error", (error) => {
    logger.error("Unexpected PostgreSQL pool error", error);
  });
};

let connected = false;

export const connectToDatabase = async () => {
  registerPoolListeners();

  if (connected) {
    logger.debug("PostgreSQL already connected");
    return pool;
  }

  try {
    const client = await pool.connect();

    await client.query("SELECT 1");

    client.release();

    connected = true;

    logger.info("PostgreSQL connection established");

    return pool;
  } catch (error) {
    logger.error("Failed to connect to PostgreSQL", error);
    throw error;
  }
};

export const disconnectFromDatabase = async () => {
  if (!connected) return;

  try {
    await pool.end();
    connected = false;

    logger.info("PostgreSQL pool closed");
  } catch (error) {
    logger.error("Failed to close PostgreSQL pool", error);
    throw error;
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Closing PostgreSQL pool...`);

  try {
    await disconnectFromDatabase();
    logger.info("PostgreSQL disconnected gracefully");
    process.exit(0);
  } catch (error) {
    logger.error("Error during PostgreSQL shutdown", error);
    process.exit(1);
  }
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));