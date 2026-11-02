// ─────────────────────────────────────────────────────────────
//  workers/emailProcessor.ts
//  BullMQ job processor — handles one email send.
//
//  Processing flow per job:
//  1. Idempotency check — skip if already SENT
//  2. Mark email as PROCESSING in DB
//  3. Rate limit check via Redis Lua
//     → If exceeded: reschedule to next hour, return
//  4. Apply minimum delay (MIN_EMAIL_DELAY_MS)
//  5. Send via SMTP (Nodemailer + Ethereal)
//  6. Update DB to SENT + save messageId + previewUrl
//  7. Update Elasticsearch index
//  8. Record delivery attempt in DB
//
//  On SMTP failure:
//  - BullMQ retries with exponential backoff (configured in queue)
//  - DB status set to FAILED after exhausted retries
//  - Delivery attempt recorded with error
//  - Rate limit slot released (don't waste quota on failed sends)
// ─────────────────────────────────────────────────────────────

import { Job } from "bullmq";
import { EmailJobData, EmailStatus } from "../types";
import { prisma } from "../config/database";
import { rateLimitService } from "../services/rateLimitService";
import { slackService } from "../integrations/slack";
import { elasticsearchService } from "../integrations/elasticsearch";
import {
  createTransporterForSender,
  getDefaultTransporter,
  sendEmail,
} from "../integrations/smtp";
import { emailQueue } from "../queues/emailQueue";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Main job processor function.
 * Called by BullMQ worker for each email job.
 */
export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, userId, senderId, recipient, subject, body, idempotencyKey } =
    job.data;

  logger.info(`[Worker] Processing job`, {
    jobId: job.id,
    attempt: job.attemptsMade + 1,
    recipient,
  });

  // ── Step 1: Idempotency check ──────────────────────────────
  // If this email was already sent (e.g., worker crashed after SMTP
  // but before DB update, then BullMQ retried), skip it.
  const existing = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
    include: { sender: true },
  });

  if (!existing) {
    logger.warn(`[Worker] Scheduled email not found in DB, skipping`, { scheduledEmailId });
    return; // Job completes cleanly (no retry)
  }

  if (existing.status === "SENT") {
    logger.info(`[Worker] Email already sent, skipping (idempotent)`, {
      scheduledEmailId,
      idempotencyKey,
    });
    return;
  }

  if (existing.status === "CANCELLED") {
    logger.info(`[Worker] Email was cancelled, skipping`, { scheduledEmailId });
    return;
  }

  // ── Step 2: Mark as PROCESSING ─────────────────────────────
  await prisma.scheduledEmail.update({
    where: { id: scheduledEmailId },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
    },
  });

  // ── Step 3: Rate limit check ───────────────────────────────
  const rateResult = await rateLimitService.tryReserveSlot(senderId);

  if (!rateResult.allowed) {
    // Reschedule to next hour window using BullMQ delay
    const delayMs = rateResult.nextWindowMs! + 1000; // +1s buffer
    const nextWindowAt = new Date(Date.now() + delayMs);

    logger.warn(`[Worker] Rate limit reached, rescheduling`, {
      senderId,
      nextWindowAt: nextWindowAt.toISOString(),
    });

    // Revert status to QUEUED (will be re-processed in next window)
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: "QUEUED",
        scheduledAt: nextWindowAt,
        attemptCount: { decrement: 1 }, // don't count this as an attempt
      },
    });

    // Re-enqueue as a delayed job (preserves ordering as much as possible)
    await emailQueue.add("send-email", job.data, {
      jobId: `${idempotencyKey}-${nextWindowAt.getTime()}`, // new unique ID
      delay: delayMs,
    });

    // Notify via Slack (deduplicated per hour)
    await slackService.notifyRateLimitHit({
      userId,
      senderEmail: existing.sender.fromEmail,
      limitReached: rateResult.limit,
      nextWindowAt,
    });

    return; // Current job completes; email will be picked up in new job
  }

  // ── Step 4: Minimum delay between sends ───────────────────
  // This mimics provider throttling. We use a simple sleep here.
  // Alternative: BullMQ limiter (but that requires Enterprise plan for per-queue limits).
  if (env.MIN_EMAIL_DELAY_MS > 0) {
    await sleep(env.MIN_EMAIL_DELAY_MS);
  }

  // ── Step 5: Send via SMTP ──────────────────────────────────
  const attemptStart = Date.now();
  let smtpResult: { messageId: string; previewUrl: string | null } | null = null;
  let smtpError: string | null = null;

  try {
    // Use sender-specific transporter or default Ethereal
    const transporter = existing.sender
      ? createTransporterForSender(existing.sender)
      : await getDefaultTransporter();

    smtpResult = await sendEmail(transporter, {
      from: `"${existing.sender.displayName}" <${existing.sender.fromEmail}>`,
      to: recipient,
      subject,
      html: body,
    });
  } catch (err) {
    smtpError = err instanceof Error ? err.message : String(err);
    logger.error(`[Worker] SMTP delivery failed`, {
      scheduledEmailId,
      recipient,
      error: smtpError,
      attempt: job.attemptsMade + 1,
    });

    // Release the rate limit slot — don't waste quota on failed sends
    await rateLimitService.releaseSlot(senderId);
  }

  // ── Step 6: Update DB ──────────────────────────────────────
  const attemptDuration = Date.now() - attemptStart;
  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 5);

  if (smtpResult) {
    // Success path
    const sentAt = new Date();
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: "SENT",
        sentAt,
        smtpMessageId: smtpResult.messageId,
        etherealPreviewUrl: smtpResult.previewUrl,
        lastError: null,
      },
    });

    // Update campaign counters
    if (existing.campaignId) {
      await prisma.emailCampaign.update({
        where: { id: existing.campaignId },
        data: { sentCount: { increment: 1 } },
      });
    }

    // ── Step 7: Update Elasticsearch ────────────────────────
    await elasticsearchService.updateEmailStatus(
      scheduledEmailId,
      "SENT",
      sentAt
    );

    // ── Step 8: Record delivery attempt ─────────────────────
    await prisma.emailDeliveryAttempt.create({
      data: {
        scheduledEmailId,
        attemptNumber: job.attemptsMade + 1,
        status: "SUCCESS",
        smtpMessageId: smtpResult.messageId,
        duration: attemptDuration,
      },
    });
  } else {
    // Failure path
    const newStatus = isLastAttempt ? "FAILED" : "QUEUED";

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: newStatus,
        lastError: smtpError,
      },
    });

    if (isLastAttempt) {
      await elasticsearchService.updateEmailStatus(scheduledEmailId, "FAILED");
      if (existing.campaignId) {
        await prisma.emailCampaign.update({
          where: { id: existing.campaignId },
          data: { failedCount: { increment: 1 } },
        });
      }
    }

    await prisma.emailDeliveryAttempt.create({
      data: {
        scheduledEmailId,
        attemptNumber: job.attemptsMade + 1,
        status: "FAILURE",
        errorMessage: smtpError,
        duration: attemptDuration,
      },
    });

    // Re-throw so BullMQ knows this attempt failed and applies backoff
    throw new Error(smtpError ?? "SMTP delivery failed");
  }
}

// ── Utility ───────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

