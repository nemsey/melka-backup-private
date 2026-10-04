#!/usr/bin/env python3
"""P3-05 — مقایسه پیکسلی رگرسیون بصری PHASE 3 (baseline 3001 ⇔ فعلی 3002)"""
from PIL import Image, ImageChops
import sys

BASE = "/home/z/my-project/download/phase3-visual"
ROUND = sys.argv[1] if len(sys.argv) > 1 else ""  # "" یا "2"
PAIRS = [
    (f"p3-base{ROUND}-transactions.png", f"p3-final{ROUND}-transactions.png", "معاملات"),
    (f"p3-base{ROUND}-experts.png", f"p3-final{ROUND}-experts.png", "کارشناسان"),
    (f"p3-base{ROUND}-requests.png", f"p3-final{ROUND}-requests.png", "درخواست ملک"),
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
        diff.save(f"{BASE}/p3-diff{ROUND}-{label}.png")
        print(f"· {label}: {a.size} — {pct:.3f}% پیکسل متفاوت | جعبه: {w}×{h} در ({bbox[0]},{bbox[1]})")
        if pct > 0.5:
            overall_ok = False

print("\nنتیجه:", "قابل‌قبول (تفاوت ساختاری صفر)" if overall_ok else "نیازمند بررسی")
sys.exit(0 if overall_ok else 1)
