// ─────────────────────────────────────────────────────────────
//  services/rateLimitService.ts
//  Distributed hourly rate limiting using Redis Lua scripts.
//
//  Strategy:
//  - Key: ratelimit:{senderId}:{hourWindow}
//    where hourWindow = floor(epochMs / 3_600_000)
//  - Atomic Lua script: INCR + conditional EXPIRE in one round-trip
//  - If count > MAX_EMAILS_PER_HOUR_PER_SENDER:
//      → DECR to undo reservation
//      → return { allowed: false, nextWindowMs }
//  - Safe across multiple workers/instances (Redis is the arbiter)
//
//  Why Lua? INCR + EXPIRE must be atomic — a crash between them
//  would leave a key with no TTL (lasts forever). Lua script
//  is executed atomically on the Redis server.
// ─────────────────────────────────────────────────────────────

import { getRedisClient } from "../config/redis";
import { env } from "../config/env";
import { RateLimitResult } from "../types";
import { logger } from "../utils/logger";

// Lua script: atomically increment + set TTL if key is new
const ATOMIC_INCREMENT_LUA = `
local key   = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl   = tonumber(ARGV[2])

local count = redis.call("INCR", key)
if count == 1 then
  redis.call("EXPIRE", key, ttl)
end

if count > limit then
  redis.call("DECR", key)
  return -1
end

return count
`;

export class RateLimitService {
  private readonly maxPerHour: number;

  constructor(maxPerHourPerSender?: number) {
    this.maxPerHour =
      maxPerHourPerSender ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  }

  /**
   * Try to reserve a slot for a sender in the current hour window.
   * Returns { allowed: true } if within limit, or
   *         { allowed: false, nextWindowMs } if limit exceeded.
   */
  async tryReserveSlot(senderId: string): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const hourWindow = this.getCurrentHourWindow();
    const key = `ratelimit:${senderId}:${hourWindow}`;
    const ttlSeconds = 3600 + 60; // 1 hour + 60s buffer

    try {
      const result = (await redis.eval(
        ATOMIC_INCREMENT_LUA,
        1,         // number of keys
        key,       // KEYS[1]
        this.maxPerHour.toString(), // ARGV[1]
        ttlSeconds.toString()       // ARGV[2]
      )) as number;

      if (result === -1) {
        // Limit exceeded
        const nextWindowMs = this.msUntilNextHourWindow();
        logger.warn(`[RateLimit] Sender ${senderId} reached hourly limit`, {
          limit: this.maxPerHour,
          nextWindowMs,
        });
        return {
          allowed: false,
          currentCount: this.maxPerHour,
          limit: this.maxPerHour,
          nextWindowMs,
        };
      }

      return {
        allowed: true,
        currentCount: result,
        limit: this.maxPerHour,
      };
    } catch (err) {
      // Redis error → fail open (allow email) to avoid blocking all sends
      logger.error("[RateLimit] Redis error, failing open", { error: err });
      return { allowed: true, currentCount: 0, limit: this.maxPerHour };
    }
  }

  /**
   * Release a previously reserved slot (e.g. on SMTP failure).
   * This prevents wasting quota on failed sends.
   */
  async releaseSlot(senderId: string): Promise<void> {
    const redis = getRedisClient();
    const hourWindow = this.getCurrentHourWindow();
    const key = `ratelimit:${senderId}:${hourWindow}`;
    try {
      await redis.decr(key);
    } catch (err) {
      logger.error("[RateLimit] Failed to release slot", { error: err });
    }
  }

  /**
   * Get current count for a sender without modifying it.
   */
  async getCurrentCount(senderId: string): Promise<number> {
    const redis = getRedisClient();
    const hourWindow = this.getCurrentHourWindow();
    const key = `ratelimit:${senderId}:${hourWindow}`;
    const value = await redis.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Integer representing the current hour (epoch hours). */
  private getCurrentHourWindow(): number {
    return Math.floor(Date.now() / 3_600_000);
  }

  /** Milliseconds until the start of the next hour. */
  private msUntilNextHourWindow(): number {
    const now = Date.now();
    const nextHourMs = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
    return nextHourMs - now;
  }
}

// Singleton instance
export const rateLimitService = new RateLimitService();

