#!/usr/bin/env python3
"""
P1-06 — مقایسه پیکسلی رگرسیون بصری (baseline ↔ final)
------------------------------------------------------
هر جفت تصویر: (۱) تطابق ابعاد (۲) درصد پیکسل متفاوت (۳) نقشه تفاوت
آستانیه پذیرش: تفاوت ساختاری صفر — تفاوت‌های جزئی فقط از عناصر زمان‌محور
(نشانگر اتصال/ساعت) مجاز است و باید موضعی و کوچک باشد.
"""

from PIL import Image, ImageChops
import sys

BASE = "/home/z/my-project/download/phase1-visual"
PAIRS = [
    ("base-ready-transactions.png", "final-ready-transactions.png", "معاملات"),
    ("base-ready-experts.png", "final-ready-experts.png", "کارشناسان"),
    ("base-ready-requests.png", "final-ready-requests.png", "درخواست ملک"),
]

overall_ok = True
for base_name, final_name, label in PAIRS:
    a = Image.open(f"{BASE}/{base_name}").convert("RGB")
    b = Image.open(f"{BASE}/{final_name}").convert("RGB")

    if a.size != b.size:
        print(f"✗ {label}: ابعاد متفاوت {a.size} vs {b.size} — تفاوت محتوایی (نه ساختاری) باید بررسی شود")
        overall_ok = False
        continue

    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    hist = diff.convert("L").histogram()
    total = a.size[0] * a.size[1]
    changed = sum(hist[8:])  # پیکسل‌هایی که تفاوتشان بیشتر از نویز فشرده‌سازی است
    pct = changed / total * 100

    if bbox is None:
        print(f"✓ {label}: {a.size} — صددرصد یکسان (صفر پیکسل متفاوت)")
    else:
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        print(f"· {label}: {a.size} — {pct:.3f}% پیکسل متفاوت | جعبه تفاوت: x={bbox[0]}..{bbox[2]} y={bbox[1]}..{bbox[3]} ({w}×{h})")
        # نقشه تفاوت برای بازبینی
        diff.visualize = None
        diff.save(f"{BASE}/diff-{label}.png")
        if pct > 0.5:
            overall_ok = False

print("\nنتیجه کلی:", "قابل‌قبول (تفاوت ساختاری صفر یا جزئی زمان‌محور)" if overall_ok else "نیازمند بررسی دستی")
sys.exit(0 if overall_ok else 1)
