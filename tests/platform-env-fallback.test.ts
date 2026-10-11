/**
 * تست‌های P6.5-08 — سازوکار env.platform.json (بقای دیپلوی پلتفرم)
 * ----------------------------------------------------------------
 * زمینه: فرایند دیپلوی پلتفرم .env را می‌زداید (کامیت‌های b1336cc /
 * 90e2388) و سرور standalone هم .env ریشه را بار نمی‌کند؛ در نتیجه
 * هر دیپلوی عمومی بدون fallback در بوت fail-fast می‌مرد و دامنهٔ عمومی
 * 500 می‌داد. این تست‌ها سازوکار جایگزین را قفل می‌کنند:
 *
 *  ۱) متغیرهای غایب از env.platform.json پر می‌شوند
 *  ۲) متغیر محیطی واقعی هرگز بازنویسی نمی‌شود (اولویت مطلق env)
 *  ۳) idempotent — اجرای دوم چیزی جدید اعمال نمی‌کند
 *  ۴) یکپارچگی بوت: پس از fallback در production، assertProductionSecrets پاس می‌شود
 *  ۵) فایل هر سه کلید حیاتی را با مقدار معتبر دارد
 *  ۶) مقادیر فایل همان مقادیر تستیِ عمومیِ موجود در تاریخچهٔ git‌اند
 *     (هرگز راز واقعی/جدید در این فایل ننشیند)
 *  ۷) کلیدهای مستندسازی «_» نادیده گرفته می‌شوند
 *  ۸) اسکن امنیتی HOTFIX-01 دست‌نخورده می‌ماند: هیچ literal رازی در src/**
 *     وارد نشده (فایل JSON خارج از src است)
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";

const ENV_BACKUP: Record<string, string | undefined> = {};
// PN-012 ترمیم: env.platform.json پس از PN-011 «کاشِ بوت از escrow» است و
// OWNER_PERSONNEL_CODES/MELK_SYNC_MODE هم حمل می‌کند — هر کلیدی که
// applyPlatformEnvFallbacks می‌تواند بنشاند باید backup/restore شود؛ وگرنه
// به فایل‌های تست بعدی در همان worker نشت می‌کند (شاهد: شکست ۷-p6504i).
const WATCHED_KEYS = [
  "NODE_ENV",
  "MELK_TOKEN_KEY",
  "MASTER_ACCESS_CODE",
  "DATABASE_URL",
  "OWNER_PERSONNEL_CODES",
  "MELK_SYNC_MODE",
  // PN-029 (شورا-ن۰۳۳): اعمال fallback فایل واقعی، این پرچم عملیاتی را هم
  // در فرایند تست می‌نشاند — باید در پایان جلسهٔ همین فایل بازگردانی شود
  // تا رجیستری Worker و تستهای sync پس از آن، حالت واقعی (روشن) را نبینند.
  "MELK_ARM_OFFLINE",
] as const;

function setEnv(key: string, value: string | undefined) {
  if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeAll(() => {
  for (const k of WATCHED_KEYS) setEnv(k, process.env[k]);
});

afterAll(() => {
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("P6.5-08 — applyPlatformEnvFallbacks (بارگذاری env.platform.json)", () => {
  test("۱) متغیرهای غایب از فایل پر می‌شوند", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MELK_TOKEN_KEY", undefined);
    setEnv("MASTER_ACCESS_CODE", undefined);
    setEnv("DATABASE_URL", undefined);

    const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
    const result = applyPlatformEnvFallbacks();

    expect(result.error).toBeNull();
    expect(result.source).toContain("env.platform.json");
    expect(result.applied).toContain("MELK_TOKEN_KEY");
    expect(result.applied).toContain("MASTER_ACCESS_CODE");
    expect(result.applied).toContain("DATABASE_URL");
    expect(process.env.MELK_TOKEN_KEY?.trim().length ?? 0).toBeGreaterThan(0);
    expect(process.env.MASTER_ACCESS_CODE?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test("۲) متغیر محیطی واقعی هرگز بازنویسی نمی‌شود", async () => {
    setEnv("MELK_TOKEN_KEY", "real-env-key-must-win");

    const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
    const result = applyPlatformEnvFallbacks();

    expect(result.applied).not.toContain("MELK_TOKEN_KEY");
    expect(process.env.MELK_TOKEN_KEY).toBe("real-env-key-must-win");
  });

  test("۳) idempotent — پس از اعمال، اجرای مجدد هیچ کلیدی اضافه نمی‌کند", async () => {
    setEnv("MELK_TOKEN_KEY", undefined);
    setEnv("MASTER_ACCESS_CODE", undefined);

    const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
    const first = applyPlatformEnvFallbacks();
    expect(first.applied.length).toBeGreaterThan(0);

    const second = applyPlatformEnvFallbacks();
    expect(second.applied).toEqual([]);
  });

  test("۴) یکپارچگی بوت: fallback + assertProductionSecrets در production پاس می‌شود", async () => {
    // شبیه‌سازی دقیق دیپلوی پلتفرم: env کاملاً زدوده‌شده + NODE_ENV=production
    setEnv("NODE_ENV", "production");
    setEnv("MELK_TOKEN_KEY", undefined);
    setEnv("MASTER_ACCESS_CODE", undefined);

    const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
    applyPlatformEnvFallbacks();

    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  test("۵) فایل هر سه کلید حیاتی را با مقدار معتبر دارد", async () => {
    const raw = (await Bun.file("env.platform.json").json()) as Record<string, unknown>;
    for (const key of ["MELK_TOKEN_KEY", "MASTER_ACCESS_CODE", "DATABASE_URL"]) {
      expect(typeof raw[key]).toBe("string");
      expect((raw[key] as string).trim().length).toBeGreaterThan(0);
    }
  });

  test("۶) env.platform.json خارج از گیت است و مقادیرش واقعی/چرخیده‌اند (قرارداد PN-011)", async () => {
    // PN-011 اولاً — قرارداد جدید این فایل:
    //   پس از پنج بازنشانی محیط، این فایل «کاشِ بادوامِ بوت» است که توسط گارد
    //   خوددرمانی راز (upload/.runtime/boot-secrets.json) بازسازی/همگام می‌شود؛
    //   مقادیر واقعی در آن می‌نشیند چون gitignored + 0600 است و هرگز وارد
    //   git/بستهٔ بقا نمی‌شود (سنت قدیمی «فقط مقادیر تستی» منسوخ شد — دلیل:
    //   بقا سرویس عمومی به آن وابسته بود و ۵ بار شکست).
    const { execSync } = await import("node:child_process");
    const tracked = execSync("git ls-files", { cwd: "/home/z/my-project" }).toString().split("\n");
    expect(tracked).not.toContain("env.platform.json");
    expect(tracked).not.toContain(".env");
    expect(tracked).toContain("env.platform.json.example");
    const raw = (await Bun.file("env.platform.json").json()) as Record<string, string>;
    expect(raw.MELK_TOKEN_KEY).not.toBe("test-only-key-not-a-real-secret"); // چرخیده ✓
    // کد مستر: ۸ رقمی معتبر (مقدار واقعی مالک — فقط در فایل gitignored)
    expect(raw.MASTER_ACCESS_CODE).toMatch(/^\d{8}$/);
  });

  test("۷) کلیدهای مستندسازی با پیشوند «_» نادیده گرفته می‌شوند", async () => {
    const raw = (await Bun.file("env.platform.json").json()) as Record<string, unknown>;
    // PN-011 — گارد خوددرمانی کلید مستندسازی را «_comment» می‌نویسد (قرارداد واحد)
    expect("_comment" in raw).toBe(true);

    setEnv("NODE_ENV", "production");
    setEnv("MELK_TOKEN_KEY", undefined);
    setEnv("MASTER_ACCESS_CODE", undefined);

    const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
    const result = applyPlatformEnvFallbacks();
    expect(result.applied).not.toContain("_comment");
  });

  test("۸) اسکن امنیتی HOTFIX-01 دست‌نخورده است — بدون literal راز در src/**", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const offenders: string[] = [];
    for (const file of glob.scanSync({ cwd: process.cwd() })) {
      if (file.includes("instrumentation")) continue; // فقط ارجاع متنی به نام متغیرها
      const text = await Bun.file(file).text();
      if (text.includes("melk-tabriz-fallback-key")) offenders.push(`${file}: melk-tabriz-fallback-key`);
      if (/\b00000000\b/.test(text)) offenders.push(`${file}: 00000000`);
    }
    expect(offenders).toEqual([]);
  });
});
