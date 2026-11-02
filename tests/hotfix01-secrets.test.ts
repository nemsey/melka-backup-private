/**
 * تست‌های HOTFIX-01 — حذف رازهای fallback (SEC-1, SEC-2)
 * ------------------------------------------------------
 * پوشش:
 *  ۱) بوت بدون MASTER_ACCESS_CODE در production باید throw کند (fail-fast)
 *  ۲) بوت بدون MELK_TOKEN_KEY در production باید throw کند (fail-fast)
 *  ۳) بوت با هر دو راز در production نباید throw کند
 *  ۴) در development غیبت رازها throw نمی‌کند (کلید dev از .env.local)
 *  ۵) encryptSecret بدون MELK_TOKEN_KEY باید throw کند (نه fallback)
 *  ۶) هیچ fallback سورس‌نشسته‌ای در سورس باقی نمانده (اسکن متنی)
 *  ۷) چرخش کلید: decrypt با قدیم → encrypt با جدید → verify (روی کپی DB تست)
 *  ۸) چرخش idempotent: اجرای دوم فقط already-rotated
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash, randomBytes } from "crypto";

const ENV_BACKUP: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeAll(() => {
  // پشتیبان‌گیری از محیط فعلی تست
  for (const k of ["NODE_ENV", "MASTER_ACCESS_CODE", "MELK_TOKEN_KEY"]) setEnv(k, process.env[k]);
});

afterAll(() => {
  // بازگردانی محیط
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ==========================================================================
// ۱-۴) fail-fast بوت
// ==========================================================================

describe("HOTFIX-01 — fail-fast رازهای production (assertProductionSecrets)", () => {
  test("بوت بدون MASTER_ACCESS_CODE در production باید throw کند", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MASTER_ACCESS_CODE", undefined);
    setEnv("MELK_TOKEN_KEY", "some-key");
    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    expect(() => assertProductionSecrets()).toThrow(/MASTER_ACCESS_CODE/);
  });

  test("بوت بدون MELK_TOKEN_KEY در production باید throw کند", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MASTER_ACCESS_CODE", "24681357");
    setEnv("MELK_TOKEN_KEY", undefined);
    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    expect(() => assertProductionSecrets()).toThrow(/MELK_TOKEN_KEY/);
  });

  test("بوت بدون هر دو راز باید هر دو را در پیام خطا فهرست کند", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MASTER_ACCESS_CODE", undefined);
    setEnv("MELK_TOKEN_KEY", undefined);
    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    try {
      assertProductionSecrets();
      expect.unreachable("باید throw می‌کرد");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("MASTER_ACCESS_CODE");
      expect(msg).toContain("MELK_TOKEN_KEY");
    }
  });

  test("بوت با هر دو راز در production بدون خطا عبور می‌کند", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("MASTER_ACCESS_CODE", "24681357");
    setEnv("MELK_TOKEN_KEY", "a-real-32byte-key-0123456789abcdef");
    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  test("در development غیبت رازها throw نمی‌کند (کلید dev جداگانه)", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MASTER_ACCESS_CODE", undefined);
    setEnv("MELK_TOKEN_KEY", undefined);
    const { assertProductionSecrets } = await import("@/lib/melk-api/config");
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  test("masterCode در پیکربندی دیگر fallback ندارد — بدون env مقدار خالی است", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MASTER_ACCESS_CODE", undefined);
    const { getMelkApiConfig } = await import("@/lib/melk-api/config");
    expect(getMelkApiConfig().masterCode).toBe("");
  });
});

// ==========================================================================
// ۵) رمزنگاری بدون کلید = throw (نه fallback)
// ==========================================================================

describe("HOTFIX-01 — رمزنگاری بدون MELK_TOKEN_KEY", () => {
  test("encryptSecret بدون کلید باید throw کند", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MELK_TOKEN_KEY", undefined);
    const { encryptSecret } = await import("@/lib/auth/crypto");
    expect(() => encryptSecret("secret")).toThrow(/MELK_TOKEN_KEY/);
  });


  test("با کلید معتبر، رفت‌وبرگشت رمزنگاری کار می‌کند", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("MELK_TOKEN_KEY", "test-key-hotfix01-rotate");
    const { encryptSecret, decryptSecret } = await import("@/lib/auth/crypto");
    const enc = encryptSecret("arm-token-sample");
    expect(enc).not.toContain("arm-token-sample");
    expect(decryptSecret(enc)).toBe("arm-token-sample");
  });
});

// ==========================================================================
// ۶) اسکن سورس: صفر fallback
// ==========================================================================

describe("HOTFIX-01 — پاکسازی سورس از رازهای fallback", () => {
  test("هیچ راز fallback سورس‌نشسته‌ای در src باقی نمانده", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const offenders: string[] = [];
    for (const file of glob.scanSync({ cwd: process.cwd() })) {
      const text = await Bun.file(file).text();
      if (text.includes("melk-tabriz-fallback-key")) offenders.push(`${file}: melk-tabriz-fallback-key`);
      // کد مدیر ۸ رقمی قدیمی به‌عنوان literal در سورس ممنوع
      if (/\b00000000\b/.test(text)) offenders.push(`${file}: 00000000`);
    }
    expect(offenders).toEqual([]);
  });

  test("masterCode دیگر از MASTER_ACCESS_CODE مشتق نمی‌شود در crypto (زنجیره مستقل)", async () => {
    const crypto = await Bun.file("src/lib/auth/crypto.ts").text();
    expect(crypto).not.toContain("MASTER_ACCESS_CODE");
    const divar = await Bun.file("src/lib/divar/config.ts").text();
    expect(divar.includes("MASTER_ACCESS_CODE")).toBe(false);
  });
});

// ==========================================================================
// ۷-۸) چرخش کلید — روی دیتابیس تست
// ==========================================================================

describe("HOTFIX-01 — چرخش کلید رمزنگاری (rotateEncryptionKeys)", () => {
  const OLD_KEY = `old-key-${randomBytes(8).toString("hex")}`;
  const NEW_KEY = `new-key-${randomBytes(8).toString("hex")}`;

  test("چرخش: رمزگذاری با قدیم → چرخش → خواندن با جدید", async () => {
    const { __internal } = await import("@/lib/auth/key-rotation");
    const { db } = await import("@/lib/db");

    // رمزنگاری یک توکن نمونه با کلید قدیمی (عین فرمت سرور)
    const oldKeyBuf = __internal.keyFromSecret(OLD_KEY);
    const plaintext = "eyJhbGciOiJIUzI1NiJ9.arm-rotation-test-token";
    const encOld = __internal.encryptWith(plaintext, oldKeyBuf);
    expect(__internal.decryptWith(encOld, oldKeyBuf)).toBe(plaintext);

    // درج رکورد نشست با این مقدار رمزنگاری‌شده
    const session = await db.session.create({
      data: {
        tokenHash: createHash("sha256").update(`rot-test-${Date.now()}`).digest("hex"),
        personnelCode: "900001",
        displayName: "تست چرخش کلید",
        role: "CONSULTANT",
        armTokenEnc: encOld,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    try {
      // اجرای چرخش قدیم → جدید
      const { rotateEncryptionKeys } = await import("@/lib/auth/key-rotation");
      const report = await rotateEncryptionKeys(OLD_KEY, NEW_KEY);
      expect(report.ok).toBe(true);
      expect(report.rotated).toBeGreaterThanOrEqual(1);

      // راستی‌آزمایی: رکورد با کلید جدید قابل خواندن است و مقدار اصلی را دارد
      const updated = await db.session.findUnique({ where: { id: session.id } });
      expect(updated?.armTokenEnc).toBeTruthy();
      const newKeyBuf = __internal.keyFromSecret(NEW_KEY);
      expect(__internal.decryptWith(updated!.armTokenEnc!, newKeyBuf)).toBe(plaintext);
      // و با کلید قدیمی دیگر باز نمی‌شود
      expect(__internal.decryptWith(updated!.armTokenEnc!, oldKeyBuf)).toBeNull();
    } finally {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
  });

  test("چرخش idempotent: اجرای دوم نباید دوباره بچرخاند", async () => {
    const { __internal, rotateEncryptionKeys } = await import("@/lib/auth/key-rotation");
    const { db } = await import("@/lib/db");

    const oldKeyBuf = __internal.keyFromSecret(OLD_KEY);
    const encOld = __internal.encryptWith("idempotency-check-token", oldKeyBuf);
    const session = await db.session.create({
      data: {
        tokenHash: createHash("sha256").update(`rot-idem-${Date.now()}`).digest("hex"),
        personnelCode: "900002",
        displayName: "تست idempotency",
        role: "CONSULTANT",
        armTokenEnc: encOld,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    try {
      const first = await rotateEncryptionKeys(OLD_KEY, NEW_KEY);
      expect(first.rotated).toBeGreaterThanOrEqual(1);
      const snapshot = await db.session.findUnique({ where: { id: session.id } });
      const encAfterFirst = snapshot!.armTokenEnc!;

      const second = await rotateEncryptionKeys(OLD_KEY, NEW_KEY);
      // در اجرای دوم همین رکورد باید already حساب شود
      expect(second.tables.Session?.already ?? 0).toBeGreaterThanOrEqual(1);

      const after = await db.session.findUnique({ where: { id: session.id } });
      expect(after!.armTokenEnc).toBe(encAfterFirst); // مقدار دست‌نخورده
    } finally {
      await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
  });
});
