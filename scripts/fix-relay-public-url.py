#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix-relay-public-url.py — بازگردانی کلیدهای عملیاتی رله که escrow-wrapper قدیمی زدود
================================================================================
زمینه (تشخیص ۲۰۲۶-۱۰-۲۸):
  ترموکس مالک نمی‌توانست به /api/mobile-relay/bootstrap برسد. دستور نصب صادرشده
  نشانی داخلیِ VPC زیرساخت پیش‌نمایش (http://ws-eccdd-....cn-hongkong-vpc.fcapp.run)
  را داشت — غیرقابل‌دسترس از اینترنت. ریشه: پس از بازنشانی محیط،
  scripts/pn012/escrow-manager.ts (با فهرست سفید ۴کلیدی قدیمی) کلیدهای عملیاتی
  رله (MELK_PUBLIC_BASE_URL و…) را از escrow زد و getPublicBaseUrl به هدر
  x-forwarded-hostِ داخل VPC سقوط کرد.

اقدام این اسکریپت (fill-missing — هرگز مقدار موجود را بازنویسی نمی‌کند):
  ۱) منبع حقیقت: upload/.runtime/env.platform.json (نسخهٔ بازماندهٔ پیش از ریست)
  ۲) پرکردن کلیدهای غایب در ۴ مکان:
       .env.local · env.platform.json · db/.runtime/boot-secrets.json
       · upload/.runtime/boot-secrets.json
  ۳) پشتیبان قبل از هر تغییر + گزارش تأیید (بدون چاپ راز‌ها)

