// =============================================================================
//  services/senderService.ts
//  Business logic for managing Sender Accounts (SMTP identities).
//
//  Design decisions:
//  - "Ethereal" accounts are auto-generated via nodemailer.createTestAccount().
//    No real SMTP credentials needed — perfect for demos and testing.
//  - Passwords are AES-256-GCM encrypted before storage (never plaintext).
//  - Users can also provide custom SMTP credentials (Gmail, SendGrid, etc.).
//  - A user can have multiple senders (different campaigns, different addresses).
//  - fromEmail is the display address; SMTP host/port/user are separate fields.
// =============================================================================

import nodemailer from "nodemailer";
import { prisma } from "../config/database";
import { encrypt } from "../utils/crypto";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateEtherealSenderInput {
  /** Display name shown in the "From:" header */
  displayName: string;
}

export interface CreateCustomSenderInput {
  displayName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure?: boolean;
}

// ── Service class ─────────────────────────────────────────────────────────────

export class SenderService {
  /**
   * Create an Ethereal (fake) sender account.
   *
   * Ethereal Email is a free disposable SMTP service from Nodemailer.
   * All sent emails appear in an Ethereal inbox with a preview URL -- perfect
   * for demos without real SMTP credentials.
   *
   * Flow:
   *   1. Call nodemailer.createTestAccount() to get fake SMTP credentials
   *   2. Encrypt the SMTP password with AES-256-GCM
   *   3. Save to DB
   *   4. Return sender + plaintext Ethereal credentials (password shown ONCE)
   */
  async createEtherealSender(userId: string, input: CreateEtherealSenderInput) {
    logger.info("[SenderService] Generating Ethereal test account...");

    // Auto-generate Ethereal credentials from Nodemailer
    const testAccount = await nodemailer.createTestAccount();

    const encryptedPass = encrypt(testAccount.pass);

    const sender = await prisma.senderAccount.create({
      data: {
        userId,
        displayName: input.displayName,
        fromEmail:   testAccount.user,  // e.g. abcd1234@ethereal.email
        smtpHost:    "smtp.ethereal.email",
        smtpPort:    587,
        smtpUser:    testAccount.user,
        smtpPassEncrypted: encryptedPass,
        smtpSecure:  false,
        isActive:    true,
      },
    });

    logger.info("[SenderService] Ethereal sender created", {
      senderId:  sender.id,
      fromEmail: sender.fromEmail,
    });

    return {
      ...sender,
      etherealInboxUrl:  "https://ethereal.email/login",
      etherealUser:      testAccount.user,
      // Password shown ONCE so user can log into the Ethereal web inbox
      etherealPassOnce:  testAccount.pass,
    };
  }

  /**
   * Create a custom SMTP sender account.
   * Supports Gmail, SendGrid, Mailgun, or any SMTP provider.
   */
  async createCustomSender(userId: string, input: CreateCustomSenderInput) {
    const encryptedPass = encrypt(input.smtpPass);

    const sender = await prisma.senderAccount.create({
      data: {
        userId,
        displayName: input.displayName,
        fromEmail:   input.fromEmail,
        smtpHost:    input.smtpHost,
        smtpPort:    input.smtpPort,
        smtpUser:    input.smtpUser,
        smtpPassEncrypted: encryptedPass,
        smtpSecure:  input.smtpSecure ?? (input.smtpPort === 465),
        isActive:    true,
      },
    });

    logger.info("[SenderService] Custom sender created", {
      senderId:  sender.id,
      fromEmail: sender.fromEmail,
    });

    return sender;
  }

  /**
   * List all active sender accounts for a user.
   * Password is never returned -- smtpPassEncrypted is intentionally omitted.
   */
  async listSenders(userId: string) {
    return prisma.senderAccount.findMany({
      where:   { userId, isActive: true },
      select: {
        id:          true,
        displayName: true,
        fromEmail:   true,
        smtpHost:    true,
        smtpPort:    true,
        smtpUser:    true,
        smtpSecure:  true,
        isActive:    true,
        createdAt:   true,
        // smtpPassEncrypted intentionally omitted
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single sender, scoped to the authenticated user.
   * Throws 404 if not found or belongs to another user.
   */
  async getSender(id: string, userId: string) {
    const sender = await prisma.senderAccount.findFirst({
      where:  { id, userId, isActive: true },
      select: {
        id:          true,
        displayName: true,
        fromEmail:   true,
        smtpHost:    true,
        smtpPort:    true,
        smtpUser:    true,
        smtpSecure:  true,
        isActive:    true,
        createdAt:   true,
      },
    });

    if (!sender) throw new AppError(404, "Sender account not found");
    return sender;
  }

  /**
   * Soft-delete a sender account (sets isActive = false).
   * We soft-delete instead of hard-delete to preserve delivery history
   * for emails that were sent using this sender.
   */
  async deleteSender(id: string, userId: string) {
    // Verify ownership before deleting
    const sender = await prisma.senderAccount.findFirst({
      where: { id, userId },
    });
    if (!sender) throw new AppError(404, "Sender account not found");

    await prisma.senderAccount.update({
      where: { id },
      data:  { isActive: false },
    });

    logger.info("[SenderService] Sender deactivated", { senderId: id });
  }
}

export const senderService = new SenderService();
