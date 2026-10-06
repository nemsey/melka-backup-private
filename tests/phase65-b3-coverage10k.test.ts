/**
 * تست‌های D.3 (شب دوم) — پوشش مقیاس‌بستهٔ قواعد سه‌لایهٔ B.3
 * ==================================================================================
 * دستور ملکا-شورا-۰۰۸ بخش D.3: «ادامهٔ P6.5-04» — پایش سنجهٔ «نرمال‌سازی ≥ ۹۵٪»
 * برای لایهٔ تازهٔ B.3 (raw→target روی نام‌ها/موبایل‌های هفت موجودیت Bulk).
 *
 * سنجه‌ها (۲۱٬۰۰۰ ردیف = ۳٬۰۰۰ × ۷ موجودیت، seed قطعی ۱۴۰۵):
 *  ۱) حفظ خام — فیلد raw عین ورودی، بیت‌به‌بیت (تضمین سه‌لایه) → ۱۰۰٪ الزامی
 *  ۲) پوشش مشتق‌سازی — فیلدهای معتبرِ خام → مقصدِ نرمالِ غیرخالی → ≥ ۹۵٪
 *  ۳) idempotency — اجرای مجدد روی خروجی: صفر تغییر در مقصد + خام عین منبع
 *  ۴) deterministic — همان seed → همان کلیدها
 *
 * نویز واقع‌گرایانهٔ ورودی (عین سامانه مبدأ): فاصله‌های تکراری · حروف عربی (ي/ك)
 * · نیم‌فاصله · ارقام فارسی/عربی · پیش‌شمارهٔ +98/0914/914 · جداکننده‌های ـ و فاصله
 * · ۳٪ موبایل نامعتبر (رد صادقانه، خارج از صورت کسر پوشش).
 */
import { describe, expect, test } from "bun:test";

import {
  normalizeBulkRow,
  normalizeName,
  normalizeMobile,
  type LocationRegistry,
} from "../src/lib/melk-api/normalize";
import { getDefaultLocationRegistry } from "../src/lib/melk-api/location-registry";

// ===================== ساختگاه =====================

/** مولد قطعی mulberry32 — عین تست ۱۰K خواهر (seed ثابت ۱۴۰۵) */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["سيد", "علي", "محمد رضا", "فاطمه", "زهرا", "حسين", "مهدی", "علي‌رضا"];
const LAST = ["رضائي", "كريمي", "موسوي", "محمدی", "ئيزدي", "تبریزی", "قلی‌زاده", "صادقی"];
const TITLES = ["املاک ثقه ", "مشاور املاك  ملک", "املاک سيد", "آژانس پارس"];

/** نام خام با نویز واقع‌گرایانه (فاصله تکراری + گاهی عربی) */
function noisyName(rnd: () => number, i: number): string {
  const f = FIRST[Math.floor(rnd() * FIRST.length)];
  const l = LAST[Math.floor(rnd() * LAST.length)];
  return ` ${f}  ${l} ${i % 97} `;
}

/** موبایل خام با فرمت‌های متنوع سامانهٔ مبدأ؛ invalid=true → نامعتبر */
function noisyMobile(rnd: () => number, invalid: boolean): string {
  if (invalid) return "12345";
  const body = "9141234567";
  const variants = [
    `۰${body}`,                       // ارقام فارسی + صفر
    `+98 ${body}`,                    // پیش‌شمارهٔ بین‌المللی با فاصله
    `0${body.slice(0, 3)}-${body.slice(3, 6)}-${body.slice(6)}`, // خط تیره
    `۹${body.slice(1)}`,              // ارقام فارسی بدون صفر
    `0${body}`,                       // ساده
  ];
  return variants[Math.floor(rnd() * variants.length)];
}

/** رجیستری محله — برای موجودیت‌های بدون قاعدهٔ محله اهمیتی ندارد؛ یکتا و ارزان */
const REGISTRY: LocationRegistry = getDefaultLocationRegistry();