اجرا: python3 scripts/fix-relay-public-url.py
"""
import json
import os
import shutil
import sys
import datetime

ROOT = "/home/z/my-project"
TS = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
BACKUP_DIR = os.path.join(ROOT, "upload", ".runtime", f"relay-fix-backup-{TS}")

SOURCE_OF_TRUTH = os.path.join(ROOT, "upload", ".runtime", "env.platform.json")

TARGETS = {
    "env.local": os.path.join(ROOT, ".env.local"),
    "env.platform": os.path.join(ROOT, "env.platform.json"),
    "escrow_db": os.path.join(ROOT, "db", ".runtime", "boot-secrets.json"),
    "escrow_upload": os.path.join(ROOT, "upload", ".runtime", "boot-secrets.json"),
}

# کلیدهای عملیاتی رله برای بازگردانی (بدون MELK_ARM_PROXY_URL — حذف‌شدهٔ PN-033)
RESTORE_KEYS = [
    "MELK_PUBLIC_BASE_URL",   # ← ریشهٔ اتصال ترموکس (PN-031-HOTFIX · شورا-ن۰۳۸)
    "MELK_RELAY_ALT_URL",     # مسیر جایگزین پایدار (PN-041-R · شورا-ن۰۶۸)
    "MELK_PROXY_SECRET",      # راز HMAC لایهٔ پروکسی (PN-031-B · restore-only)
    "MELK_ARM_RELAY_MODE",    # mobile (PN-031)
    "MELK_ARM_CIRCUIT_DISABLED",  # 1 — فیوز PN-029 خاموش دائم (PN-033)
]


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        fail(f"خواندن {path} ناموفق: {e}")


def write_atomic(path, content, mode=0o600):
    tmp = path + ".tmp-fixrelay"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    try:
        os.chmod(tmp, mode)
    except Exception:
        pass
    os.replace(tmp, path)
    try:
        os.chmod(path, mode)
    except Exception:
        pass


def main():
    os.makedirs(BACKUP_DIR, exist_ok=True)

    # ── ۱) منبع حقیقت ──
    src = load_json(SOURCE_OF_TRUTH)
    values = {}
    for k in RESTORE_KEYS:
        v = src.get(k)
        if isinstance(v, str) and v.strip():
            values[k] = v.strip()
    if "MELK_PUBLIC_BASE_URL" not in values:
        fail("MELK_PUBLIC_BASE_URL در منبع حقیقت (upload/.runtime/env.platform.json) نیست")
    if not values["MELK_PUBLIC_BASE_URL"].startswith("https://"):
        fail("MELK_PUBLIC_BASE_URL باید https:// باشد — مقدار منبع معتبر نیست")
    missing_in_src = [k for k in RESTORE_KEYS if k not in values]
    print(f"[source] {len(values)}/{len(RESTORE_KEYS)} کلید از منبع حقیقت خوانده شد"
          + (f" — غایب در منبع: {missing_in_src}" if missing_in_src else ""))

    # ── ۲) پشتیبان ──
    backed = 0
    for name, path in TARGETS.items():
        if os.path.isfile(path):
            shutil.copy2(path, os.path.join(BACKUP_DIR, os.path.basename(path) + "." + name))
            backed += 1
    print(f"[backup] {backed} فایل در {BACKUP_DIR}")

    # ── ۳) .env.local (فرمت KEY=VALUE) ──
    envl_path = TARGETS["env.local"]
    lines = []
    if os.path.isfile(envl_path):
        with open(envl_path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    existing_keys = {l.split("=", 1)[0].strip() for l in lines if "=" in l and not l.strip().startswith("#")}
    added_envl = []
    for k, v in values.items():
        if k not in existing_keys:
            lines.append(f"{k}={v}")
            added_envl.append(k)
    if added_envl:
        write_atomic(envl_path, "\n".join(lines) + "\n")
    print(f"[.env.local] اضافه‌شده (fill-missing): {added_envl or '—'}")

    # ── ۴) سه فایل JSON ──
    for name in ["env.platform", "escrow_db", "escrow_upload"]:
        path = TARGETS[name]
        data = load_json(path) if os.path.isfile(path) else {}
        added = []
        for k, v in values.items():
            if not (isinstance(data.get(k), str) and data[k].strip()):
                data[k] = v
                added.append(k)
        if name.startswith("escrow"):
            data["_note"] = "PN-011/012 escrow — بازگردانی کلیدهای عملیاتی رله (fix-relay-public-url ۲۰۲۶-۱۰-۲۸) + رازهای بوت"
            data["updatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        if added:
            write_atomic(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"[{name}] اضافه‌شده (fill-missing): {added or '—'}")

    # ── ۵) گزارش تأیید (نام‌ها فقط — راز‌ها هرگز) ──
    print("\n===== ماتریس حضور کلیدها پس از اصلاح =====")
    print(f"{'key':<28} {'env.local':>9} {'env.plat':>9} {'escrowDB':>9} {'escrowUP':>9}")
    envl_keys = set()
    if os.path.isfile(envl_path):
        with open(envl_path, "r", encoding="utf-8") as f:
            envl_keys = {l.split("=", 1)[0].strip() for l in f if "=" in l and not l.strip().startswith("#")}
    row = lambda present: "✓" if present else "✗"
    for k in RESTORE_KEYS:
        ep = load_json(TARGETS["env.platform"]).get(k) if os.path.isfile(TARGETS["env.platform"]) else None
        db = load_json(TARGETS["escrow_db"]).get(k) if os.path.isfile(TARGETS["escrow_db"]) else None
        up = load_json(TARGETS["escrow_upload"]).get(k) if os.path.isfile(TARGETS["escrow_upload"]) else None
        print(f"{k:<28} {row(k in envl_keys):>9} {row(bool(ep)):>9} {row(bool(db)):>9} {row(bool(up)):>9}")
    print(f"\nMELK_PUBLIC_BASE_URL = {values.get('MELK_PUBLIC_BASE_URL', '<غایب!>')}")
    print("OK — بازگردانی انجام شد. اکنون اسکریپت سرور باید ری‌استارت شود تا env تازه بارگذاری شود.")


if __name__ == "__main__":
    main()
