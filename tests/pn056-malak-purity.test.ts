/**
 * تست رگرسیون PN-056 — خلوص ستون مالک/متقاضی (نکتهٔ ۲ مالک)
 * ---------------------------------------------------------------------------
 * قانون مالک: «نهایت دقت شود نام کارشناس و شماره موبایل در ستون مالک در فهرست
 * آگهی ملکتون و ستون متقاضی در فهرست درخواست به اشتباه ثبت نشود»
 * + نکتهٔ ۳: سامانهٔ crm ملکتون مبنای استخراج اطلاعات مالک/متقاضی است.
 *
 * اجرا: bun test tests/pn056-malak-purity.test.ts
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { isConsultantIdentity, normId, last10 } from "../src/lib/integrations/melketun/deep";

const syncSrc = readFileSync("src/lib/integrations/melketun/sync.ts", "utf8");
const deepSrc = readFileSync("src/lib/integrations/melketun/deep.ts", "utf8");

// رجیستری نمونهٔ کارشناسان (شکل واقعی گارد — موبایل‌ها نرمال‌شدهٔ last10)
const guard = {
  names: new Set(["آرزو نجفی", "مسعود معصومی( شعبه رضانژاد)", "مجتبی سیفی"]),
  mobiles: new Set(["9142913808", "9368120295"]),
  filerByCode: new Map([["ME8442", "آرزو نجفی"], ["ME8447", "داود زادپناهی"]]),
  filerMobileByCode: new Map([["ME8442", "9142913808"]]),
};

describe("PN-056 · fountain (sync.ts) — حذف fallback عمومی فاسد", () => {
  test("۱) فیلد عمومی f.ownerName هرگز مبنای rawOwnerName نیست (فیلدهای خصوصی اختصاصی)", () => {
    expect(syncSrc).toContain("privateOwnerName");
    expect(syncSrc).toContain("privateOwnerPhone");
    // نگاشت نهایی: فقط enrich خصوصی یا فیلد خصوصیِ ادغام‌شده
    expect(syncSrc).toContain("ownerEnrich?.owner_name?.trim() ?? (String((f as unknown as InertiaRow).privateOwnerName");
  });

  test("۲) fallback فاسد قدیمی حذف شده", () => {
    expect(syncSrc).not.toContain("?? (f.ownerName?.trim() || null)");
    expect(syncSrc).not.toContain("?? f.phone?.replace(/\\D/g, \"\") ?? null");
  });

  test("۳) ادغام نمای خصوصی در فیلدهای اختصاصی می‌نویسد (نه فیلدهای عمومی)", () => {
    expect(syncSrc).toContain("privateOwnerName = owner");
    expect(syncSrc).toContain("privateOwnerPhone = byName");
  });
});

describe("PN-056 · گارد موتور عمیق (deep.ts) — نکتهٔ ۲", () => {
  test("۴) گارد بارگذاری از هر سه منبع حقیقت کارشناسان", () => {
    expect(deepSrc).toContain('key: "melketun-users"');
    expect(deepSrc).toContain('key: "melketun-website-filers"');
    expect(deepSrc).toContain('key: "melketun-website-owners"');
    expect(deepSrc).toContain("expertRecord.findMany");
  });

  test("۵) شمارندهٔ مسدودی + هر سه نقطهٔ نوشتن گارد‌دار", () => {
    expect(deepSrc).toContain("consultantBlocked: number");
    expect(deepSrc).toContain("applicantIsConsultant");
    expect(deepSrc).toContain("ownerIsConsultant");
    expect(deepSrc).toContain("rowScopeHit");
  });
});

describe("PN-056 · منطق خالص isConsultantIdentity", () => {
  test("۶) شاهد سطری: نام == فایلرِ همین کد → کارشناس", () => {
    expect(isConsultantIdentity(guard, "آرزو نجفی", "09120000000", "ME8442")).toBe(true);
  });

  test("۷) شاهد سطری: موبایل == فایلرِ همین کد → کارشناس", () => {
    expect(isConsultantIdentity(guard, "خانم احمدی", "09142913808", "ME8442")).toBe(true);
  });

  test("۸) رجیستری قطعی: نام کاربر CRM → کارشناس (سخت‌گیرانه — نکتهٔ ۲)", () => {
    expect(isConsultantIdentity(guard, "مجتبی سیفی", "09120000000", "ME9999")).toBe(true);
  });

  test("۹) موبایل قطعی رجیستری → کارشناس", () => {
    expect(isConsultantIdentity(guard, "خانم احمدی", "09368120295", "ME9999")).toBe(true);
  });

  test("۱۰) مالک واقعی با نام/موبایل ناآشنا → مجاز", () => {
    expect(isConsultantIdentity(guard, "اقای مرادی", "09106948002", "ME8439")).toBe(false);
    expect(isConsultantIdentity(guard, "خانم دانایی فرد", "09190152296", null)).toBe(false);
  });

  test("۱۱) نرمال‌سازی: نیم‌فاصله/فاصلهٔ تکراری بی‌اثر", () => {
    expect(normId("  آرزو\u200cنجفی  ")).toBe("آرزو نجفی");
    expect(normId("مجتبی   سیفی")).toBe("مجتبی سیفی");
    expect(last10("+98 914 291 3808")).toBe("9142913808");
    expect(last10("0914-291-3808")).toBe("9142913808");
    expect(last10("123")).toBe("");
  });
});
