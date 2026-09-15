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

  // ---------- ۳) حلقه همگام‌سازی پس‌زمینه — HOTFIX-02 (SEC-3) ----------
  // توکن ARM مشترک (SyncState.armTokenEnc) حذف شد؛ تا معرفی «حساب سرویس»
  // مجزا در PHASE 2، تایمر پس‌زمینه فقط با فعال‌سازی صریح (MELK_BACKGROUND_SYNC=enabled)
  // کار می‌کند و در آن حالت نیز با آخرین نشستِ «زنده و دارای توکن» و ثبت AuditLog.
  if (process.env.MELK_BACKGROUND_SYNC === "enabled") {
    const { getMelkApiConfig } = await import("@/lib/melk-api/config");
    const cfg = getMelkApiConfig();
    const intervalMs = Math.max(cfg.syncIntervalMinutes, 2) * 60 * 1000;

    const tick = async () => {
      try {
        const { syncFromArm } = await import("@/lib/melk-api/sync");
        const { sessionToArmTokens, audit } = await import("@/lib/auth/session");
        const { db } = await import("@/lib/db");

        // فقط نشست‌های زنده‌ای که خودشان توکن ARM دارند (نه توکن مشترک)
        const live = await db.session.findFirst({
          where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
          orderBy: { lastSeenAt: "desc" },
        });
        const armTokens = live ? sessionToArmTokens(live) : null;
        if (!armTokens?.accessToken) return; // هیچ نشست دارای توکن زنده نیست

        // فقط اگر داده‌ای در کش نیست یا آخرین تلاش ناموفق بوده (بازیابی پس از قطعی)
        const [txCount, exCount, state] = await Promise.all([
          db.transactionRecord.count(),
          db.expertRecord.count(),
          db.syncState.findUnique({ where: { id: "singleton" } }),
        ]);
        if (txCount > 0 && exCount > 0 && !state?.lastError) return;

        const result = await syncFromArm(armTokens.accessToken);
        await audit("DATA_SYNC_BACKGROUND", live.personnelCode, `ok=${result.ok}; tx=${result.transactions}; ex=${result.experts}`);
        if (result.ok) {
          console.log(`[sync:bg] استخراج پس‌زمینه با نشست ${live.personnelCode}: ${result.transactions} معامله، ${result.experts} کاربر`);
        }
      } catch {
        // خطای پس‌زمینه بی‌صدا — در تیک بعدی دوباره تلاش می‌شود
      }
    };

    // اجرای اولیه پس از ۳۰ ثانیه (پس از آماده‌شدن سرور) و سپس دوره‌ای
    setTimeout(() => void tick(), 30_000);
    setInterval(() => void tick(), intervalMs);
  } else {
    // حالت پیش‌فرض پس از HOTFIX-02: خاموش — همگام‌سازی فقط دستی/درخواستی با توکن خود کاربر
  }
}
