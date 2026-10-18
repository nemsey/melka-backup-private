// پرس‌وجوی مقادیر سند (ستون سند M2) برای رنگ‌آمیزی — PN-025/حذفیات-تغییرات
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const grouped = await db.requestRecord.groupBy({
    by: ["sanadNames"],
    _count: true,
    where: { sanadNames: { not: null } },
    orderBy: { _count: { sanadNames: "desc" } },
    take: 60,
  });

  const single = new Map<string, number>();
  for (const g of grouped) {
    const raw = g.sanadNames ?? "";
    for (const part of raw.split(/[,،]/)) {
      const v = part.trim();
      if (v) single.set(v, (single.get(v) ?? 0) + g._count);
    }
  }
  console.log("=== تک‌مقادیر سند (تفکیک‌شده) ===");
  for (const [v, c] of [...single.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${v} :: ${c}`);
  }
}

main().finally(() => db.$disconnect());
