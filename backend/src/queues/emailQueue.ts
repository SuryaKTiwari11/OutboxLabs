// ─────────────────────────────────────────────────────────────
//  queues/emailQueue.ts
//  BullMQ Queue definition for email jobs.
//
//  Design decisions:
//  - One queue: "email-jobs"
//  - Jobs use deterministic IDs (idempotencyKey) → no duplicates
//  - defaultJobOptions define retry behavior globally
//  - Separate Redis connections for queue vs worker (BullMQ requirement)
// ─────────────────────────────────────────────────────────────

import { Queue, QueueEvents } from "bullmq";
import { createRedisClient } from "../config/redis";
import { EmailJobData } from "../types";
import { logger } from "../utils/logger";

export const EMAIL_QUEUE_NAME = "email-jobs";

// ── Queue instance ─────────────────────────────────────────────
// Use a dedicated Redis connection for the queue.
export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: createRedisClient("queue"),
  defaultJobOptions: {
    // Remove job from queue after it completes (keep last 1000 for Bull Board)
    removeOnComplete: { count: 1000 },
    // Keep failed jobs for debugging (last 500)
    removeOnFail: { count: 500 },
    // Retry strategy: exponential backoff
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000, // 5s, 10s, 20s, 40s, 80s
    },
  },
});

// ── Queue Events (for logging and monitoring) ─────────────────
export const emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
  connection: createRedisClient("queue-events"),
});

emailQueueEvents.on("completed", ({ jobId }) => {
  logger.info(`[Queue] Job completed`, { jobId });
});

emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.error(`[Queue] Job failed`, { jobId, reason: failedReason });
});

emailQueueEvents.on("delayed", ({ jobId, delay }) => {
  logger.info(`[Queue] Job delayed`, { jobId, delayMs: delay });
});

// ── Helper: add a single email job ────────────────────────────
export async function enqueueEmailJob(
  data: EmailJobData,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  const job = await emailQueue.add(
    "send-email",
    data,
    {
      jobId: data.idempotencyKey, // deterministic → prevents duplicates
      delay,
    }
  );

  logger.info(`[Queue] Email job enqueued`, {
    jobId: job.id,
    recipient: data.recipient,
    delayMs: delay,
    scheduledAt: scheduledAt.toISOString(),
  });

  return job.id!;
}

// ── Helper: check if a job exists in the queue ────────────────
export async function getJobById(jobId: string) {
  return emailQueue.getJob(jobId);
}

export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
  await emailQueueEvents.close();
}

