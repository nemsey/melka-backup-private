#!/usr/bin/env python3
# PN-038 فاز ۲ — بازطراحی UI (کوچک‌سازی و متمرکزسازی)
import re, sys, pathlib

ROOT = pathlib.Path("/home/z/my-project")
def edit(rel, subs, must=True):
    p = ROOT / rel
    src = p.read_text()
    for old, new in subs:
        if old not in src:
            if must:
                print(f"MISSING in {rel}: {old[:60]!r}"); sys.exit(1)
            continue
        src = src.replace(old, new)
    p.write_text(src)
    print(f"OK {rel}")

# ── ۱) رجیستری کاشی‌ها: نام کوتاه + ترتیب جدید + حذف ظرف ──
edit("src/core/tiles/tiles/file-finder/index.ts", [
    ('title: "فایل یابی ملکا",', 'title: "فایل یابی", // PN-038/۲.۴ — نام کوتاه'),
])
edit("src/core/tiles/tiles/arm-listing/index.ts", [
    ('title: "آگهی ملک تبریز",', 'title: "آگهی", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 1,\n  container: "management-dashboard",', '  order: 2, // PN-038/۲.۵ — ترتیب جدید هوم: آگهی دوم'),
])
edit("src/core/tiles/tiles/arm-request/index.ts", [
    ('title: "درخواست ملک تبریز",', 'title: "درخواست", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 2,\n  container: "management-dashboard",', '  order: 3, // PN-038/۲.۵ — ترتیب جدید هوم: درخواست سوم'),
])
edit("src/core/tiles/tiles/transactions-contracts/index.ts", [
    ('title: "معاملات ملک تبریز",', 'title: "معاملات", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 3,\n  container: "management-dashboard",', '  order: 4, // PN-038/۲.۵ — ترتیب جدید هوم: معاملات چهارم'),
])
edit("src/core/tiles/tiles/experts/index.ts", [
    ('title: "کارشناسان ملک تبریز",', 'title: "کارشناسان", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 4,\n  container: "management-dashboard",', '  order: 5, // PN-038/۲.۵ — ترتیب جدید هوم: کارشناسان پنجم'),
])
edit("src/core/tiles/tiles/smart-matching/index.ts", [
    ('title: "تطبیق هوشمند ملک تبریز",', 'title: "تطبیق", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 5,\n  container: "management-dashboard",', '  order: 6, // PN-038/۲.۵ — ترتیب جدید هوم: تطبیق ششم'),
])
edit("src/core/tiles/tiles/learning-tier/index.ts", [
    ('title: "مغز ملکا — یادگیری و Tier",', 'title: "مغز", // PN-038/۲.۴ — نام کوتاه'),
    ('  order: 8, // PN-028/خامساً-ق — دستور مالک: مغز ملکا هشتم\n  container: "management-dashboard",', '  order: 7, // PN-038/۲.۵ — ترتیب جدید هوم: مغز هفتم'),
])
edit("src/core/tiles/tiles/settings/index.ts", [
    ('title: "تنظیمات عمومی",', 'title: "تنظیمات", // PN-038/۲.۴ — نام کوتاه'),
])

# settings order 4 → 8
p = ROOT / "src/core/tiles/tiles/settings/index.ts"
src = p.read_text()
src = re.sub(r"  order: 4,\n", "  order: 8, // PN-038/۲.۵ — ترتیب جدید هوم: تنظیمات هشتم (آخر)\n", src, count=1)
p.write_text(src); print("OK settings order")

# ── ۲) bootstrap: حذف M6/M7 + ظرف + کاشی‌های قدیمی ملکا ──
edit("src/core/tiles/bootstrap.ts", [
    ('import "@/core/tiles/tiles/listing";\nimport "@/core/tiles/tiles/request";\n', ''),
    ('import "@/core/tiles/tiles/management-dashboard";\n', ''),
    ('import "@/core/tiles/tiles/market-index";\nimport "@/core/tiles/tiles/data-coverage";\n', ''),
    ('export { listingTile } from "@/core/tiles/tiles/listing";\n', ''),
    ('export { requestTile } from "@/core/tiles/tiles/request";\n', ''),
    ('export { managementDashboardTile } from "@/core/tiles/tiles/management-dashboard";\n', ''),
    ('export { marketIndexTile } from "@/core/tiles/tiles/market-index";\n', ''),
    ('export { dataCoverageTile } from "@/core/tiles/tiles/data-coverage";\n', ''),
], must=False)

# bootstrap سند سرآغاز
edit("src/core/tiles/bootstrap.ts", [
    ('import "@/core/tiles/tiles/file-finder";',
     '''// PN-038/فاز ۲ (شورا-ن۰۶۳): بازطراحی UI — کوچک‌سازی و متمرکزسازی.
// کاشی‌های M6 (شاخص بازار) و M7 (پوشش داده) از رجیستری حذف شدند؛
// کانتینر «داشبورد مدیریتی» حذف شد و M1-M5 + M8 به ریشهٔ هوم رفتند؛
// کاشی‌های قدیمی «آگهی ملکا» و «درخواست ملکا» از هوم حذف شدند.
// ترتیب جدید هوم: فایل یابی ← آگهی ← درخواست ← معاملات ← کارشناسان ← تطبیق ← مغز ← تنظیمات.
// دادهٔ همهٔ کاشی‌های حذف/ادغام‌شده در پایگاه ماندگار است (قانون دادهٔ مقدس).
import "@/core/tiles/tiles/file-finder";'''),
], must=False)

# ── ۳) personnel-access: فهرست کاشی‌های قابل مدیریت تازه ──
edit("src/lib/access/personnel-access.ts", [
    ('''  { id: "arm-listings", title: "M1 — آگهی ملک تبریز" },
  { id: "arm-requests", title: "M2 — درخواست ملک تبریز" },
  { id: "transactions-contracts", title: "M3 — معاملات ملک تبریز" },
  { id: "experts", title: "M4 — کارشناسان" },
  { id: "smart-matching", title: "M5 — تطبیق هوشمند" },
  { id: "learning-tier", title: "M6 — مغز و یادگیری" },
  { id: "market-index", title: "شاخص قیمت بازار" },
  { id: "data-coverage", title: "پوشش داده‌ها" },
  { id: "file-finder", title: "فایل‌یاب" },
  { id: "management-dashboard", title: "داشبورد مدیریتی" },''',
     '''  // PN-038/فاز ۲: هشت کاشی هوم — نام‌های کوتاه (M6/M7/ظرف حذف شدند)
  { id: "file-finder", title: "فایل یابی" },
  { id: "arm-listings", title: "آگهی" },
  { id: "arm-requests", title: "درخواست" },
  { id: "transactions-contracts", title: "معاملات" },
  { id: "experts", title: "کارشناسان" },
  { id: "smart-matching", title: "تطبیق" },
  { id: "learning-tier", title: "مغز" },'''),
])

# ── ۴) SmartMatchingPage: returnTo ظرف → هوم ──
edit("src/core/tiles/tiles/smart-matching/SmartMatchingPage.tsx", [
    ('      openTile(tileId, "management-dashboard", { code });',
     '      openTile(tileId, null, { code }); // PN-038/فاز ۲: ظرف حذف شد — بازگشت به هوم'),
    ('    openTile(tileId, "management-dashboard", { code: result.sourceInfo.code });',
     '    openTile(tileId, null, { code: result.sourceInfo.code }); // PN-038/فاز ۲'),
])
print("ALL PHASE-2 SOURCE EDITS DONE")
