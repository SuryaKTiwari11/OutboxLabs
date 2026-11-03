// ─────────────────────────────────────────────────────────────
//  workers/indexingWorker.ts
//  Dedicated Asynchronous Search Indexing Worker.
//  Pulls jobs from "indexing-jobs" queue and updates Elasticsearch.
//  Ensures that ES outages never impact core email sending performance.
// ─────────────────────────────────────────────────────────────

import { Worker, Job } from "bullmq";
import { INDEXING_QUEUE_NAME } from "../queues/emailQueue";
import { IndexingJobData } from "../types";
import { createRedisClient } from "../config/redis";
import { elasticsearchService } from "../integrations/elasticsearch";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";

export async function processIndexingJob(job: Job<IndexingJobData>): Promise<void> {
  const { scheduledEmailId, action, status } = job.data;

  try {
    if (action === "INDEX") {
      const email = await prisma.scheduledEmail.findUnique({
        where: { id: scheduledEmailId },
        include: { sender: true },
      });

      if (!email) return;

      await elasticsearchService.indexEmail({
        id: email.id,
        userId: email.userId,
        campaignId: email.campaignId ?? undefined,
        senderId: email.senderId,
        senderEmail: email.sender.fromEmail,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduledAt: email.scheduledAt,
        createdAt: email.createdAt,
      });
      logger.debug(`[IndexingWorker] Indexed email ${scheduledEmailId} in Elasticsearch`);
    } else if (action === "UPDATE_STATUS" && status) {
      await elasticsearchService.updateEmailStatus(scheduledEmailId, status);
      logger.debug(`[IndexingWorker] Updated email ${scheduledEmailId} status in Elasticsearch: ${status}`);
    }
  } catch (err) {
    logger.warn(`[IndexingWorker] Non-critical Elasticsearch indexing failure for email ${scheduledEmailId}:`, err);
    // Non-blocking: doesn't crash or halt email queues
  }
}

export function startIndexingWorker(): Worker<IndexingJobData> {
  const worker = new Worker<IndexingJobData>(
    INDEXING_QUEUE_NAME,
    processIndexingJob,
    {
      connection: createRedisClient("worker:indexing"),
      concurrency: 5,
    }
  );

  worker.on("completed", (job) => logger.debug(`[IndexingWorker] Job ${job.id} completed`));
  worker.on("failed", (job, err) => logger.warn(`[IndexingWorker] Job ${job?.id} failed:`, err.message));

  return worker;
}

