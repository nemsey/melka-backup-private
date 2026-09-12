/**
 * Next.js Instrumentation — راه‌اندازی پس‌زمینه سرور
 * ------------------------------------------------------
 * ثبت حلقه همگام‌سازی خودکار: هر MELK_SYNC_INTERVAL_MINUTES دقیقه،
 * داده واقعی از arus-api.melketabriz.ir استخراج می‌شود (با توکن ARM
 * ذخیره‌شده‌ی آخرین ورود موفق). این حلقه برای مواقعی که سامانه ملک
 * تبریز موقتاً قطع است حیاتی است — به‌محض بازگشت سرور، داده واقعی
 * به‌طور خودکار استخراج و جایگزین می‌شود.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
