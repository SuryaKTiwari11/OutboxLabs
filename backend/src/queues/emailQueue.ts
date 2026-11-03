// ─────────────────────────────────────────────────────────────
//  queues/emailQueue.ts
//  BullMQ Queue definitions for decoupled, horizontally scalable workloads:
//  1. emailQueue ("email-jobs"): Primary delayed delivery queue
//  2. indexingQueue ("indexing-jobs"): Asynchronous Elasticsearch indexing
//  3. notificationQueue ("notification-jobs"): Asynchronous Slack notifications
//  4. dlqQueue ("email-dlq"): Dead-letter queue for terminal failures
// ─────────────────────────────────────────────────────────────

import { Queue, QueueEvents } from "bullmq";
import { createRedisClient } from "../config/redis";
import { EmailJobData, IndexingJobData, NotificationJobData } from "../types";
import { logger } from "../utils/logger";
import { queueDepthGauge } from "../config/metrics";
import { buildBullJobId } from "../utils/jobId";

export const EMAIL_QUEUE_NAME = "email-jobs";
export const INDEXING_QUEUE_NAME = "indexing-jobs";
export const NOTIFICATION_QUEUE_NAME = "notification-jobs";
export const DLQ_QUEUE_NAME = "email-dlq";

const defaultJobOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
  attempts: 5,
  backoff: {
    type: "exponential" as const,
    delay: 5000,
  },
};

// ── 1. Primary Email Queue ─────────────────────────────────────
export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createRedisClient("queue:email"),
  defaultJobOptions,
});

// ── 2. Async Search Indexing Queue ─────────────────────────────
export const indexingQueue = new Queue<IndexingJobData>(INDEXING_QUEUE_NAME, {
  connection: createRedisClient("queue:indexing"),
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

// ── 3. Async Notification Queue ────────────────────────────────
export const notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
  connection: createRedisClient("queue:notification"),
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

// ── 4. Dead Letter Queue (DLQ) ─────────────────────────────────
export const dlqQueue = new Queue<EmailJobData & { error: string }>(DLQ_QUEUE_NAME, {
  connection: createRedisClient("queue:dlq"),
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

// ── Queue Events ───────────────────────────────────────────────
export const emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: createRedisClient("queue-events:email"),
});

emailQueueEvents.on("completed", ({ jobId }) => {
  logger.info(`[Queue] Email job completed`, { jobId });
});

emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error(`[Queue] Email job failed`, { jobId, failedReason });
});

emailQueueEvents.on("delayed", ({ jobId, delay }) => {
  logger.info(`[Queue] Email job delayed`, { jobId, delayMs: delay });
});

// ── Helper: add a single email job (lightweight payload) ────────
export async function enqueueEmailJob(
  data: EmailJobData,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  const job = await emailQueue.add(
    "send-email",
    data,
    {
      jobId: data.idempotencyKey, // deterministic ID
      delay,
    }
  );

  logger.info(`[Queue] Email job enqueued`, {
    jobId: job.id,
    delayMs: delay,
    scheduledAt: scheduledAt.toISOString(),
  });

  return job.id!;
}

// ── Helper: enqueue async indexing ─────────────────────────────
export async function enqueueIndexingJob(data: IndexingJobData): Promise<void> {
  await indexingQueue.add("index-email", data, {
    jobId: buildBullJobId("idx", data.scheduledEmailId, data.action, Date.now()),
  });
}

// ── Helper: enqueue async notification ─────────────────────────
export async function enqueueNotificationJob(data: NotificationJobData): Promise<void> {
  await notificationQueue.add("slack-alert", data, {
    jobId: buildBullJobId("slack", data.userId, data.senderEmail, Date.now()),
  });
}

// ── Helper: enqueue to DLQ ─────────────────────────────────────
export async function enqueueDeadLetter(
  data: EmailJobData,
  error: string
): Promise<void> {
  await dlqQueue.add("dead-letter", { ...data, error }, {
    jobId: buildBullJobId("dlq", data.scheduledEmailId, Date.now()),
  });
  logger.warn(`[Queue] Moved job to Dead-Letter Queue`, { emailId: data.scheduledEmailId, error });
}

export async function getJobById(jobId: string) {
  return emailQueue.getJob(jobId);
}

// ── Metrics collection helper for queues ───────────────────────
export async function updateQueueMetrics(): Promise<void> {
  const [waiting, active, delayed, failed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getDelayedCount(),
    emailQueue.getFailedCount(),
  ]);

  queueDepthGauge.set({ queue: EMAIL_QUEUE_NAME, status: "waiting" }, waiting);
  queueDepthGauge.set({ queue: EMAIL_QUEUE_NAME, status: "active" }, active);
  queueDepthGauge.set({ queue: EMAIL_QUEUE_NAME, status: "delayed" }, delayed);
  queueDepthGauge.set({ queue: EMAIL_QUEUE_NAME, status: "failed" }, failed);
}

export async function closeEmailQueue(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    indexingQueue.close(),
    notificationQueue.close(),
    dlqQueue.close(),
    emailQueueEvents.close(),
  ]);
}
