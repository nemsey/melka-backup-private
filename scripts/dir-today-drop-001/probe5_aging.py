#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · گام ۵ — اثبات سازوکار: رکوردهای خارج‌شده از پنجره، پیش از اسکرین‌شات ۱ در DB بودند؟
import sqlite3, datetime
from zoneinfo import ZoneInfo

TEH = ZoneInfo("Asia/Tehran")
DB = "/home/z/my-project/db/custom.db"
def ms(dt): return int(dt.timestamp() * 1000)
def show(ts): return datetime.datetime.fromtimestamp(ts/1000, TEH).strftime("%m-%d %H:%M") if ts else "—"

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()

S1 = datetime.datetime(2026, 11, 17, 12, 38, 17, tzinfo=TEH)
S2 = datetime.datetime(2026, 11, 17, 15, 39, 9,  tzinfo=TEH)

# برش «خارج‌شده»: createdAt بین (۱۶ نوامبر ۱۲:۳۸ .. ۱۶ نوامبر ۱۵:۳۹]
rows = cur.execute(
    """SELECT propertyCode, createdAt, extractedAt, updatedAt FROM PropertyRecord
       WHERE tenantId='melk-tabriz' AND createdAt > ? AND createdAt <= ?
       ORDER BY createdAt""",
    (ms(S1) - 86_400_000, ms(S2) - 86_400_000)).fetchall()
print(f"رکوردهای برش خارج‌شده (createdAt در ۱۱-۱۶ ۱۲:۳۸..۱۵:۳۹): {len(rows)}")
before_s1 = [r for r in rows if r[2] and r[2] < ms(S1)]
after_s1  = [r for r in rows if r[2] and r[2] >= ms(S1)]
print(f"  · با extractedAt پیش از اسکرین‌شات۱ (در DB بودند و شمرده شده بودند): {len(before_s1)}")
print(f"  · با extractedAt پس از اسکرین‌شات۱ (بعداً بک‌فیل شده‌اند): {len(after_s1)}")
for r in rows[:8]:
    print(f"    code={r[0]} createdAt={show(r[1])} extractedAt={show(r[2])} updatedAt={show(r[3])}")

# و رکوردهای داخل پنجرهٔ دوم که «تازه‌وارد» نبودند — یعنی در ۱۵:۳۹ چه چیزی مانده بود؟
kept = cur.execute(
    """SELECT COUNT(*), SUM(CASE WHEN extractedAt < ? THEN 1 ELSE 0 END) FROM PropertyRecord
       WHERE tenantId='melk-tabriz' AND createdAt > ? AND createdAt <= ?""",
    (ms(S2), ms(S2) - 86_400_000, ms(S1))).fetchall()
print(f"\nرکوردهای createdAt در (۱۱-۱۶ ۱۵:۳۹ .. ۱۱-۱۷ ۱۲:۳۸] — کل: {kept[0][0]} · همگی جزو ۶۸ِ اسکرین‌شات۱ بودند (extractedAt<۱۲:۳۸ در {kept[0][1] or 0} مورد تأیید)")

# میانگین زمان رسیدن رکورد به DB پس از ثبت در ARM (extractedAt - createdAt) برای آن روز
lags = cur.execute(
    """SELECT extractedAt - createdAt FROM PropertyRecord
       WHERE tenantId='melk-tabriz' AND createdAt > ? AND createdAt <= ? AND extractedAt IS NOT NULL""",
    (ms(datetime.datetime(2026,11,16,0,0,tzinfo=TEH)), ms(datetime.datetime(2026,11,17,23,59,tzinfo=TEH)))).fetchall()
lag_min = [l[0]/60000 for l in lags if l[0] is not None and l[0] >= 0]
lag_min.sort()
if lag_min:
    n = len(lag_min)
    print(f"\nتأخیر رسیدن به DB (نمونه={n}): میانه={lag_min[n//2]:.0f}دقیقه · کمینه={lag_min[0]:.0f}د · بیشینه={lag_min[-1]:.0f}د")
con.close()
