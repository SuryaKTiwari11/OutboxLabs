// ─────────────────────────────────────────────────────────────
//  services/emailService.ts
//  Business logic for scheduling emails.
//  Orchestrates: DB → BullMQ → Elasticsearch
//
//  Design: Service layer sits between controllers and repositories.
//  Controllers are thin; all business logic lives here.
// ─────────────────────────────────────────────────────────────

import { emailRepository } from "../repositories/emailRepository";
import { enqueueEmailJob, getJobById } from "../queues/emailQueue";
import { elasticsearchService } from "../integrations/elasticsearch";
import { generateIdempotencyKey } from "../utils/idempotency";
import { logger } from "../utils/logger";
import { ScheduleEmailPayload, BulkSchedulePayload, EmailSearchParams } from "../types";
import { prisma } from "../config/database";
import { AppError } from "../middleware/errorHandler";

export class EmailService {
  /**
   * Schedule a single email.
   *
   * Atomicity note:
   *   - We insert into DB first (with QUEUED-but-no-bullJobId state)
   *   - Then enqueue into BullMQ
   *   - Then update DB with the bullJobId
   *   - If server crashes between DB insert and BullMQ enqueue,
   *     the startup reconciliation picks it up.
   */
  async scheduleSingle(
    userId: string,
    payload: ScheduleEmailPayload
  ) {
    const scheduledAt = new Date(payload.scheduledAt);

    if (scheduledAt < new Date()) {
      throw new AppError(400, "scheduledAt must be in the future");
    }

    // Validate sender belongs to user
    const sender = await prisma.senderAccount.findFirst({
      where: { id: payload.senderId, userId },
    });
    if (!sender) {
      throw new AppError(404, "Sender account not found");
    }

    const idempotencyKey = generateIdempotencyKey(
      userId,
      payload.recipientEmail,
      scheduledAt
    );

    // ── Insert into DB ─────────────────────────────────────
    // P2002 (unique constraint) is caught by errorHandler
    const email = await emailRepository.create({
      idempotencyKey,
      recipient: payload.recipientEmail,
      subject: payload.subject,
      body: payload.body,
      scheduledAt,
      status: "PENDING",
      user: { connect: { id: userId } },
      sender: { connect: { id: payload.senderId } },
      ...(payload.campaignId && { campaign: { connect: { id: payload.campaignId } } }),
    });

    // ── Enqueue into BullMQ ────────────────────────────────
    const jobId = await enqueueEmailJob(
      {
        scheduledEmailId: email.id,
        userId,
        senderId: payload.senderId,
        recipient: payload.recipientEmail,
        subject: payload.subject,
        body: payload.body,
        idempotencyKey,
      },
      scheduledAt
    );

    // ── Update DB with job ID ──────────────────────────────
    await emailRepository.setBullJobId(email.id, jobId);

    // ── Index into Elasticsearch ───────────────────────────
    await elasticsearchService.indexEmail({
      id: email.id,
      userId,
      campaignId: payload.campaignId,
      senderId: payload.senderId,
      senderEmail: sender.fromEmail,
      recipient: payload.recipientEmail,
      subject: payload.subject,
      body: payload.body,
      status: "QUEUED",
      scheduledAt,
      createdAt: email.createdAt,
    });

    logger.info(`[EmailService] Email scheduled`, {
      emailId: email.id,
      jobId,
      recipient: payload.recipientEmail,
      scheduledAt: scheduledAt.toISOString(),
    });

    return email;
  }

