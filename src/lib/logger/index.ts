// ===============================
// src/lib/logger.ts - Super Simple Logger
// ===============================
import winston from "winston";

// Simple console format
const simpleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create simple logger
const logger = winston.createLogger({
  level: "info",
  format: simpleFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "app.log",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Simple logging functions
export const log = {
  info: (message: string, meta?: any, extra?: any) =>
    logger.info(message, { ...meta, ...extra }),

  error: (message: string, error?: any, extra?: any) => {
    if (error instanceof Error) {
      logger.error(message, {
        error: error.message,
        stack: error.stack,
        ...extra,
      });
    } else {
      logger.error(message, { error, ...extra });
    }
  },

  warn: (message: string, meta?: any, extra?: any) =>
    logger.warn(message, { ...meta, ...extra }),

  debug: (message: string, meta?: any, extra?: any) =>
    logger.debug(message, { ...meta, ...extra }),
};
