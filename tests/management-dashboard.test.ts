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
 * اجرا: bun test tests/management-dashboard.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Home as DummyIcon } from "lucide-react";

/** PN-038/۲.۵ — ترتیب الزامی هوم: هشت کاشی ریشه */
const ROOT_EXPECTED = [
  "file-finder",             // فایل یابی
  "arm-listings",            // آگهی
  "arm-requests",            // درخواست
  "transactions-contracts",  // معاملات
  "experts",                 // کارشناسان
  "smart-matching",          // تطبیق
  "learning-tier",           // مغز
  "settings",                // تنظیمات
];

/** PN-038/۲.۴ — نام‌های کوتاه هشت کاشی */
const TITLES_EXPECTED: Record<string, string> = {
  "file-finder": "فایل یابی",
  "arm-listings": "آگهی",
  "arm-requests": "درخواست",
  "transactions-contracts": "معاملات",
  "experts": "کارشناسان",
  "smart-matching": "تطبیق",
  "learning-tier": "مغز",
  "settings": "تنظیمات",
};

describe("معماری هوم یک‌پارچه (PN-038/فاز ۲)", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("PN-038/۲.۵ — هوم: هشت کاشی ریشه به ترتیب الزامی مالک (فایل یابی ← … ← تنظیمات)", async () => {
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
      expect(t.title).not.toContain("ملک تبریز");
    }
  });

  test("PN-038/۲.۱ — M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شده‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const removed of ["market-index", "data-coverage"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
  });

  test("PN-038/۲.۲ — کانتینر management-dashboard حذف شد؛ هیچ کاشی فرزند ظرف ندارد", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("management-dashboard")).toBeUndefined();
    for (const t of tileRegistry.listAll("OWNER")) {
      expect(t.container).toBeUndefined();
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

  test("PN-038 — هیچ کاشی گم نشده: هشت ریشه = کل رجیستری", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const all = tileRegistry.listAll("OWNER").map((t) => t.id);
    expect(all.sort()).toEqual([...ROOT_EXPECTED].sort());
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
