#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pn012-b1-revive.py — MELKA PN-012-B گام ۱ (احیای فوری سرویس)
بازیابی MELK_TOKEN_KEY از escrow زندهٔ 07:05 (تنها نسخهٔ زندهٔ کلید) به:
  - .env.local (لایهٔ ۱ — env واقعی)
  - env.platform.json (لایهٔ ۲ — fallback بوت، کد مستر تستی طبق قرارداد تست شش)
  - db/.runtime/boot-secrets.json (لایهٔ ۳ جدید — نسخهٔ اول escrow پایدار)
سپس سرور شکسته را می‌کشد تا watchdog با env سالم در ۵ ثانیه بالا بیاورد.
"""
import json, os, sys

ROOT = "/home/z/my-project"

# ۱) خواندن escrow زنده
with open(f"{ROOT}/upload/.runtime/boot-secrets.json") as f:
    escrow = json.load(f)

key = escrow["MELK_TOKEN_KEY"]
assert len(key) == 64 and all(c in "0123456789abcdef" for c in key), "کلید نامعتبر"

# ۲) .env.local — افزودن کلید غایب (بدون بازنویسی کلیدهای پلتفرم)
env_local_path = f"{ROOT}/.env.local"
env_local = open(env_local_path).read()
if "MELK_TOKEN_KEY=" not in env_local:
    env_local = env_local.rstrip("\n") + f"\nMELK_TOKEN_KEY={key}\n"
    open(env_local_path, "w").write(env_local)
    print("✓ .env.local: MELK_TOKEN_KEY از escrow بازیابی شد")
else:
    print("• .env.local: کلید از قبل موجود بود")
os.chmod(env_local_path, 0o600)

# ۳) env.platform.json — بازسازی (کلید واقعی + کد مستر تستی طبق قرارداد تست شش)
platform = {
    "_comment": "بازسازی‌شده توسط PN-012-B از escrow زندهٔ upload/.runtime/boot-secrets.json (بحران ششم). MELK_TOKEN_KEY واقعی؛ MASTER_ACCESS_CODE تست عمومی — کد واقعی فقط .env.local + هش AppMeta.",
    "MELK_TOKEN_KEY": key,
    "MASTER_ACCESS_CODE": "00000000",
    "DATABASE_URL": "file:/home/z/my-project/db/custom.db",
    "MELK_SYNC_MODE": "incremental",
}
with open(f"{ROOT}/env.platform.json", "w") as f:
    json.dump(platform, f, indent=2)
print("✓ env.platform.json: بازسازی شد (لایهٔ دوم زنده شد)")

# ۴) db/.runtime/boot-secrets.json — نسخهٔ اول escrow در محل پایدار (db/ هرگز پاک نشد در ۶ بحران)
os.makedirs(f"{ROOT}/db/.runtime", exist_ok=True)
db_escrow = dict(escrow)
db_escrow["_note"] = "PN-012-B escrow v1 — db/.runtime (پایدارترین محل: db/ در هر ۶ بحران زنده ماند). Triple-redundant با upload/.runtime و env.escrow.enc"
db_escrow["updatedAt"] = escrow.get("updatedAt")
with open(f"{ROOT}/db/.runtime/boot-secrets.json", "w") as f:
    json.dump(db_escrow, f, indent=2)
print("✓ db/.runtime/boot-secrets.json: نسخهٔ اول escrow پایدار نوشته شد")

# ۵) تازه‌سازی escrow در upload (همگام با db)
print("✓ upload/.runtime/boot-secrets.json: از قبل زنده (منبع بازیابی)")
print("\n— اکنون سرور شکسته کشته می‌شود تا watchdog در ۵ ثانیه بوت سالم کند —")