/** نگاشت موجودیت → جفت‌های (خام، مقصد، نوع) — عین FIELD_RULES با target */
const ENTITY_RULES: Record<string, Array<{ raw: string; target: string; kind: "name" | "mobile" }>> = {
  transaction: [
    { raw: "rawPropertyCustomer", target: "propertyCustomer", kind: "name" },
    { raw: "rawRequestCustomer", target: "requestCustomer", kind: "name" },
  ],
  expert: [
    { raw: "rawFullName", target: "fullName", kind: "name" },
    { raw: "rawMobile", target: "mobile", kind: "mobile" },
    { raw: "rawBusinessTitle", target: "businessTitle", kind: "name" },
    { raw: "rawCreator", target: "creator", kind: "name" },
  ],
  listing: [
    { raw: "rawOwnerName", target: "ownerName", kind: "name" },
    { raw: "rawOwnerMobile", target: "ownerMobile", kind: "mobile" },
  ],
  request: [
    { raw: "rawCustomerName", target: "customerName", kind: "name" },
    { raw: "rawCustomerMobile", target: "customerMobile", kind: "mobile" },
  ],
  visit: [
    { raw: "rawRequesterName", target: "requesterName", kind: "name" },
    { raw: "rawCheckerName", target: "checkerName", kind: "name" },
    { raw: "rawPropertyRealtorName", target: "propertyRealtorName", kind: "name" },
  ],
  contract: [
    { raw: "rawCreatorName", target: "creatorName", kind: "name" },
    { raw: "rawPropertyTitle", target: "propertyTitle", kind: "name" },
  ],
  interaction: [
    { raw: "rawRequestRealtorName", target: "requestRealtorName", kind: "name" },
    { raw: "rawPropertyRealtorName", target: "propertyRealtorName", kind: "name" },
  ],
};

const ROWS_PER_ENTITY = 3_000;
const INVALID_MOBILE_RATE = 0.03; // عین تست ۱۰K خواهر

