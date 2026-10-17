#!/usr/bin/env python3
"""PN-018/T3b — ترمیم داده: ستون floor نامعتبر (ارزش غیرطبقه‌ای از منبع ARM) → NULL
دکترین دادهٔ مقدس: لایهٔ خام (detailsJson/rawArea) دست‌نخورده."""
import sqlite3, json, datetime

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(DB)

before = con.execute("SELECT id, propertyCode, floor FROM PropertyRecord WHERE floor > 200 OR floor < 0").fetchall()
print("── پیش از ترمیم:", before)

if not before:
    print("── چیزی برای ترمیم نیست — PASS")
    exit(0)

cur = con.execute("UPDATE PropertyRecord SET floor = NULL WHERE floor > 200 OR floor < 0")
repaired = cur.rowcount
con.commit()
print("── ردیف ترمیم‌شده:", repaired)

overflow = con.execute("SELECT COUNT(*) FROM PropertyRecord WHERE floor > 2147483647 OR floor < -2147483648").fetchone()[0]
illogical = con.execute("SELECT COUNT(*) FROM PropertyRecord WHERE floor > 200 OR floor < 0").fetchone()[0]
print("── پس از ترمیم — سرریز Int32:", overflow, "| نامعتبر(>200):", illogical)
con.close()

witness = {
    "at": datetime.datetime.now().isoformat(),
    "repaired": repaired,
    "rows": [{"id": r[0], "propertyCode": r[1], "badFloor": r[2]} for r in before],
    "int32OverflowAfter": overflow,
    "illogicalAfter": illogical,
    "doctrine": "لایهٔ خام (detailsJson/rawArea/rawPrice) دست‌نخورده — فقط ستون تایپ‌دار نرمال‌شده تهی شد",
    "rootCause": "خود سامانهٔ ARM در جزئیات این آگهی‌ها برچسب floor را با ارزش غیرطبقه‌ای (قیمت/کد) پر کرده بود (نمونه: آگهی ۴۸۸۱۳ طبقه=۱۶٬۵۰۰٬۰۰۰٬۰۰۰)؛ نرمال‌ساز بی‌دامنه آن را عیناً در ستون Int می‌ریخت",
    "permanentFix": "دامنهٔ معتبر per-field در detailsToPropertyExtras (arm-catalog) + extractApuDetails (melk-public) + گارد audit-int-overflow.sh",
}
with open("/home/z/my-project/download/pn018/int-overflow-repair.json", "w", encoding="utf-8") as f:
    json.dump(witness, f, ensure_ascii=False, indent=2)
print("── شاهد: download/pn018/int-overflow-repair.json")
