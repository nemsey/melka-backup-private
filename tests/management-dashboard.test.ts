/**
 * تست معماری «داشبورد مدیریتی» — ظرف کاشی‌های مدیریتی (P6526/الف — به‌روز)
 * ------------------------------------------------------
 * صفحه هوم پنج کاشی ریشه را به ترتیب الزامی مالک نشان می‌دهد:
 *   فایل یابی ملکا · آگهی ملکا · درخواست ملکا · تنظیمات عمومی · داشبورد مدیریتی ملک تبریز
 * داشبورد مدیریتی ظرف چهار کاشی M1 تا M4 است (بازسازی فازهای ۷-۸-۹ — ترتیب و نام عین دستور مالک).
 * اجرا: bun test tests/management-dashboard.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Home as DummyIcon } from "lucide-react";

/** P6526/الف — ترتیب الزامی مالک: فایل یابی ملکا · آگهی ملکا · درخواست ملکا · تنظیمات عمومی · داشبورد مدیریتی */
const ROOT_EXPECTED = ["file-finder", "listings", "requests", "settings", "management-dashboard"];
/** بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷): چهار کاشی مدیریتی M1 تا M4 */
// P6545/گام۲ (جلسه ۰۳۳): چهار کاشی تازهٔ M5-M8 به داشبورد مدیریتی افزوده شدند
const CHILDREN_EXPECTED = [
  "arm-listings",        // M1 آگهی ملک تبریز
  "arm-requests",        // M2 درخواست ملک تبریز
  "transactions-contracts", // M3 معاملات ملک تبریز
  "experts",             // M4 کارشناسان ملک تبریز
  "smart-matching",      // M5 تطبیق هوشمند (P6545)
  "learning-tier",       // M6 یادگیری و Tier (PN-003 — نام‌گذاری مالک: m5 تطبیق + m6 یادگیری)
  "market-index",        // M7 شاخص بازار
  "data-coverage",       // M8 پوشش داده
];

