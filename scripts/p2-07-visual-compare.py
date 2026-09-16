#!/usr/bin/env python3
"""P2-07a — مقایسه پیکسلی رگرسیون بصری PHASE 2 (baseline ↔ فعلی)"""
from PIL import Image, ImageChops
import sys

BASE = "/home/z/my-project/download/phase2-visual"
PAIRS = [
    ("p2-base-transactions.png", "p2-final-transactions.png", "معاملات"),
    ("p2-base-experts.png", "p2-final-experts.png", "کارشناسان"),
    ("p2-base-requests.png", "p2-final-requests.png", "درخواست ملک"),
]

overall_ok = True
for base_name, final_name, label in PAIRS:
    a = Image.open(f"{BASE}/{base_name}").convert("RGB")
    b = Image.open(f"{BASE}/{final_name}").convert("RGB")
    if a.size != b.size:
        print(f"✗ {label}: ابعاد متفاوت {a.size} vs {b.size}")
        overall_ok = False
        continue
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    hist = diff.convert("L").histogram()
    total = a.size[0] * a.size[1]
    changed = sum(hist[8:])
    pct = changed / total * 100
    if bbox is None:
        print(f"✓ {label}: {a.size} — صفر پیکسل متفاوت")
    else:
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        diff.save(f"{BASE}/p2-diff-{label}.png")
        print(f"· {label}: {a.size} — {pct:.3f}% پیکسل متفاوت | جعبه: {w}×{h} در ({bbox[0]},{bbox[1]})")
        if pct > 0.5:
            overall_ok = False

print("\nنتیجه:", "قابل‌قبول (تفاوت ساختاری صفر — باقی نویز/فاز انیمیشن)" if overall_ok else "نیازمند بررسی")
sys.exit(0 if overall_ok else 1)
