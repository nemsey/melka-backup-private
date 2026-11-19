/**
 * تست معماری «هوم یک‌پارچه» — PN-038/فاز ۲ (شورا-ن۰۶۳) + PN-086 (دستور مالک ۱۴۰۵/۰۸/۲۵)
 * ------------------------------------------------------
 * بازطراحی UI (کوچک‌سازی و متمرکزسازی):
 *   · M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شدند
 *   · کانتینر «داشبورد مدیریتی» حذف شد؛ M1-M5 + M8 به ریشهٔ هوم رفتند
 *   · کاشی‌های قدیمی «آگهی ملکا» (listings) و «درخواست ملکا» (requests) از هوم حذف شدند
 *   · نام‌ها کوتاه شدند (حذف پسوند «ملکا» و «ملک تبریز»)
 * دادهٔ همهٔ کاشی‌های حذف‌شده در DB ماندگار است (قانون دادهٔ مقدس PN-038).
 * PN-043/فاز ۲ (شورا-ن۰۸۷): M1-M4 به ظرف tenant-dashboards رفتند (wrapper مشترک).
 * PN-086/گام ۱ (دستور مالک ۱۴۰۵/۰۸/۲۵ ساعت ۰۷:۴۵ تهران) — انحلال ظرف:
 *   · کاشی «داشبورد ملک تبریز» حذف شد؛ M1-M4 به ریشهٔ هوم صعود کردند.
 *   · کاشی «فایل‌یابی» حذف شد (حذف نما — داده/خط‌لولهٔ دیوار مقدس).
 *   · ترتیب هفت‌تایی هوم: آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← مغز ملکا ← تنظیمات.
 * DIR-FF-TILE-003 (دستور مالک ۱۴۰۵/۰۸/۳۰) — بازسازی فایل‌یابی (هشتم حذف PN-086 برای این کاشی) +
 *   ادغام مغز ملکا در تنظیمات و حذف کاشی مستقل + هشت‌تایی‌شدن هوم.
 *   · گام ۲: قاب «بروزرسانی چهار فهرست» + «نوار لینک کاشی‌ها» در M1-M4 (FourListsTileChrome).
 * اجرا: bun test tests/management-dashboard.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Home as DummyIcon } from "lucide-react";

/** DIR-FF-TILE-003 (دستور مالک ۱۴۰۵/۰۸/۳۰) — ترتیب الزامی هوم: هشت کاشی ریشه */
const ROOT_EXPECTED = [
  "file-finder",            // فایل‌یابی (بازسازی — تمام ظرفیت‌های مغز + تمام‌ظرفیت ترموکس)
  "arm-listings",            // آگهی (M1)
  "arm-requests",            // درخواست (M2)
  "transactions-contracts",  // معاملات (M3)
  "experts",                 // کارشناسان (M4)
  "smart-matching",          // تطبیق
  "changes",                 // تغییرات
  "settings",                // تنظیمات (مغز ملکا در آن ادغام شد — DIR-FF-TILE-003/ثانیاً)
];

/** DIR-FF-TILE-003 — نام‌های کاشی‌ها (مغز ملکا = بخش تنظیمات؛ کاشی مستقل حذف شد) */
const TITLES_EXPECTED: Record<string, string> = {
  "file-finder": "فایل یابی",
  "arm-listings": "آگهی",
  "arm-requests": "درخواست",
  "transactions-contracts": "معاملات",
  "experts": "کارشناسان",
  "smart-matching": "تطبیق",
  "changes": "تغییرات",
  "settings": "تنظیمات",
};

describe("معماری هوم یک‌پارچه (PN-038 + PN-086 + DIR-FF-TILE-003)", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("DIR-FF-TILE-003 — هوم: هشت کاشی ریشه به ترتیب الزامی مالک (فایل‌یابی ← آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← تغییرات ← تنظیمات)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const root = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(root).toEqual(ROOT_EXPECTED);
    // نمای مشاور: کاشی‌های فقط-مالک (تطبیق/تغییرات) حذف می‌شوند — ترتیب باقی حفظ می‌شود
    const rootConsultant = tileRegistry.listRoot("CONSULTANT").map((t) => t.id);
    expect(rootConsultant).toEqual(ROOT_EXPECTED.filter((id) => id !== "smart-matching" && id !== "changes"));
  });

  test("DIR-FF-TILE-003 — کاشی «فایل‌یابی» بازسازی شد؛ کاشی مغز ملکا و داشبورد ملک تبریز حذف‌اند (ادغام در تنظیمات)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("file-finder")).toBeDefined(); // بازسازی — حکم تازهٔ مالک
    expect(tileRegistry.get("learning-tier")).toBeUndefined(); // ادغام در تنظیمات
    expect(tileRegistry.get("tenant-dashboard-tabriz")).toBeUndefined();
  });

  test("PN-086/گام ۱ — ظرف tenant-dashboards منحل شد: هیچ کاشی container ندارد؛ M1-M4 ریشه‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.listChildren("tenant-dashboards", "OWNER")).toEqual([]);
    for (const t of tileRegistry.listAll("OWNER")) {
      expect(t.container).toBeUndefined(); // PN-086: دیگر هیچ ظرفی زنده نیست
    }
  });

  test("PN-038/۲.۴ + DIR-FF-TILE-003 — نام‌های کاشی‌ها (مغز ملکا در تنظیمات ادغام شد)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const [id, title] of Object.entries(TITLES_EXPECTED)) {
      expect(tileRegistry.get(id)!.title).toBe(title);
    }
    // هیچ کاشی ثبت‌شده‌ای پسوند قدیمی ندارد (مغز ملکا دیگر کاشی نیست — بخش تنظیمات است)
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

  test("PN-086 — هیچ کاشی گم نشده: هشت ریشه = کل رجیستری", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const all = tileRegistry.listAll("OWNER").map((t) => t.id);
    expect(all.sort()).toEqual([...ROOT_EXPECTED].sort());
    expect(tileRegistry.size).toBe(ROOT_EXPECTED.length);
  });

  test("PN-038 — کاشی‌های ماندگار ایجنت‌های خود را حفظ کرده‌اند (فایل‌یابی بازسازی شد)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    for (const id of ["file-finder", "arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching"]) {
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

  test("DIR-FF-TILE-003 — ماژول فیزیکی فایل‌یابی بازسازی شد؛ مغز ملکا/داشبورد حذف (دادهٔ DB مقدس می‌ماند)", async () => {
    // بازسازی (حکم تازهٔ مالک ۱۴۰۵/۰۸/۳۰): ماژول‌های فیزیکی فایل‌یابی زنده‌اند
    expect(existsSync(join(import.meta.dir, "..", "src/core/tiles/tiles/file-finder/index.ts"))).toBe(true);
    expect(existsSync(join(import.meta.dir, "..", "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"))).toBe(true);
    // مغز ملکا حذف نما شد (ادغام در تنظیمات) — داشبورد ملک تبریز همچنان حذف
    for (const mod of [
      "src/core/tiles/tiles/learning-tier/index.ts",
      "src/core/tiles/tiles/learning-tier/LearningTierPage.tsx",
      "src/core/tiles/tiles/tenant-dashboard-tabriz/index.ts",
      "src/components/tiles/TenantDashboard.tsx",
      "src/app/dashboard/tabriz/page.tsx",
    ]) {
      expect(existsSync(join(import.meta.dir, "..", mod))).toBe(false);
    }
  });
});
