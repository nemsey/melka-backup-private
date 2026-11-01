// accelerate-m2-completion.ts — شتاب‌دهی تکمیل ستون‌های ناقص M2 (P6549)
// غنی‌سازی هدفمند ردیف‌هایی که موبایل متقاضی/دسته‌بندی/نوع ملک/قیمت ندارند (rowIds — عبور از فیلتر pending)
// اجرا: bun scripts/p6549/accelerate-m2-completion.ts [دقیقه-بودجه=8]
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../../src/lib/auth/crypto";
import { enrichArmRequests } from "../../src/lib/melk-api/arm-catalog";
const db = new PrismaClient();

async function main() {
  const budgetMin = Number(process.argv[2] ?? "8");
  const deadline = Date.now() + budgetMin * 60_000;
  // توکن ARM از تازه‌ترین نشست
  const session = await db.session.findFirst({
    where: { armTokenEnc: { not: null }, revoked: false },
    orderBy: { lastSeenAt: "desc" },
  });
  const token = decryptSecret(session?.armTokenEnc ?? "") ?? "";
  if (!token) { console.error("FAIL: توکن ARM موجود نیست"); process.exit(1); }

  const stats = async () => {
    const [total, mobile, rawMobile] = await Promise.all([
      db.requestRecord.count({ where: { source: "arm" } }),
      db.requestRecord.count({ where: { source: "arm", customerMobile: { not: null } } }),
      db.requestRecord.count({ where: { source: "arm", rawCustomerMobile: { not: null } } }),
    ]);
    return { total, mobile, pct: Math.round((mobile / total) * 1000) / 10, rawMobile };
  };
  const before = await stats();
  console.log(`قبل: موبایل متقاضی ${before.mobile}/${before.total} (${before.pct}٪) — بودجهٔ ${budgetMin} دقیقه`);

  let batch = 0, enrichedTotal = 0;
  while (Date.now() < deadline) {
    batch += 1;
    const incomplete = await db.requestRecord.findMany({
      where: {
        source: "arm",
        customerMobile: null,
        OR: [{ tradeTypeName: null }, { buildingTypeName: null }, { priceFrom: null }, { rawCustomerMobile: null }],
      },
      orderBy: { updatedAt: "asc" },
      take: 250,
      select: { id: true },
    });
    if (incomplete.length === 0) { console.log("همهٔ ردیف‌های ناقص پوشش داده شدند ✓"); break; }
    console.log(`-- دستهٔ ${batch}: ${incomplete.length} ردیف هدفمند (${new Date().toISOString().slice(11, 19)})`);
    try {
      const res = await enrichArmRequests(token, { maxRows: 250, rowIds: incomplete.map((r) => r.id) });
      enrichedTotal += res.enriched;
      console.log(`   غنی‌شده=${res.enriched} · missingAtSource=${res.missingAtSource} · خطا=${res.failed} · ${(res.durationMs / 1000).toFixed(0)}s`);
    } catch (e) {
      console.log("   شکست دسته:", (e as Error).message?.slice(0, 120));
      break;
    }
  }
  const after = await stats();
  console.log(`\nبعد: موبایل متقاضی ${after.mobile}/${after.total} (${after.pct}٪) — رشد +${after.mobile - before.mobile}`);
  console.log(`غنی‌سازی این اجرا: ${enrichedTotal} ردیف · دیمون پایدارساز ادامه می‌دهد (۶۰ ردیف/تیک)`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
