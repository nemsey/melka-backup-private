// ============================================================================
// PN-049/گام ۳ — سینک زندهٔ کامل ملکتون: بروزرسانی فهرست‌های چهارگانه (M7-M10)
// ============================================================================
// عین کار Worker (id: melketun-sync · src/core/runtime/jobs.ts:772) — اجرای
// مستقیم syncMelketun() با DATABASE_URL تولید. افزودنی-فقط (upsert idempotent)؛
// صفر حذف (قانون ۶ دادهٔ مقدس). پس از پایان، شاهد G6 گرفته می‌شود.
// اجرا: bun scripts/pn049/run-melketun-sync.ts
// ============================================================================
import { syncMelketun } from "@/lib/integrations/melketun/sync";

async function main() {
  console.log("[pn049] شروع سینک زندهٔ ملکتون —", new Date().toISOString());
  const t0 = Date.now();
  const result = await syncMelketun();
  console.log(JSON.stringify({
    ok: result.ok,
    durationMs: Date.now() - t0,
    fetched: result.fetched,
    upserted: result.upserted,
    skippedByCityFilter: result.skippedByCityFilter,
    skippedDuplicates: result.skippedDuplicates,
    badPages: result.badPages,
    branchesSeen: result.branchesSeen,
    errorsCount: result.errors.length,
    errorsSample: result.errors.slice(0, 5),
  }, null, 1));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
