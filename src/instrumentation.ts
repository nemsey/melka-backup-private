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

// P6549 — import سطح‌بالا حذف شد: کامپایل Edge Runtime روی "node:fs" خطا می‌داد
// (حتی با گارد NEXT_RUNTIME در زمان اجرا). الگوی امن: import پویا داخل مسیر nodejs.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // فقط در رانتایم Node در دسترس است — تابع کمکی محلی
  const { existsSync } = await import("node:fs");

  // ---------- ۰) P6.5-08: env جایگزین پلتفرم ----------
  // فرایند دیپلوی پلتفرم .env/.env.local را می‌زداید و سرور standalone هم
  // .env ریشه را بار نمی‌کند؛ بدون این گام هر دیپلوی عمومی در بوت می‌میرد
  // و دامنهٔ عمومی 500 می‌دهد. فقط کلیدهای «غایب» پر می‌شوند (env واقعی اولویت دارد).
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  const platformEnv = applyPlatformEnvFallbacks();
  const { logEvent } = await import("@/lib/logger");
  if (platformEnv.error) {
    logEvent({
      level: "warn",
      category: "system",
      operation: "platform-env",
      status: "fail",
      errorCode: "PLATFORM_ENV_UNREADABLE",
      detail: { error: platformEnv.error },
    });
  }
  if (platformEnv.applied.length > 0) {
    logEvent({
      category: "system",
      operation: "platform-env",
      status: "ok",
      detail: {
        applied: platformEnv.applied,
        source: platformEnv.source,
        note: "platform deploy strips .env/.env.local; real env always takes precedence",
      },
    });
  }

  // ---------- ۱) fail-fast رازهای اجباری (HOTFIX-01 / SEC-1, SEC-2) ----------
  const { assertProductionSecrets } = await import("@/lib/melk-api/config");
  assertProductionSecrets(); // در production نبود راز = throw → بوت نمی‌شود

  // ---------- ۱-ب) P6519: ثبت شاهد بیلد در DB (app_meta) ----------
  // آخرین بیلدی که سرور با آن بالا آمد در جدول singleton ثبت می‌شود؛
  // خطای DB هرگز بوت را نمی‌شکند (endpoint /api/version مستقل کار می‌کند).
  {
    const { db } = await import("@/lib/db");
    const { recordBuildWitnessToDb, getBuildWitness } = await import("@/lib/build-witness");
    const w = getBuildWitness();
    await recordBuildWitnessToDb(db);
    const { logEvent } = await import("@/lib/logger");
    logEvent({
      category: "system",
      operation: "build-witness",
      status: "ok",
      detail: { buildId: w.buildId, gitSha: w.gitSha, env: w.env, source: w.source, builtAt: w.builtAt },
    });
  }

  // ---------- ۲) چرخش کلید در صورت درخواست صریح (ROTATION_PENDING=true) ----------
  if (process.env.ROTATION_PENDING === "true") {
    const { rotateFromEnv } = await import("@/lib/auth/key-rotation");
    const { logEvent } = await import("@/lib/logger");
    const report = await rotateFromEnv();
    if (report.ok) {
      logEvent({
        category: "system",
        operation: "key-rotation",
        status: "ok",
        detail: { rotated: report.rotated, alreadyRotated: report.alreadyRotated, unreadable: report.unreadable },
      });
    } else {
      logEvent({
        level: "error",
        category: "system",
        operation: "key-rotation",
        status: "fail",
        errorCode: "ROTATION_INCOMPLETE",
        detail: { error: report.error ?? "خطای نامشخص" },
      });
    }
  }

  // ---------- ۳-ب) دیمن مغز هوشمند v2 (فازهای ۷/۸/۹ — بازسازی) ----------
  // حلقهٔ پس‌زمینهٔ سرنوشت: پیش‌بینی روی دادهٔ واقعی ARM + پیامد واقعی +
  // ارزیابی صادقانه + یادگیری حلقه‌بسته. فقط خواندن از DB محلی و نوشتن
  // شاهد در intelligence-data/ — بدون تماس خارجی؛ خاموشی با
  // MELK_INTELLIGENCE_DAEMON=disabled.
  {
    const { startIntelligenceDaemon } = await import("@/lib/intelligence/daemon");
    const { db } = await import("@/lib/db");
    startIntelligenceDaemon(db);

    // P6530/گام ۶ (نکتهٔ بسیار مهم ۱) — دیمن پایدار اتصال و انتقال داده:
    // برش‌های کوچک checkpointدار کاتالوگ آگهی‌ها/درخواست‌ها + غنی‌سازی؛
    // به‌محض اتصال تازهٔ ARM، انتقال خودکار از آخرین نقطه ادامه می‌یابد.
    const { startCatalogDaemon } = await import("@/lib/melk-api/catalog-daemon");
    startCatalogDaemon(db);
  }

  // ---------- ۴) P6548-recovery: قلاب وارسی بازگشت در بوت (Tier 4) ----------
  // ۲۰ ثانیه پس از هر بوت، وارسی «مهر زنده ↔ HEAD ↔ آینهٔ GitHub ↔ شمارش DB»
  // را به‌صورت detached اجرا می‌کند؛ در صورت تشخیص بازگشت (بازیابی محیط از
  // اسنپ‌شات کهنهٔ پلتفرم)، بازیابی خودکار آغاز می‌شود (docs/RECOVERY-POLICY.md).
  // خاموشی: MELK_AUTO_RECOVERY=disabled · در تست‌ها (DATABASE_URL آزمایشی) غیرفعال.
  // محدودیت صادقانه: این قلاب فقط در کدِ ≥P6548 هست؛ اسنپ‌شات‌های قدیمی‌تر
  // فاقد آن‌اند ⇒ وارسی آغاز جلسه (بند و قانون ۰۳۱) همچنان خط اول دفاع است.
  if (
    process.env.MELK_AUTO_RECOVERY !== "disabled" &&
    !(process.env.DATABASE_URL ?? "").includes("test") &&
    existsSync("scripts/recovery/auto-recovery.sh")
  ) {
    const { spawn } = await import("node:child_process");
    const { logEvent: logBootCheck } = await import("@/lib/logger");
    setTimeout(() => {
      try {
        const child = spawn("bash", ["scripts/recovery/auto-recovery.sh", "check"], {
          cwd: process.cwd(),
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        logBootCheck({
          category: "system",
          operation: "auto-recovery-boot-check",
          status: "ok",
          detail: { pid: child.pid ?? -1 },
        });
      } catch (e) {
        logBootCheck({
          level: "warn",
          category: "system",
          operation: "auto-recovery-boot-check",
          status: "fail",
          detail: { error: String(e) },
        });
      }
    }, 20_000);
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
        const actorCode = live?.personnelCode ?? "unknown";
        await audit("DATA_SYNC_BACKGROUND", actorCode, `ok=${result.ok}; tx=${result.transactions}; ex=${result.experts}`);
        if (result.ok) {
          const { logSync } = await import("@/lib/logger");
          logSync("sync-run", {
            status: "ok",
            mode: "legacy",
            userId: actorCode,
            detail: { transactions: result.transactions, experts: result.experts, background: true },
          });
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
