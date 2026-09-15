#!/usr/bin/env python3
"""
پاس دوم هماهنگ‌سازی — گرادیان‌های دوتایی فیروزه←آکوا
------------------------------------------------------
پس از جاروی emerald→teal، جفت‌های هم‌خانواده (teal→teal) تخت شده‌اند؛
این پاس آنها را به جفت دوتایی برند (فیروزه→آکوا/سیان) تبدیل می‌کند.
"""

from pathlib import Path

ROOT = Path("/home/z/my-project/src")

# الگوهای (قدیم → جدید) — فقط وقتی هر دو سوی گرادیان teal هستند
PAIRS = [
    ("from-teal-600 to-teal-400", "from-teal-600 to-cyan-500"),
    ("from-teal-600 to-teal-500", "from-teal-600 to-cyan-500"),
    ("from-teal-700 to-teal-500", "from-teal-700 to-cyan-500"),
    ("from-teal-600 via-teal-500 to-teal-400", "from-teal-600 via-teal-500 to-cyan-500"),
    ("hover:from-teal-700 hover:to-teal-600", "hover:from-teal-700 hover:to-cyan-600"),
    ("from-teal-500 to-teal-300", "from-teal-500 to-cyan-400"),
]

changed = {}
for p in list(ROOT.rglob("*.tsx")) + list(ROOT.rglob("*.ts")):
    text = p.read_text(encoding="utf-8")
    new = text
    n = 0
    for old, repl in PAIRS:
        c = new.count(old)
        if c:
            new = new.replace(old, repl)
            n += c
    if n:
        p.write_text(new, encoding="utf-8")
        changed[str(p.relative_to(ROOT))] = n

print(f"فایل‌های به‌بود یافته: {len(changed)}")
for k, v in sorted(changed.items(), key=lambda x: -x[1]):
    print(f"  {v} × {k}")

# بررسی باقی‌مانده‌ها
import re
left = []
for p in list(ROOT.rglob("*.tsx")) + list(ROOT.rglob("*.ts")):
    text = p.read_text(encoding="utf-8")
    for m in re.finditer(r"from-teal-\d+(?:\s+via-teal-\d+)?\s+to-teal-\d+", text):
        left.append((str(p.relative_to(ROOT)), m.group(0)))
print("ترتیب‌های تخت باقی‌مانده:", left if left else "هیچ")
