/**
 * تست معماری «داشبورد مدیریتی» — ظرف کاشی‌های مدیریتی
 * ------------------------------------------------------
 * صفحه خانه کاشی‌های ریشه (فایل‌یابی، آگهی، درخواست ملک، داشبورد مدیریتی و
 * تنظیمات عمومی به‌عنوان آخرین کاشی) را نشان می‌دهد؛ سایر کاشی‌ها با فیلد
 * container به داخل داشبورد مدیریتی منتقل شده‌اند.
 * اجرا: bun test tests/management-dashboard.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { Home as DummyIcon } from "lucide-react";

const ROOT_EXPECTED = ["file-finder", "listings", "requests", "management-dashboard", "settings"];
/** P6.5-12: سه کاشی ادغامی + حذف بازدیدها (P6.5-11) + حذف مشتریان (P6.5-12) — ۷ فرزند */
const CHILDREN_EXPECTED = [
  "transactions-contracts",
  "price-index",
  "experts",
  "supply-demand",
  "extraction",
  // P6.5-10 — دو کاشی کاتالوگ ARM
  "arm-listings",
  "arm-requests",
];

describe("معماری داشبورد مدیریتی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("صفحه خانه ۵ کاشی ریشه را نشان می‌دهد — تنظیمات عمومی آخرین کاشی", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const root = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(root).toEqual(ROOT_EXPECTED);
    // نمای مشاور هم همین کاشی‌های ریشه است (هیچ‌کدام فقط-مالک نیستند)
    const rootConsultant = tileRegistry.listRoot("CONSULTANT").map((t) => t.id);
    expect(rootConsultant).toEqual(ROOT_EXPECTED);
  });

  test("۸ کاشی مدیریتی داخل داشبورد مدیریتی ملک تبریز منتقل شده‌اند — به همین ترتیب (P6.5-11)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(children).toEqual(CHILDREN_EXPECTED);
  });

  test("P6.5-11 — کاشی‌های ادغام/حذف‌شده دیگر در رجیستری نیستند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const removed of ["transactions", "contracts", "finance-commission", "visits"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
  });

  test("P6.5-12 — کاشی «معاملات ملک تبریز» (تغییر نام از نسخهٔ ادغامی) با ایجنت ۲۱ دامنه‌ای (≥۱۵)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    expect(tile).toBeDefined();
    expect(tile.title).toBe("معاملات ملک تبریز");
    expect(tile.agent).not.toBeNull();
    expect(tile.agent!.insightDomains.length).toBeGreaterThanOrEqual(15);
    expect(tile.agent!.insightDomains).toContain("CONTACT_COVERAGE");
    expect(tile.agent!.insightDomains).toContain("CONTRACT_TEXT");
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
        accent: "stone",
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
