#!/usr/bin/env python3
"""PN-043/فاز ۵ — update stale test assertions in p6530-architecture-guards.test.ts
to match the new PN-043 home reality (6 root tiles + tenant-dashboards container).
Line-number-precise (ZWNJ-safe)."""
import sys

P = "tests/p6530-architecture-guards.test.ts"
with open(P, encoding="utf-8") as f:
    lines = f.readlines()

def find_line(substr, start=0):
    for i in range(start, len(lines)):
        if substr in lines[i]:
            return i
    raise SystemExit(f"NOT FOUND: {substr}")

# ── ۰-۱: home root tiles (old 8-tile assertion → PN-043 six root tiles) ──
i_title = find_line("۰-۱) صفحه هوم")
assert 'expect(roots.map((t) => t.title)).toEqual([' in lines[i_title + 3], lines[i_title + 3]
# replace array line + trailing comment
assert "فایل یابی" in lines[i_title + 4], lines[i_title + 4]
lines[i_title + 4] = '      "فایل یابی", "تطبیق", "مغز", "تنظیمات", "داشبورد ملک تبریز", "داشبورد ملکتون",\n'
assert "PN-038/فاز ۲" in lines[i_title + 5], lines[i_title + 5]
lines[i_title + 5] = "    ]); // PN-043/فاز ۲ (شورا-ن۰۸۷): شش کاشی ریشه — M1-M4 درون داشبوردهای tenant (wrapper، نه تکرار)\n"

# ── ۰-۳: management-dashboard assertion → tenant-dashboards container ──
i3 = find_line("۰-۳) داشبورد مدیریتی")
# i3+3: children lookup line
assert "management-dashboard" in lines[i3 + 3], lines[i3 + 3]
lines[i3 + 3] = '    const children = tileRegistry.listChildren("tenant-dashboards", "OWNER");\n'
assert lines[i3 + 4].strip().startswith("expect(children).toEqual([]);"), lines[i3 + 4]
lines[i3 + 4] = '    expect(children.map((t) => t.title)).toEqual(["آگهی", "درخواست", "معاملات", "کارشناسان"]); // PN-043: M1-M4 درون ظرف tenant-dashboards\n'
# i3+6: titles array → drop; keep orders assertion updated to six roots
assert "فایل یابی" in lines[i3 + 6], lines[i3 + 6]
lines[i3 + 6] = '    // PN-043: ریشه‌ها شش‌تا هستند و M1-M4 دیگر در ریشه نیستند\n'
assert "toEqual([1, 2, 3, 4, 5, 6, 7, 8])" in lines[i3 + 7], lines[i3 + 7]
lines[i3 + 7] = '    expect(roots.map((t) => t.id)).toEqual(["file-finder", "smart-matching", "learning-tier", "settings", "tenant-dashboard-tabriz", "tenant-dashboard-melketun"]);\n    expect(roots.map((t) => t.order)).toEqual([1, 2, 3, 4, 5, 6]);\n'

with open(P, "w", encoding="utf-8") as f:
    f.writelines(lines)
print("OK — p6530 assertions updated to PN-043 reality")
