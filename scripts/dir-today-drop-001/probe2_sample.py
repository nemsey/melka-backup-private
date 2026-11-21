#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · گام ۲ — توزیع createdAt آگهی/درخواست در بازهٔ ۱۱-۱۵ تا ۱۱-۱۹
import sqlite3, datetime

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

# ۱) نمونه createdAt تا فرمت معلوم شود
for t in ("PropertyRecord", "RequestRecord"):
    row = cur.execute(f"SELECT createdAt, updatedAt, extractedAt FROM {t} ORDER BY rowid DESC LIMIT 3").fetchall()
    print(t, "sample:", row)

con.close()
