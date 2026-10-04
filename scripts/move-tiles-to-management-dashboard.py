#!/usr/bin/env python3
"""انتقال کاشی‌های مدیریتی به داخل کاشی «داشبورد مدیریتی» (فیلد container + ترتیب جدید)

ترتیب جدید صفحه خانه (کاشی‌های ریشه):
  1. فایل‌یابی   2. آگهی   3. درخواست ملک   4. داشبورد مدیریتی
ترتیب درون داشبورد مدیریتی (فرزندان):
  1. معاملات  2. قراردادها  3. باشگاه مشتریان  4. مالی و کمیسیون  5. شاخص قیمت
  6. کارشناسان  7. بازدیدها  8. عرضه و تقاضا  9. استخراج  99. تنظیمات عمومی
"""
import re
import sys

BASE = "/home/z/my-project/src/core/tiles/tiles"

# (module, new_order, container?)
PLAN = [
    ("transactions", 1, True),
    ("contracts", 2, True),
    ("customer-club", 3, True),
    ("finance-commission", 4, True),
    ("price-index", 5, True),
    ("experts", 6, True),
    ("visits", 7, True),
    ("supply-demand", 8, True),
    ("extraction", 9, True),
    ("settings", 99, True),
    ("file-finder", 1, False),
    ("listing", 2, False),
    ("request", 3, False),
]

for module, new_order, container in PLAN:
    path = f"{BASE}/{module}/index.ts"
    with open(path, encoding="utf-8") as f:
        src = f.read()

    # ۱) جایگزینی order
    src, n_order = re.subn(r"^(\s+)order: \d+,\s*$", rf"\1order: {new_order},", src, count=1, flags=re.M)
    if n_order != 1:
        sys.exit(f"FAIL order: {path}")

    # ۲) افزودن container (اگر نبود و خواسته شده)
    if container and "container:" not in src:
        src = src.replace(f"order: {new_order},", f'order: {new_order},\n  container: "management-dashboard",', 1)
    if not container and "container:" in src:
        src = re.sub(r"^\s+container: \"[a-z-]+\",\s*\n", "", src, count=1, flags=re.M)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"OK {module}: order={new_order} container={'management-dashboard' if container else '-'}")

print("ALL DONE")
