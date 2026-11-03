// ─────────────────────────────────────────────────────────────
//  workers/notificationWorker.ts
//  Dedicated Asynchronous Slack Notification Worker.
//  Pulls jobs from "notification-jobs" queue and delivers Slack alerts.
//  Decouples third-party Slack HTTP API calls from SMTP delivery.
// ─────────────────────────────────────────────────────────────

import { Worker, Job } from "bullmq";
import { NOTIFICATION_QUEUE_NAME } from "../queues/emailQueue";
import { NotificationJobData } from "../types";
import { createRedisClient } from "../config/redis";
import { slackService } from "../integrations/slack";
import { logger } from "../utils/logger";

export async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { userId, senderEmail, limitReached, nextWindowAt } = job.data;

  try {
    await slackService.notifyRateLimitHit({
      userId,
      senderEmail,
      limitReached,
      nextWindowAt: new Date(nextWindowAt),
    });
    logger.info(`[NotificationWorker] Dispatched Slack rate limit notification for ${senderEmail}`);
  } catch (err) {
    logger.warn(`[NotificationWorker] Failed to dispatch Slack notification for user ${userId}:`, err);
  }
}

export function startNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    processNotificationJob,
    {
      connection: createRedisClient("worker:notification"),
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => logger.debug(`[NotificationWorker] Job ${job.id} completed`));
  worker.on("failed", (job, err) => logger.warn(`[NotificationWorker] Job ${job?.id} failed:`, err.message));

  return worker;
}

