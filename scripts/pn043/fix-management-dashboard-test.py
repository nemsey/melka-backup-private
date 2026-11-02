#!/usr/bin/env python3
"""PN-043/فاز ۵ — update management-dashboard.test.ts assertions to the
PN-043 home reality (6 root tiles + tenant-dashboards container holding M1-M4)."""
import sys

P = "tests/management-dashboard.test.ts"
with open(P, encoding="utf-8") as f:
    src = f.read()

def swap(old, new, label):
    global src
    if old not in src:
        raise SystemExit(f"NOT FOUND [{label}]:\n{old[:120]}")
    src = src.replace(old, new, 1)
    print(f"OK [{label}]")

# 1) header comment — append PN-043 note
swap(
    " * دادهٔ همهٔ کاشی‌های حذف‌شده در DB ماندگار است (قانون دادهٔ مقدس PN-038).",
    " * دادهٔ همهٔ کاشی‌های حذف‌شده در DB ماندگار است (قانون دادهٔ مقدس PN-038).\n"
    " * PN-043/فاز ۲ (شورا-ن۰۸۷): داشبوردهای tenant — M1-M4 به ظرف tenant-dashboards رفتند؛\n"
    " * ترتیب جدید هوم: فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبورد ملک تبریز ← داشبورد ملکتون.",
    "header",
)

# 2) ROOT_EXPECTED — six PN-043 roots
swap(
    """/** PN-038/۲.۵ — ترتیب الزامی هوم: هشت کاشی ریشه */
const ROOT_EXPECTED = [
  "file-finder",             // فایل یابی
  "arm-listings",            // آگهی
  "arm-requests",            // درخواست
  "transactions-contracts",  // معاملات
  "experts",                 // کارشناسان
  "smart-matching",          // تطبیق
  "learning-tier",           // مغز
  "settings",                // تنظیمات
];""",
    """/** PN-043/فاز ۲ (شورا-ن۰۸۷) — ترتیب الزامی هوم: شش کاشی ریشه */
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
];""",
    "ROOT_EXPECTED",
)

# 3) TITLES_EXPECTED — add the two tenant dashboards
swap(
    """/** PN-038/۲.۴ — نام‌های کوتاه هشت کاشی */
const TITLES_EXPECTED: Record<string, string> = {
  "file-finder": "فایل یابی",
  "arm-listings": "آگهی",
  "arm-requests": "درخواست",
  "transactions-contracts": "معاملات",
  "experts": "کارشناسان",
  "smart-matching": "تطبیق",
  "learning-tier": "مغز",
  "settings": "تنظیمات",
};""",
    """/** PN-038/۲.۴ + PN-043 — نام‌های کاشی‌ها */
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
};""",
    "TITLES_EXPECTED",
)

with open(P, "w", encoding="utf-8") as f:
    f.write(src)

# ── phase 2: line-anchored rewrites inside tests ──
with open(P, encoding="utf-8") as f:
    lines = f.readlines()

def find_idx(substr, start=0):
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    raise SystemExit(f"NOT FOUND LINE: {substr}")

# 4) test ۲.۵ title + root assertion now uses new ROOT_EXPECTED (auto) — update the test NAME only
i25 = find_idx("۲.۵ — هوم: هشت کاشی ریشه")
lines[i25] = '  test("PN-043/۲.۵ — هوم: شش کاشی ریشه به ترتیب الزامی مالک (فایل یابی ← تطبیق ← مغز ← تنظیمات ← داشبوردها)", async () => {\n'

# 5) test ۲.۴ — "no ملک تبریز suffix" must exempt the two tenant dashboards (PN-043 owner-decreed names)
i24 = find_idx("۲.۴ — نام‌های کوتاه")
# find the "expect(t.title).not.toContain(\"ملک تبریز\")" line after i24
i24b = find_idx('not.toContain("ملک تبریز")', i24)
lines[i24b] = '      if (t.id !== "tenant-dashboard-tabriz" && t.id !== "tenant-dashboard-melketun") {\n        expect(t.title).not.toContain("ملک تبریز"); // PN-043: نام کامل داشبوردهای tenant به دستور مالک است\n      }\n'

# 6) test ۲.۲ — container reality: tenant-dashboards exists, children = M1-M4
i22 = find_idx("۲.۲ — کانتینر management-dashboard حذف شد؛ هیچ کاشی فرزند ظرف ندارد")
lines[i22] = '  test("PN-043/۲.۲ — کانتینر قدیمی حذف؛ فرزندانِ ظرف فقط M1-M4 در tenant-dashboards", async () => {\n'
i22b = find_idx("expect(tileRegistry.get(\"management-dashboard\")).toBeUndefined();", i22)
# replace the old "no container children" loop with the tenant container assertion
i22c = find_idx("expect(t.container).toBeUndefined();", i22b)
lines[i22b:i22c + 1] = [
    '    expect(tileRegistry.get("management-dashboard")).toBeUndefined();\n',
    '    const children = tileRegistry.listChildren("tenant-dashboards", "OWNER").map((t) => t.id);\n',
    '    expect(children).toEqual(TENANT_CHILDREN_EXPECTED); // PN-043: تنها ظرف زنده = داشبوردهای tenant\n',
    '    // همهٔ فرزندانِ ظرف در ریشه نیستند (wrapper — نه تکرار)\n',
    '    for (const t of tileRegistry.listAll("OWNER")) {\n',
    '      if (t.container) expect(t.container).toBe("tenant-dashboards");\n',
    '    }\n',
]

# 7) "هشت ریشه = کل رجیستری" → 6 roots + 4 container children = whole registry (13)
i_lost = find_idx("هیچ کاشی گم نشده: هشت ریشه = کل رجیستری")
lines[i_lost] = '  test("PN-043 — هیچ کاشی گم نشده: ۶ ریشه + ۴ فرزند tenant = کل رجیستری (۱۳)", async () => {\n'
i_lost_b = find_idx("all.sort()", i_lost)
lines[i_lost_b] = '    expect(all.sort()).toEqual([...ROOT_EXPECTED, ...TENANT_CHILDREN_EXPECTED].sort()); // PN-043: wrapper — همهٔ کاشی‌ها سرِجایشان\n'

with open(P, "w", encoding="utf-8") as f:
    f.writelines(lines)
print("ALL OK — management-dashboard.test.ts updated")
