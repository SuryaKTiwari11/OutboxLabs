// ─────────────────────────────────────────────────────────────
//  utils/circuitBreaker.ts
//  Circuit Breaker Pattern for SMTP Delivery.
//
//  States:
//  - CLOSED: Normal operation. Requests flow through.
//  - OPEN: Tripped after N consecutive failures. Fast-fails immediately
//          to protect SMTP infrastructure and avoid hanging worker threads.
//  - HALF_OPEN: Probe state after cooldown. Allows a single test request
//               to determine if the downstream service has recovered.
// ─────────────────────────────────────────────────────────────

import { logger } from "./logger";
import { smtpCircuitBreakerGauge } from "../config/metrics";

export type CircuitState = "CLOSED" | "HALF_OPEN" | "OPEN";

export class CircuitBreakerOpenError extends Error {
  public readonly isTransient = true; // Classified as transient for queue retries
  constructor(message = "SMTP Circuit breaker is OPEN. Fast-failing request.") {
    super(message);
    this.name = "CircuitBreakerOpenError";
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;  // Consecutive failures before opening (default: 5)
  resetTimeoutMs?: number;    // Time in OPEN state before testing HALF_OPEN (default: 30,000ms)
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.updateGauge();
  }

  public getState(): CircuitState {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transitionTo("HALF_OPEN");
      }
    }
    return this.state;
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      logger.warn("[CircuitBreaker] Fast-failing call — Circuit is OPEN");
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      logger.info("[CircuitBreaker] Probe succeeded! Resetting Circuit to CLOSED");
    }
    this.failureCount = 0;
    this.transitionTo("CLOSED");
  }

  private onFailure(err: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`[CircuitBreaker] Failure recorded (${this.failureCount}/${this.failureThreshold})`, {
      error: err instanceof Error ? err.message : String(err),
      state: this.state,
    });

    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      logger.warn(`[CircuitBreaker] Transition: ${this.state} -> ${newState}`);
      this.state = newState;
      this.updateGauge();
    }
  }

  private updateGauge(): void {
    const stateValue = this.state === "CLOSED" ? 0 : this.state === "HALF_OPEN" ? 1 : 2;
    smtpCircuitBreakerGauge.set(stateValue);
  }
}

// Global singleton for SMTP operations
export const smtpCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

