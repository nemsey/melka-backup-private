/**
 * تست معماری «هوم یک‌پارچه» — PN-038/فاز ۲ (شورا-ن۰۶۳)
 * ------------------------------------------------------
 * بازطراحی UI (کوچک‌سازی و متمرکزسازی):
 *   · M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شدند
 *   · کانتینر «داشبورد مدیریتی» حذف شد؛ M1-M5 + M8 به ریشهٔ هوم رفتند
 *   · کاشی‌های قدیمی «آگهی ملکا» (listings) و «درخواست ملکا» (requests) از هوم حذف شدند
 *   · نام‌ها کوتاه شدند (حذف پسوند «ملکا» و «ملک تبریز»)
 *   · ترتیب جدید هوم: فایل یابی ← آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← مغز ← تنظیمات
 * دادهٔ همهٔ کاشی‌های حذف‌شده در DB ماندگار است (قانون دادهٔ مقدس PN-038).
 * PN-043/فاز ۲ (شورا-ن۰۸۷): داشبوردهای tenant — M1-M4 به ظرف tenant-dashboards رفتند؛
 * ترتیب جدید هوم: فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبورد ملک تبریز ← داشبورد ملکتون.
 * اجرا: bun test tests/management-dashboard.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Home as DummyIcon } from "lucide-react";

/** PN-043/فاز ۲ (شورا-ن۰۸۷) — ترتیب الزامی هوم: شش کاشی ریشه */
const ROOT_EXPECTED = [
  "file-finder",                 // فایل یابی
  "smart-matching",              // تطبیق
  "learning-tier",               // مغز
  "settings",                    // تنظیمات
  "tenant-dashboard-tabriz",     // داشبورد ملک تبریز (ظرف wrapper)
  "tenant-dashboard-melketun",   // داشبورد ملکتون (ظرف wrapper)
];

/** PN-043 — کاشی‌های M1-M4 درون ظرف tenant-dashboards (داشبوردهای tenant) */
const TENANT_CHILDREN_EXPECTED = [
  "arm-listings",            // آگهی
  "arm-requests",            // درخواست
  "transactions-contracts",  // معاملات
  "experts",                 // کارشناسان
];

/** PN-038/۲.۴ + PN-043 — نام‌های کاشی‌ها */
const TITLES_EXPECTED: Record<string, string> = {
  "file-finder": "فایل یابی",
  "arm-listings": "آگهی",
  "arm-requests": "درخواست",
  "transactions-contracts": "معاملات",
  "experts": "کارشناسان",
  "smart-matching": "تطبیق",
  "learning-tier": "مغز",
  "settings": "تنظیمات",
  "tenant-dashboard-tabriz": "داشبورد ملک تبریز",
  "tenant-dashboard-melketun": "داشبورد ملکتون",
};

