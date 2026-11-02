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
   * Find emails by user with optional status filter and pagination.
   */
  async findByUser(
    userId: string,
    status?: EmailStatus,
    page = 1,
    limit = 20
  ): Promise<{
    emails: Awaited<ReturnType<typeof prisma.scheduledEmail.findMany>>;
    pagination: Pagination;
  }> {
    const where = {
      userId,
      ...(status ? { status } : {}),
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
   * Find all PENDING/QUEUED emails with future scheduledAt.
   * Used by startup reconciliation — re-enqueues after Redis restart.
   * NOT a cron — called exactly once on server startup.
   */
  async findPendingForReconciliation() {
    return prisma.scheduledEmail.findMany({
      where: {
        status: { in: ["PENDING", "QUEUED"] },
        scheduledAt: { gt: new Date() },
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
}

export const emailRepository = new EmailRepository();
