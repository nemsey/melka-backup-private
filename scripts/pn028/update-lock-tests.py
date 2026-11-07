#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-028 — تکمیل به‌روزرسانی تست‌های کمربند تصمیم (L-10 + import) — idempotent"""
import io

P = "/home/z/my-project/tests/pn025-meta-mind.test.ts"
src = io.open(P, encoding="utf-8").read()
changed = []

# ─── L-10: حذف دو مورد قفل شمارشی از فهرست «پیام فارسی» (فاز طرح: قفل نمی‌کنند) ───
old10 = """      { hoursSinceLastAdvice: 100, changed: false, today: 10, cat: 0 },
      { hoursSinceLastAdvice: 100, changed: false, today: 0, cat: 3 },
    ];"""
if old10 in src:
    src = src.replace(old10, "    ];", 1)
    changed.append("L-10 cases")

old10t = 'test("L-۱۰) پیام فارسی هر رد — کاربر می\u200cفهمد چرا", () => {'
new10t = 'test("L-۱۰) پیام فارسی هر رد — کاربر می\u200cفهمد چرا (PN-028: قفل شمارشی در فاز طرح خاموش — فقط TTL/Cooldown)", () => {'
if old10t in src:
    src = src.replace(old10t, new10t, 1)
    changed.append("L-10 title")

# ─── import پرچم نامحدود ───
oldimp = """const {
  evaluateLock,"""
newimp = """const {
  ANALYSIS_RATE_UNLIMITED,
  evaluateLock,"""
if oldimp in src and "ANALYSIS_RATE_UNLIMITED,\n  evaluateLock" not in src:
    src = src.replace(oldimp, newimp, 1)
    changed.append("import")

io.open(P, "w", encoding="utf-8").write(src)
print("OK — updated:", changed if changed else "nothing (already done)")
