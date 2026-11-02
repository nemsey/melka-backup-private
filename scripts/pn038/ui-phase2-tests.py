#!/usr/bin/env python3
# PN-038 فاز ۲ — ویرایش‌های تست (پس از کامیت منبع؛ ضد-بازنشانی: idempotent)
import sys, pathlib
ROOT = pathlib.Path("/home/z/my-project")
def edit(rel, subs):
    p = ROOT / rel
    src = p.read_text()
    changed = False
    for old, new in subs:
        if old in src:
            src = src.replace(old, new); changed = True
        elif new in src:
            pass  # قبلاً اعمال شده
        else:
            print(f"MISSING in {rel}: {old[:70]!r}"); sys.exit(1)
    p.write_text(src)
    print(f"OK {rel} (changed={changed})")

# ── new-tiles-2: ترتیب ریشه جدید ──
edit("tests/new-tiles-2.test.ts", [
    ('''    // بازسازی فازهای ۷-۸-۹ — ترتیب الزامی M1 تا M4
    const ids = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(ids.indexOf("arm-listings")).toBe(0); // M1
    expect(ids.indexOf("arm-requests")).toBe(1); // M2
    expect(ids.indexOf("transactions-contracts")).toBe(2); // M3
    expect(ids.indexOf("experts")).toBe(3); // M4
    expect(ids.length).toBe(8); // هشت کاشی — M1-M4 + چهار کاشی تازه (PN-003: m5 تطبیق + m6 یادگیری)
    expect(ids.indexOf("smart-matching")).toBe(4); // M5 تطبیق
    expect(ids.indexOf("market-index")).toBe(5); // M6 شاخص بازار (PN-030/گام دوم — شورا-ن۰۳۵)
    expect(ids.indexOf("data-coverage")).toBe(6); // M7 پوشش اطلاعات (PN-030/گام دوم — شورا-ن۰۳۵)
    expect(ids.indexOf("learning-tier")).toBe(7); // M8 مغز ملکا (PN-028/خامساً-ق)
    // تنظیمات عمومی ریشه است (چهارم) — نه داخل داشبورد مدیریتی؛ داشبورد مدیریتی آخرین کاشی ریشه
    expect(ids).not.toContain("settings");
    expect(tileRegistry.listRoot("OWNER").at(-1)?.id).toBe("management-dashboard");''',
     '''    // PN-038/فاز ۲ (شورا-ن۰۶۳): ترتیب جدید هوم — فایل یابی ← آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← مغز ← تنظیمات
    const ids = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(ids).toEqual([
      "file-finder", "arm-listings", "arm-requests", "transactions-contracts",
      "experts", "smart-matching", "learning-tier", "settings",
    ]);
    // M6/M7 و ظرف و کاشی‌های قدیمی ملکا حذف شدند (PN-038/۲.۱-۲.۳)
    expect(tileRegistry.has("market-index")).toBe(false);
    expect(tileRegistry.has("data-coverage")).toBe(false);
    expect(tileRegistry.has("management-dashboard")).toBe(false);
    expect(tileRegistry.has("listings")).toBe(false);
    expect(tileRegistry.has("requests")).toBe(false);'''),
])