describe("D.3 — پوشش مقیاس‌بستهٔ قواعد سه‌لایهٔ B.3 (۲۱K ردیف، seed ۱۴۰۵)", () => {
  test("حفظ خام ۱۰۰٪ + پوشش مشتق‌سازی ≥ ۹۵٪ + idempotency + deterministic", () => {
    const rnd = mulberry32(1405);
    let rawChecked = 0;
    let rawPreserved = 0;
    let derivable = 0;   // ورودی معتبر (موبایل سالم یا نام غیرخالی)
    let derived = 0;     // مقصدِ نرمالِ غیرخالی و منطبق بر تابع خالص
    let invalidMobiles = 0;
    let idempotencyViolations = 0;
    const firstKeys: Record<string, string[]> = {};

    for (const [entity, rules] of Object.entries(ENTITY_RULES)) {
      firstKeys[entity] = [];
      for (let i = 0; i < ROWS_PER_ENTITY; i++) {
        // ساخت ردیف خام — فقط فیلدهای خام؛ مقاصد باید از صفر مشتق شوند
        const row: Record<string, unknown> = { id: `${entity}-${i}` };
        if (entity === "transaction") row.propertyCode = `P${200000 + i}`;
        if (entity === "expert") row.personnelCode = `E${300000 + i}`;
        if (entity === "listing") row.propertyCode = `L${400000 + i}`;
        if (entity === "request") row.requestCode = `R${500000 + i}`;
        if (entity === "visit") row.propertyCode = `V${600000 + i}`;
        if (entity === "contract") { row.contractHolo = `H${700000 + i}`; row.propertyCode = `P${700000 + i}`; }

        for (const r of rules) {
          row[r.raw] =
            r.kind === "mobile"
              ? noisyMobile(rnd, rnd() < INVALID_MOBILE_RATE)
              : r.raw === "rawBusinessTitle"
                ? ` ${TITLES[Math.floor(rnd() * TITLES.length)]} ${i % 53} `
                : noisyName(rnd, i);
        }

        const snapshot: Record<string, string> = {};
        for (const r of rules) snapshot[r.raw] = row[r.raw] as string;

        const res = normalizeBulkRow(entity as Parameters<typeof normalizeBulkRow>[0], row, REGISTRY);
        const resRow = res.row as Record<string, unknown>;

        // ۱) حفظ خام — عین ورودی
        for (const r of rules) {
          rawChecked += 1;
          if (resRow[r.raw] === snapshot[r.raw]) rawPreserved += 1;
        }

        // ۲) پوشش مشتق‌سازی
        for (const r of rules) {
          const rawVal = snapshot[r.raw];
          if (r.kind === "mobile") {
            if (rawVal === "12345") { invalidMobiles += 1; continue; }
            derivable += 1;
            const expectv = normalizeMobile(rawVal);
            if (typeof resRow[r.target] === "string" && (resRow[r.target] as string) === expectv && expectv.length > 0) derived += 1;
          } else {
            derivable += 1;
            const expectv = normalizeName(rawVal);
            if (typeof resRow[r.target] === "string" && (resRow[r.target] as string) === expectv && expectv.length > 0) derived += 1;
          }
        }

        // ۳) idempotency — اجرای مجدد روی خروجی
        const res2 = normalizeBulkRow(entity as Parameters<typeof normalizeBulkRow>[0], resRow, REGISTRY);
        const res2Row = res2.row as Record<string, unknown>;
        for (const r of rules) {
          if (res2Row[r.target] !== resRow[r.target]) idempotencyViolations += 1;
          if (res2Row[r.raw] !== snapshot[r.raw]) idempotencyViolations += 1;
        }

        if (i < 40) firstKeys[entity].push(res.stats.key);
      }
    }

    const rawPreservationRate = rawPreserved / rawChecked;
    const derivationRate = derived / derivable;

    // ===================== سنجه‌های پذیرش =====================
    const totalRulePaths = Object.values(ENTITY_RULES).reduce((s, rs) => s + rs.length, 0); // ۱۷ مسیر خام→مقصد
    expect(rawChecked).toBe(totalRulePaths * ROWS_PER_ENTITY); // ۱۷ × ۳۰۰۰ = ۵۱٬۰۰۰ بازرسی خام
    expect(rawPreservationRate).toBe(1); // حفظ خام: ۱۰۰٪ بدون استثنا
    expect(derivationRate).toBeGreaterThanOrEqual(0.95); // پوشش مشتق‌سازی ≥ ۹۵٪
    expect(idempotencyViolations).toBe(0); // idempotency کامل

    // ۴) deterministic — بازپخش کامل همان seed (همهٔ ردیف‌ها، ثبت کلید فقط برای ۴۰ تای اول)
    const rnd2 = mulberry32(1405);
    const secondKeys: Record<string, string[]> = {};
    for (const [entity, rules] of Object.entries(ENTITY_RULES)) {
      secondKeys[entity] = [];
      for (let i = 0; i < ROWS_PER_ENTITY; i++) {
        const row: Record<string, unknown> = { id: `${entity}-${i}` };
        if (entity === "transaction") row.propertyCode = `P${200000 + i}`;
        if (entity === "expert") row.personnelCode = `E${300000 + i}`;
        if (entity === "listing") row.propertyCode = `L${400000 + i}`;
        if (entity === "request") row.requestCode = `R${500000 + i}`;
        if (entity === "visit") row.propertyCode = `V${600000 + i}`;
        if (entity === "contract") { row.contractHolo = `H${700000 + i}`; row.propertyCode = `P${700000 + i}`; }
        for (const r of rules) {
          row[r.raw] =
            r.kind === "mobile"
              ? noisyMobile(rnd2, rnd2() < INVALID_MOBILE_RATE)
              : r.raw === "rawBusinessTitle"
                ? ` ${TITLES[Math.floor(rnd2() * TITLES.length)]} ${i % 53} `
                : noisyName(rnd2, i);
        }
        if (i < 40) {
          secondKeys[entity].push(normalizeBulkRow(entity as Parameters<typeof normalizeBulkRow>[0], row, REGISTRY).stats.key);
        } else {
          normalizeBulkRow(entity as Parameters<typeof normalizeBulkRow>[0], row, REGISTRY); // بازپخش کامل — حفظ جریان seed
        }
      }
    }
    for (const entity of Object.keys(ENTITY_RULES)) {
      expect(secondKeys[entity]).toEqual(firstKeys[entity]);
    }

    console.log(
      `  [B.3-۲۱K] حفظ خام=${(rawPreservationRate * 100).toFixed(1)}% · پوشش مشتق‌سازی=${(derivationRate * 100).toFixed(1)}% · مشتق‌پذیر=${derivable.toLocaleString("fa-IR")} · موفق=${derived.toLocaleString("fa-IR")} · موبایل نامعتبر (رد صادقانه)=${invalidMobiles} · نقض idempotency=${idempotencyViolations}`
    );
  });
});
