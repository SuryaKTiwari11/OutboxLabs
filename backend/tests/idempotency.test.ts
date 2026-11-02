// ─────────────────────────────────────────────────────────────
//  tests/idempotency.test.ts
//  Unit tests for idempotency key generation.
// ─────────────────────────────────────────────────────────────

import { generateIdempotencyKey } from "../src/utils/idempotency";

describe("generateIdempotencyKey", () => {
  it("generates a 64-char hex string (SHA-256)", () => {
    const key = generateIdempotencyKey("user1", "test@example.com", new Date("2024-01-01T12:00:00Z"));
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic — same inputs produce same key", () => {
    const date = new Date("2024-01-01T12:00:00Z");
    const key1 = generateIdempotencyKey("user1", "test@example.com", date);
    const key2 = generateIdempotencyKey("user1", "test@example.com", date);
    expect(key1).toBe(key2);
  });

  it("is unique for different recipients", () => {
    const date = new Date("2024-01-01T12:00:00Z");
    const key1 = generateIdempotencyKey("user1", "a@example.com", date);
    const key2 = generateIdempotencyKey("user1", "b@example.com", date);
    expect(key1).not.toBe(key2);
  });

  it("is unique for different times", () => {
    const key1 = generateIdempotencyKey("user1", "a@example.com", new Date("2024-01-01T12:00:00Z"));
    const key2 = generateIdempotencyKey("user1", "a@example.com", new Date("2024-01-01T13:00:00Z"));
    expect(key1).not.toBe(key2);
  });

  it("normalizes email to lowercase", () => {
    const date = new Date("2024-01-01T12:00:00Z");
    const key1 = generateIdempotencyKey("user1", "TEST@EXAMPLE.COM", date);
    const key2 = generateIdempotencyKey("user1", "test@example.com", date);
    expect(key1).toBe(key2);
  });
});

