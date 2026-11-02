/**
 * PN-050 · گام آخر — سینک زندهٔ ملکتون با قانون ادغام جدید (شاهد طلایی)
 * اجرای همان تابعی که Worker هر ۶ ساعت صدا می‌زند — حالا از مسیر قانون‌دار:
 *   filingToProperty → upsertRecordWithMerge → mergeField (الف→ه) + provenance + journal
 */
import { syncMelketun } from "@/lib/integrations/melketun/sync";

async function main(): Promise<void> {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  console.log("[pn050-live-sync] شروع سینک زنده با قانون برتری متخصص (PN-050)…");
  const t0 = Date.now();
  const r = await syncMelketun();
  console.log(
    JSON.stringify(
      {
        ok: r.ok,
        tenantId: r.tenantId,
        fetched: r.fetched,
        upserted: r.upserted,
        skippedDuplicates: r.skippedDuplicates,
        branchesSeen: r.branchesSeen.length,
        errors: r.errors.slice(0, 5),
        durationMs: Date.now() - t0,
      },
      null,
      1,
    ),
  );
}

main().catch((e) => {
  console.error("[pn050-live-sync] خطا:", e);
  process.exit(1);
});
