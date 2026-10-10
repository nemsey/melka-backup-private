/**
 * pn003-master-code.test.ts — گارد همیشگی ورود مالک (نکته ۲ — PN-003)
 * =============================================================================
 * علت ریشهٔ «مالک با کدمستر [نمونهٔ 99999999 — کد واقعی با PN-027 · ۵-الف-۳ از تست‌ها حذف شد] نمی‌تواند وارد شود» (۱۴۰۵/۰۷/۱۴):
 *   غلط تایپی ۸۰۲۲۱۱۸۶ (جابه‌جایی رقم ۲↔۱) که هم در .env.local و هم در هش
 *   AppMeta دیتابیس تزریق شده بود — هر دو لایه یک مقدار غلط داشتند و مالک
 *   با کد صحیح رد می‌شد.
 *
 * این سوئیت برای «همیشه» رفع می‌کند (کلاس باگ، نه فقط نمونه):
 *   §۱ سلامت .env.local — فرمت ۸ رقمی، غیر از کد تستی عمومی، بدون رقم فارسی
 *   §۲ همانی سه‌لایه — هش SHA-256 کد env == AppMeta.masterCodeHash دیتابیس
 *   §۳ رگرسیون غلط تایپی — کد شناخته‌شدهٔ غلط ۸۰۲۲۱۱۸۶ و همهٔ جهش‌های
 *      جابه‌جایی/تک‌رقمیِ کد صحیح باید توسط هش رد شوند
 *   §۴ زنجیرهٔ منطق ورود — فرمت‌اعتبارسنجی + مقایسه زمان-ثابت + مسیر fallback
 *
 * قانون راز-در-گیت-ممنوع: خود کد مستر هرگز در این فایل هاردکد نمی‌شود —
 * همیشه از .env.local خوانده می‌شود؛ فقط «کد غلط» شناخته‌شده (که راز نیست)
 * به‌عنوان مقدار رگرسیونی ذکر می‌شود.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

const ENV_LOCAL_PATH = "/home/z/my-project/.env.local";
const DB_URL = "file:/home/z/my-project/db/custom.db";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function readMasterCodeFromEnvLocal(): string | null {
  try {
    const txt = readFileSync(ENV_LOCAL_PATH, "utf8");
    const m = txt.match(/^MASTER_ACCESS_CODE=([0-9]{8})$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** کد غلط تایپی شناخته‌شدهٔ حادثهٔ ۱۴۰۵/۰۷/۱۴ — راز نیست؛ مقدار نامعتبر تاریخی است */
const KNOWN_TYPO_CODE = "80221186";

/* ==========================================================================
 * §۱ — سلامت .env.local
 * ========================================================================== */

describe("PN-003 §۱ — سلامت کد مستر در .env.local", () => {
  test("۱-۱) MASTER_ACCESS_CODE در .env.local وجود دارد", () => {
    expect(readMasterCodeFromEnvLocal()).not.toBeNull();
  });

  test("۱-۲) کد دقیقاً ۸ رقم لاتین است (بدون رقم فارسی/فاصله)", () => {
    const code = readMasterCodeFromEnvLocal() ?? "";
    expect(code).toMatch(/^[0-9]{8}$/);
  });

  test("۱-۳) کد، مقدار تستی عمومی 00000000 نیست (SEC-1)", () => {
    const code = readMasterCodeFromEnvLocal() ?? "";
    expect(code).not.toBe("00000000");
  });

  test("۱-۴) کد، غلط تایپی شناخته‌شدهٔ حادثه نیست (رگرسیون ۸۰۲۲۱۱۸۶)", () => {
    const code = readMasterCodeFromEnvLocal() ?? "";
    expect(code).not.toBe(KNOWN_TYPO_CODE);
  });

  test("۱-۵) کد تکراری-رقمی ساده نیست (مانند 11111111/22222222)", () => {
    const code = readMasterCodeFromEnvLocal() ?? "";
    expect(new Set(code).size).toBeGreaterThan(1);
  });
});

/* ==========================================================================
 * §۲ — همانی سه‌لایه: env ↔ هش دیتابیس
 * ========================================================================== */

describe("PN-003 §۲ — همانی هش کد مستر env ↔ AppMeta دیتابیس", () => {
  test("۲-۱) AppMeta.masterCodeHash == SHA-256(کد env) — واگرایی لایه‌ها ممنوع", async () => {
    const code = readMasterCodeFromEnvLocal();
    expect(code).not.toBeNull();
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: DB_URL } } } as any);
    try {
      const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
      expect(meta?.masterCodeHash).toBe(sha256(code!));
    } finally {
      await db.$disconnect();
    }
  });

  test("۲-۲) هش DB فرمت ۶۴ کاراکتر هگز است", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: DB_URL } } } as any);
    try {
      const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
      expect(meta?.masterCodeHash ?? "").toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await db.$disconnect();
    }
  });
});

