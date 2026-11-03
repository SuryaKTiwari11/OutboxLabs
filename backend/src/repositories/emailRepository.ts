// ─────────────────────────────────────────────────────────────
//  repositories/emailRepository.ts
//  Repository pattern: all DB access for ScheduledEmail.
//  Controllers/services never call prisma directly for emails.
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";
import { Pagination, EmailStatus } from "../types";

// Derive Prisma input types from the client at compile-time
// (avoids importing from @prisma/client directly — keeps types sync'd)
type ScheduledEmailCreateInput = Parameters<typeof prisma.scheduledEmail.create>[0]["data"];

export class EmailRepository {
  /**
   * Create a new scheduled email record.
   * Throws P2002 (unique constraint) if idempotencyKey already exists.
   */
  async create(data: ScheduledEmailCreateInput) {
    return prisma.scheduledEmail.create({ data, include: { sender: true } });
  }

  /**
   * Find emails by user with optional status filter (single or array) and pagination.
   * Passing an array queries any of those statuses (OR condition via Prisma `in:`).
   */
  async findByUser(
    userId: string,
    status?: EmailStatus | EmailStatus[],
    page = 1,
    limit = 20
  ): Promise<{
    emails: Awaited<ReturnType<typeof prisma.scheduledEmail.findMany>>;
    pagination: Pagination;
  }> {
    const where = {
      userId,
      ...(status
        ? Array.isArray(status)
          ? { status: { in: status } }   // multi-status filter
          : { status }                    // single-status filter
        : {}),
    };

    const [emails, total] = await prisma.$transaction([
      prisma.scheduledEmail.findMany({
        where,
        include: { sender: true, campaign: true },
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scheduledEmail.count({ where }),
    ]);

    return {
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single email by ID, scoped to authenticated user.
   * Prevents cross-user data access.
   */
  async findByIdAndUser(id: string, userId: string) {
    return prisma.scheduledEmail.findFirst({
      where: { id, userId },
      include: { sender: true, campaign: true, attempts: true },
    });
  }

  /**
   * Update email status + optional extra fields.
   */
  async updateStatus(
    id: string,
    status: EmailStatus,
    extra?: Partial<{
      sentAt: Date;
      bullJobId: string;
      smtpMessageId: string;
      etherealPreviewUrl: string;
      lastError: string;
    }>
  ) {
    return prisma.scheduledEmail.update({
      where: { id },
      data: { status, ...extra },
    });
  }

  /**
   * Find QUEUED emails with a recorded BullMQ ID.
   * PENDING emails are published by the transactional outbox dispatcher;
   * reconciling them here would create a second publisher path.
   * NOT a cron — called exactly once on server startup.
   */
  async findPendingForReconciliation() {
    return prisma.scheduledEmail.findMany({
      where: {
        status: "QUEUED",
        bullJobId: { not: null },
      },
      include: { sender: true },
      orderBy: { scheduledAt: "asc" },
    });
  }

  /**
   * Set the BullMQ job ID after successfully enqueuing.
   */
  async setBullJobId(id: string, bullJobId: string) {
    return prisma.scheduledEmail.update({
      where: { id },
      data: { bullJobId, status: "QUEUED" },
    });
  }

  /**
   * Search emails in PostgreSQL with case-insensitive ILIKE fallback
   * when Elasticsearch is unavailable or disabled.
   */
  async searchByUser(userId: string, query: string, page = 1, limit = 20) {
    const where = {
      userId,
      OR: [
        { recipient: { contains: query, mode: "insensitive" as const } },
        { subject: { contains: query, mode: "insensitive" as const } },
        { body: { contains: query, mode: "insensitive" as const } },
      ],
    };

    const [emails, total] = await prisma.$transaction([
      prisma.scheduledEmail.findMany({
        where,
        include: { sender: true, campaign: true },
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scheduledEmail.count({ where }),
    ]);

    return {
      results: emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        campaignId: e.campaignId,
        senderId: e.senderId,
        recipient: e.recipient,
        subject: e.subject,
        body: e.body,
        status: e.status,
        scheduledAt: e.scheduledAt.toISOString(),
        sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
    };
  }
}

export const emailRepository = new EmailRepository();
