// PN-045 · فاز ۱ — اجرای sync ملکتون با فیلتر تبریز (کل DB، مستقیم — نه HTTP)
import { syncMelketun } from "@/lib/integrations/melketun/sync";
import { db } from "@/lib/db";

async function main() {
  const r = await syncMelketun();
  console.log(JSON.stringify({
    ok: r.ok,
    tenantId: r.tenantId,
    fetched: r.fetched,
    upserted: r.upserted,
    skippedByCityFilter: r.skippedByCityFilter,
    skippedSamples: r.skippedSamples,
    errors: r.errors,
    durationMs: r.durationMs,
  }, null, 2));
  // شمارش نهایی پس از sync
  const pl = await db.propertyRecord.count({ where: { tenantId: "melketun" } });
  const rq = await db.requestRecord.count({ where: { tenantId: "melketun" } });
  console.log(`DB AFTER SYNC: PropertyRecord(melketun)=${pl} RequestRecord(melketun)=${rq}`);
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", e instanceof Error ? e.message : String(e)); process.exit(1); });
