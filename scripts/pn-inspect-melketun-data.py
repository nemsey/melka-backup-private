#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""بازجویی DB زنده: توزیع tenantId و جداول مرتبط با ملکتون"""
import sqlite3, sys

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
print("TABLES:", " ".join(tables))
print()

# ستون tenantId در کدام جدول‌هاست؟
for t in tables:
    cols = [r[1] for r in cur.execute(f'PRAGMA table_info("{t}")')]
    if "tenantId" in cols:
        try:
            rows = list(cur.execute(f'SELECT tenantId, COUNT(*) FROM "{t}" GROUP BY tenantId'))
            print(f"{t}: {rows}")
        except Exception as e:
            print(f"{t}: ERR {e}")
print()

# جداولی که نامشان melketun دارد
mk = [t for t in tables if "melketun" in t.lower()]
for t in mk:
    print(f"MELKETUN TABLE {t}: count={cur.execute(f'SELECT COUNT(*) FROM \"{t}\"').fetchone()[0]}")
if not mk:
    print("(no melketun-named tables)")

# SyncState برای ملکتون
try:
    rows = list(cur.execute("SELECT id, kind, status, substr(lastError,1,80), updatedAt FROM SyncState LIMIT 40"))
    for r in rows:
        print("SyncState:", r)
except Exception as e:
    print("SyncState ERR", e)
con.close()
