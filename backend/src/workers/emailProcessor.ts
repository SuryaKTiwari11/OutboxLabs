// ─────────────────────────────────────────────────────────────
//  workers/emailProcessor.ts
//  BullMQ job processor — handles one email send.
//
//  Scalability & Reliability Features:
//  1. Lightweight payload: Fetches full email body from DB at execution time.
//  2. Idempotency check: Skips if already SENT or CANCELLED.
//  3. Rate limiting: Redis Lua atomic slot reservation. Reschedules if exhausted.
//  4. SMTP Circuit Breaker: Fast-fails if downstream SMTP is tripping.
//  5. Asynchronous Decoupling: Offloads Slack alerts and ES indexing to dedicated queues.
//  6. Observability: Records Prometheus latency, counters, and delivery attempts.
//  7. Dead-Letter Queue (DLQ): Enqueues terminal failures after max retries.
// ─────────────────────────────────────────────────────────────

import { Job } from "bullmq";
import { EmailJobData } from "../types";
import { prisma } from "../config/database";
import { rateLimitService } from "../services/rateLimitService";
import {
  createTransporterForSender,
  formatSmtpError,
  getSmtpErrorDetails,
  getDefaultSmtpConnectionDetails,
  getSenderSmtpConnectionDetails,
  getDefaultTransporter,
  sendEmail,
  verifySmtpTransport,
} from "../integrations/smtp";
import {
  emailQueue,
  enqueueIndexingJob,
  enqueueNotificationJob,
  enqueueDeadLetter,
} from "../queues/emailQueue";
import { smtpCircuitBreaker } from "../utils/circuitBreaker";
import {
  emailsProcessedCounter,
  emailDeliveryLatencyHistogram,
  rateLimitHitsCounter,
} from "../config/metrics";
import { env } from "../config/env";
import { logger } from "../utils/logger";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { scheduledEmailId, idempotencyKey } = job.data;

  logger.info(`[Worker] Processing job`, {
    jobId: job.id,
    scheduledEmailId,
    attempt: job.attemptsMade + 1,
  });

  // ── Step 1: Idempotency & Fresh State Fetch ─────────────────
  const email = await prisma.scheduledEmail.findUnique({
    where: { id: scheduledEmailId },
    include: { sender: true, campaign: true },
  });

  if (!email) {
    logger.warn(`[Worker] Scheduled email not found in DB, skipping`, { scheduledEmailId });
    return; // Complete cleanly
  }

  if (email.status === "SENT") {
    logger.info(`[Worker] Email already sent, skipping (idempotent)`, {
      scheduledEmailId,
      idempotencyKey,
    });
    return;
  }

  if (email.status === "CANCELLED") {
    logger.info(`[Worker] Email was cancelled, skipping`, { scheduledEmailId });
    return;
  }

  const { senderId, userId, recipient, subject, body } = email;

  // ── Step 2: Mark as PROCESSING in DB ────────────────────────
  await prisma.scheduledEmail.update({
    where: { id: scheduledEmailId },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
    },
  });

  // ── Step 3: Atomic Distributed Rate Limit Check ─────────────
  const rateResult = await rateLimitService.tryReserveSlot(
    senderId,
    email.campaign?.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER
  );

  if (!rateResult.allowed) {
    rateLimitHitsCounter.inc({ senderId });

    // Calculate rollover to next hour window
    const delayMs = (rateResult.nextWindowMs ?? 3600000) + 1000; // +1s buffer
    const nextWindowAt = new Date(Date.now() + delayMs);

    logger.warn(`[Worker] Rate limit reached for sender ${senderId}, rolling over to next window`, {
      nextWindowAt: nextWindowAt.toISOString(),
    });

    // Revert status to QUEUED in DB
    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: "QUEUED",
        scheduledAt: nextWindowAt,
        attemptCount: { decrement: 1 }, // Rollover does not count as failed attempt
      },
    });

    // Reschedule in BullMQ with remaining delay
    await emailQueue.add("send-email", job.data, {
      jobId: `${idempotencyKey}-${nextWindowAt.getTime()}`,
      delay: delayMs,
    });

    // Asynchronously notify via Slack (offloaded to notificationQueue)
    await enqueueNotificationJob({
      userId,
      senderEmail: email.sender.fromEmail,
      limitReached: rateResult.limit,
      nextWindowAt: nextWindowAt.toISOString(),
    });

    emailsProcessedCounter.inc({ senderId, status: "rescheduled" });
    return;
  }

  // ── Step 4: Minimum Delay Spacing ───────────────────────────
  if (env.MIN_EMAIL_DELAY_MS > 0) {
    await sleep(env.MIN_EMAIL_DELAY_MS);
  }

  // ── Step 5: Send via SMTP with Circuit Breaker ───────────────
  const attemptStart = Date.now();
  let smtpResult: { messageId: string; previewUrl: string | null } | null = null;
  let smtpError: string | null = null;
  let smtpCause: unknown;

  try {
    const transporter = email.sender
      ? createTransporterForSender(email.sender)
      : await getDefaultTransporter();
      const smtpDetails = email.sender
        ? getSenderSmtpConnectionDetails(email.sender)
        : getDefaultSmtpConnectionDetails();

      // Execute with rolling failure Circuit Breaker
      smtpResult = await smtpCircuitBreaker.execute(() =>
        verifySmtpTransport(transporter, smtpDetails).then(() =>
          sendEmail(transporter, {
            from: `"${email.sender.displayName}" <${email.sender.fromEmail}>`,
            to: recipient,
            subject,
            html: body,
            // A stable Message-ID is the strongest application-side duplicate
            // protection available when SMTP acceptance and DB acknowledgement
            // cannot be made atomic.
            messageId: `<${idempotencyKey}@reachinbox.local>`,
          })
        )
      );
  } catch (err) {
    smtpCause = err;
    smtpError = formatSmtpError(err);
    logger.error(`[Worker] SMTP delivery attempt failed`, {
      scheduledEmailId,
      recipient,
      error: smtpError,
      errorDetails: getSmtpErrorDetails(err),
      attempt: job.attemptsMade + 1,
    });

    // Release rate limit quota since send did not succeed
    await rateLimitService.releaseSlot(senderId);
  }

  const attemptDuration = Date.now() - attemptStart;
  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 5);

  // ── Step 6: Update Database & Metrics ───────────────────────
  if (smtpResult) {
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

    // Asynchronously index in Elasticsearch
    await enqueueIndexingJob({
      scheduledEmailId,
      action: "UPDATE_STATUS",
      status: "SENT",
    });

    // Record delivery attempt audit record
    await prisma.emailDeliveryAttempt.create({
      data: {
        scheduledEmailId,
        attemptNumber: job.attemptsMade + 1,
        status: "SUCCESS",
        smtpMessageId: smtpResult.messageId,
        duration: attemptDuration,
      },
    });

    emailsProcessedCounter.inc({ senderId, status: "sent" });
    emailDeliveryLatencyHistogram.observe({ senderId }, attemptDuration / 1000);

    logger.info(`[Worker] Email sent successfully`, {
      scheduledEmailId,
      recipient,
      messageId: smtpResult.messageId,
      durationMs: attemptDuration,
    });
  } else {
    // Failure path
    const finalStatus = isLastAttempt ? "FAILED" : "QUEUED";

    await prisma.scheduledEmail.update({
      where: { id: scheduledEmailId },
      data: {
        status: finalStatus,
        lastError: smtpError,
      },
    });

    await prisma.emailDeliveryAttempt.create({
      data: {
        scheduledEmailId,
        attemptNumber: job.attemptsMade + 1,
        status: "FAILURE",
        errorMessage: smtpError,
        duration: attemptDuration,
      },
    });

    if (isLastAttempt) {
      emailsProcessedCounter.inc({ senderId, status: "failed" });
      // Offload to Dead Letter Queue
      await enqueueDeadLetter(job.data, smtpError ?? "Unknown error");
    }

    // Re-throw so BullMQ initiates its exponential backoff retry
    const retryError = new Error(`SMTP delivery failed: ${smtpError}`, {
      cause: smtpCause,
    });
    retryError.name = "SmtpDeliveryError";
    throw retryError;
  }
}
