// ─────────────────────────────────────────────────────────────
//  tests/circuitBreaker.test.ts
//  Unit tests for SMTP Circuit Breaker pattern.
// ─────────────────────────────────────────────────────────────

import { CircuitBreaker, CircuitBreakerOpenError } from "../src/utils/circuitBreaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
    });
  });

  it("starts in CLOSED state and allows successful execution", async () => {
    expect(breaker.getState()).toBe("CLOSED");

    const result = await breaker.execute(async () => "success");
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("trips to OPEN state when consecutive failures reach threshold", async () => {
    const failingAction = async () => {
      throw new Error("SMTP connection timeout");
    };

    // 1st failure
    await expect(breaker.execute(failingAction)).rejects.toThrow("SMTP connection timeout");
    expect(breaker.getState()).toBe("CLOSED");

    // 2nd failure
    await expect(breaker.execute(failingAction)).rejects.toThrow("SMTP connection timeout");
    expect(breaker.getState()).toBe("CLOSED");

    // 3rd failure (trips threshold)
    await expect(breaker.execute(failingAction)).rejects.toThrow("SMTP connection timeout");
    expect(breaker.getState()).toBe("OPEN");

    // 4th call: immediately fast-fails with CircuitBreakerOpenError without executing action
    const mockAction = jest.fn();
    await expect(breaker.execute(mockAction)).rejects.toThrow(CircuitBreakerOpenError);
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("transitions to HALF_OPEN after cooldown and resets to CLOSED on probe success", async () => {
    const failingAction = async () => {
      throw new Error("SMTP down");
    };

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingAction)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe("OPEN");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 1100));

    expect(breaker.getState()).toBe("HALF_OPEN");

    // Probe succeeds
    const result = await breaker.execute(async () => "probe-ok");
    expect(result).toBe("probe-ok");
    expect(breaker.getState()).toBe("CLOSED");
  });
});

