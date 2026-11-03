// ─────────────────────────────────────────────────────────────
//  services/outboxService.ts
//  Transactional Outbox Pattern implementation.
//  Guarantees atomic persistence of business state (ScheduledEmail)
//  and queue events (OutboxEvent) in a single PostgreSQL transaction.
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { generateIdempotencyKey } from "../utils/idempotency";
import { ScheduleEmailPayload } from "../types";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { emailsScheduledCounter } from "../config/metrics";

export class OutboxService {
  /**
   * Schedule a single email atomically with an outbox event.
   * If the process crashes immediately after this call, the outbox dispatcher
   * or startup reconciliation is guaranteed to publish the event to BullMQ.
   */
  async createEmailWithOutbox(userId: string, payload: ScheduleEmailPayload) {
    const scheduledAt = new Date(payload.scheduledAt);

    if (scheduledAt < new Date()) {
      throw new AppError(400, "scheduledAt must be in the future");
    }

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

    // ── Atomic PostgreSQL Transaction ──────────────────────────
    const [email, event] = await prisma.$transaction(async (tx) => {
      // 1. Create the scheduled email
      const newEmail = await tx.scheduledEmail.create({
        data: {
          idempotencyKey,
          recipient: payload.recipientEmail,
          subject: payload.subject,
          body: payload.body,
          scheduledAt,
          status: "PENDING",
          user: { connect: { id: userId } },
          sender: { connect: { id: payload.senderId } },
          ...(payload.campaignId && { campaign: { connect: { id: payload.campaignId } } }),
        },
        include: { sender: true },
      });

      // 2. Create the Outbox Event in the SAME transaction
      const outboxEvent = await tx.outboxEvent.create({
        data: {
          aggregateType: "EMAIL",
          aggregateId: newEmail.id,
          eventType: "EMAIL_SCHEDULED",
          payload: JSON.stringify({
            scheduledEmailId: newEmail.id,
            userId,
            senderId: payload.senderId,
            recipient: payload.recipientEmail,
            subject: payload.subject,
            body: payload.body,
            scheduledAt: scheduledAt.toISOString(),
            idempotencyKey,
            hourlyLimit: payload.hourlyLimit,
          }),
          status: "PENDING",
        },
      });

      return [newEmail, outboxEvent];
    });

    emailsScheduledCounter.inc({ senderId: payload.senderId, campaign: payload.campaignId ?? "none" });

    logger.info("[Outbox] Email + Outbox event committed atomically", {
      emailId: email.id,
      outboxEventId: event.id,
      scheduledAt: scheduledAt.toISOString(),
    });

    return email;
  }
}

export const outboxService = new OutboxService();
