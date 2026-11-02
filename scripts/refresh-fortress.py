#!/usr/bin/env python3
# refresh-fortress.py — تازرسازی کپی قلعه (upload/.data/custom.db) از DB زندهٔ ادغام‌شده
# دکترین شورا-ن۰۶۸: زنده = db/custom.db (دیسک محلی) · قلعه = کپی پایدار هم‌روز.
# کشف این جلسه: قلعه کهنه بود (27,868 — بدون دادهٔ ملکتون!)؛ رستاخیز آینده می‌توانست
# آن را به‌جای زندهٔ غنی برگرداند. این اسکریپت با backup API آنلاین (WAL-امن) قلعه را
# همگام می‌کند. مهر مقدس: sacred-data-guard اجازهٔ «همگام‌سازی تازگی» را می‌دهد.
import sqlite3, os, sys
from datetime import datetime, timezone

REPO = "/home/z/my-project"
LIVE = f"{REPO}/db/custom.db"
FORT = f"{REPO}/upload/.data/custom.db"

def counts(p):
    c = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    n1 = c.execute("SELECT COUNT(*) FROM PropertyRecord").fetchone()[0]
    n2 = c.execute("SELECT COUNT(*) FROM RequestRecord").fetchone()[0]
    c.close()
    return n1, n2

live_n = counts(LIVE)
fort_n = counts(FORT) if os.path.exists(FORT) else (0, 0)
print(f"live: Property={live_n[0]} Request={live_n[1]}")
print(f"fortress (before): Property={fort_n[0]} Request={fort_n[1]}")
if fort_n[0] >= live_n[0] and fort_n != live_n:
    # قلعه پرتر است؟ طبق قانون، قلعه می‌برد — اما اینجا فقط همگام‌سازی زنده→قلعه است
    print("fortress already >= live — no refresh needed")
    sys.exit(0)

# backup آنلاین (شامل WAL · اتمی)
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
if os.path.exists(FORT):
    os.rename(FORT, f"{FORT}.stale-{stamp}")
src = sqlite3.connect(LIVE, timeout=30)
src.execute("PRAGMA busy_timeout=30000")
dst = sqlite3.connect(FORT)
src.backup(dst)
dst.close()
src.close()
fort_n2 = counts(FORT)
print(f"fortress (after): Property={fort_n2[0]} Request={fort_n2[1]}")
assert fort_n2 == live_n, "fortress refresh mismatch!"
print("✓ FORTRESS REFRESHED — همگام با زندهٔ ادغام‌شده (WAL-امن · اتمی)")
