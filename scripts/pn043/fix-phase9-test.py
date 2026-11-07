#!/usr/bin/env python3
"""PN-043/فاز ۵ — update phase9-wiring-brain-daemon.test.ts (§۱۱ ۱۱-۱/۱۱-۲) to PN-043 reality."""

P = "tests/phase9-wiring-brain-daemon.test.ts"
with open(P, encoding="utf-8") as f:
    src = f.read()

# ۱۱-۱ — six root tiles
old1 = '''    expect(tileRegistry.listRoot("OWNER").map((t) => t.title)).toEqual([
      "فایل یابی", "آگهی", "درخواست", "معاملات", "کارشناسان", "تطبیق", "مغز", "تنظیمات",
    ]);'''
new1 = '''    expect(tileRegistry.listRoot("OWNER").map((t) => t.title)).toEqual([
      "فایل یابی", "تطبیق", "مغز", "تنظیمات", "داشبورد ملک تبریز", "داشبورد ملکتون",
    ]); // PN-043/فاز ۲ (شورا-ن۰۸۷): شش ریشه — M1-M4 درون داشبوردهای tenant'''
assert old1 in src, "11-1 anchor not found"
src = src.replace(old1, new1, 1)

# ۱۱-۲ — tenant-dashboards container
old2 = '''    expect(tileRegistry.listChildren("management-dashboard", "OWNER")).toEqual([]);
    expect(tileRegistry.get("management-dashboard")).toBeUndefined();
    const roots = tileRegistry.listRoot("OWNER");
    expect(roots.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);'''
new2 = '''    expect(tileRegistry.get("management-dashboard")).toBeUndefined();
    const children = tileRegistry.listChildren("tenant-dashboards", "OWNER");
    expect(children.map((t) => t.title)).toEqual(["آگهی", "درخواست", "معاملات", "کارشناسان"]); // PN-043: ظرف زنده
    const roots = tileRegistry.listRoot("OWNER");
    expect(roots.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6]); // PN-043: شش ریشه'''
assert old2 in src, "11-2 anchor not found"
src = src.replace(old2, new2, 1)

# test names (۱۱-۱ / ۱۱-۲ headers) — replace old titles
old3 = '۱۱-۱ → PN-03۸/۲.۵: هوم = هشت کاشی با نام‌های کوتاه به ترتیب الزامی مالک'
new3 = '۱۱-۱ → PN-043/۲.۵: هوم = شش کاشی ریشه به ترتیب الزامی مالک (wrapper tenant)'
assert old3 in src, "11-1 title not found"
src = src.replace(old3, new3, 1)

old4 = '۱۱-۲ → PN-03۸: ظرف داشبورد مدیریتی حذف شد — هشت کاشی همه در ریشهٔ هوم‌اند'
new4 = '۱۱-۲ → PN-043: ظرف قدیمی حذف؛ M1-M4 درون ظرف tenant-dashboards'
assert old4 in src, "11-2 title not found"
src = src.replace(old4, new4, 1)

with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("OK — phase9 §۱۱ assertions updated")