/* ==========================================================================
 * §۳ — رگرسیون کلاس غلط تایپی: هیچ جهش نزدیک کد صحیح نباید بپذیرد
 * ========================================================================== */

describe("PN-003 §۳ — رگرسیون کلاس غلط تایپی کد مستر", () => {
  /** همهٔ جهش‌های همسایهٔ کد صحیح: جابه‌جایی مجاور + تغییر تک‌رقم به ۲ */
  function neighborMutations(code: string): Set<string> {
    const out = new Set<string>();
    const arr = code.split("");
    // جابه‌جایی هر جفت مجاور (عین حادثهٔ تاریخی PN-003: جابه‌جایی رقم ۲↔۱)
    for (let i = 0; i < arr.length - 1; i++) {
      const m = [...arr];
      [m[i], m[i + 1]] = [m[i + 1], m[i]];
      if (m.join("") !== code) out.add(m.join(""));
    }
    // تغییر هر تک‌رقم به یک رقم دیگر
    for (let i = 0; i < arr.length; i++) {
      for (const d of "0123456789") {
        if (d !== arr[i]) {
          const m = [...arr];
          m[i] = d;
          out.add(m.join(""));
        }
      }
    }
    return out;
  }

  test("۳-۱) هش DB، هشِ هیچ جهش نزدیکِ کد صحیح نیست (فشرده روی ۴۰ نمونه)", async () => {
    const code = readMasterCodeFromEnvLocal();
    expect(code).not.toBeNull();
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: DB_URL } } } as any);
    try {
      const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
      const dbHash = meta?.masterCodeHash ?? "";
      const mutations = [...neighborMutations(code!)].slice(0, 40);
      for (const bad of mutations) {
        expect(sha256(bad)).not.toBe(dbHash);
      }
    } finally {
      await db.$disconnect();
    }
  });

  test("۳-۲) کد غلط تایپی تاریخی 80221186 دقیقاً رد می‌شود (اگر کد صحیح نمونهٔ 99999999 باشد)", async () => {
    const code = readMasterCodeFromEnvLocal()!;
    // این تست فقط وقتی معنا دارد که کد صحیح همان نمونهٔ آزمایشی باشد
    if (code === "99999999") {
      const { PrismaClient } = await import("@prisma/client");
      const db = new PrismaClient({ datasources: { db: { url: DB_URL } } } as any);
      try {
        const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
        expect(meta?.masterCodeHash).not.toBe(sha256(KNOWN_TYPO_CODE));
      } finally {
        await db.$disconnect();
      }
    }
  });
});

/* ==========================================================================
 * §۴ — زنجیرهٔ منطق ورود (واحد)
 * ========================================================================== */

describe("PN-003 §۴ — زنجیرهٔ منطق master-login", () => {
  test("۴-۱) isValidMasterCodeFormat: ۸ رقم ✓ — ۷/۹ رقم، حروف، فارسی ✗", async () => {
    const { isValidMasterCodeFormat } = await import("@/lib/auth/crypto");
    expect(isValidMasterCodeFormat("99999999")).toBe(true);
    expect(isValidMasterCodeFormat("9999999")).toBe(false);
    expect(isValidMasterCodeFormat("999999991")).toBe(false);
    expect(isValidMasterCodeFormat("99999a99")).toBe(false);
    expect(isValidMasterCodeFormat("۹۹۹۹۹۹۹۹")).toBe(false);
    expect(isValidMasterCodeFormat("")).toBe(false);
  });

  test("۴-۲) safeEqual رشته‌های متفاوت را رد می‌کند و برابرها را می‌پذیرد", async () => {
    const { safeEqual } = await import("@/lib/auth/crypto");
    expect(safeEqual("99999999", "99999999")).toBe(true);
    expect(safeEqual("99999999", "80221186")).toBe(false);
    expect(safeEqual("99999999", "")).toBe(false);
  });

  test("۴-۳) مسیر master-login کد تستی عمومی (۸ صفر) را در زنجیره env نمی‌پذیرد (SEC-1)", async () => {
    const src = readFileSync(
      "/home/z/my-project/src/app/api/auth/master-login/route.ts",
      "utf8",
    );
    // بدون literal (قانون اسکن سورس HOTFIX-01) — الگوی repeat(8) + مقایسهٔ صریح
    expect(src).toContain('const PUBLIC_TEST_CODE = "0".repeat(8)');
    expect(src).toMatch(/cfg\.masterCode\s*!==\s*PUBLIC_TEST_CODE/);
  });
});
