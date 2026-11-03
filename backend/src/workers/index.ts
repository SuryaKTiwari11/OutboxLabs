// ─────────────────────────────────────────────────────────────
//  workers/index.ts
//  Distributed Worker Supervisor.
//  Coordinates and executes specialized background workers:
//  1. Email Worker (SMTP Delivery + Circuit Breaker + Rate Limiting)
//  2. Search Indexing Worker (Elasticsearch sync)
//  3. Slack Notification Worker (Alert delivery)
//  4. Outbox Dispatcher (Continuous transactional outbox publisher)
// ─────────────────────────────────────────────────────────────

import { Worker, WorkerOptions } from "bullmq";
import { EMAIL_QUEUE_NAME, updateQueueMetrics } from "../queues/emailQueue";
import { processEmailJob } from "./emailProcessor";
import { startIndexingWorker } from "./indexingWorker";
import { startNotificationWorker } from "./notificationWorker";
import { outboxDispatcher } from "./outboxDispatcher";
import { createRedisClient } from "../config/redis";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { elasticsearchService } from "../integrations/elasticsearch";
import { EmailJobData } from "../types";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export async function startWorkers(): Promise<() => Promise<void>> {
  logger.info("=".repeat(60));
  logger.info("  ReachInbox — Starting Distributed Worker Services");
  logger.info("=".repeat(60));

  // 1. Connect to Database & Elasticsearch
  await connectDatabase();
  await elasticsearchService.initialize();

  // 2. Start Primary Email Worker
  const workerOptions: WorkerOptions = {
    connection: createRedisClient("worker:email"),
    concurrency: env.WORKER_CONCURRENCY,
    limiter: {
      max: env.WORKER_CONCURRENCY * 2,
      duration: Math.max(1000, env.MIN_EMAIL_DELAY_MS * env.WORKER_CONCURRENCY),
    },
  };

  const emailWorker = new Worker<EmailJobData, void>(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    workerOptions
  );

  emailWorker.on("active", (job) => {
    logger.debug(`[Worker:Email] Job active`, { jobId: job.id, attempt: job.attemptsMade + 1 });
  });

  emailWorker.on("completed", (job) => {
    logger.info(`[Worker:Email] Job completed ✓`, { jobId: job.id });
  });

  emailWorker.on("failed", (job, err) => {
    logger.error(`[Worker:Email] Job failed ✗`, {
      jobId: job?.id,
      attempt: (job?.attemptsMade ?? 0) + 1,
      error: err.message,
    });
  });

  // 3. Start Auxiliary Workers
  const indexingWorker = startIndexingWorker();
  const notificationWorker = startNotificationWorker();

  // 4. Start Outbox Dispatcher
  outboxDispatcher.start().catch((err) => {
    logger.error("[Worker] Outbox dispatcher error:", err);
  });

  // 5. Periodic Queue Metrics Scraper for Prometheus
  const metricsTimer = setInterval(async () => {
    try {
      await updateQueueMetrics();
    } catch {
      // non-blocking
    }
  }, 10_000);

  logger.info(`[Workers] All workers active:`);
  logger.info(`  • Email Worker Concurrency:      ${env.WORKER_CONCURRENCY}`);
  logger.info(`  • Search Indexing Worker:        Active (queue: indexing-jobs)`);
  logger.info(`  • Slack Notification Worker:     Active (queue: notification-jobs)`);
  logger.info(`  • Transactional Outbox Dispatch: Continuous (batchSize: 100)`);

  const closeWorkers = async () => {
    clearInterval(metricsTimer);
    outboxDispatcher.stop();
    await Promise.all([
      emailWorker.close(),
      indexingWorker.close(),
      notificationWorker.close(),
    ]);
  };

  return closeWorkers;
}

// Auto-run if executed directly as entrypoint
if (process.argv[1]?.includes("workers") || process.env.RUN_STANDALONE_WORKER === "true") {
  startWorkers()
    .then((close) => {
      const shutdown = async (sig: string) => {
        logger.info(`[Workers] ${sig} received — shutting down...`);
        await close();
        await disconnectDatabase();
        process.exit(0);
      };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));
    })
    .catch((err) => {
      logger.error("[Workers] Fatal startup error", { error: err.message, stack: err.stack });
      process.exit(1);
    });
}
