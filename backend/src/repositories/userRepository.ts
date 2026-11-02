// =============================================================================
//  repositories/userRepository.ts
//  Repository for User and SenderAccount DB access.
//  Pattern: all DB access for these models lives here — no direct prisma calls
//  in controllers or services.
// =============================================================================

import { prisma } from "../config/database";

export class UserRepository {
  async findByGoogleId(googleId: string) {
    return prisma.user.findUnique({ where: { googleId } });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { senderAccounts: true, slackIntegration: true },
    });
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async upsertFromGoogle(profile: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }) {
    return prisma.user.upsert({
      where: { googleId: profile.googleId },
      update: {
        name:      profile.name,
        avatarUrl: profile.avatarUrl,
      },
      create: {
        googleId:  profile.googleId,
        email:     profile.email,
        name:      profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
  }
}

export class SenderAccountRepository {
  /**
   * List active sender accounts for a user.
   * Sorted newest-first (createdAt desc).
   */
  async findByUser(userId: string) {
    return prisma.senderAccount.findMany({
      where:   { userId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.senderAccount.findUnique({ where: { id } });
  }

  /** Create a new sender account (called by SenderService). */
  async create(data: {
    userId: string;
    displayName: string;
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassEncrypted: string;
    smtpSecure?: boolean;
    isActive?: boolean;
  }) {
    return prisma.senderAccount.create({ data });
  }
}

export const userRepository = new UserRepository();
export const senderAccountRepository = new SenderAccountRepository();
