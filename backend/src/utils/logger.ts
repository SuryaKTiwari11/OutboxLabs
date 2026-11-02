// ─────────────────────────────────────────────────────────────
//  utils/logger.ts
//  Structured logger using Winston.
//  In production: JSON format (machine-readable).
//  In development: pretty colorized format (human-readable).
// ─────────────────────────────────────────────────────────────

import winston from "winston";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

// Human-readable format for development
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${ts} [${level}] ${message}${metaStr}`;
  })
);

// JSON format for production (structured logs → log aggregator)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const isDev = (process.env["NODE_ENV"] ?? "development") === "development";

export const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: isDev ? devFormat : prodFormat,
  transports: [
    new winston.transports.Console(),
    // In production you'd add a file or external transport here
  ],
  exitOnError: false,
});

