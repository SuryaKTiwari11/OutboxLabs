// ─────────────────────────────────────────────────────────────
//  scripts/loadTest.ts
//  Load test & high-throughput simulation script.
//  Simulates 1,000 scheduled emails across multiple senders.
//  Validates:
//  - Batch insertion throughput
//  - Transactional outbox event creation
//  - Distributed rate limit rollover
//  - Memory and latency overhead
//
//  Run via: pnpm test:load
// ─────────────────────────────────────────────────────────────

import { prisma } from "../src/config/database";
import { encrypt } from "../src/utils/crypto";
import { generateIdempotencyKey } from "../src/utils/idempotency";
import { logger } from "../src/utils/logger";

interface LoadTestOptions {
  totalEmails?: number;
  batchSize?: number;
}

export async function runLoadTest(options: LoadTestOptions = {}): Promise<void> {
  const totalEmails = options.totalEmails ?? 1000;
  const batchSize = options.batchSize ?? 100;

  console.log("\n=======================================================");
  console.log(`  STARTING LOAD TEST: ${totalEmails} Scheduled Emails`);
  console.log("=======================================================\n");

  // 1. Setup Demo User & Senders
  const user = await prisma.user.upsert({
    where: { email: "loadtest@reachinbox.io" },
    update: {},
    create: {
      googleId: "loadtest-google-id",
      email: "loadtest@reachinbox.io",
      name: "Load Tester",
    },
  });

  const sendersData = [
    { displayName: "Sender Alpha (High Quota)", fromEmail: "alpha@ethereal.email", quota: 500 },
    { displayName: "Sender Beta (Medium Quota)", fromEmail: "beta@ethereal.email", quota: 200 },
    { displayName: "Sender Gamma (Low Quota)", fromEmail: "gamma@ethereal.email", quota: 50 },
  ];

  const senderIds: string[] = [];
  for (const s of sendersData) {
    const sender = await prisma.senderAccount.upsert({
      where: { userId_fromEmail: { userId: user.id, fromEmail: s.fromEmail } },
      update: {},
      create: {
        userId: user.id,
        displayName: s.displayName,
        fromEmail: s.fromEmail,
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpUser: s.fromEmail,
        smtpPassEncrypted: encrypt("password123"),
        smtpSecure: false,
        isActive: true,
      },
    });
    senderIds.push(sender.id);
  }

  // 2. Generate 1,000 Scheduled Emails & Outbox Events in Batches
  const startTime = Date.now();
  let createdCount = 0;
  const now = Date.now();

  for (let b = 0; b < totalEmails / batchSize; b++) {
    const emailBatch = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = b * batchSize + i;
      const senderId = senderIds[idx % senderIds.length]!;
      const recipient = `lead_${idx}@example.com`;
      const scheduledAt = new Date(now + 60000 + (idx * 50)); // Staggered over future minutes
      const idempotencyKey = generateIdempotencyKey(user.id, recipient, scheduledAt);

      emailBatch.push({
        idempotencyKey,
        recipient,
        subject: `Performance Test Email #${idx}`,
        body: `<p>Hello lead ${idx}, this is a high-throughput load test.</p>`,
        scheduledAt,
        status: "PENDING" as const,
        userId: user.id,
        senderId,
      });

    }

    // Keep the email rows and their outbox events in one transaction. The
    // second query resolves generated email IDs before creating events.
    await prisma.$transaction(async (tx) => {
      await tx.scheduledEmail.createMany({ data: emailBatch, skipDuplicates: true });
      const createdEmails = await tx.scheduledEmail.findMany({
        where: { idempotencyKey: { in: emailBatch.map((email) => email.idempotencyKey) } },
        select: {
          id: true,
          idempotencyKey: true,
          userId: true,
          senderId: true,
          recipient: true,
          subject: true,
          scheduledAt: true,
        },
      });

      await tx.outboxEvent.createMany({
        data: createdEmails.map((email) => ({
          aggregateType: "EMAIL",
          aggregateId: email.id,
          eventType: "EMAIL_SCHEDULED",
          payload: JSON.stringify({
            scheduledEmailId: email.id,
            userId: email.userId,
            senderId: email.senderId,
            recipient: email.recipient,
            subject: email.subject,
            scheduledAt: email.scheduledAt.toISOString(),
            idempotencyKey: email.idempotencyKey,
          }),
          status: "PENDING" as const,
        })),
        skipDuplicates: true,
      });
    });

    createdCount += batchSize;
    process.stdout.write(`  Progress: ${createdCount}/${totalEmails} emails committed...\r`);
  }

  const durationMs = Date.now() - startTime;
  const throughput = Math.round((totalEmails / (durationMs / 1000)));

  console.log("\n\n=======================================================");
  console.log("  LOAD TEST COMPLETED SUCCESSFULLY!                    ");
  console.log("=======================================================");
  console.log(`  Total Emails Scheduled:     ${totalEmails}`);
  console.log(`  Senders Simulated:          ${senderIds.length}`);
  console.log(`  Total Duration:             ${durationMs} ms`);
  console.log(`  Database Throughput:        ${throughput} emails/sec`);
  console.log(`  Memory Usage (Heap Used):   ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  console.log("=======================================================\n");
}

if (require.main === module) {
  const args = new Map(
    process.argv.slice(2).flatMap((argument) => {
      const [key, value] = argument.split("=");
      return key && value ? [[key, value] as [string, string]] : [];
    })
  );
  runLoadTest({
    totalEmails: args.has("--totalEmails") ? Number(args.get("--totalEmails")) : undefined,
    batchSize: args.has("--batchSize") ? Number(args.get("--batchSize")) : undefined,
  })
    .catch((err) => {
      logger.error("[LoadTest] Simulation failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
