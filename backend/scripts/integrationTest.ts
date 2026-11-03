import { randomUUID } from "node:crypto";
import { connectDatabase, disconnectDatabase, prisma } from "../src/config/database";
import { closeRedisClient } from "../src/config/redis";
import { closeEmailQueue, emailQueue } from "../src/queues/emailQueue";
import { RateLimitService } from "../src/services/rateLimitService";
import { elasticsearchService } from "../src/integrations/elasticsearch";

async function runIntegrationTest(): Promise<void> {
  const senderId = `integration-${randomUUID()}`;
  const jobId = `integration-${randomUUID()}`;

  await connectDatabase();
  await prisma.$queryRaw`SELECT 1`;

  const queueJob = await emailQueue.add(
    "integration-check",
    {
      scheduledEmailId: "integration-check",
      idempotencyKey: jobId,
    },
    { jobId, delay: 60_000, removeOnComplete: true, removeOnFail: true }
  );
  if (queueJob.id !== jobId) {
    throw new Error("BullMQ did not preserve the deterministic integration job ID");
  }

  const limiter = new RateLimitService(3);
  const reservations = await Promise.all(
    Array.from({ length: 10 }, () => limiter.tryReserveSlot(senderId))
  );
  const allowed = reservations.filter((result) => result.allowed).length;
  if (allowed !== 3) {
    throw new Error(`Expected exactly 3 concurrent Redis reservations, received ${allowed}`);
  }

  if (process.env.RUN_ELASTICSEARCH_INTEGRATION === "true") {
    await elasticsearchService.initialize();
  }
  console.log(JSON.stringify({
    database: "ok",
    bullmq: "ok",
    redisLuaReservations: `${allowed}/10`,
    elasticsearch: process.env.RUN_ELASTICSEARCH_INTEGRATION === "true"
      ? (elasticsearchService.isReady() ? "ok" : "unavailable")
      : "optional-skipped",
  }, null, 2));

  await emailQueue.remove(jobId);
}

runIntegrationTest()
  .catch((error: unknown) => {
    console.error("[IntegrationTest] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEmailQueue();
    await closeRedisClient();
    await disconnectDatabase();
    process.exit(process.exitCode ?? 0);
  });