describe("معماری داشبورد مدیریتی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("P6526/الف — صفحه هوم ۵ کاشی ریشه به ترتیب الزامی مالک (تنظیمات عمومی چهارم، داشبورد مدیریتی آخر)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const root = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(root).toEqual(ROOT_EXPECTED);
    // نمای مشاور هم همین کاشی‌های ریشه است (هیچ‌کدام فقط-مالک نیستند)
    const rootConsultant = tileRegistry.listRoot("CONSULTANT").map((t) => t.id);
    expect(rootConsultant).toEqual(ROOT_EXPECTED);
  });

  test("P6545 — هشت کاشی مدیریتی M1 تا M8 داخل داشبورد مدیریتی — به همین ترتیب (جلسه ۰۳۳)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(children).toEqual(CHILDREN_EXPECTED);
  });

  test("P6530/گام ۵ — M5/M6/M7 به‌طور کامل حذف شده‌اند (ماژول‌ها + رجیستری؛ داده DB ماندگار)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const removed of ["price-index", "supply-demand", "extraction"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
    // P6530/گام ۵ — حذف کامل: ماژول‌ها هم فیزیکی حذف شدند (داده DB مقدس می‌ماند)
    for (const mod of [
      "src/core/tiles/tiles/price-index/index.ts",
      "src/core/tiles/tiles/supply-demand/index.ts",
      "src/core/tiles/tiles/extraction/index.ts",
    ]) {
      expect(existsSync(join(import.meta.dir, "..", mod))).toBe(false);
    }
  });

  test("P6.5-11 — کاشی‌های ادغام/حذف‌شده دیگر در رجیستری نیستند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const removed of ["transactions", "contracts", "finance-commission", "visits"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
  });

  test("P6.5-12 + P6526/الف — کاشی M3 «معاملات ملک تبریز» با ایجنت بیست‌دامنه‌ای (≥۱۵) — قرارداد تازه P6.5-14", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    expect(tile).toBeDefined();
    expect(tile.title).toBe("معاملات ملک تبریز");
    expect(tile.agent).not.toBeNull();
    expect(tile.agent!.insightDomains.length).toBeGreaterThanOrEqual(15);
    // P6526/پ — قرارداد کاشی عین ایجنت واقعی: INFO_COVERAGE جای CONTACT_COVERAGE نشست و TOP_EXPERTS تازه آمد
    expect(tile.agent!.insightDomains).toContain("INFO_COVERAGE");
    expect(tile.agent!.insightDomains).toContain("TOP_EXPERTS");
    // P6546/گام سوم-۲ — دامنهٔ CONTRACT_TEXT (پوشش متن قرارداد) حذف شد
    expect(tile.agent!.insightDomains).not.toContain("CONTRACT_TEXT");
    expect(tile.agent!.insightDomains).toContain("SHARE_AGGREGATE");
    // بینش‌های مهاجرت‌یافتهٔ بازدیدها (بند ج)
    expect(tile.agent!.insightDomains).toContain("VISIT_VOLUME");
    expect(tile.agent!.insightDomains).toContain("VISIT_TREND");
    expect(tile.agent!.insightDomains).toContain("VISIT_STATUS");
  });

  test("هیچ کاشی خارج از ریشه و داشبورد مدیریتی گم نشده است", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const all = tileRegistry.listAll("OWNER").map((t) => t.id);
    const accounted = new Set([...ROOT_EXPECTED, ...CHILDREN_EXPECTED]);
    expect(all.length).toBe(accounted.size);
    for (const id of all) expect(accounted.has(id)).toBe(true);
  });

  test("کاشی‌های فرزند فیلد container صحیح دارند و ایجنت‌هایشان حفظ شده است", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of CHILDREN_EXPECTED) {
      const tile = tileRegistry.get(id)!;
      expect(tile.container).toBe("management-dashboard");
      // همه کاشی‌های فرزند ظرف، ایجنت اختصاصی دارند
      expect(tile.agent).not.toBeNull();
      expect(tile.agent!.tileId).toBe(id);
    }
    // تنظیمات عمومی دیگر فرزند نیست — ریشه است و ایجنت ندارد
    const settings = tileRegistry.get("settings")!;
    expect(settings.container).toBeUndefined();
    expect(settings.agent).toBeNull();
  });

  test("خود کاشی داشبورد مدیریتی ظرف ندارد و در رجه‌ستری صحیح تعریف شده است", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const md = tileRegistry.get("management-dashboard")!;
    expect(md).toBeDefined();
    expect(md.container).toBeUndefined();
    expect(md.title).toBe("داشبورد مدیریتی ملک تبریز"); // P6.5-10 — بند ۱ دستور مالک
    expect(md.agent).toBeNull(); // ظرف ناوبری — بدون ایجنت (مانند تنظیمات عمومی)
    expect(md.component).toBeDefined();
  });

  test("تعریف کاشی خود-ظرف رد می‌شود (ایزوله‌سازی ساختاری)", async () => {
    const { defineTile } = await import("@/core/tiles/tile-contract");
    const Dummy = () => null;
    expect(() =>
      defineTile({
        id: "self-container",
        version: "1.0.0",
        title: "تست",
        tagline: "تست",
        description: "تست",
        icon: DummyIcon,
        accent: "settings",
        component: Dummy,
        order: 1,
        settings: [],
        agent: null,
        container: "self-container",
      })
    ).toThrow();
  });

  test("کاشی‌های ریشه (کارگاه اصلی دفتر) ظرف ندارند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["file-finder", "listings", "requests"]) {
      const tile = tileRegistry.get(id)!;
      expect(tile.container).toBeUndefined();
      expect(tile.agent).not.toBeNull();
    }
    // ظرف و تنظیمات نیز بدون ظرف‌اند (ایجنت ندارند)
    for (const id of ["management-dashboard", "settings"]) {
      const tile = tileRegistry.get(id)!;
      expect(tile.container).toBeUndefined();
      expect(tile.agent).toBeNull();
    }
  });
});
