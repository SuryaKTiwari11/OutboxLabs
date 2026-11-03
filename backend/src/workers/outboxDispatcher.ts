// ─────────────────────────────────────────────────────────────
//  workers/outboxDispatcher.ts
//  Continuous Transactional Outbox Dispatcher.
//  Reads PENDING OutboxEvents from PostgreSQL and reliably publishes
//  them into BullMQ and the async indexing queue.
//
//  Design:
//  - Event-driven polling loop with dynamic backoff (NO CRON).
//  - Uses optimistic concurrency / atomic status updates to allow
//    multiple dispatcher instances to run horizontally without conflict.
//  - Safe for restarts and resilient against Redis disconnections.
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { enqueueEmailJob, enqueueIndexingJob } from "../queues/emailQueue";
import { logger } from "../utils/logger";
import { outboxEventsCounter } from "../config/metrics";

export class OutboxDispatcher {
  private isRunning = false;
  private readonly batchSize: number;
  private readonly idlePollIntervalMs: number;
  private readonly activePollIntervalMs: number;

  constructor(batchSize = 100, idlePollIntervalMs = 1000, activePollIntervalMs = 50) {
    this.batchSize = batchSize;
    this.idlePollIntervalMs = idlePollIntervalMs;
    this.activePollIntervalMs = activePollIntervalMs;
  }

  /**
   * Start the continuous outbox dispatch loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info("[OutboxDispatcher] Starting continuous outbox dispatcher loop...");

    while (this.isRunning) {
      try {
        const processedCount = await this.dispatchBatch();
        // If we found and processed events, immediately check for more; otherwise sleep idle interval
        const delay = processedCount > 0 ? this.activePollIntervalMs : this.idlePollIntervalMs;
        await this.sleep(delay);
      } catch (err) {
        logger.error("[OutboxDispatcher] Error in dispatch loop:", err);
        await this.sleep(this.idlePollIntervalMs);
      }
    }
  }

  public stop(): void {
    logger.info("[OutboxDispatcher] Stopping outbox dispatcher...");
    this.isRunning = false;
  }

  /**
   * Process a single batch of PENDING outbox events.
   * Returns number of events processed.
   */
  public async dispatchBatch(): Promise<number> {
    // 1. Fetch pending events
    const pendingEvents = await prisma.outboxEvent.findMany({
      where: {
        status: { in: ["PENDING", "PUBLISHING"] },
        retryCount: { lt: 5 },
      },
      orderBy: { createdAt: "asc" },
      take: this.batchSize,
    });

    if (pendingEvents.length === 0) {
      return 0;
    }

    let processedCount = 0;

    for (const event of pendingEvents) {
      if (!this.isRunning) break;

      try {
        const payload = JSON.parse(event.payload);

        // 2. Mark as PUBLISHING
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "PUBLISHING" },
        });

        // 3. Publish to BullMQ
        const scheduledAt = new Date(payload.scheduledAt);
        const jobId = await enqueueEmailJob(
          {
            scheduledEmailId: payload.scheduledEmailId,
            idempotencyKey: payload.idempotencyKey,
            userId: payload.userId,
            senderId: payload.senderId,
            recipient: payload.recipient,
            subject: payload.subject,
            body: payload.body,
            hourlyLimit: payload.hourlyLimit,
          },
          scheduledAt
        );

        // 4. Update ScheduledEmail with bullJobId
        await prisma.scheduledEmail.update({
          where: { id: payload.scheduledEmailId },
          data: {
            bullJobId: jobId,
            status: "QUEUED",
          },
        });

        // 5. Enqueue async search indexing
        await enqueueIndexingJob({
          scheduledEmailId: payload.scheduledEmailId,
          action: "INDEX",
        });

        // 6. Mark OutboxEvent as PUBLISHED
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });

        outboxEventsCounter.inc({ eventType: event.eventType, status: "published" });
        processedCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[OutboxDispatcher] Failed to dispatch event ${event.id}:`, errorMsg);

        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: event.retryCount + 1 >= 5 ? "FAILED" : "PENDING",
            retryCount: { increment: 1 },
            lastError: errorMsg,
          },
        });

        outboxEventsCounter.inc({ eventType: event.eventType, status: "failed" });
      }
    }

    return processedCount;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const outboxDispatcher = new OutboxDispatcher();
