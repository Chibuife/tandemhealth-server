import winston from 'winston';
import { createLogger, format, transports } from 'winston';

const { combine, timestamp, label, printf, colorize } = format;

const consoleFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

// Plain (uncolored) format for files - ANSI color codes would just show up
// as garbled escape sequences if written to disk.
const fileFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

export const logger = winston.createLogger({
  level: 'debug',
  defaultMeta: {},
  transports: [
    new winston.transports.Console({
      level: 'debug',
      format: combine(
        label({ label: 'Starting Server!' }),
        timestamp(),
        colorize({ all: true }),
        consoleFormat
      ),
    }),
    new winston.transports.File({
      filename: './src/logs/error.log',
      level: 'error',
      format: combine(
        label({ label: 'Starting Server!' }),
        timestamp(),
        fileFormat
      ),
    }),
    new winston.transports.File({
      filename: './src/logs/combined.log',
      format: combine(
        label({ label: 'Starting Server!' }),
        timestamp(),
        fileFormat
      ),
    }),
  ],
});