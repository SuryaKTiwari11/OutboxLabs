import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS reachinbox;`);
    console.log("Cleaned up extra database 'reachinbox'.");
  } catch (err: any) {
    console.error("Cleanup error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

