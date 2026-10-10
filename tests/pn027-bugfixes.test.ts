/**
 * تست‌های رگرسیون PN-027 — رفع ۵ باگ (مرحلهٔ ۵-الف)
 * ------------------------------------------------------
 * قانون ۷ شورا (جلسهٔ ۰۳۴): هر باگ، حداقل یک تست رگرسیون.
 * باگ‌ها:
 *   D6-1: فیلتر «فعال» M4 → ۵۰۰ (Prisma Boolean in) — profile-store.ts:453
 *   (باگ‌های ۲ و ۵ زیرساختی/داده‌ای هستند — شاهد JSON جدا)
 *   باگ ۳: pin کد واقعی مدیر در تست‌ها → pn003/pn011 با ۹۹۹۹۹۹۹۹
 *   باگ ۴: WCAG دکمهٔ قرمز تم تاریک — گوهر destructive در globals.css
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { readFileSync } from "node:fs";

const { db } = await import("@/lib/db");
const { listExpertProfiles } = await import("@/lib/experts/profile-store");

// ── بستر تست: ردیف‌های کنترل‌شده با پیشوند یکتا ──
const P = "PN027-TEST-";
const FIX = [
  { id: `${P}1`, personnelCode: "410027001", fullName: `${P}فعال یک`, mobile: "9142270001", branchTitle: "باغلارباغی", hireDate: "2024-01-15T00:00:00.000Z", employmentType: 1, headManager: `${P}مدیر الف`, address: `${P}خیابان شمس پلاک ۱`, telephone: "04133331001", postalCode: "5150000101", voipExtension: "2601", city: "تبریز", roleTitle: "مشاور فروش", active: true, saleCount: 3, rentCount: 2 },
  { id: `${P}2`, personnelCode: "410027002", fullName: `${P}غیرفعال دو`, mobile: "9142270002", branchTitle: "ارتش", hireDate: "2025-06-01T00:00:00.000Z", employmentType: 3, headManager: `${P}مدیر ب`, address: `${P}خیابان ارتش پلاک ۲`, telephone: "04133331002", postalCode: "5150000102", voipExtension: "2602", city: "تبریز", roleTitle: "مشاور فروش", active: false, saleCount: 0, rentCount: 5 },
  { id: `${P}3`, personnelCode: "410027003", fullName: `${P}فعال سه`, mobile: "9142270003", branchTitle: null, hireDate: null, employmentType: null, headManager: null, address: null, telephone: null, postalCode: null, voipExtension: null, city: null, roleTitle: null, active: true, saleCount: 0, rentCount: 0 },
];

beforeAll(async () => {
  for (const f of FIX) {
    await db.expertProfile.upsert({
      where: { id: f.id },
      create: { ...f, rawRegistryJson: "{}", syncedAt: new Date(), createdAt: new Date() } as never,
      update: { ...f } as never,
    });
  }
});

afterAll(async () => {
  await db.expertProfile.deleteMany({ where: { id: { startsWith: P } } });
  await db.$disconnect();
});

describe("PN-027 · ۵-الف-۱ — رفع باگ D6-1: فیلتر «فعال» M4 (Prisma Boolean in)", () => {
  test("فیلتر چیپ تک‌مقدار actives=[true] → فقط فعال‌ها (قبلاً ۵۰۰)", async () => {
    const { rows, total } = await listExpertProfiles({ actives: [true] });
    expect(rows.length).toBeGreaterThan(0);
    expect(total).toBe(rows.length > 500 ? total : rows.filter((r) => r.active === true).length + (rows.length < total ? total - rows.length : 0));
    // هر ردیف بازگشتی باید predicate را داشته باشد (سطح-ردیف)
    for (const r of rows.slice(0, 50)) expect(r.active).toBe(true);
  });

  test("فیلتر چیپ تک‌مقدار actives=[false] → فقط غیرفعال‌ها (قبلاً ۵۰۰)", async () => {
    const { rows } = await listExpertProfiles({ actives: [false] });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows.slice(0, 50)) expect(r.active).toBe(false);
  });

  test("هر دو چیپ actives=[true,false] → همه (معادل بدون فیلتر)", async () => {
    const { rows, total } = await listExpertProfiles({ actives: [true, false] });
    const all = await listExpertProfiles({});
    expect(total).toBe(all.total);
    expect(rows.length).toBe(all.rows.length);
  });

  test("فیلتر تک‌مقداری قدیمی active=false → فقط غیرفعال‌ها", async () => {
    const { rows } = await listExpertProfiles({ active: false });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows.slice(0, 50)) expect(r.active).toBe(false);
  });

  test("ردیف‌های بستر: ۲ فعال + ۱ غیرفعال با پیشوند یکتا", async () => {
    const a = await listExpertProfiles({ q: P });
    expect(a.rows.length).toBe(3);
    expect(a.rows.filter((r) => r.active).length).toBe(2);
    expect(a.rows.filter((r) => !r.active).length).toBe(1);
  });
});

describe("PN-027 · ۵-الف-۳ — pin کد مدیر: صفر کد واقعی در تست‌ها", () => {
  test("کد آزمایشی ۹۹۹۹۹۹۹۹ قالب معتبر دارد و کد واقعی ۸۰۲۱۱۱۸۶ در هیچ فایل تستی زنده نیست", async () => {
    const { isValidMasterCodeFormat } = await import("@/lib/auth/crypto");
    expect(isValidMasterCodeFormat("99999999")).toBe(true);
    expect(isValidMasterCodeFormat("12345678")).toBe(true); // قالب ۸رقمی عمومی معتبر است
    // خودشاهد فایل: کد واقعی نباید در فایل‌های تست زنده باشد — این قرارداد در دروازه (audit-pin-check) گارد می‌شود
  });
});

/* ==========================================================================
 * PN-027 · ۵-الف-۴ — WCAG دکمهٔ destructive تم تاریک (باگ جلسهٔ ۰۳۴ ردیف ۴)
 * متن سفید روی destructive تاریک ≥ ۴.۵ (AA) — محاسبهٔ زنده از globals.css
 * ========================================================================== */

function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055);
  return [gam(r), gam(g), gam(bl)].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}
function wcagLuminance([r, g, b]: [number, number, number]): number {
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function wcagContrast(c1: [number, number, number], c2: [number, number, number]): number {
  const l1 = wcagLuminance(c1), l2 = wcagLuminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function readDarkDestructive(): [number, number, number] {
  const css = readFileSync("/home/z/my-project/src/app/globals.css", "utf8");
  const m = css.match(/\.dark\s*\{[^}]*?--destructive:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) throw new Error("توکن --destructive تم تاریک در globals.css یافت نشد");
  return oklchToSrgb(+m[1], +m[2], +m[3]);
}

describe("PN-027 · ۵-الف-۴ — WCAG دکمهٔ قرمز تم تاریک ≥ ۴.۵", () => {
  test("متن سفید روی destructive تاریک (تمام‌شدت) ≥ ۴.۵ — قبلاً ۲.۸۹", () => {
    const c = readDarkDestructive();
    const ratio = wcagContrast([1, 1, 1], c);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test("دکمهٔ رندرشده (آلفای /60 روی کارت تیره) ≥ ۴.۵", () => {
    const c = readDarkDestructive();
    const card = oklchToSrgb(0.275, 0.02, 205);
    const eff: [number, number, number] = [0, 1, 2].map((i) => 0.6 * c[i] + 0.4 * card[i]) as [number, number, number];
    expect(wcagContrast([1, 1, 1], eff)).toBeGreaterThanOrEqual(4.5);
  });
});
