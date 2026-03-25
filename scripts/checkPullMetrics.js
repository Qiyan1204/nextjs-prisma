const { PrismaClient } = require("../app/generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const since12 = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const total = await prisma.pullMetric.count();
    const last12 = await prisma.pullMetric.count({ where: { createdAt: { gte: since12 } } });
    const byKind = await prisma.pullMetric.groupBy({
      by: ["kind"],
      _count: { _all: true },
    });

    console.log("total=", total, "last12h=", last12);
    console.log("byKind=", JSON.stringify(byKind));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
