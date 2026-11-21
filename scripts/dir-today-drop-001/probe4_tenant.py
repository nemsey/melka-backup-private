#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · گام ۴ — بازسازی با فیلتر tenant (منبع حقیقت عین سرور)
import sqlite3, datetime
from zoneinfo import ZoneInfo
from collections import Counter

TEH = ZoneInfo("Asia/Tehran")
DB = "/home/z/my-project/db/custom.db"

def ms(dt): return int(dt.timestamp() * 1000)

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

# توزیع tenant
for t in ("PropertyRecord", "RequestRecord"):
    print(t, "tenant counts:", cur.execute(f"SELECT tenantId, COUNT(*) FROM {t} GROUP BY tenantId").fetchall())

S1 = datetime.datetime(2026, 11, 17, 12, 38, 17, tzinfo=TEH)
S2 = datetime.datetime(2026, 11, 17, 15, 39, 9,  tzinfo=TEH)
day0 = datetime.datetime(2026, 11, 17, 0, 0, 0, tzinfo=TEH)
day1 = datetime.datetime(2026, 11, 18, 0, 0, 0, tzinfo=TEH)

for table, label, tenant in (("PropertyRecord", "آگهی", "melk-tabriz"), ("RequestRecord", "درخواست", "melk-tabriz")):
    print(f"\n===== {label} ({table} · tenant={tenant}) =====")
    rows = [r[0] for r in cur.execute(
        f"SELECT createdAt FROM {table} WHERE tenantId=? AND createdAt IS NOT NULL", (tenant,))]
    rows.sort()
    total = len(rows)
    print("کل:", total)
    w1 = [t for t in rows if ms(S1) - 86_400_000 < t <= ms(S1)]
    w2 = [t for t in rows if ms(S2) - 86_400_000 < t <= ms(S2)]
    cal = [t for t in rows if ms(day0) <= t < ms(day1)]
    print(f"غلتان@۱۲:۳۸ = {len(w1)} (انتظار ~۶۸) | غلتان@۱۵:۳۹ = {len(w2)} (انتظار ~۳۴) | تقویمی ۱۱-۱۷ = {len(cal)}")
    # چه چیزی بین دو لحظه از پنجره بیرون رفت؟
    aged_out = [t for t in w1 if t <= ms(S2) - 86_400_000]
    still_in = [t for t in w1 if t > ms(S2) - 86_400_000]
    new_in = [t for t in w2 if t > ms(S1)]
    print(f"خارج‌شده از پنجره بین دو اسکرین‌شات: {len(aged_out)} | مانده: {len(still_in)} | تازه‌وارد: {len(new_in)}")
    if aged_out:
        print("بازهٔ createdAt خارج‌شده‌ها:",
              datetime.datetime.fromtimestamp(min(aged_out)/1000, TEH).strftime("%m-%d %H:%M"),
              "تا",
              datetime.datetime.fromtimestamp(max(aged_out)/1000, TEH).strftime("%m-%d %H:%M"))
con.close()
