#!/usr/bin/env python3
"""deploy-b3b4-visual-diff.py — مقایسهٔ پیکسلی قبل/بعد استقرار + کادر تفاوت"""
from PIL import Image, ImageChops
import sys

def compare(a_path, b_path, label):
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    print(f"[{label}] a={a.size} b={b.size}")
    if a.size != b.size:
        print(f"  ✗ ابعاد متفاوت — مقایسهٔ پیکسلی نامعتبر")
        return
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    if bbox is None:
        print(f"  ✓ تصاویر بیت‌به‌بیت یکسان (md5 باید یکسان باشد)")
        return
    # نسبت پیکسل‌های متفاوت
    hist = diff.convert("L").histogram()
    nonzero = sum(hist[1:])
    total = a.size[0] * a.size[1]
    ratio = nonzero / total
    print(f"  کادر تفاوت: {bbox}")
    print(f"  پیکسل‌های متفاوت: {nonzero:,} از {total:,} ({ratio*100:.3f}%)")
    # حداکثر شدت تفاوت
    print(f"  بیشینهٔ شدت تفاوت: {max(hist[-1], key=lambda i: i) if False else ''}{diff.convert('L').getextrema()[1]}")
    diff.save(f"/home/z/my-project/download/deploy-b3b4/diff-{label}.png")
    print(f"  تصویر تفاوت → download/deploy-b3b4/diff-{label}.png")

pairs = [
    ("auth", "/home/z/my-project/download/deploy-b3b4/before-auth.png",
              "/home/z/my-project/download/deploy-b3b4/after-auth-v2.png"),
]
for label, a, b in pairs:
    compare(a, b, label)