# ── p6545-step2-tiles: M6/M7 حذف + M8 bootstrap + import existsSync ──
edit("tests/p6545-step2-tiles.test.ts", [
    ('import { readFileSync } from "node:fs";', 'import { readFileSync, existsSync } from "node:fs";'),
    ('''  test("م-۶-۱۴ فایل کاشی M6 ثبت شده (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/market-index/index.ts`, "utf8");
    expect(idx).toContain('id: "market-index"');
    expect(idx).toContain('accent: "m6"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۶-۱۵ صفحهٔ M6 هر پنج قابلیت را دارد (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/market-index/MarketIndexPage.tsx`, "utf8");
    expect(page).toContain("روند قیمت ماهانه");
    expect(page).toContain("۱۰ منطقهٔ پرتقاضا");
    expect(page).toContain("نوع ملک");
    expect(page).toContain("معاملات واقعی در برابر آگهی‌های فعال");
    expect(page).toContain("حجم ماهانه");
  });''',
     '''  test("م-۶-۱۴ → PN-038/۲.۱: فایل کاشی M6 فیزیکی حذف شد (رجیستری + ماژول؛ داده DB مقدس)", () => {
    expect(existsSync(`${TILES_DIR}/market-index/index.ts`)).toBe(false);
  });

  test("م-۶-۱۵ → PN-038: صفحهٔ M6 فیزیکی حذف شد", () => {
    expect(existsSync(`${TILES_DIR}/market-index/MarketIndexPage.tsx`)).toBe(false);
  });'''),
    ('''  test("م-۶-۱۷ نمودار سه‌سری در صفحه هست (اسکن منبع)", () => {
    const page = readFileSync(`${TILES_DIR}/market-index/MarketIndexPage.tsx`, "utf8");
    expect(page).toContain('dataKey="transactions"');
    expect(page).toContain('dataKey="listings"');
    expect(page).toContain('dataKey="requests"');
  });''',
     '''  test("م-۶-۱۷ → PN-038: نمودار سه‌سری M6 با ماژول حذف شد (دادهٔ معاملات در DB ماندگار)", () => {
    expect(existsSync(`${TILES_DIR}/market-index/`)).toBe(false);
  });'''),
    ('''  test("م-۶-۲۳ دادهٔ شاخص از ۷۵۷ معاملهٔ واقعی سخن می‌گوید (اسکن سند)", () => {
    const idx = readFileSync(`${TILES_DIR}/market-index/index.ts`, "utf8");
    expect(idx).toContain("معاملات");
  });''',
     '''  test("م-۶-۲۳ → PN-038: دادهٔ شاخص (۷۵۷ معامله) در DB مقدس ماند — کاشی حذف، داده ماندگار", async () => {
    const count = await real.transactionRecord.count();
    expect(count).toBeGreaterThan(700); // داده در پایگاه ماندگار است (قانون دادهٔ مقدس)
  });'''),
    ('''  test("م-۷-۱۱ فایل کاشی M7 ثبت شده (اسکن منبع)", () => {
    const idx = readFileSync(`${TILES_DIR}/data-coverage/index.ts`, "utf8");
    expect(idx).toContain('id: "data-coverage"');
    expect(idx).toContain('accent: "m7"');
    expect(idx).toContain('minRole: "OWNER"');
  });

  test("م-۷-۱۲ صفحهٔ M7 جدول پوشش + نمودار + رکوردهای ناقص دارد", () => {
    const page = readFileSync(`${TILES_DIR}/data-coverage/DataCoveragePage.tsx`, "utf8");
    expect(page).toContain("درصد پوشش");
    expect(page).toContain("مسیر پر شدن");
    expect(page).toContain("رکوردهای ناقص");
    expect(page).toContain("BarChart");
  });''',
     '''  test("م-۷-۱۱ → PN-038/۲.۱: فایل کاشی M7 فیزیکی حذف شد (رجیستری + ماژول؛ داده DB مقدس)", () => {
    expect(existsSync(`${TILES_DIR}/data-coverage/index.ts`)).toBe(false);
  });

  test("م-۷-۱۲ → PN-038: صفحهٔ M7 فیزیکی حذف شد (پوشش داده در DB محاسبه‌پذیر ماند)", () => {
    expect(existsSync(`${TILES_DIR}/data-coverage/DataCoveragePage.tsx`)).toBe(false);
  });'''),
    ('''  test("م-۷-۱۴ نمایش Tier در صفحهٔ M7 (بینش Tier-aware)", () => {
    const page = readFileSync(`${TILES_DIR}/data-coverage/DataCoveragePage.tsx`, "utf8");
    expect(page).toContain("Tier");
  });''',
     '''  test("م-۷-۱۴ → PN-038: نمایش Tier در صفحهٔ M7 با حذف صفحه منتفی (Tier در مغز M8)", () => {
    expect(existsSync(`${TILES_DIR}/data-coverage/`)).toBe(false);
  });'''),
    ('''  test("م-۸-۲۴ رجیستری کاشی‌ها شامل چهار کاشی تازه است", async () => {
    const bootstrap = readFileSync("src/core/tiles/bootstrap.ts", "utf8");
    expect(bootstrap).toContain("smart-matching");
    expect(bootstrap).toContain("market-index");
    expect(bootstrap).toContain("data-coverage");
    expect(bootstrap).toContain("learning-tier");''',
     '''  test("م-۸-۲۴ → PN-038: رجیستری bootstrap — هشت کاشی هوم (M6/M7/ظرف حذف)", async () => {
    const bootstrap = readFileSync("src/core/tiles/bootstrap.ts", "utf8");
    expect(bootstrap).toContain("smart-matching");
    expect(bootstrap).toContain("learning-tier");
    expect(bootstrap).not.toContain("market-index");
    expect(bootstrap).not.toContain("data-coverage");
    expect(bootstrap).not.toContain("management-dashboard");'''),
])

print("PHASE-2 TEST EDITS REAPPLIED")
