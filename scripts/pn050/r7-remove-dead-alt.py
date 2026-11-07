#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""R7 — حذف MELK_RELAY_ALT_URL مرده (پیش‌نمایش کهنهٔ c1vdh8442240-d) از ۴ مخزن env.
ALT مرده = تلهٔ سوئیچ: پس از ۳ خطای پیاپی، گوشی به مسیر جایگزین می‌افتاد و
صفحهٔ ۵۰۰/HTML آن رله را برای همیشه همان‌جا حبس می‌کرد (حادثهٔ ۱۹:۴۶ امروز).
تا وقتی میزبان دومِ زنده‌ای وجود ندارد، تک‌مسیریِ صادقانه امن‌تر است.
پشتیبان پیش از هر تغییر · رازها هرگز چاپ نمی‌شوند."""
import json, os, shutil, datetime

ROOT = "/home/z/my-project"
TS = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
BACKUP = os.path.join(ROOT, "upload", ".runtime", f"alt-removal-backup-{TS}")
os.makedirs(BACKUP, exist_ok=True)

TARGETS = [
    ("env.local", os.path.join(ROOT, ".env.local")),
    ("env.platform", os.path.join(ROOT, "env.platform.json")),
    ("escrow_db", os.path.join(ROOT, "db", ".runtime", "boot-secrets.json")),
    ("escrow_upload", os.path.join(ROOT, "upload", ".runtime", "boot-secrets.json")),
]

DEAD = "c1vdh8442240-d.space-z.ai"

for name, path in TARGETS:
    if not os.path.isfile(path):
        print(f"[{name}] غایب — skip")
        continue
    shutil.copy2(path, os.path.join(BACKUP, os.path.basename(path) + "." + name))
    if name == "env.local":
        lines = open(path, encoding="utf-8").read().splitlines()
        kept = [l for l in lines if not (l.startswith("MELK_RELAY_ALT_URL=") and DEAD in l)]
        removed = len(lines) - len(kept)
        open(path, "w", encoding="utf-8").write("\n".join(kept) + ("\n" if kept else ""))
        print(f"[{name}] حذف شد: {removed} سطر")
    else:
        d = json.load(open(path, encoding="utf-8"))
        if d.get("MELK_RELAY_ALT_URL", "").startswith("https://" + DEAD):
            del d["MELK_RELAY_ALT_URL"]
            json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            print(f"[{name}] کلید حذف شد")
        else:
            print(f"[{name}] مقدار متفاوت/غایب — دست نخورد ({str(d.get('MELK_RELAY_ALT_URL'))[:30]})")

# راستی‌آزمایی
print("\n— راستی‌آزمایی —")
ok = True
for name, path in TARGETS:
    if not os.path.isfile(path):
        continue
    content = open(path, encoding="utf-8").read()
    if DEAD in content:
        print(f"✗ [{name}] هنوز مقدار مرده حاضر است!")
        ok = False
    else:
        print(f"✓ [{name}] پاک")
print("VERDICT:", "PASS" if ok else "FAIL")
