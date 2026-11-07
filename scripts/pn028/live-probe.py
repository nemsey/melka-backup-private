#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-028 — probe زنده: تطبیق خرید آپارتمان فقط فروش آپارتمان + سرعت نشانگرها"""
import sqlite3, json, urllib.request, hashlib, secrets, datetime, time

con = sqlite3.connect('db/custom.db')
cur = con.cursor()
token_plain = 'probe-pn028-' + secrets.token_hex(16)
token_hash = hashlib.sha256(token_plain.encode()).hexdigest()
now = datetime.datetime.now(datetime.UTC)
fmt = now.isoformat()  # قالب ISO عین خود اپ (P2023 → صفر)
expires = (now + datetime.timedelta(hours=2)).isoformat()
cur.execute(
    "INSERT INTO Session (id, tokenHash, personnelCode, displayName, role, revoked, expiresAt, lastSeenAt, createdAt) VALUES (?,?,?,?,?,0,?,?,?)",
    (secrets.token_hex(12), token_hash, '930001', 'probe-pn028', 'OWNER', expires, fmt, fmt),
)
con.commit()
con.close()
print("[probe] session created")


def api(path, timeout=30):
    req = urllib.request.Request('http://localhost:3000' + path, headers={'Authorization': 'Bearer ' + token_plain})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


# ── ۱) نشانگرهای اتصال: سرعت پاسخ (پیش از این تا ۴۵+ ثانیه معلق) ──
t0 = time.time()
try:
    api('/api/indicators', timeout=20)
    print(f"[probe] /api/indicators → 200 (نشست معتبر) در {int((time.time()-t0)*1000)}ms")
except urllib.error.HTTPError as e:
    print(f"[probe] /api/indicators → HTTP {e.code} در {int((time.time()-t0)*1000)}ms")

# ── ۲) تطبیق: درخواست ۱۴۴۶۹ (خرید آپارتمان ۱۵۰-۱۶۰ متری) ──
t0 = time.time()
res = api('/api/matching?requestId=14469')
ms = int((time.time() - t0) * 1000)
cands = res.get('result', {}).get('candidates', [])
print(f"[probe] /api/matching?requestId=14469 → {ms}ms · {len(cands)} کاندیدا (top 20)")
con = sqlite3.connect('file:db/custom.db?mode=ro', uri=True)
cur = con.cursor()
violations = []
for c in cands:
    row = cur.execute("SELECT propertyTypeName, tradeTypeName FROM PropertyRecord WHERE propertyCode=?", (c.get('listingCode'),)).fetchone()
    if not row:
        violations.append(f"{c.get('listingCode')}: یافت نشد")
        continue
    ptype, trade = row
    print(f"  listing {c.get('listingCode')} → امتیاز {c.get('score')} · نوع: {ptype} · معامله: {trade}")
    if ptype and 'آپارتمان' not in ptype:
        violations.append(f"{c.get('listingCode')}: نوع {ptype} (غیر آپارتمان!)")
    if trade and 'فروش' not in trade:
        violations.append(f"{c.get('listingCode')}: معامله {trade} (غیر فروش!)")
print("[probe] تخلف نوع/معامله:", violations if violations else "صفر ✓ (و لاغیر برقرار)")
if cands:
    print("[probe] ابعاد کاندیدای نخست:", json.dumps(cands[0].get('dimensions', []), ensure_ascii=False)[:220])
    print("[probe] عوامل:", [f.get('label') for f in cands[0].get('analysis', [])])
print("[probe] lessons:", json.dumps(res.get('lessons', {}), ensure_ascii=False)[:160])

# ── ۳) پروندهٔ حرفه‌ای: فایل درخواست ۱۴۴۶۹ ──
t0 = time.time()
f = api('/api/matching/file?requestCode=14469')
ms = int((time.time() - t0) * 1000)
print(f"[probe] /api/matching/file?requestCode=14469 → {ms}ms · kind={f.get('kind')} · sections: identity/financial/spatial/physical/human/temporal={'all' if all(k in f for k in ['identity','financial','spatial','physical','human','temporal']) else 'MISSING'}")
print("[probe] identity:", json.dumps(f.get('identity', {}), ensure_ascii=False)[:200])

# ── ۴) فایل آگهی ──
if cands:
    code = cands[0].get('listingCode')
    t0 = time.time()
    fl = api(f'/api/matching/file?listingCode={code}')
    ms = int((time.time() - t0) * 1000)
    print(f"[probe] /api/matching/file?listingCode={code} → {ms}ms · kind={fl.get('kind')} · نوع: {fl.get('physical', {}).get('propertyType')}")
con.close()
EOF_MARKER = True
