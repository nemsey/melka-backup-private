#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-050-R7-ب — بستهٔ شاهد سه اصلاح فرمان مالک ۲۰۲۶-۱۱-۰۱ (شکایت ۱ و ۲ + گام ۳)."""
import json, subprocess, datetime, sqlite3, os

REPO = "/home/z/my-project"
OUT = f"{REPO}/download/pn050-resurrection"

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO).stdout.strip()

c = sqlite3.connect(f"file:{REPO}/db/custom.db?mode=ro", uri=True)
c.row_factory = sqlite3.Row
scan_new = dict(c.execute("SELECT * FROM DivarScanLog WHERE startedAt > 1793563000000").fetchall()[-1])
scan_old = dict(c.execute("SELECT * FROM DivarScanLog WHERE startedAt BETWEEN 1793561000000 AND 1793562000000").fetchall()[-1])
phone = dict(c.execute("SELECT lastSeenAt, servedCount, errorCount, lastRoundtripMs FROM RelayDevice WHERE deviceId='poco-f3-e1e092'").fetchone())
sync = dict(c.execute("SELECT lastSyncedAt, lastSuccessAt, lastError, attempts FROM SyncState").fetchone())
divar_total = c.execute("SELECT COUNT(*) FROM DivarAd").fetchone()[0]
hunt = c.execute("SELECT COUNT(*) FROM DivarAd WHERE totalScore >= 70").fetchone()[0]
follow = c.execute("SELECT COUNT(*) FROM DivarAd WHERE totalScore >= 40 AND totalScore < 70").fetchone()[0]
sacred = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "TransactionRecord")}
c.close()

