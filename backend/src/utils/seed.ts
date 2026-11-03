// ─────────────────────────────────────────────────────────────
//  utils/seed.ts
//  Database seed script for local development and demonstration.
//  Run via: pnpm db:seed
// ─────────────────────────────────────────────────────────────

import nodemailer from "nodemailer";
import { prisma } from "../config/database";
import { encrypt } from "./crypto";
import { generateJwt } from "../middleware/auth";
import { generateIdempotencyKey } from "./idempotency";
import { logger } from "./logger";

async function seedForUser(user: { id: string; email: string; name: string }) {
  logger.info(`[Seed] Seeding data for user: ${user.name} (${user.email})...`);

  // 2. Generate Ethereal test accounts for multiple senders
  let sender1 = await prisma.senderAccount.findFirst({
    where: { userId: user.id, displayName: "ReachInbox Sales", isActive: true },
  });

  if (!sender1) {
    const testAccount1 = await nodemailer.createTestAccount();
    sender1 = await prisma.senderAccount.create({
      data: {
        userId: user.id,
        displayName: "ReachInbox Sales",
        fromEmail: testAccount1.user,
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: testAccount1.user,
        smtpPassEncrypted: encrypt(testAccount1.pass),
        smtpSecure: false,
        isActive: true,
      },
    });
  }

  let sender2 = await prisma.senderAccount.findFirst({
    where: { userId: user.id, displayName: "Oliver Brown (Growth Lead)", isActive: true },
  });

  if (!sender2) {
    const testAccount2 = await nodemailer.createTestAccount();
    // Guard against Ethereal returning the same address as sender1
    const fromEmail =
      testAccount2.user === sender1!.fromEmail
        ? `growth.${testAccount2.user}`
        : testAccount2.user;
    sender2 = await prisma.senderAccount.upsert({
      where: { userId_fromEmail: { userId: user.id, fromEmail } },
      update: { displayName: "Oliver Brown (Growth Lead)", isActive: true },
      create: {
        userId: user.id,
        displayName: "Oliver Brown (Growth Lead)",
        fromEmail,
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: testAccount2.user,
        smtpPassEncrypted: encrypt(testAccount2.pass),
        smtpSecure: false,
        isActive: true,
      },
    });
  }

  // 3. Create Sample Email Campaigns
  const campaign1 = await prisma.emailCampaign.create({
    data: {
      userId: user.id,
      name: "Product Launch Outreach 2026",
      subject: "Introducing ReachInbox 2.0",
      body: "<p>Hi there,</p><p>We are thrilled to announce ReachInbox 2.0!</p>",
      scheduledAt: new Date(Date.now() + 3600000),
      totalEmails: 4,
      status: "IN_PROGRESS",
    },
  });

  const campaign2 = await prisma.emailCampaign.create({
    data: {
      userId: user.id,
      name: "Enterprise Q4 Warm Follow-ups",
      subject: "Custom Deliverability Infrastructure for Your Team",
      body: "<p>Hello,</p><p>Sharing our latest benchmarks on multi-sender email queue throughput.</p>",
      scheduledAt: new Date(Date.now() + 7200000),
      totalEmails: 2,
      status: "PENDING",
    },
  });

  // 4. Seed Scheduled Emails
  const scheduledSamples = [
    {
      recipient: "sarah.lead@example.com",
      subject: "Introducing ReachInbox 2.0 - Exclusive Preview",
      body: "Hi Sarah,\n\nHere is your exclusive preview link to the new ReachInbox automated outreach platform.\n\nBest regards,\nReachInbox Team",
      scheduledAt: new Date(Date.now() + 45 * 60 * 1000), // 45 mins from now
      status: "QUEUED" as const,
      senderId: sender1.id,
      campaignId: campaign1.id,
    },
    {
      recipient: "david.tech@example.com",
      subject: "Engineering discussion: High-throughput job scheduling with BullMQ",
      body: "Hi David,\n\nI noticed your recent article on distributed background task queues. Would love to share how we handle sub-second email dispatch with Redis.\n\nCheers,\nOliver",
      scheduledAt: new Date(Date.now() + 3 * 3600 * 1000), // 3 hours from now
      status: "QUEUED" as const,
      senderId: sender2.id,
      campaignId: campaign1.id,
    },
    {
      recipient: "emily.director@example.com",
      subject: "Demo follow-up & customized ROI calculator for your SDR team",
      body: "Hi Emily,\n\nFollowing up on our brief chat yesterday. I put together a quick ROI calculator based on 20,000 monthly cold emails.\n\nLet me know if 10 AM tomorrow works for a 15-minute walkthrough.",
      scheduledAt: new Date(Date.now() + 18 * 3600 * 1000), // Tomorrow morning
      status: "PENDING" as const,
      senderId: sender1.id,
      campaignId: campaign2.id,
    },
    {
      recipient: "marcus.ops@example.com",
      subject: "Scaling your outbound infrastructure without spam traps",
      body: "Hi Marcus,\n\nWanted to check if you have evaluated multi-domain sender rotation to protect your primary domain reputation.\n\nBest,\nOliver",
      scheduledAt: new Date(Date.now() + 36 * 3600 * 1000), // Day after tomorrow
      status: "PENDING" as const,
      senderId: sender2.id,
      campaignId: campaign2.id,
    },
  ];

  for (const sample of scheduledSamples) {
    const key = generateIdempotencyKey(user.id, sample.recipient, sample.scheduledAt);
    await prisma.scheduledEmail.upsert({
      where: { idempotencyKey: key },
      update: {},
      create: {
        userId: user.id,
        senderId: sample.senderId,
        campaignId: sample.campaignId,
        recipient: sample.recipient,
        subject: sample.subject,
        body: sample.body,
        scheduledAt: sample.scheduledAt,
        status: sample.status,
        idempotencyKey: key,
      },
    });
  }

  // 5. Seed Sent Emails
  const sentSamples = [
    {
      recipient: "alex.buyer@example.com",
      subject: "Welcome to ReachInbox Platform",
      body: "Hi Alex,\n\nWelcome to ReachInbox! Your API keys and dashboard credentials have been provisioned.\n\nReach out anytime if you need help with your first campaign.",
      scheduledAt: new Date(Date.now() - 2 * 3600 * 1000),
      sentAt: new Date(Date.now() - 2 * 3600 * 1000),
      status: "SENT" as const,
      senderId: sender1.id,
      campaignId: campaign1.id,
      etherealPreviewUrl: "https://ethereal.email/messages",
    },
    {
      recipient: "jessica.vp@example.com",
      subject: "Quick question regarding cold email deliverability",
      body: "Hi Jessica,\n\nSaw your team is expanding SDR hiring this quarter. Are you currently using dedicated IP warmups for new domains?\n\nBest,\nOliver",
      scheduledAt: new Date(Date.now() - 5 * 3600 * 1000),
      sentAt: new Date(Date.now() - 5 * 3600 * 1000),
      status: "SENT" as const,
      senderId: sender2.id,
      campaignId: campaign1.id,
      etherealPreviewUrl: "https://ethereal.email/messages",
    },
    {
      recipient: "michael.growth@example.com",
      subject: "ReachInbox API access & webhook documentation",
      body: "Hi Michael,\n\nHere is the documentation for listening to real-time email delivery webhooks and bounce alerts.\n\nLet me know if you run into any questions.",
      scheduledAt: new Date(Date.now() - 24 * 3600 * 1000),
      sentAt: new Date(Date.now() - 24 * 3600 * 1000),
      status: "SENT" as const,
      senderId: sender1.id,
      campaignId: campaign1.id,
      etherealPreviewUrl: "https://ethereal.email/messages",
    },
    {
      recipient: "brian.invalid@nonexistent-domain.test",
      subject: "Q4 Partnership Proposal",
      body: "Hi Brian,\n\nReaching out regarding our partnership proposal for Q4.",
      scheduledAt: new Date(Date.now() - 3 * 3600 * 1000),
      sentAt: null,
      status: "FAILED" as const,
      senderId: sender1.id,
      campaignId: campaign1.id,
      lastError: "SMTP 550 5.1.1 Recipient address rejected: User unknown in virtual mailbox table",
      attemptCount: 3,
      etherealPreviewUrl: null,
    },
  ];

  for (const sample of sentSamples) {
    const key = generateIdempotencyKey(user.id, sample.recipient, sample.scheduledAt);
    await prisma.scheduledEmail.upsert({
      where: { idempotencyKey: key },
      update: {},
      create: {
        userId: user.id,
        senderId: sample.senderId,
        campaignId: sample.campaignId,
        recipient: sample.recipient,
        subject: sample.subject,
        body: sample.body,
        scheduledAt: sample.scheduledAt,
        sentAt: sample.sentAt,
        status: sample.status,
        idempotencyKey: key,
        etherealPreviewUrl: sample.etherealPreviewUrl,
        lastError: (sample as any).lastError || null,
        attemptCount: (sample as any).attemptCount || 1,
      },
    });
  }

  // 6. Seed Slack Integration record
  await prisma.slackIntegration.upsert({
    where: { userId: user.id },
    update: { isActive: true },
    create: {
      userId: user.id,
      botUserId: "U0CEJS0TN8L",
      teamId: "T0CEHKLS6SG",
      teamName: "Surya",
      accessTokenEncrypted: encrypt("xoxb-12493666890900-12494884940292-P8bBQehXFPpQhmNomK80QTuA"),
      isActive: true,
    },
  });
}

async function main() {
  logger.info("[Seed] Starting database seeding...");

  // 1. Ensure Demo User exists
  const demoEmail = "demo@reachinbox.io";
  await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: "Demo User",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoUser",
    },
    create: {
      googleId: "demo-google-id-001",
      email: demoEmail,
      name: "Demo User",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoUser",
    },
  });

  // Seed for ALL users in the database (including Surya Kant Tiwari from Google login!)
  const allUsers = await prisma.user.findMany();
  for (const u of allUsers) {
    await seedForUser(u);
  }

  logger.info(`[Seed] Seeded data for ${allUsers.length} user(s).`);

  console.log("\n=======================================================");
  console.log("  SEED DATA CREATED SUCCESSFULLY!                      ");
  console.log("=======================================================");
  console.log(`  Users Seeded:    ${allUsers.map((u) => u.email).join(", ")}`);
  console.log("  Emails and Senders seeded for all accounts.");
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    logger.error("[Seed] Failed to seed database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

