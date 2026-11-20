/**
 * DIR-DESC-CLEANUP-001 — گاردهای معماری (دستور مالک ۱۴۰۵/۰۸/۳۰ · چهار بند)
 * ------------------------------------------------------------------
 * اولاً) حذف توضیحات متنی بخش «حالت تمام‌ظرفیت ترموکس» در دو کاشی
 *        فایل‌یابی و تغییرات (کارکرد کامل بخش پابرجا می‌ماند).
 * ثانیاً) حذف کامل نوار «دسترسی سریع» M1-M5
 *        (M1آگهی · M2درخواست · M3معاملات · M4کارشناسان · M5تطبیق) از قاب
 *        تمام کاشی‌ها (FourListsTileChrome) — سربرگ هویت و بخش بروزرسانی
 *        فوق پیشرفته پابرجا می‌مانند.
 * ثالثاً) حذف توضیحات بخش «تغییر در کد و حذف کد» از سربرگ کاشی تغییرات —
 *        عنوان کاشی و یادداشت نقشِ غیرمالک پابرجا می‌مانند.
 * رابعاً) چهار قانون — جداگانه با اسکریپت‌های زنده راستی‌آزمایی می‌شود
 *        (audit-data-sacred.sh + union-snapshot.py + همگرایی پنج‌واحدی).
 * اجرا: bun test tests/dir-desc-cleanup-001.test.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const ROOT = "/home/z/my-project";
const FF = readFileSync(`${ROOT}/src/core/tiles/tiles/file-finder/FileFinderPage.tsx`, "utf8");
const CH = readFileSync(`${ROOT}/src/core/tiles/tiles/changes/ChangesPage.tsx`, "utf8");
const CHROME = readFileSync(`${ROOT}/src/components/tiles/FourListsTileChrome.tsx`, "utf8");

/* ═══════════ اولاً — حذف توضیحات حالت تمام‌ظرفیت ترموکس (هر دو کاشی) ═══════════ */

describe("DIR-DESC-CLEANUP-001 · اولاً — توضیحات تمام‌ظرفیت حذف شد", () => {
  test("۱-۱ کاشی فایل‌یابی: پاراگراف توضیحات (فعال‌سازی خودکار + توقف چهار فهرست + اولویت سقف + انقضای ۳۰ دقیقه) حذف شد", () => {
    expect(FF).not.toContain("هنگام ثبت هر آگهی در سامانه ARM از این کاشی");
    expect(FF).not.toContain("بروزرسانی چهار فهرست (آگهی/درخواست/معاملات/مشاوران) متوقف می‌شود");
    expect(FF).not.toContain("آیتم‌های ثبت با اولویت سقف (۱۰) مقدم بر OTP و سینک اجرا می‌شوند. انقضای خودکار: ۳۰ دقیقه.");
  });

  test("۱-۲ کاشی تغییرات: پاراگراف توضیحات هم‌مضمون حذف شد", () => {
    expect(CH).not.toContain("با فعال‌سازی: بروزرسانی چهار فهرست");
    expect(CH).not.toContain("تمام ظرفیت رلهٔ ترموکس به این کاشی اختصاص می‌یابد");
    expect(CH).not.toContain("هر عملیات ثبت/تغییر نیز این حالت را خودکار فعال می‌کند. انقضای خودکار: ۳۰ دقیقه.");
  });

  test("۱-۳ کارکرد بخش پابرجاست — عنوان کارت + کلیدهای «تمام ظرفیت»/«حالت عادی» + کارت وضعیت", () => {
    expect(FF).toContain("حالت تمام‌ظرفیت ترموکس");
    expect(CH).toContain("حالت تمام‌ظرفیت ترموکس");
    expect(FF).toContain("تمام ظرفیت\n");
    expect(FF).toContain("حالت عادی\n");
    expect(CH).toContain("تمام ظرفیت\n");
    expect(CH).toContain("حالت عادی\n");
    // چهار سنجهٔ زندهٔ کارت (رله/صف/اولویت/انبوه) پابرجا
    expect(FF).toContain("رلهٔ ترموکس");
    expect(FF).toContain("اولویت سقف (۱۰)");
    expect(CH).toContain("رلهٔ ترموکس");
    expect(CH).toContain("اولویت کاشی (۱۰)");
  });
});

/* ═══════════ ثانیاً — حذف کامل نوار «دسترسی سریع» M1-M5 از تمام کاشی‌ها ═══════════ */