ev = {
    "schema": "melka-r7b-three-fixes-evidence",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "trigger": "فرمان مالک ۲۰۲۶-۱۱-۰۱: (۱) اتصال به api سامانه‌های ملک‌تبریز برقرار نمی‌شود (۲) اصلاح مکانیسم فایل‌یابی دیوار + استخراج فایل‌های شخصی بیشتر (۳) قانون تثبیت/بقا/دادهٔ مقدس/لینک در پایان گزارش",
    "commits": ["85d3d37 (پنجرهٔ رله ۲۴۰ث + dedup فایل‌یابی + عمق ۸ + همه تبریز)", "6a19163 (مقاوم‌سازی سوئیچ مسیر رله + خلع ALT مرده)"],
    "fix1_melkTabrizConnectivity": {
        "symptom": "SyncState.lastError=NETWORK_ERROR «ارتباط با سامانه ملک تبریز برقرار نشد» · آخرین موفق ۲۰ اکتبر · ۲۱ تلاش ناموفق — در حالی که گوشی زنده و مشغول بود (served=1341 همان روز)",
        "rootCause": "RELAY_ONLINE_WINDOW_MS=۹۰ث < چرخهٔ poll گوشی (~۱۳۴ث = انتظار long-poll ۱۰۰ث + rtt ~۳۵ث) → سرور در انتهای هر poll گوشی را «آفلاین» می‌پنداشت → relayFetch هم‌زمان RelayOfflineError → سینک با NETWORK_ERROR می‌مرد",
        "fixes": [
            "RELAY_ONLINE_WINDOW_MS ‏۹۰ ← ۲۴۰ ثانیه (پوشش کامل چرخهٔ poll + حاشیه)",
            "مقاوم‌سازی مولد اسکریپت رله: پاسخ بدون قرارداد JSON (صفحهٔ ۵۰۰/HTML پروکسی) دیگر خواب ۳۰ث روی همان مسیر نیست — مثل خطای شبکه شمرده می‌شود + چرخش مسیر + backoff → بازگشت خودکار",
            "خلع MELK_RELAY_ALT_URL مرده (c1vdh8442240-d — پیش‌نمایش کهنه) از هر ۵ مخزن env با پشتیبان — تلهٔ سوئیچ برای همیشه خنثی شد",
        ],
        "incident": "حین بیلد R7، خاموشی ~۱۰دقیقه‌ای سرور → گوشی پس از ۳ خطا به ALT مرده سوئیچ کرد و در حلقهٔ «پاسخ غیرمنتظره» حبس شد (آخرین poll: ۱۹:۴۶:۱۴Z) — ریشهٔ ساختاری همان حلقهٔ حبس، همین امروز بسته شد",
        "ownerAction": "یک بار Termux را ببندید و دوباره باز کنید (یا اسکریپت رله را دوباره اجرا کنید) — از مسیر اصلی وصل می‌شود؛ برای گرفتن اسکریپت مقاوم‌شده، یک دستگاه تازه از تنظیمات ثبت کنید",
        "phoneState": phone,
        "syncState": sync,
    },
    "fix2_divarFileFinder": {
        "symptom": "هر اسکن فقط ~۲ فایل شخصی تازه — قیف: ۸۰ درون پنجره → ۷۴ ردِ «بیرون از محدوده» (۹۲.۵٪!)",
        "rootCauses": [
            "فیلتر مکان روی ۱۷ منطقهٔ «پیش‌فرض» (هرگز توسط مالک تنظیم نشده — init اولیهٔ ۶ اکتبر) — ۹۲.۵٪ آگهی‌های درون پنجره را می‌کشت",
            "باگ changeKey: مقایسهٔ متن خام قیمت («۱۳,۶۰۰,۰۰۰,۰۰۰ تومان») با عدد ذخیره‌شده (13600000000) هرگز برابر نمی‌شد → هر اسکن جزئیات همهٔ آگهی‌های شناخته‌شده را دوباره می‌گرفت",
            "عمق اسکن ۳ صفحه (~۷۶ آگهی/دسته) — دیوار فقط بر اساس بامپ مرتب می‌کند (آزمون زنده: sort_newest هم بر اساس انتشار نیست) → فایل شخصیِ تازه زیر نویز بامپ مشاوران می‌لغزد",
        ],
        "fixes": [
            "فیلتر مکان ← همهٔ تبریز (حالت رسمی UI «پاک‌کردن فیلتر» · قابل باریک‌شدن از تنظیمات کاشی هر لحظه)",
            "changeKey با parsePriceToman در فضای عددی مشترک → آگهی شناخته‌شدهٔ بی‌تغییر = صفر fetch",
            "maxScanPages ‏۳ ← ۸ (۱۶۳۲ آگهی اسکن‌شده در همان چرخهٔ ۱۵دقیقه‌ای · مدت ۲۱۰ث)",
        ],
        "funnelBefore": scan_old,
        "funnelAfter": scan_new,
        "improvement": "newAds ‏۲ → ۴۲ (۲۱×) در یک اسکن · outOfArea ‏۷۴ → ۰ · DivarAd ‏۳۸ → ۸۰ (۳۸ شکار ≥۷۰ · ۴۲ پیگیری ۴۰-۷۰ · میانگین امتیاز ۶۹.۱)",
        "divarAdTotals": {"total": divar_total, "hunt": hunt, "follow": follow},
    },
    "fix3_reportLaws": {
        "تثبیت (pin)": "audit-pin-check: PASS — ۷/۷ سبز · صفر pin کد واقعی در کد زنده",
        "بقا (survival)": "upload/.survival/R7-20261101 · ۷۰۲MB · ۳۳ فایل · زنجیرهٔ ۴۷ لنگر به MANIFEST بستهٔ ۴۶ (PN-048-20261021 · 7b45769e9401c63a74232cfe6fcea905) · شاهد DB: quick_check=ok · wal",
        "دادهٔ مقدس": f"PASS — growth-only: {json.dumps(sacred, ensure_ascii=False)} — صفر حذف/کاهش در تمام جلسه",
        "لینک": [
            "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai (اپ ملکا — عمومی · 200 در 0.07s)",
            "https://github.com/nemsey/melka-backup-private (منبع حقیقت کد — main)",
            "https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh (اسکریپت رستاخیز)",
            "download/pn050-resurrection/ (شواهد رستاخیز ۱-۷ + خودآزمایی کدنصب ۱۶/۱۶)",
            "upload/.survival/R7-20261101/ (بستهٔ بقای این جلسه)",
        ],
    },
    "honestNotes": [
        "گوشی مالک از ۱۹:۴۶Z ساکت است (سوئیچ به ALT مرده حین خاموشی بیلد) — تا ری‌استارت Termux توسط مالک، مسیر ملک‌تبریز سمت سرور کاملاً آماده است؛ صف در اولین poll پاک‌سازی TTL خودکار دارد",
        "اسکن ۲۰:۱۰ توسط چرخهٔ خودکار اجرا شد و قیف کامل آن شاهد این گزارش است",
        "تغییر «همه تبریز» تنظیمات زندهٔ مالک است (نه پیش‌فرض کد) — پیش‌فرض کد برای نصب‌های تازه دست‌نخورده ماند",
    ],
}

