/**
 * تست رگرسیون PN-055 — موتور استخراج عمیق (deep.ts)
 * الگوی تست‌های pn054: منطق خالص + DB تزریقی — بدون فراخوانی شبکهٔ واقعی.
 * اجرا: bun test tests/pn055-deep-engine.test.ts
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

// خواندن سورس deep.ts و راستی‌آزمایی ساختاری (بدون اجرای شبکه)
const src = readFileSync("src/lib/integrations/melketun/deep.ts", "utf8");

describe("PN-055 · موتور استخراج عمیق — ساختار", () => {
  test("۱) مسیرهای show درست‌اند", () => {
    expect(src).toContain("/Potentials/show/");
    expect(src).toContain("/Melketunfilingplus/show/");
  });

  test("۲) سیاست خطای هوشمند: ۵۰۰/۴۰۴ = بسته (بدون تلاش مجدد)", () => {
    expect(src).toMatch(/status === 500 \|\| fe\.status === 404/);
    expect(src).toContain("brokenIds");
  });

  test("۳) سیاست نشست: ۴۰۱/۴۰۳/۴۱۹ = ورود تازه", () => {
    expect(src).toContain("401");
    expect(src).toContain("403");
    expect(src).toContain("419");
  });

  test("۴) دکترین بدون نابودی: موبایل خالی هرگز دادهٔ موجود را پاک نمی‌کند + نگاشت ستون‌ها (PN-055 ترمیم + PN-056 گارد نکتهٔ ۲)", () => {
    // در ادغام درخواست: فقط مقدار غیرخالیِ غیر-کارشناسی نوشته می‌شود (PN-056 گارد)
    expect(src).toContain("if (customerMobile.length >= 10 && !applicantIsConsultant) data.customerMobile = customerMobile;");
    // در ادغام آگهی مستقیم: فقط غیرخالیِ غیر-کارشناسی (PN-056 گارد)
    expect(src).toContain("if (ownerMobile.length >= 10 && !ownerIsConsultant) data.ownerMobile = ownerMobile;");
    // در relatedFilings: فقط وقتی موجود خالی است
    expect(src).toContain("if (!existing.ownerMobile && phone.length >= 10)");
    // ⚠️ نگاشت ستون‌ها: مالک واقعی → rawOwnerName (نه ownerName که ستون کارشناس است)
    // (لایهٔ repository: realtorName←ownerName · ownerName(UI)←rawOwnerName)
    expect(src).toContain("data.rawOwnerName = ownerName;");
    expect(src).toContain("pdata.rawOwnerName = ownerName;");
  });

  test("۵) سقف چرخه + هرس وضعیت", () => {
    expect(src).toContain("PER_CYCLE_CAP = 150");
    expect(src).toContain("20_000");
  });

  test("۶) فیلد متقاضی از cf_pcf_snf_2638 و موبایل از cf_pcf_irm_1179", () => {
    expect(src).toContain("cf_pcf_snf_2638");
    expect(src).toContain("cf_pcf_irm_1179");
  });

  test("۷) فیلد مالک آگهی از cf_pcf_snf_1702 + cf_1704 + cf_pcf_irm_1706", () => {
    expect(src).toContain("cf_pcf_snf_1702");
    expect(src).toContain("cf_1704");
    expect(src).toContain("cf_pcf_irm_1706");
  });

  test("۸) قلاب ایزوله در sync.ts — فاز عمیق هرگز سینک اصلی را نمی‌شکند", () => {
    const syncSrc = readFileSync("src/lib/integrations/melketun/sync.ts", "utf8");
    expect(syncSrc).toContain('await import("./deep")');
    expect(syncSrc).toMatch(/try\s*\{[\s\S]*?syncMelketunDeep[\s\S]*?\}\s*catch\s*\(deepErr\)/);
    expect(syncSrc).toContain("soft-fail");
  });
});

describe("PN-055 · دادهٔ خزش‌شده — صحت ساختار", () => {
  test("۹) pot-details.jsonl: هر رکورد pid + فیلدهای استخراجی کلیدی دارد", () => {
    const lines = readFileSync("download/pn055/pot-details.jsonl", "utf8").split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);
    const rec = JSON.parse(lines[0]);
    expect(rec.pid).toMatch(/^13x\d+$/);
    expect("customerMobile" in rec).toBe(true);
    expect("ownerMobile" in rec).toBe(true);
    expect(Array.isArray(rec.relatedFilings)).toBe(true);
  });

  test("۱۰) موبایل‌های متقاضی استخراج‌شده همه ۱۰+ رقم‌اند", () => {
    const lines = readFileSync("download/pn055/pot-details.jsonl", "utf8").split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const rec = JSON.parse(line);
      if (rec.customerMobile) expect(rec.customerMobile).toMatch(/^\d{10,}$/);
    }
  });
});
