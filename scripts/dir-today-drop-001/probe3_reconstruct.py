#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · گام ۳ — بازسازی عددی دو اسکرین‌شات (۶۸ در برابر ۳۴)
# فرضیه: پنجرهٔ غلتان ۲۴ساعته به‌جای «امروزِ تقویمی» باعث افت نمایشی شده است.
import sqlite3, datetime, tzdata
from zoneinfo import ZoneInfo

TEH = ZoneInfo("Asia/Tehran")
DB = "/home/z/my-project/db/custom.db"

def ms(dt): return int(dt.timestamp() * 1000)
def show(ts): return datetime.datetime.fromtimestamp(ts/1000, TEH).strftime("%Y-%m-%d %H:%M:%S")

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

S1 = datetime.datetime(2026, 11, 17, 12, 38, 17, tzinfo=TEH)   # اسکرین‌شات ۱ — آگهی امروز: ۶۸
S2 = datetime.datetime(2026, 11, 17, 15, 39, 9,  tzinfo=TEH)   # اسکرین‌شات ۲ — آگهی امروز: ۳۴

for table, label in (("PropertyRecord", "آگهی"), ("RequestRecord", "درخواست")):
    print(f"\n===== {label} ({table}) =====")
    rows = [r[0] for r in cur.execute(f"SELECT createdAt FROM {table} WHERE createdAt IS NOT NULL")]
    rows.sort()
    print("کل رکوردها:", len(rows), "| جدیدترین createdAt:", show(rows[-1]))

    # ۱) پنجرهٔ غلتان در لحظهٔ اسکرین‌شات‌ها
    w1 = [t for t in rows if ms(S1) - 86_400_000 < t <= ms(S1)]
    w2 = [t for t in rows if ms(S2) - 86_400_000 < t <= ms(S2)]
    print(f"پنجرهٔ غلتان در لحظهٔ اسکرین‌شات‌۱ ({S1.strftime('%H:%M')}): {len(w1)}  ← انتظار ۶۸")
    print(f"پنجرهٔ غلتان در لحظهٔ اسکرین‌شات‌۲ ({S2.strftime('%H:%M')}): {len(w2)}  ← انتظار ۳۴")

    # ۲) «امروزِ تقویمی» ۱۷ نوامبر (نیمه‌شب تهران)
    day0 = datetime.datetime(2026, 11, 17, 0, 0, 0, tzinfo=TEH)
    day1 = datetime.datetime(2026, 11, 18, 0, 0, 0, tzinfo=TEH)
    cal = [t for t in rows if ms(day0) <= t < ms(day1)]
    print(f"امروزِ تقویمی ۱۴۰۵/۰۸/۲۶ (۲0۲6-11-17 تهران): {len(cal)}")

    # ۳) توزیع ساعتی رکوردهای ۱۵ تا ۱۸ نوامبر — آیا رکوردهایی که از پنجره بیرون افتادند واقعاً مال عصرِ ۱۶ نوامبرند؟
    lo = ms(datetime.datetime(2026, 11, 15, 0, 0, 0, tzinfo=TEH))
    hi = ms(datetime.datetime(2026, 11, 18, 0, 0, 0, tzinfo=TEH))
    from collections import Counter
    hourly = Counter()
    for t in rows:
        if lo <= t < hi:
            d = datetime.datetime.fromtimestamp(t/1000, TEH)
            hourly[d.strftime("%m-%d %H")] += 1
    print("توزیع ساعتی ۱۵–۱۷ نوامبر (تهران):")
    for k in sorted(hourly):
        print("  ", k, "→", hourly[k])

con.close()
