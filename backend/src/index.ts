// ─────────────────────────────────────────────────────────────
//  index.ts
//  API server entry point.
//
//  Startup sequence:
//  1. Load env (validates all required vars)
//  2. Connect to database
//  3. Initialize Elasticsearch index
//  4. Run startup reconciliation (re-queue any lost emails)
//  5. Start HTTP server
//
//  Graceful shutdown:
//  - SIGTERM / SIGINT → close server → disconnect DB → exit
// ─────────────────────────────────────────────────────────────

import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { elasticsearchService } from "./integrations/elasticsearch";
import { emailService } from "./services/emailService";
import { closeEmailQueue } from "./queues/emailQueue";
import { closeRedisClient } from "./config/redis";
import { createApp } from "./app";
import { logger } from "./utils/logger";
import http from "http";

async function bootstrap(): Promise<void> {
  logger.info("=".repeat(60));
  logger.info("  ReachInbox Email Scheduler — Starting API Server");
  logger.info("=".repeat(60));

  // 1. Connect to database
  await connectDatabase();
  logger.info("[Bootstrap] ✓ Database connected");

  // 2. Initialize Elasticsearch (non-blocking — ES down won't prevent startup)
  await elasticsearchService.initialize();
  logger.info("[Bootstrap] ✓ Elasticsearch initialized");

  // 3. Startup reconciliation
  // Re-enqueues any emails that were PENDING/QUEUED but lost from Redis
  // (e.g. after a Redis restart or server crash).
  // This is NOT a cron — it runs exactly once on startup.
  await emailService.reconcileOnStartup();
  logger.info("[Bootstrap] ✓ Startup reconciliation complete");

  // 4. Start HTTP server
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info(`[Bootstrap] ✓ API server listening on port ${env.PORT}`);
      logger.info(`[Bootstrap]   Frontend:      ${env.FRONTEND_URL}`);
      logger.info(`[Bootstrap]   Bull Board:    http://localhost:${env.PORT}/admin/queues`);
      logger.info(`[Bootstrap]   Health check:  http://localhost:${env.PORT}/health`);
      resolve();
    });
  });

  // 4b. Optionally run queue workers in the same process (1-server deployment)
  let closeWorkers: (() => Promise<void>) | null = null;
  if (process.env.RUN_WORKER === "true") {
    logger.info("[Bootstrap] Starting in-process BullMQ workers (single-server mode)...");
    const { startWorkers } = await import("./workers");
    closeWorkers = await startWorkers();
  }

  // 5. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[Bootstrap] ${signal} received — shutting down...`);

    // Stop accepting new requests
    server.close(async () => {
      if (closeWorkers) {
        await closeWorkers();
      }
      await disconnectDatabase();
      await closeEmailQueue();
      await closeRedisClient();
      logger.info("[Bootstrap] Shutdown complete");
      process.exit(0);
    });

    // Force shutdown after 30s
    setTimeout(() => {
      logger.error("[Bootstrap] Forced shutdown after timeout");
      process.exit(1);
    }, 30_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("[Bootstrap] Unhandled promise rejection", { reason });
  });

  process.on("uncaughtException", (err) => {
    logger.error("[Bootstrap] Uncaught exception", { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error("[Bootstrap] Fatal startup error", { error: err.message, stack: err.stack });
  process.exit(1);
});

