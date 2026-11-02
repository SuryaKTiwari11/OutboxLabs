// ─────────────────────────────────────────────────────────────
//  config/redis.ts
//  Singleton Redis client (ioredis).
//  BullMQ requires a separate connection per queue/worker.
//  Use createRedisClient() to get a fresh connection when needed.
// ─────────────────────────────────────────────────────────────

import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

// ── Connection factory ────────────────────────────────────────
// BullMQ recommends creating dedicated connections per queue/worker
// rather than sharing a single connection.
export function createRedisClient(name?: string): Redis {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,    // required by BullMQ
    lazyConnect: false,
  });

  client.on("connect", () => {
    logger.info(`[Redis${name ? `:${name}` : ""}] Connected`);
  });

  client.on("error", (err) => {
    logger.error(`[Redis${name ? `:${name}` : ""}] Error`, { error: err.message });
  });

  return client;
}

// ── Default shared client for non-BullMQ operations ──────────
// (rate-limit counters, notification deduplication, etc.)
let _sharedClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_sharedClient) {
    _sharedClient = createRedisClient("shared");
  }
  return _sharedClient;
}

export async function closeRedisClient(): Promise<void> {
  if (_sharedClient) {
    await _sharedClient.quit();
    _sharedClient = null;
    logger.info("[Redis:shared] Connection closed");
  }
}

