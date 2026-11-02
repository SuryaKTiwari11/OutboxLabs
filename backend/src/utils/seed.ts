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

async function main() {
  logger.info("[Seed] Starting database seeding...");

  // 1. Create or upsert Demo User
  const demoEmail = "demo@reachinbox.io";
  const user = await prisma.user.upsert({
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

  logger.info(`[Seed] Demo User ready: ${user.email} (ID: ${user.id})`);

  // 2. Generate Ethereal test account for sender
  let sender = await prisma.senderAccount.findFirst({
    where: { userId: user.id, isActive: true },
  });

  let etherealPass = "";
  if (!sender) {
    logger.info("[Seed] Creating Ethereal SMTP test account...");
    const testAccount = await nodemailer.createTestAccount();
    etherealPass = testAccount.pass;

    sender = await prisma.senderAccount.create({
      data: {
        userId: user.id,
        displayName: "ReachInbox Sales",
        fromEmail: testAccount.user,
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: testAccount.user,
        smtpPassEncrypted: encrypt(testAccount.pass),
        smtpSecure: false,
        isActive: true,
      },
    });
    logger.info(`[Seed] Created Ethereal Sender: ${sender.fromEmail}`);
  } else {
    logger.info(`[Seed] Using existing Sender: ${sender.fromEmail}`);
  }

  // 3. Create Sample Email Campaign
  const campaign = await prisma.emailCampaign.create({
    data: {
      userId: user.id,
      name: "Product Launch Outreach",
      subject: "Introducing ReachInbox 2.0",
      body: "<p>Hi there,</p><p>We are thrilled to announce ReachInbox 2.0!</p>",
      scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
      totalEmails: 2,
      status: "IN_PROGRESS",
    },
  });

  // 4. Create Sample Scheduled Emails
  const futureDate = new Date(Date.now() + 7200000); // 2 hours in future
  const idempotencyKey1 = generateIdempotencyKey(user.id, "sarah.lead@example.com", futureDate);

  await prisma.scheduledEmail.upsert({
    where: { idempotencyKey: idempotencyKey1 },
    update: {},
    create: {
      userId: user.id,
      senderId: sender.id,
      campaignId: campaign.id,
      recipient: "sarah.lead@example.com",
      subject: "Introducing ReachInbox 2.0 - Exclusive Preview",
      body: "<p>Hi Sarah,</p><p>Here is your exclusive preview link!</p>",
      scheduledAt: futureDate,
      status: "QUEUED",
      idempotencyKey: idempotencyKey1,
    },
  });

  const sentDate = new Date(Date.now() - 3600000); // 1 hour ago
  const idempotencyKey2 = generateIdempotencyKey(user.id, "alex.buyer@example.com", sentDate);

  await prisma.scheduledEmail.upsert({
    where: { idempotencyKey: idempotencyKey2 },
    update: {},
    create: {
      userId: user.id,
      senderId: sender.id,
      campaignId: campaign.id,
      recipient: "alex.buyer@example.com",
      subject: "Welcome to ReachInbox Platform",
      body: "<p>Hi Alex,</p><p>Welcome aboard!</p>",
      scheduledAt: sentDate,
      sentAt: sentDate,
      status: "SENT",
      idempotencyKey: idempotencyKey2,
      etherealPreviewUrl: "https://ethereal.email/messages",
    },
  });

  // 5. Generate development JWT cookie
  const devToken = generateJwt(user.id, user.email);

  console.log("\n=======================================================");
  console.log("  SEED DATA CREATED SUCCESSFULLY!                      ");
  console.log("=======================================================");
  console.log(`  User:            ${user.name} (${user.email})`);
  console.log(`  Sender:          ${sender.displayName} <${sender.fromEmail}>`);
  if (etherealPass) {
    console.log(`  Ethereal Login:  ${sender.smtpUser} / ${etherealPass}`);
  }
  console.log("\n  --- BYPASS GOOGLE OAUTH FOR LOCAL TESTING ---");
  console.log("  Set this cookie in your browser (http://localhost:5173):");
  console.log(`  Name:  auth_token`);
  console.log(`  Value: ${devToken}`);
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
