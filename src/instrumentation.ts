/**
 * Next.js Instrumentation — راه‌اندازی پس‌زمینه سرور
 * ------------------------------------------------------
 * ۱) HOTFIX-01: اعتبارسنجی fail-fast رازهای اجباری (SEC-1/SEC-2) —
 *    در production نبود MASTER_ACCESS_CODE یا MELK_TOKEN_KEY = عدم بوت.
 * ۲) HOTFIX-01: چرخش کلید رمزنگاری در startup فقط اگر ROTATION_PENDING=true.
 * ۳) PN-010 فاز ۲: RuntimeSupervisor — معماری «یک Web + یک Worker»؛
 *    دیمن‌های قبلی (مغز/کاتالوگ/آینه/چرخش لاگ) اکنون کارهای صف Worker اند.
 * ۴) P6548-recovery: قلاب خوددرمانی در بوت (Auto-Recovery — Boot Hook).
 * ۵) حلقه همگام‌سازی خودکار (خاموش پیش‌فرض — MELK_BACKGROUND_SYNC=enabled).
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

  // ---------- ۱-الف) PN-011 اولاً: خوددرمانی رازهای اجباری ----------
  // مصوبهٔ مالک پس از پنجمین بازنشانی محیط: «این مشکل با تکرار مجدد را به هر
  // طریق ممکن برای همیشه رفع گردد». راز غایب ← بازیابی از escrow بادوام
  // (upload/.runtime/boot-secrets.json — زنده‌مانده در هر پنج بازنشانی) ← در
  // فقدان کامل، تولید کلید رمزنگاری تازه. env واقعی همیشه برنده است؛ سپس
  // assertProductionSecrets فقط برای فقدان‌های غیرقابل‌خوددرمانی می‌ماند.
  {
    const { ensureBootSecrets } = await import("@/lib/auth/boot-secrets");
    const heal = await ensureBootSecrets();
    const healed = heal.actions.filter(
      (a) => a.action === "restored-from-escrow" || a.action === "generated"
    );
    if (healed.length > 0 || heal.errors.length > 0) {
      logEvent({
        level: heal.errors.length > 0 ? "warn" : "info",
        category: "system",
        operation: "boot-secrets-heal",
        status: heal.errors.length > 0 ? "fail" : "ok",
        detail: {
          actions: heal.actions,
          envPlatformRegenerated: heal.envPlatformRegenerated,
          errors: heal.errors,
          note:
            "healed=" +
            healed.map((a) => `${a.key}:${a.action}`).join(",") +
            (healed.some((a) => a.key === "MELK_TOKEN_KEY" && a.action === "generated")
              ? " | کلید تازه تولید شد — نشست‌های ARM قبلی نامعتبر؛ مالک یک‌بار وارد ARM شود"
              : ""),
        },
      });
    }
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

  // ---------- ۳-ب) PN-010 فاز ۲: معماری Runtime «یک Web + یک Worker» ----------
  // دیمن‌های درون‌فرایندی (مغز هوشمند + پایدارساز کاتالوگ) به فرایند Worker
  // منتقل شدند (BLOCK 4) — اینجا فقط RuntimeSupervisor سبک (BLOCK 3):
  //   • Worker را می‌فروشد اگر زنده نیست (idempotent)
  //   • بازرسی ۶۰ ثانیه‌ای + احیای Worker در صورت مرگ
  //   • خاموشی کامل: MELK_WORKER=disabled · خاموشی احیا: MELK_SUPERVISOR_RESPAWN=disabled
  // کارهای Worker (با همان فاصله/کلیدهای خاموشی قبلی — صفر قطع خدمت):
  //   intelligence-cycle (۶۰m) · catalog-cycle (۱m) · mirror-cycle (۶h)
  //   log-rotate (۳۰m) · backup-rotation (۶h — ترمیم پایدار DIAG-DATA-005)
  if (process.env.MELK_WORKER !== "disabled" && !(process.env.DATABASE_URL ?? "").includes("test")) {
    const { RuntimeSupervisor } = await import("@/core/runtime/supervisor");
    const { db } = await import("@/lib/db");
    const supervisor = RuntimeSupervisor.getInstance(db);
    const result = supervisor.start();
    const { logEvent: logRuntime } = await import("@/lib/logger");
    logRuntime({
      category: "system",
      operation: "runtime-supervisor",
      status: result.ok ? "ok" : "fail",
      detail: { action: result.action, detail: result.detail ?? null, architecture: "1-web-1-worker" },
    });
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
    !(process.env.DATABASE_URL ?? "").includes("test")
  ) {
    // جلسهٔ ۰۰۵ — مسیر مطلق مخزن: در سرور standalone مقدار process.cwd() ریشهٔ
    // پروژه نیست و قلاب نسبی در production خاموش می‌شد. ریشه با MELKA_REPO_DIR
    // قابل بازتعریف است (پیش‌فرض مسیر رسمی مخزن).
    const repoRoot = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
    const hookPath = `${repoRoot}/scripts/recovery/auto-recovery.sh`;
    if (existsSync(hookPath)) {
    const { spawn } = await import("node:child_process");
    const { logEvent: logBootCheck } = await import("@/lib/logger");
    setTimeout(() => {
      try {
        const child = spawn("bash", [hookPath, "check"], {
          cwd: repoRoot,
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
  }

  // ---------- ۳) حلقه همگام‌سازی پس‌زمینه — HOTFIX-02 (SEC-3) ----------
  // توکن ARM مشترک (SyncState.armTokenEnc) حذف شد؛ تا معرفی «حساب سرویس»
  // مجزا در PHASE 2، تایمر پس‌زمینه فقط با فعال‌سازی صریح (MELK_BACKGROUND_SYNC=enabled)
  // کار می‌کند و در آن حالت نیز با آخرین نشستِ «زنده و دارای توکن» و ثبت AuditLog.
  // PN-029 (مرحلهٔ ۲) — L7: صفر تلاش خودکار در تولید بدون توکن سالم؛
  // در حالت آفلینی ملک تبریز حلقهٔ پس‌زمینه حتی با MELK_BACKGROUND_SYNC=enabled
  // نیز روشن نمی‌شود (قانون احتیاط اتصال خارجی — سند شورا-ن۰۳۳).
  // PN-038/۶.۱: گارد حالت آفلینی حذف شد (پرچم از ن۰۵۴ خاموش است — کد مرده)
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

  // ---------- ۵) PN-027 · ۵-پ-۵: پیش‌گرمایش مغز هوشمند (جلسهٔ ۰۳۴) ----------
  // گلوگاه ۹ نقشهٔ سرعت: فراخوانی سرد /api/intelligence/status = ۸۱۱ms (گردآوری
  // ۱۶ موتور + گراف) در برابر گرم = ۱۶۳ms. با یک بار گرم‌کردنِ معلق ۲۰ ثانیه‌ای
  // پس از بوت، نخستین درخواستِ مالک از همان ابتدا پاسخ گرم می‌گیرد.
  // صفر تغییر رفتار — فقط پیش‌محاسبه؛ خطا هرگز بوت را نمی‌شکند (بهترین-تلاش).
  if (!(process.env.DATABASE_URL ?? "").includes("test")) {
    const { logEvent: logPrewarm } = await import("@/lib/logger");
    setTimeout(() => {
      void (async () => {
        const t0 = Date.now();
        try {
          const { ensureBrainStatus } = await import("@/lib/intelligence/daemon");
          await ensureBrainStatus();
          logPrewarm({
            category: "system",
            operation: "intelligence-prewarm",
            status: "ok",
            detail: { ms: Date.now() - t0, note: "موتورهای ۱-۱۶ گرم شد — نخستین درخواست سرد نیست (PN-027 · ۵-پ-۵)" },
          });
        } catch (e) {
          logPrewarm({
            level: "warn",
            category: "system",
            operation: "intelligence-prewarm",
            status: "fail",
            detail: { error: String(e), ms: Date.now() - t0 },
          });
        }
      })();
    }, 20_000);
  }
}
