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

  // ۲) اتصال DB (تنبل — همان کلاینت رسمی برنامه)
  const { db } = await import("@/lib/db");

  // ۳) بوت Worker (تا سیگنال توقف منتظر می‌ماند — event loop با تایمرها زنده می‌ماند)
  const result = await (await import("@/core/runtime/worker")).startWorkerRuntime(db);
  if (!result.started) {
    console.log(`[worker] شروع نشد: ${result.reason ?? "نامشخص"}`);
    process.exit(0); // Worker دیگری زنده است — خروج موفق و بی‌صدا (بند ۲.۴)
  }
  console.log(`[worker] زنده — کارها: ${result.jobs.join(" · ")}`);
}

main().catch((e) => {
  console.error("[worker] خطای بوت:", e);
  process.exit(1);
});
