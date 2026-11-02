// ─────────────────────────────────────────────────────────────
//  config/database.ts
//  Prisma client singleton.
//  In development, reuse across hot-reloads to avoid
//  "too many connections" errors.
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Prevent multiple Prisma instances in development (hot reload)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: env.isDevelopment()
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  global.__prisma ?? createPrismaClient();

if (env.isDevelopment()) {
  global.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