  /**
   * Bulk schedule emails from a recipient list.
   * Spaces them out by delayBetweenMs.
   */
  async scheduleBulk(userId: string, payload: BulkSchedulePayload) {
    const { recipients, subject, body, startAt, delayBetweenMs, senderId, campaignName } =
      payload;

    // Validate sender
    const sender = await prisma.senderAccount.findFirst({
      where: { id: senderId, userId },
    });
    if (!sender) throw new AppError(404, "Sender account not found");

    // Create campaign
    const campaign = await prisma.emailCampaign.create({
      data: {
        userId,
        name: campaignName ?? `Campaign ${new Date().toISOString()}`,
        subject,
        body,
        scheduledAt: new Date(startAt),
        totalEmails: recipients.length,
        status: "IN_PROGRESS",
      },
    });

    const results: Array<{ recipient: string; status: "scheduled" | "duplicate" }> = [];

    for (let i = 0; i < recipients.length; i++) {
      const scheduledAt = new Date(new Date(startAt).getTime() + i * delayBetweenMs);

      try {
        await this.scheduleSingle(userId, {
          recipientEmail: recipients[i]!,
          subject,
          body,
          scheduledAt: scheduledAt.toISOString(),
          senderId,
          campaignId: campaign.id,
        });
        results.push({ recipient: recipients[i]!, status: "scheduled" });
      } catch (err: unknown) {
        // Idempotency key collision → already scheduled, not an error
        if ((err as { code?: string }).code === "P2002" || (err instanceof AppError && err.statusCode === 409)) {
          results.push({ recipient: recipients[i]!, status: "duplicate" });
        } else {
          throw err;
        }
      }
    }

    return { campaignId: campaign.id, results };
  }

  /**
   * Get scheduled emails for a user.
   * Shows PENDING (inserted but not yet enqueued), QUEUED (in BullMQ),
   * and PROCESSING (worker picked it up) - all "in-flight" statuses.
   */
  async getScheduled(userId: string, page = 1, limit = 20) {
    return emailRepository.findByUser(
      userId,
      ["PENDING", "QUEUED", "PROCESSING"],
      page,
      limit
    );
  }

  /**
   * Get sent emails for a user.
   */
  async getSent(userId: string, page = 1, limit = 20) {
    return emailRepository.findByUser(userId, "SENT", page, limit);
  }

  /**
   * Get a single email by ID.
   */
  async getById(id: string, userId: string) {
    const email = await emailRepository.findByIdAndUser(id, userId);
    if (!email) throw new AppError(404, "Email not found");
    return email;
  }

  /**
   * Full-text search via Elasticsearch with automatic PostgreSQL ILIKE fallback.
   */
  async search(params: EmailSearchParams) {
    try {
      const esResult = await elasticsearchService.searchEmails(params);
      if (esResult && (esResult.results.length > 0 || elasticsearchService.isReady())) {
        return esResult;
      }
    } catch {
      // Fallback to PostgreSQL
    }

    if (params.query) {
      return emailRepository.searchByUser(
        params.userId,
        params.query,
        params.page ?? 1,
        params.limit ?? 20
      );
    }

    return { results: [], total: 0 };
  }

  /**
   * Startup reconciliation — re-enqueue emails that are PENDING/QUEUED
   * but not in Redis (e.g., server crashed before enqueue).
   * Called once on server startup.
   * This is NOT a cron job — runs exactly once per startup.
   */
  async reconcileOnStartup(): Promise<void> {
    try {
      logger.info("[EmailService] Running startup reconciliation...");
      const emails = await emailRepository.findPendingForReconciliation();

      let requeued = 0;
      for (const email of emails) {
        // Check if job already exists in BullMQ (Redis has it)
        if (email.bullJobId) {
          const job = await getJobById(email.bullJobId);
          if (job) {
            logger.debug(`[Reconcile] Job exists in Redis, skipping`, { emailId: email.id });
            continue;
          }
        }

        // Job is missing from Redis → re-enqueue
        const idempotencyKey = email.idempotencyKey;
        const jobId = await enqueueEmailJob(
          {
            scheduledEmailId: email.id,
            userId: email.userId,
            senderId: email.senderId,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
            idempotencyKey,
          },
          email.scheduledAt
        );

        await emailRepository.setBullJobId(email.id, jobId);
        requeued++;
      }

      logger.info(`[Reconcile] Complete — requeued ${requeued}/${emails.length} emails`);
    } catch (err) {
      logger.error("[EmailService] Error during startup reconciliation (continuing boot):", err);
    }
  }
}

export const emailService = new EmailService();
