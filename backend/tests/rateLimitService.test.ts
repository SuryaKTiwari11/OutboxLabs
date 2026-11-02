// ─────────────────────────────────────────────────────────────
//  tests/rateLimitService.test.ts
//  Unit tests for distributed rate limiting logic.
// ─────────────────────────────────────────────────────────────

// Mock required env vars before any imports
process.env["DATABASE_URL"]        = "postgresql://test:test@localhost:5432/test";
process.env["GOOGLE_CLIENT_ID"]    = "test";
process.env["GOOGLE_CLIENT_SECRET"]= "test";
process.env["GOOGLE_CALLBACK_URL"] = "http://localhost/callback";
process.env["SLACK_CLIENT_ID"]     = "test";
process.env["SLACK_CLIENT_SECRET"] = "test";
process.env["SLACK_REDIRECT_URI"]  = "http://localhost/slack";
process.env["JWT_SECRET"]          = "test-secret-minimum-32-chars-long!!!!";
process.env["ENCRYPTION_KEY"]      = "a".repeat(64);

import { RateLimitService } from "../src/services/rateLimitService";
import { getRedisClient } from "../src/config/redis";

// Mock Redis for unit tests
jest.mock("../src/config/redis", () => ({
  getRedisClient: jest.fn(),
}));

const mockRedis = {
  eval:  jest.fn(),
  get:   jest.fn(),
  decr:  jest.fn(),
  setex: jest.fn(),
};

(getRedisClient as jest.Mock).mockReturnValue(mockRedis);

describe("RateLimitService", () => {
  let service: RateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RateLimitService(10); // limit of 10/hour
  });

  describe("tryReserveSlot", () => {
    it("allows when under limit", async () => {
      mockRedis.eval.mockResolvedValue(5); // 5th email this hour
      const result = await service.tryReserveSlot("sender-1");

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(5);
      expect(result.limit).toBe(10);
    });

    it("denies when limit exceeded (eval returns -1)", async () => {
      mockRedis.eval.mockResolvedValue(-1); // Lua script returned -1
      const result = await service.tryReserveSlot("sender-1");

      expect(result.allowed).toBe(false);
      expect(result.nextWindowMs).toBeGreaterThan(0);
      expect(result.nextWindowMs).toBeLessThanOrEqual(3_600_000);
    });

    it("fails open when Redis throws", async () => {
      mockRedis.eval.mockRejectedValue(new Error("Redis connection refused"));
      const result = await service.tryReserveSlot("sender-1");

      // Fail open: allow the email rather than blocking all sends
      expect(result.allowed).toBe(true);
    });

    it("uses correct Redis key format", async () => {
      mockRedis.eval.mockResolvedValue(1);
      await service.tryReserveSlot("sender-abc");

      const hourWindow = Math.floor(Date.now() / 3_600_000);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String), // Lua script
        1,
        `ratelimit:sender-abc:${hourWindow}`,
        "10",
        expect.any(String) // TTL
      );
    });
  });

  describe("releaseSlot", () => {
    it("decrements the counter", async () => {
      mockRedis.decr.mockResolvedValue(4);
      await service.releaseSlot("sender-1");

      const hourWindow = Math.floor(Date.now() / 3_600_000);
      expect(mockRedis.decr).toHaveBeenCalledWith(`ratelimit:sender-1:${hourWindow}`);
    });
  });
});