describe("DIR-DESC-CLEANUP-001 · ثانیاً — نوار دسترسی سریع M1-M5 حذف شد", () => {
  test("۲-۱ کامپوننت TileLinkBar و آرایهٔ LINKS به‌طور کامل از قاب حذف شدند", () => {
    expect(CHROME).not.toContain("TileLinkBar");
    expect(CHROME).not.toContain("LINKS");
    expect(CHROME).not.toContain('data-testid="tile-link-bar"');
    expect(CHROME).not.toContain('aria-label="لینک به کاشی‌های دیگر"');
  });

  test("۲-۲ المان‌های پابرجای قاب: بروزرسانی فوق پیشرفته + سربرگ هویت (M1 · آگهی ملک تبریز)", () => {
    expect(CHROME).toContain("SuperListUpdate");
    expect(CHROME).toContain("listId={listId}");
    expect(CHROME).toContain("TileIdentityHeader");
    expect(CHROME).toContain("TENANT_TILE_IDENTITY");
  });

  test("۲-۳ هیچ صفحه/ماژول دیگری نوار را ارجاع نمی‌دهد (صفر import باقی‌مانده)", () => {
    const importers = [
      "src/core/tiles/tiles/arm-listing/index.ts",
      "src/core/tiles/tiles/arm-request/index.ts",
      "src/core/tiles/tiles/transactions-contracts/index.ts",
      "src/core/tiles/tiles/experts/index.ts",
    ];
    for (const p of importers) {
      const src = readFileSync(`${ROOT}/${p}`, "utf8");
      expect(src).not.toContain("TileLinkBar");
      expect(src).toContain("withFourListsChrome"); // قاب خودش پابرجاست
    }
  });
});

/* ═══════════ ثالثاً — حذف توضیحات «تغییر در کد و حذف کد» از سربرگ کاشی تغییرات ═══════════ */

describe("DIR-DESC-CLEANUP-001 · ثالثاً — توضیحات سربرگ کاشی تغییرات حذف شد", () => {
  test("۳-۱ متن «صاحب‌اختیار مالک ...» با ارجاع به گزارش‌ها حذف شد", () => {
    expect(CH).not.toContain("صاحب‌اختیار مالک در سامانه ARM ملک تبریز");
    expect(CH).not.toContain("تغییر تاریخ «ایجاد مشاور» با آبشار اتوماتیک تاریخچه‌ها، و حذف کامل کدها با پاکسازی کامل آثار");
    expect(CH).not.toContain("با شناخت کامل گزارش‌های dir-reg-req-099-001 و DIR-CHANGES-TILE-001");
  });

  test("۳-۲ عنوان کاشی و ساختار پابرجاست — دو تب کدآگهی/کددرخواست", () => {
    expect(CH).toContain("تغییرات — تغییر در کد و حذف کد (کدآگهی و کددرخواست)");
    expect(CH).toContain("۱. کدآگهی — تغییر · حذف");
    expect(CH).toContain("۲. کددرخواست — تغییر · حذف");
    expect(CH).toContain("ListingChangesPanel");
    expect(CH).toContain("RequestChangesPanel");
  });

  test("۳-۳ یادداشت نقشِ غیرمالک حفظ شد (مرز دسترسی — کارکردی، نه توضیحی)", () => {
    expect(CH).toContain("این کاشی فقط برای مالک فعال است.");
  });
});

/* ═══════════ رابعاً — چهار قانون: گاردهای ایستا (زنده با اسکریپت‌های جداگانه) ═══════════ */

describe("DIR-DESC-CLEANUP-001 · رابعاً — چهار قانون (گاردهای ایستا)", () => {
  test("۴-۱ دادهٔ مقدس: حذف‌ها فقط متنی‌اند — هیچ deleteMany/دستکاری داده در این نوبت نیست", () => {
    // این دستور صرفاً حذف توضیحات UI است؛ هیچ مسیر سینک/داده‌ای تغییر نکرده
    expect(CHROME).not.toContain("deleteMany");
    expect(FF).not.toContain("deleteMany");
    expect(CH).not.toContain("deleteMany");
  });

  test("۴-۲ لینک: قاب مشترک همچنان از یک منبع حقیقت واحد (SuperListUpdate) سرو می‌شود", () => {
    expect(CHROME).toContain("from '@/components/tiles/SuperListUpdate'");
    expect(CHROME.indexOf("SuperListUpdate")).toBeGreaterThan(-1);
  });
});
