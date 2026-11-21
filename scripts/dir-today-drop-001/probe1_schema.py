#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · گام ۱ — کالبدشکافی شمارندهٔ «آگهی امروز / درخواست امروز»
import sqlite3, json, datetime, sys

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("TABLES:", ", ".join(tables))

for t in tables:
    if any(k in t.lower() for k in ("propert", "listing", "request")):
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})")]
        n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"\n== {t} ({n} rows) ==")
        print("cols:", ",".join(cols))
con.close()
