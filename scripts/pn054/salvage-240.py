#!/usr/bin/env python3
"""
salvage-240.py — نجات ردیف‌های جامانده از اسنپ‌شات 08:28 (PN-054 · قانون داده مقدس)
--------------------------------------------------------------------------------
وضعیت: DB زنده از sacred-08:12 (سالم) بازگردانده شد. اسنپ‌شات sacred-08:28
شامل ردیف‌های تازه‌تر است اما یک ناسازگاری ایندکس دارد (wrong # of entries).
قانون: بازیابی صرفاً «افزودنی» — INSERT OR IGNORE — هرگز UPDATE/DELETE.
مقایسهٔ شمارش جدول‌به‌جدول + درج ردیف‌های تازه + گواهی نهایی.
"""
import sqlite3
import sys

LIVE = "/home/z/my-project/db/custom.db"
SRC = "/home/z/my-project/upload/.data/sacred/sacred-2026-11-08T08-28-04-776.db"

live = sqlite3.connect(LIVE, timeout=30)
live.execute("PRAGMA busy_timeout=30000")
src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)

tables = [r[0] for r in src.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]

report = []
inserted_total = 0
for t in tables:
    try:
        cols = [r[1] for r in src.execute(f'PRAGMA table_info("{t}")').fetchall()]
        if not cols:
            continue
        # کلید یکتا: هر ستونی که PK/unique دارد؛ وگرنه کل ردیف
        pk_cols = [r[1] for r in src.execute(f'PRAGMA table_info("{t}")').fetchall() if r[5] > 0]
        n_src = src.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        n_live = live.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        if n_src <= n_live:
            continue
        collist = ", ".join(f'"{c}"' for c in cols)
        ph = ", ".join("?" for _ in cols)
        rows = src.execute(f'SELECT {collist} FROM "{t}"').fetchall()
        before = live.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        live.executemany(f'INSERT OR IGNORE INTO "{t}" ({collist}) VALUES ({ph})', rows)
        after = live.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        added = after - before
        inserted_total += added
        if added:
            report.append(f"  {t}: {before} → {after} (+{added})")
    except Exception as e:
        report.append(f"  {t}: SKIP ({str(e)[:60]})")

live.commit()
# گواهی نهایی
integ = live.execute("PRAGMA integrity_check;").fetchone()[0]
live.close()
src.close()

print("═══ نتیجهٔ نجات (افزودنی · INSERT OR IGNORE):")
print("\n".join(report) if report else "  (هیچ ردیف تازه‌ای نبود)")
print(f"═══ مجموع ردیف‌های نجات‌یافته: {inserted_total}")
print(f"═══ یکپارچگی DB پس از نجات: {integ[:60]}")
