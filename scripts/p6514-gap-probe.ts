/** BLOCK C.3 — اثبات منبع برای درصدهای کمتر از هدف (probe مستقیم ۵ نمونه) */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });
async function main() {
  const { decryptSecret } = await import("../src/lib/auth/crypto");
  const row = await db.armConnection.findFirst({ where: { status: "connected" }, orderBy: { updatedAt: "desc" } });
  const token = decryptSecret(row!.tokenEnc!)!;
  // ۵ نمونهٔ بدون حق‌السهم
  const noShare = await db.transactionEnrichment.findMany({ where: { realtorSharesJson: null }, take: 5, select: { txId: true } });
  // ۵ نمونهٔ بدون مبلغ
  const noPrice = await db.transactionEnrichment.findMany({ where: { contractPrice: null }, take: 5, select: { txId: true } });
  const probe = async (ids: Array<{ txId: string }>, label: string) => {
    console.log(`\n=== ${label} (${ids.length} نمونه) ===`);
    for (const { txId } of ids) {
      const res = await fetch(`https://arus-api.melketabriz.ir/api/apm/trade-overviews/info/${txId}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json()) as { data?: Record<string, unknown> };
      const d = j.data ?? {};
      const prim = Array.isArray(d.primaryRealtorList) ? (d.primaryRealtorList as unknown[]).length : -1;
      const sec = Array.isArray(d.secondaryRealtorList) ? (d.secondaryRealtorList as unknown[]).length : -1;
      console.log(`${txId}: HTTP ${res.status} | type=${JSON.stringify(d.contractType)} | price=${JSON.stringify(d.contractPrice)} | deposit=${JSON.stringify(d.contractDeposte)} | primary=${prim} | secondary=${sec} | comision=${JSON.stringify(d.comisionOfContract)}`);
      await new Promise((r) => setTimeout(r, 450));
    }
  };
  await probe(noShare, "بدون حق‌السهم");
  await probe(noPrice, "بدون مبلغ قرارداد");
  // آمار کلی
  const noShareCount = await db.transactionEnrichment.count({ where: { realtorSharesJson: null } });
  const noPriceCount = await db.transactionEnrichment.count({ where: { contractPrice: null } });
  const rentNoPrice = await db.transactionEnrichment.count({ where: { contractPrice: null, contractType: { contains: "اجاره" } } });
  console.log(`\nTOTAL no-share: ${noShareCount}/739 | no-price: ${noPriceCount}/739 (of which rent: ${rentNoPrice})`);
}
main().catch((e) => console.error("FATAL", (e as Error).message?.slice(0, 150))).finally(() => db.$disconnect());
