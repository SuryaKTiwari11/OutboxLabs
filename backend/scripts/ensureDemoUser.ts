import { prisma } from "../src/config/database";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@reachinbox.io" },
    update: {
      name: "Demo User",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoUser",
    },
    create: {
      googleId: "dev-test-google-id",
      email: "demo@reachinbox.io",
      name: "Demo User",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoUser",
    },
  });
  console.log("✅ Demo user ready:", user.email, "| id:", user.id);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });

