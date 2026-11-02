// ─────────────────────────────────────────────────────────────
//  workers/index.ts
//  Worker process entry point.
//  Run separately from the API: `npm run dev:worker`
//
//  Design decisions:
//  - Separate process for worker vs API (better isolation)
//  - Configurable concurrency via WORKER_CONCURRENCY env var
//  - Graceful shutdown: wait for active jobs to finish
//  - Dedicated Redis connections (BullMQ requirement)
// ─────────────────────────────────────────────────────────────

import { Worker, WorkerOptions } from "bullmq";
import { EMAIL_QUEUE_NAME } from "../queues/emailQueue";
import { processEmailJob } from "./emailProcessor";
import { createRedisClient } from "../config/redis";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { elasticsearchService } from "../integrations/elasticsearch";
import { EmailJobData } from "../types";
import { env } from "../config/env";
import { logger } from "../utils/logger";

async function startWorker(): Promise<void> {
  logger.info("[Worker] Starting email worker...");

  // Connect to DB
  await connectDatabase();
  logger.info("[Worker] Database connected");

  // Initialize Elasticsearch (non-blocking)
  await elasticsearchService.initialize();

  // Worker options
  const workerOptions: WorkerOptions = {
    connection: createRedisClient("worker"),
    concurrency: env.WORKER_CONCURRENCY,
    // BullMQ limiter: max X jobs per Y ms across all workers
    // This is a global limiter — we also do per-sender limiting inside the processor
    limiter: {
      max: env.WORKER_CONCURRENCY * 2,
      duration: env.MIN_EMAIL_DELAY_MS * env.WORKER_CONCURRENCY,
    },
  };

  const worker = new Worker<EmailJobData, void>(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    workerOptions
  );

  // ── Worker event listeners ─────────────────────────────────
  worker.on("active", (job) => {
    logger.debug(`[Worker] Job active`, { jobId: job.id, attempt: job.attemptsMade + 1 });
  });

  worker.on("completed", (job) => {
    logger.info(`[Worker] Job completed ✓`, { jobId: job.id });
  });

  worker.on("failed", (job, err) => {
    logger.error(`[Worker] Job failed ✗`, {
      jobId: job?.id,
      attempt: (job?.attemptsMade ?? 0) + 1,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error(`[Worker] Worker error`, { error: err.message });
  });

  logger.info(`[Worker] Ready — concurrency: ${env.WORKER_CONCURRENCY}, queue: ${EMAIL_QUEUE_NAME}`);

  // ── Graceful shutdown ──────────────────────────────────────
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.info(`[Worker] ${signal} received — shutting down gracefully...`);

    // Stop accepting new jobs, wait for active jobs to finish
    await worker.close();
    await disconnectDatabase();

    logger.info("[Worker] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
}

// ── Run ────────────────────────────────────────────────────────
startWorker().catch((err) => {
  logger.error("[Worker] Fatal startup error", { error: err.message, stack: err.stack });
  process.exit(1);
});

