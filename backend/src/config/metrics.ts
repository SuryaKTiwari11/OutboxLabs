// ─────────────────────────────────────────────────────────────
//  config/metrics.ts
//  Production-grade Prometheus metrics registry.
//  Exposes standard operational metrics for monitoring & alerting.
// ─────────────────────────────────────────────────────────────

import client from "prom-client";

// Create custom Prometheus Registry
export const register = new client.Registry();

// Enable default system metrics (CPU, Memory, Event Loop Lag, GC)
client.collectDefaultMetrics({
  register,
  prefix: "reachinbox_",
});

// ── Custom Application Metrics ─────────────────────────────────

/** Total number of emails scheduled */
export const emailsScheduledCounter = new client.Counter({
  name: "reachinbox_emails_scheduled_total",
  help: "Total number of emails scheduled",
  labelNames: ["senderId", "campaign"],
  registers: [register],
});

/** Total number of emails processed by workers */
export const emailsProcessedCounter = new client.Counter({
  name: "reachinbox_emails_processed_total",
  help: "Total number of emails processed by workers",
  labelNames: ["senderId", "status"], // status: "sent" | "failed" | "rescheduled"
  registers: [register],
});

/** Delivery latency histogram (time taken for SMTP handshake & send) */
export const emailDeliveryLatencyHistogram = new client.Histogram({
  name: "reachinbox_email_delivery_duration_seconds",
  help: "Duration of SMTP email delivery in seconds",
  labelNames: ["senderId"],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10], // 100ms up to 10s
  registers: [register],
});

/** Hourly rate limit hits */
export const rateLimitHitsCounter = new client.Counter({
  name: "reachinbox_rate_limit_hits_total",
  help: "Total occurrences of sender hourly rate limit exhaustion",
  labelNames: ["senderId"],
  registers: [register],
});

/** Transactional Outbox publishing metrics */
export const outboxEventsCounter = new client.Counter({
  name: "reachinbox_outbox_events_total",
  help: "Total transactional outbox events processed",
  labelNames: ["eventType", "status"], // status: "published" | "failed"
  registers: [register],
});

/** SMTP Circuit Breaker State (0 = CLOSED, 1 = HALF_OPEN, 2 = OPEN) */
export const smtpCircuitBreakerGauge = new client.Gauge({
  name: "reachinbox_smtp_circuit_breaker_state",
  help: "SMTP Circuit Breaker state: 0=CLOSED (Normal), 1=HALF_OPEN (Testing), 2=OPEN (Tripped)",
  registers: [register],
});

/** Active BullMQ Queue Depth */
export const queueDepthGauge = new client.Gauge({
  name: "reachinbox_queue_depth",
  help: "Number of jobs in queue by status",
  labelNames: ["queue", "status"], // status: "waiting" | "active" | "delayed" | "failed"
  registers: [register],
});

