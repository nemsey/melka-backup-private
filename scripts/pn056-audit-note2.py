#!/usr/bin/env python3
"""PN-056 — حسابرسی نکتهٔ ۲ مالک: نام/موبایل کارشناس نباید در ستون مالک (آگهی ملکتون)
یا ستون متقاضی (درخواست) ثبت شده باشد. منبع حقیقت کارشناسان: melketun-users + melketun-website-owners
+ ExpertRecord ملکتون."""
import sqlite3
import json
import re

DB = "/home/z/my-project/db/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
cur = conn.cursor()
cur.execute("PRAGMA busy_timeout=20000")

# ۱) مجموعهٔ نام‌ها/موبایل‌های کارشناس (منابع چهارگانه)
experts = {}  # name_norm -> (name, mobile)
mobiles = set()


def norm(s):
    return re.sub(r"[\s\u200c\u200f\u200e]+", " ", (s or "").strip())


def add_expert(name, mobile):
    n = norm(name)
    if not n or len(n) < 3:
        return
    if n not in experts or (mobile and not experts[n][1]):
        experts[n] = (n, mobile or experts.get(n, ("", ""))[1])
    if mobile and len(re.sub(r"\D", "", mobile)) >= 10:
        mobiles.add(re.sub(r"\D", "", mobile)[-10:])


for key in ("melketun-users", "melketun-website-owners"):
    row = cur.execute(
        "SELECT dataJson FROM RefListCache WHERE key=?", (key,)).fetchone()
    if not row:
        print(f"! {key} غایب")
        continue
    data = json.loads(row[0])
    if key == "melketun-users":
        it = data.values() if isinstance(data, dict) else data
        for v in it:
            if isinstance(v, dict):
                add_expert(v.get("name", ""), v.get("mobile", ""))
    else:
        for v in data:
            if isinstance(v, list) and len(v) >= 2:
                add_expert(v[0], v[1])

for (nm, mb) in cur.execute(
        "SELECT COALESCE(rawFullName, fullName, ''), COALESCE(rawMobile, mobile, '') "
        "FROM ExpertRecord WHERE tenantId='melketun'").fetchall():
    add_expert(nm, mb)

print(f"کارشناسان شناخته‌شده: {len(experts)} نام · {len(mobiles)} موبایل")

# ۲) آلودگی ستون مالک در آگهی ملکتون
bad_owner_name, bad_owner_mobile, samples = 0, 0, []
rows = cur.execute(
    "SELECT id, rawOwnerName, ownerMobile, ownerName FROM PropertyRecord "
    "WHERE tenantId='melketun' AND rawOwnerName IS NOT NULL AND rawOwnerName != ''").fetchall()
for (rid, ron, rom, on) in rows:
    if norm(ron) in experts:
        bad_owner_name += 1
        if len(samples) < 8:
            samples.append((rid, ron, rom, on))
    m = re.sub(r"\D", "", rom or "")
    if m and m[-10:] in mobiles:
        bad_owner_mobile += 1
print(f"آگهی ملکتون با rawOwnerName={len(rows)} → نامِ کارشناس در ستون مالک: {bad_owner_name} · موبایل کارشناس در ستون مالک: {bad_owner_mobile}")
for s in samples:
    print(f"   آلوده: id={s[0]} مالک={s[1]!r} موبایل={s[2]!r} کارشناس={s[3]!r}")

# ۳) آلودگی ستون متقاضی در درخواست (هر دو tenant + تمرکز ملکتون)
for tid in ("melketun", "melk-tabriz"):
    bad_a, bad_am, tot_a = 0, 0, 0
    rows = cur.execute(
        "SELECT id, rawCustomerName, customerMobile FROM RequestRecord "
        "WHERE tenantId=? AND (rawCustomerName IS NOT NULL AND rawCustomerName != '' "
        "OR customerMobile IS NOT NULL AND customerMobile != '')", (tid,)).fetchall()
    for (rid, rcn, rcm) in rows:
        if rcn:
            tot_a += 1
            if norm(rcn) in experts:
                bad_a += 1
        m = re.sub(r"\D", "", rcm or "")
        if m and m[-10:] in mobiles:
            bad_am += 1
    print(f"درخواست [{tid}]: متقاضی‌نام‌دار={tot_a} → نام کارشناس در ستون متقاضی: {bad_a} · موبایل کارشناس: {bad_am}")

# ۴) توزیع منبع rawOwnerName ملکتون (۱۰ مقدار پرتکرار)
print("پرتکرارترین rawOwnerName ملکتون (۱۰):")
for (nm, c) in cur.execute(
        "SELECT rawOwnerName, COUNT(*) c FROM PropertyRecord WHERE tenantId='melketun' "
        "AND rawOwnerName IS NOT NULL AND rawOwnerName != '' GROUP BY rawOwnerName ORDER BY c DESC LIMIT 10").fetchall():
    flag = " ← کارشناس!" if norm(nm) in experts else ""
    print(f"   {c:4d} × {nm!r}{flag}")
conn.close()
