#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P6550 — مونتاژ سند اسکلت کامل ملکا
====================================
ورودی:  scripts/p6550-skeleton/part-01.md ... part-10.md  + نشانگرهای {{FILE:path}}
خروجی:  upload/skeleton/MELKA-SKELETON-COMPLETE-v1.0.md
قواعد:  جاسازی عین‌متنی فایل‌های کد از دیسک (صفر ویرایش) + پانوشت آمار
"""
import os
import re
import hashlib
import datetime

ROOT = "/home/z/my-project"
PARTS_DIR = os.path.join(ROOT, "scripts/p6550-skeleton")
OUT_DIR = os.path.join(ROOT, "upload/skeleton")
OUT_FILE = os.path.join(OUT_DIR, "MELKA-SKELETON-COMPLETE-v1.0.md")

parts = sorted(f for f in os.listdir(PARTS_DIR) if re.match(r"part-\d+\.md$", f))
assert len(parts) == 11, f"expected 11 parts, found {len(parts)}: {parts}"

doc_chunks = []
marker_stats = {"count": 0, "files": []}

for p in parts:
    path = os.path.join(PARTS_DIR, p)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    # جاسازی نشانگرهای {{FILE:...}}
    def embed(m):
        rel = m.group(1)
        target = os.path.join(ROOT, rel)
        if not os.path.isfile(target):
            raise FileNotFoundError(f"marker target missing: {rel}")
        with open(target, encoding="utf-8") as tf:
            content = tf.read().rstrip("\n")
        marker_stats["count"] += 1
        marker_stats["files"].append(rel)
        return content

    text = re.sub(r"\{\{FILE:([^}]+)\}\}", embed, text)
    doc_chunks.append(text.strip("\n"))
    print(f"  + {p}: {len(text.splitlines())} lines")

body = "\n\n".join(doc_chunks)

# پانوشت سند
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
total_lines = len(body.splitlines())
footer = f"""

---
---

# پیوست پایانی — شناسنامهٔ سند

| مورد | مقدار |
|---|---|
| نام سند | MELKA-SKELETON-COMPLETE-v1.0.md |
| شمار خطوط | {total_lines:,} |
| شمار فصل‌ها | ۲۵ (۵ بخش) |
| فایل‌های کد جاسازی‌شدهٔ عینی | {', '.join(marker_stats['files'])} |
| تاریخ مونتاژ | {now} |
| پروندهٔ سازنده | P6550-skeleton-v2 (دستور ملکا-شورا-۱۴۰۵-۰۳۷) |
| قید | صفر داده، صفر توکن، صفر رمز |

**md5 سند:** (در MANIFEST.md5 بستهٔ سورس و بستهٔ بقا ثبت می‌شود)

> این سند به‌همراه `melka-source-v1.0-<date>.tar.gz` و `REBUILD-LETTER.md`، سه‌گانهٔ «بستهٔ انتقال کامل ملکا» را می‌سازد.
"""

final = body + footer

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT_FILE, "w", encoding="utf-8") as fh:
    fh.write(final)

md5 = hashlib.md5(final.encode("utf-8")).hexdigest()
print()
print(f"OK → {OUT_FILE}")
print(f"lines: {total_lines:,}  |  embedded files: {marker_stats['count']}  |  md5: {md5}")
with open(os.path.join(OUT_DIR, ".skeleton-v1.0.md5"), "w") as fh:
    fh.write(md5 + "  " + os.path.basename(OUT_FILE) + "\n")
