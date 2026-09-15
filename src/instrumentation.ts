/**
 * Next.js Instrumentation — راه‌اندازی پس‌زمینه سرور
 * ------------------------------------------------------
 * ۱) HOTFIX-01: اعتبارسنجی fail-fast رازهای اجباری (SEC-1/SEC-2) —
 *    در production نبود MASTER_ACCESS_CODE یا MELK_TOKEN_KEY = عدم بوت.
 * ۲) HOTFIX-01: چرخش کلید رمزنگاری در startup فقط اگر ROTATION_PENDING=true.
 * ۳) حلقه همگام‌سازی خودکار: هر MELK_SYNC_INTERVAL_MINUTES دقیقه،
 *    داده واقعی از arus-api.melketabriz.ir استخراج می‌شود (با توکن ARM
 *    ذخیره‌شده‌ی آخرین ورود موفق). این حلقه برای مواقعی که سامانه ملک
 *    تبریز موقتاً قطع است حیاتی است — به‌محض بازگشت سرور، داده واقعی
 *    به‌طور خودکار استخراج و جایگزین می‌شود.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ---------- ۱) fail-fast رازهای اجباری (HOTFIX-01 / SEC-1, SEC-2) ----------
  const { assertProductionSecrets } = await import("@/lib/melk-api/config");
  assertProductionSecrets(); // در production نبود راز = throw → بوت نمی‌شود

  // ---------- ۲) چرخش کلید در صورت درخواست صریح (ROTATION_PENDING=true) ----------
  if (process.env.ROTATION_PENDING === "true") {
    const { rotateFromEnv } = await import("@/lib/auth/key-rotation");
    const report = await rotateFromEnv();
    if (report.ok) {
      console.log(
        `[boot:key-rotation] چرخش کلید انجام شد: rotated=${report.rotated} already=${report.alreadyRotated} unreadable=${report.unreadable} — ` +
          `اکنون ROTATION_PENDING را حذف و MELK_TOKEN_KEY_OLD را از محیط پاک کنید.`
      );
    } else {
      console.error(`[boot:key-rotation] ناکامل: ${report.error ?? "خطای نامشخص"}`);
    }
  }

  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const cfg = getMelkApiConfig();
  const intervalMs = Math.max(cfg.syncIntervalMinutes, 2) * 60 * 1000;

  const tick = async () => {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const { syncFromArm } = await import("@/lib/melk-api/sync");
      const { decryptSecret } = await import("@/lib/auth/crypto");

      const prisma = new PrismaClient();
      try {
        const state = await prisma.syncState.findUnique({ where: { id: "singleton" } });
        const armToken = decryptSecret(state?.armTokenEnc);
        if (!armToken) return; // هنوز ورود موفق ثبت نشده

        // فقط اگر داده‌ای در کش نیست یا آخرین تلاش ناموفق بوده (بازیابی پس از قطعی)
        const [txCount, exCount] = await Promise.all([
          prisma.transactionRecord.count(),
          prisma.expertRecord.count(),
        ]);
        if (txCount > 0 && exCount > 0 && !state?.lastError) return;

        const result = await syncFromArm(armToken);
        if (result.ok) {
          console.log(`[sync] استخراج موفق از سامانه واقعی ملک تبریز: ${result.transactions} معامله، ${result.experts} کاربر، ${result.interactions} تعامل`);
        }
      } finally {
        await prisma.$disconnect();
      }
    } catch {
      // خطای پس‌زمینه بی‌صدا — در تیک بعدی دوباره تلاش می‌شود
    }
  };

  // اجرای اولیه پس از ۳۰ ثانیه (پس از آماده‌شدن سرور) و سپس دوره‌ای
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), intervalMs);
}