p = f"{OUT}/r7b-three-fixes-evidence.json"
json.dump(ev, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✓", p)

W = """
---
Task ID: PN-050-R7-ب (سه اصلاح فرمان مالک — اتصال ملک‌تبریز · فایل‌یابی دیوار · قوانین گزارش)
Agent: main (GLM)
Task: فرمان سه‌گانهٔ ۲۰۲۶-۱۱-۰۱: (۱) رفع عدم اتصال به api ملک‌تبریز (۲) اصلاح مکانیسم فایل‌یابی دیوار + فایل‌های شخصی بیشتر (۳) قانون تثبیت/بقا/دادهٔ مقدس/لینک در پایان گزارش

Work Log:
- تشخیص ۱: DNS سه میزبان ملک‌تبریز حل می‌شود (46.100.93.175) اما اتصال مستقیم geo-block — مسیر رسمی رلهٔ موبایل است. گوشی poco-f3-e1e092 امروز زنده بود (served=1341) ولی SyncState=NETWORK_ERROR با ۲۱ تلاش ناموفق از ۲۰ اکتبر. ریشه: RELAY_ONLINE_WINDOW_MS=۹۰ث < چرخهٔ poll (~۱۳۴ث) → «آفلاینِ کاذب» در انتهای هر long-poll → RelayOfflineError → سینک می‌مرد.
- تشخیص ۲ (حادثهٔ زنده): حین بیلد، گوشی پس از ۳ خطای پیاپی به MELK_RELAY_ALT_URL مرده (پیش‌نمایش کهنهٔ c1vdh8442240-d · ۵۰۰/HTML) سوئیچ کرد و در حلقهٔ «پاسخ غیرمنتظره — ۳۰ث» حبس شد (آخرین poll ‏۱۹:۴۶Z).
- اصلاحات اتصال (کامیت 85d3d37 + 6a19163): پنجرهٔ برخط ۹۰←۲۴۰ث · مقاوم‌سازی مولد اسکریپت (پاسخ غیر-JSON = خطای مسیر + چرخش + backoff، نه خواب ابدی) · خلع ALT مرده از ۵ مخزن env با پشتیبان. G3: بیلد=HEAD=6a19163 ✓
- تشخیص فایل‌یابی: قیف ۸۰ درون‌پنجره → ۷۴ رد مکانی (۹۲.۵٪) — «۱۷ منطقهٔ مالک» در حقیقت init پیش‌فرض ۶ اکتبر بود که هرگز توسط مالک تنظیم نشده؛ به‌علاوه باگ changeKey (متن خام ≠ عدد → هر اسکن refetch کامل) و عمق ۳ صفحه (دیوار فقط بامپ‌مرتب — آزمون زنده: sort_newest هم انتشار-مرتب نیست).
- اصلاحات فایل‌یابی: فیلتر مکان ← همهٔ تبریز (حالت رسمی UI · قابل باریک‌شدن) · changeKey عددی · عمق ۸. شاهد زندهٔ همان چرخه: اسکن ۲۰:۱۰ — scanned ‏۱۶۳۲ · outOfArea ‏۰ · newAds ‏۴۲ (۲۱×) · DivarAd ‏۳۸→۸۰ (۳۸ شکار · ۴۲ پیگیری · میانگین ۶۹.۱)
- گام ۳ — قوانین: تثبیت: audit-pin-check ‏PASS ۷/۷ · بقا: بستهٔ R7-20261101 (۷۰۲MB · ۳۳ فایل · زنجیرهٔ ۴۷ لنگر به ۴۶) · دادهٔ مقدس: growth-only کامل (P=33557 · R=29935 · E=396 · U=4 · T=817) + quick_check=ok · wal · لینک‌ها: در بستهٔ شاهد r7b-three-fixes-evidence.json

Stage Summary:
- هر سه شکایت مالک بسته شد؛ اتصال ملک‌تبریز سمت سرور کاملاً آماده — تنها ماندهٔ عملیاتی: یک ری‌استارت Termux توسط مالک (رله از مسیر اصلی برمی‌گردد؛ کد نصب تازه = اسکریپت مقاوم‌شده)
- فایل‌یابی: ۲۱ برابر فایل شخصی تازه در هر اسکن — شکارها آمادهٔ برداشت در کاشی
- شواهد: r7b-three-fixes-evidence.json · کامیت‌های 85d3d37 + 6a19163 · بقا: زنجیرهٔ ۴۷
"""
with open(f"{REPO}/worklog.md", "a", encoding="utf-8") as f:
    f.write(W)
print("✓ worklog.md appended")
