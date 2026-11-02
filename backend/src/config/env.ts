// ─────────────────────────────────────────────────────────────
//  config/env.ts
//  Single source of truth for all environment variables.
//  Validated at startup — if a required var is missing,
//  the app throws immediately (fail-fast pattern).
// ─────────────────────────────────────────────────────────────

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from the backend root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[ENV] Required environment variable "${key}" is missing.`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalEnvInt(key: string, fallback: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : fallback;
}

// ─────────────────────────────────────────────────────────────

export const env = {
  // App
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  PORT: optionalEnvInt("BACKEND_PORT", 4000),
  FRONTEND_URL: optionalEnv("FRONTEND_URL", "http://localhost:5173"),
  BACKEND_URL: optionalEnv("BACKEND_URL", "http://localhost:4000"),

  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),

  // Redis
  REDIS_HOST: optionalEnv("REDIS_HOST", "localhost"),
  REDIS_PORT: optionalEnvInt("REDIS_PORT", 6379),
  REDIS_PASSWORD: process.env["REDIS_PASSWORD"],

  // Elasticsearch
  ELASTICSEARCH_URL: optionalEnv("ELASTICSEARCH_URL", "http://localhost:9200"),
  ELASTICSEARCH_INDEX_EMAILS: optionalEnv("ELASTICSEARCH_INDEX_EMAILS", "emails"),

  // Google OAuth
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_CALLBACK_URL: requireEnv("GOOGLE_CALLBACK_URL"),

  // Slack OAuth
  SLACK_CLIENT_ID: requireEnv("SLACK_CLIENT_ID"),
  SLACK_CLIENT_SECRET: requireEnv("SLACK_CLIENT_SECRET"),
  SLACK_REDIRECT_URI: requireEnv("SLACK_REDIRECT_URI"),

  // Security
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRY: optionalEnv("JWT_EXPIRY", "7d"),
  ENCRYPTION_KEY: requireEnv("ENCRYPTION_KEY"),

  // Ethereal SMTP (optional — auto-created if not set)
  ETHEREAL_USER: process.env["ETHEREAL_USER"],
  ETHEREAL_PASS: process.env["ETHEREAL_PASS"],
  ETHEREAL_HOST: optionalEnv("ETHEREAL_HOST", "smtp.ethereal.email"),
  ETHEREAL_PORT: optionalEnvInt("ETHEREAL_PORT", 587),

  // BullMQ / Scheduler
  WORKER_CONCURRENCY: optionalEnvInt("WORKER_CONCURRENCY", 5),
  MIN_EMAIL_DELAY_MS: optionalEnvInt("MIN_EMAIL_DELAY_MS", 2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: optionalEnvInt("MAX_EMAILS_PER_HOUR_PER_SENDER", 200),

  // Bull Board
  BULL_BOARD_USERNAME: optionalEnv("BULL_BOARD_USERNAME", "admin"),
  BULL_BOARD_PASSWORD: optionalEnv("BULL_BOARD_PASSWORD", "admin_secret"),

  // Helpers
  isProduction(): boolean {
    return this.NODE_ENV === "production";
  },
  isDevelopment(): boolean {
    return this.NODE_ENV === "development";
  },
} as const;

