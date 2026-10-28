/**
 * ورودی فرایند Worker — PN-010 (معماری یک Web + یک Worker)
 * ------------------------------------------------------------
 * اجرا:  bun scripts/runtime/worker.ts
 * (از Supervisor در فرایند Web به‌صورت detached فراخوانی می‌شود؛
 *  یا دستی برای آزمون/احیای پس از خرابی.)
 *
 * این فایل فقط ورودی است — منطق در src/core/runtime/worker.ts.
 * مسیر @/ توسط bun از tsconfig ریشهٔ مخزن حل می‌شود (همان الگوی تست‌ها).
 */

async function main(): Promise<void> {
  // ۱) env جایگزین پلتفرم — همان گام صفر instrumentation (بقا در برابر دیپلوی عمومی)
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();

  if (process.env.MELK_WORKER === "disabled") {
    console.log("[worker] MELK_WORKER=disabled — خروج بدون راه‌اندازی");
    process.exit(0);
  }

  // ۲-ب) G1 GATE (DIR-PN048-007 · موج صفر): Worker بدون محافظ دادهٔ مقدس
  // حق استارت ندارد — stripProtectedNulls باید در مسیرهای upsert فعال باشد.
  // قانون توقف: «Worker بدون stripProtectedNulls → توقف فوری».
  const { G1_STRIP_PROTECTED_NULLS } = await import("@/lib/integrations/melketun/protected-nulls");
  if (G1_STRIP_PROTECTED_NULLS !== true) {
    console.error("[worker] ❌ G1 GATE: stripProtectedNulls غیرفعال — توقف فوری (قانون دادهٔ مقدس · DIR-PN048-007)");
    process.exit(1);
  }
  console.log("[worker] ✓ G1 GATE: stripProtectedNulls فعال — دادهٔ مقدس در برابر null-overwrite محافظت است");

  // ۲) اتصال DB (تنبل — همان کلاینت رسمی برنامه)
  const { db } = await import("@/lib/db");

  // ۲-پ) PN-050 · دستور ۵ — پراگماهای دوام: journal_mode=WAL(محلی)/DELETE(FUSE)
  // + synchronous=FULL + wal_autocheckpoint=100 (ایدمپوتنت — شکست بوت را نمی‌ایستاند)
  try {
    const { ensureDurabilityPragmas } = await import("@/lib/db");
    const pragmas = await ensureDurabilityPragmas(db);
    console.log(`[worker] ✓ PN-050 دوام دیسک: journal_mode=${pragmas.journalMode} · synchronous=FULL · wal_autocheckpoint=100`);
  } catch (e) {
    console.warn(`[worker] ⚠️ PN-050 پراگما ناتوان (ادامه): ${String(e).slice(0, 120)}`);
  }

  // ۳) بوت Worker (تا سیگنال توقف منتظر می‌ماند — event loop با تایمرها زنده می‌ماند)
  const result = await (await import("@/core/runtime/worker")).startWorkerRuntime(db);
  if (!result.started) {
    console.log(`[worker] شروع نشد: ${result.reason ?? "نامشخص"}`);
    process.exit(0); // Worker دیگری زنده است — خروج موفق و بی‌صدا (بند ۲.۴)
  }
  console.log(`[worker] زنده — کارها: ${result.jobs.join(" · ")}`);

  // ۳-پ) PN-050 · دستور ۵ — startup replay: batch های ناتمامِ ژورنال.
  // (سناریوی D دستور ۶: kill -9 وسط سینک → اینجا دوباره اجرا می‌شود؛ پس از قفل
  //  انحصار Worker → فقط همین نسخه اعمال می‌کند. ایدمپوتنت → همگرایی تضمینی.)
  try {
    const { replayPendingBatches } = await import("@/lib/journal");
    const replay = await replayPendingBatches({
      onBatch: async (intent) => {
        if (intent.kind === "melketun-sync") {
          const { syncMelketun } = await import("@/lib/integrations/melketun/sync");
          const r = await syncMelketun();
          if (!r.ok && r.errors.length > 0) throw new Error(`replay sync incomplete (${r.errors.length} errors)`);
        }
        // kind=generic — صرفاً ثبت committed (پارکر عملیاتی خاص ندارد)
      },
      log: ({ level, message }) => console[level === "warn" ? "warn" : "log"](message),
    });
    if (replay.replayed.length > 0 || replay.failed.length > 0 || replay.abandoned.length > 0) {
      console.log(`[worker] PN-050 ژورنال: replay=${replay.replayed.length} · ناتمام=${replay.failed.length} · بایگانی=${replay.abandoned.length}`);
    }
  } catch (e) {
    console.warn(`[worker] ⚠️ PN-050 replay ژورنال ناتوان: ${String(e).slice(0, 160)}`);
  }
}

main().catch((e) => {
  console.error("[worker] خطای بوت:", e);
  process.exit(1);
});