describe("معماری هوم یک‌پارچه (PN-038/فاز ۲)", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("PN-043/۲.۵ — هوم: شش کاشی ریشه به ترتیب الزامی مالک (فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبوردها)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const root = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(root).toEqual(ROOT_EXPECTED);
    // نمای مشاور: کاشی‌های فقط-مالک (تطبیق/مغز) حذف می‌شوند — ترتیب باقی حفظ می‌شود
    const rootConsultant = tileRegistry.listRoot("CONSULTANT").map((t) => t.id);
    expect(rootConsultant).toEqual(ROOT_EXPECTED.filter((id) => id !== "smart-matching" && id !== "learning-tier"));
  });

  test("PN-038/۲.۴ — نام‌های کوتاه: حذف پسوند «ملکا» و «ملک تبریز»", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const [id, title] of Object.entries(TITLES_EXPECTED)) {
      expect(tileRegistry.get(id)!.title).toBe(title);
    }
    // هیچ کاشی ثبت‌شده‌ای پسوند قدیمی ندارد
    for (const t of tileRegistry.listAll("OWNER")) {
      expect(t.title).not.toContain("ملکا");
      if (t.id !== "tenant-dashboard-tabriz" && t.id !== "tenant-dashboard-melketun") {
        expect(t.title).not.toContain("ملک تبریز"); // PN-043: نام کامل داشبوردهای tenant به دستور مالک است
      }
    }
  });

  test("PN-038/۲.۱ — M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شده‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const removed of ["market-index", "data-coverage"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
  });

  test("PN-043/۲.۲ — کانتینر قدیمی حذف؛ فرزندانِ ظرف فقط M1-M4 در tenant-dashboards", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("management-dashboard")).toBeUndefined();
    const children = tileRegistry.listChildren("tenant-dashboards", "OWNER").map((t) => t.id);
    expect(children).toEqual(TENANT_CHILDREN_EXPECTED); // PN-043: تنها ظرف زنده = داشبوردهای tenant
    // همهٔ فرزندانِ ظرف در ریشه نیستند (wrapper — نه تکرار)
    for (const t of tileRegistry.listAll("OWNER")) {
      if (t.container) expect(t.container).toBe("tenant-dashboards");
    }
  });

  test("PN-038/۲.۳ — کاشی‌های قدیمی «آگهی ملکا» و «درخواست ملکا» از هوم حذف شدند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("listings")).toBeUndefined();
    expect(tileRegistry.get("requests")).toBeUndefined();
  });

  test("P6.5-12 + P6526/الف — کاشی «معاملات» با ایجنت بیست‌دامنه‌ای (≥۱۵) — قرارداد تازه P6.5-14", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("transactions-contracts")!;
    expect(tile).toBeDefined();
    expect(tile.title).toBe("معاملات");
    expect(tile.agent).not.toBeNull();
    expect(tile.agent!.insightDomains.length).toBeGreaterThanOrEqual(15);
    expect(tile.agent!.insightDomains).toContain("INFO_COVERAGE");
    expect(tile.agent!.insightDomains).toContain("TOP_EXPERTS");
    expect(tile.agent!.insightDomains).not.toContain("CONTRACT_TEXT");
    expect(tile.agent!.insightDomains).toContain("SHARE_AGGREGATE");
    expect(tile.agent!.insightDomains).toContain("VISIT_VOLUME");
    expect(tile.agent!.insightDomains).toContain("VISIT_TREND");
    expect(tile.agent!.insightDomains).toContain("VISIT_STATUS");
  });

  test("PN-043 — هیچ کاشی گم نشده: ۶ ریشه + ۴ فرزند tenant = کل رجیستری (۱۳)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const all = tileRegistry.listAll("OWNER").map((t) => t.id);
    expect(all.sort()).toEqual([...ROOT_EXPECTED, ...TENANT_CHILDREN_EXPECTED].sort()); // PN-043: wrapper — همهٔ کاشی‌ها سرِجایشان
  });

  test("PN-038 — کاشی‌های منتقل‌شده ایجنت‌های خود را حفظ کرده‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["file-finder", "arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching", "learning-tier"]) {
      const tile = tileRegistry.get(id)!;
      expect(tile.agent).not.toBeNull();
      expect(tile.agent!.tileId).toBe(id);
    }
    // تنظیمات ریشه است و ایجنت ندارد
    const settings = tileRegistry.get("settings")!;
    expect(settings.agent).toBeNull();
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

  test("PN-038/۲.۱ — ماژول‌های M6/M7/ظرف فیزیکی حذف شدند (دادهٔ DB مقدس می‌ماند)", async () => {
    for (const mod of [
      "src/core/tiles/tiles/market-index/index.ts",
      "src/core/tiles/tiles/data-coverage/index.ts",
      "src/core/tiles/tiles/management-dashboard/index.ts",
    ]) {
      expect(existsSync(join(import.meta.dir, "..", mod))).toBe(false);
    }
  });
});
