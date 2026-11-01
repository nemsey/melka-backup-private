/**
 * PN-054 — سینک دستی موتور دو-نمایی ملکتون (فراخوانی مستقیم موتور، بدون API)
 * معادل دقیق POST /api/integrations/melketun/sync (OWNER) — بدون نیاز به نشست.
 * اجرا: bun scripts/pn054-melketun-sync.ts  (از ریشهٔ پروژه — cwd برای SECRET_FILE حیاتی است)
 */
import { syncMelketun } from "@/lib/integrations/melketun/sync";
import { writeFileSync } from "fs";

const t0 = Date.now();
console.log("[pn054] شروع سینک دو-نمایی ملکتون —", new Date().toISOString());

try {
  const r = await syncMelketun();
  const summary = {
    ok: r.ok,
    tenantId: r.tenantId,
    durationMs: r.durationMs,
    fetched: r.fetched,
    upserted: r.upserted,
    skippedByCityFilter: r.skippedByCityFilter,
    skippedDuplicates: r.skippedDuplicates,
    branchesSeen: r.branchesSeen,
    funnel: r.funnel
      ? {
          filingsNew: r.funnel.filings?.newFiles ?? null,
          potentialsNew: r.funnel.potentials?.newFiles ?? null,
        }
      : null,
    errors: r.errors.slice(0, 10),
    badPages: r.badPages,
  };
  console.log("[pn054] RESULT:", JSON.stringify(summary, null, 2));
  writeFileSync(
    "/home/z/my-project/upload/.runtime/pn054-sync-result.json",
    JSON.stringify({ ...summary, wallClockMs: Date.now() - t0, at: new Date().toISOString() }, null, 2),
  );
  console.log("[pn054] ✅ سینک کامل شد —", ((Date.now() - t0) / 1000).toFixed(1), "ثانیه");
  process.exit(0);
} catch (e) {
  console.error("[pn054] ❌ سینک شکست خورد:", e);
  writeFileSync(
    "/home/z/my-project/upload/.runtime/pn054-sync-result.json",
    JSON.stringify({ ok: false, error: String(e), at: new Date().toISOString() }, null, 2),
  );
  process.exit(1);
}
