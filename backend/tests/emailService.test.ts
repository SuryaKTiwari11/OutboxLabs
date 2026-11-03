// ─────────────────────────────────────────────────────────────
//  tests/emailService.test.ts
//  Unit tests for EmailService business logic & scheduling.
// ─────────────────────────────────────────────────────────────

// Mock environment variables before any module loads
process.env["DATABASE_URL"]        = "postgresql://test:test@localhost:5432/test";
process.env["GOOGLE_CLIENT_ID"]    = "test";
process.env["GOOGLE_CLIENT_SECRET"]= "test";
process.env["GOOGLE_CALLBACK_URL"] = "http://localhost/callback";
process.env["SLACK_CLIENT_ID"]     = "test";
process.env["SLACK_CLIENT_SECRET"] = "test";
process.env["SLACK_REDIRECT_URI"]  = "http://localhost/slack";
process.env["JWT_SECRET"]          = "test-secret-minimum-32-chars-long!!!!";
process.env["ENCRYPTION_KEY"]      = "a".repeat(64);

import { EmailService } from "../src/services/emailService";
import { emailRepository } from "../src/repositories/emailRepository";
import { enqueueEmailJob, getJobById } from "../src/queues/emailQueue";
import { elasticsearchService } from "../src/integrations/elasticsearch";
import { prisma } from "../src/config/database";
import { AppError } from "../src/middleware/errorHandler";
import { outboxService } from "../src/services/outboxService";

jest.mock("../src/repositories/emailRepository", () => ({
  emailRepository: {
    create: jest.fn(),
    setBullJobId: jest.fn(),
    findByUser: jest.fn(),
    findByIdAndUser: jest.fn(),
    findPendingForReconciliation: jest.fn(),
  },
}));

jest.mock("../src/queues/emailQueue", () => ({
  enqueueEmailJob: jest.fn(),
  getJobById: jest.fn(),
}));

jest.mock("../src/integrations/elasticsearch", () => ({
  elasticsearchService: {
    indexEmail: jest.fn().mockResolvedValue(undefined),
    searchEmails: jest.fn().mockResolvedValue({ results: [], total: 0 }),
  },
}));

jest.mock("../src/config/database", () => ({
  prisma: {
    senderAccount: {
      findFirst: jest.fn(),
    },
    emailCampaign: {
      create: jest.fn(),
    },
  },
}));

jest.mock("../src/services/outboxService", () => ({
  outboxService: {
    createEmailWithOutbox: jest.fn(),
  },
}));

describe("EmailService", () => {
  let emailService: EmailService;
  const mockUserId = "user-123";
  const mockSenderId = "sender-456";

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService();
  });

  describe("scheduleSingle", () => {
    it("rejects scheduledAt in the past", async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();

      await expect(
        emailService.scheduleSingle(mockUserId, {
          recipientEmail: "lead@example.com",
          subject: "Hello",
          body: "Test email",
          scheduledAt: pastDate,
          senderId: mockSenderId,
        })
      ).rejects.toThrow(new AppError(400, "scheduledAt must be in the future"));
    });

    it("rejects if sender is not found or does not belong to user", async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      (prisma.senderAccount.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        emailService.scheduleSingle(mockUserId, {
          recipientEmail: "lead@example.com",
          subject: "Hello",
          body: "Test email",
          scheduledAt: futureDate,
          senderId: mockSenderId,
        })
      ).rejects.toThrow(new AppError(404, "Sender account not found"));
    });

    it("successfully creates email, enqueues BullMQ job, and indexes in ES", async () => {
      const futureDate = new Date(Date.now() + 60000);
      (prisma.senderAccount.findFirst as jest.Mock).mockResolvedValue({
        id: mockSenderId,
        fromEmail: "sender@example.com",
      });

      const mockCreatedEmail = {
        id: "email-789",
        idempotencyKey: "test-hash",
        recipient: "lead@example.com",
        scheduledAt: futureDate,
        createdAt: new Date(),
      };
      (outboxService.createEmailWithOutbox as jest.Mock).mockResolvedValue(mockCreatedEmail);

      const result = await emailService.scheduleSingle(mockUserId, {
        recipientEmail: "lead@example.com",
        subject: "Welcome",
        body: "<p>Hello</p>",
        scheduledAt: futureDate.toISOString(),
        senderId: mockSenderId,
      });

      expect(result).toBe(mockCreatedEmail);
      expect(outboxService.createEmailWithOutbox).toHaveBeenCalled();
      expect(enqueueEmailJob).not.toHaveBeenCalled();
      expect(elasticsearchService.indexEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "email-789",
          userId: mockUserId,
          recipient: "lead@example.com",
        })
      );
    });

    it("returns the scheduled email when Elasticsearch indexing fails", async () => {
      const futureDate = new Date(Date.now() + 60000);
      (prisma.senderAccount.findFirst as jest.Mock).mockResolvedValue({
        id: mockSenderId,
        fromEmail: "sender@example.com",
      });

      const mockCreatedEmail = {
        id: "email-es-unavailable",
        idempotencyKey: "test-hash-es-unavailable",
        recipient: "lead@example.com",
        scheduledAt: futureDate,
        createdAt: new Date(),
      };
      (outboxService.createEmailWithOutbox as jest.Mock).mockResolvedValue(mockCreatedEmail);
      (elasticsearchService.indexEmail as jest.Mock).mockRejectedValue(
        new Error("Elastic Cloud unavailable")
      );

      await expect(
        emailService.scheduleSingle(mockUserId, {
          recipientEmail: "lead@example.com",
          subject: "Welcome",
          body: "Test email",
          scheduledAt: futureDate.toISOString(),
          senderId: mockSenderId,
        })
      ).resolves.toBe(mockCreatedEmail);
    });
  });

  describe("reconcileOnStartup", () => {
    it("re-enqueues orphaned emails missing in Redis", async () => {
      const pendingEmail = {
        id: "email-orphan",
        status: "QUEUED",
        bullJobId: "bull-job-missing",
        idempotencyKey: "key-orphan",
        userId: mockUserId,
        senderId: mockSenderId,
        recipient: "lost@example.com",
        subject: "Recovery",
        body: "Test",
        scheduledAt: new Date(Date.now() + 100000),
      };

      (emailRepository.findPendingForReconciliation as jest.Mock).mockResolvedValue([pendingEmail]);
      // Redis does NOT have this job (server crashed or Redis restarted)
      (getJobById as jest.Mock).mockResolvedValue(null);
      (enqueueEmailJob as jest.Mock).mockResolvedValue("new-bull-job-1");

      await emailService.reconcileOnStartup();

      expect(enqueueEmailJob).toHaveBeenCalled();
      expect(emailRepository.setBullJobId).toHaveBeenCalledWith("email-orphan", "new-bull-job-1");
    });

    it("skips emails that already exist in Redis", async () => {
      const activeEmail = {
        id: "email-active",
        bullJobId: "bull-job-active",
        scheduledAt: new Date(Date.now() + 100000),
      };

      (emailRepository.findPendingForReconciliation as jest.Mock).mockResolvedValue([activeEmail]);
      (getJobById as jest.Mock).mockResolvedValue({ id: "bull-job-active" });

      await emailService.reconcileOnStartup();

      expect(enqueueEmailJob).not.toHaveBeenCalled();
    });
  });
});
