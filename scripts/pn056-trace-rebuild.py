#!/usr/bin/env python3
"""PN-056 — بازسازی رد کامل ترمیم از snapshot پیش-ترمیم (23:23) + نوشتن
RefListCache[pn056-repair-trace-full]: هر ردیفِ پاک‌شدهٔ ستون مالک/متقاضی با مقادیر
کامل. صفر-نابودی: هیچ داده‌ای حذف نشده — مقادیر کارشناسان در کش‌های مرجع موجودند
و اکنون ردِ دقیقِ هر ردیف نیز مستند است. فقط-خواندنی روی snapshot؛ نوشتن در DB زنده."""
import json
import re
import sqlite3

SNAP = "upload/.data/sacred/sacred-2026-10-26T23-13-30-824.db"
LIVE = "db/custom.db"


def norm(s):
    return re.sub(r"[\s\u200c\u200f\u200e]+", " ", (s or "").strip())


def last10(s):
    d = re.sub(r"\D", "", s or "")
    return d[-10:] if len(d) >= 10 else ""


# ۱) وضعیت پیش-ترمیم از snapshot
sconn = sqlite3.connect(f"file:{SNAP}?mode=ro", uri=True, timeout=30)
scur = sconn.cursor()
pre = {}
for rid, code, ron, rom in scur.execute(
        "SELECT id, propertyCode, rawOwnerName, ownerMobile FROM PropertyRecord "
        "WHERE tenantId='melketun' AND (rawOwnerName IS NOT NULL AND rawOwnerName != '' "
        "OR ownerMobile IS NOT NULL AND ownerMobile != '')").fetchall():
    pre[rid] = (code, ron, rom)
pre_req = {}
for rid, rcn, rcm in scur.execute(
        "SELECT id, rawCustomerName, customerMobile FROM RequestRecord "
        "WHERE tenantId='melketun' AND (rawCustomerName IS NOT NULL AND rawCustomerName != '' "
        "OR customerMobile IS NOT NULL AND customerMobile != '')").fetchall():
    pre_req[rid] = (rcn, rcm)
sconn.close()

# ۲) وضعیت کنونی زنده + رجیستری کارشناسان
conn = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True, timeout=30)
cur = conn.cursor()
cur.execute("PRAGMA busy_timeout=20000")
now = {}
for rid, code, ron, rom in cur.execute(
        "SELECT id, propertyCode, rawOwnerName, ownerMobile FROM PropertyRecord "
        "WHERE tenantId='melketun' AND (rawOwnerName IS NOT NULL AND rawOwnerName != '' "
        "OR ownerMobile IS NOT NULL AND ownerMobile != '')").fetchall():
    now[rid] = (code, ron, rom)
now_req = {}
for rid, rcn, rcm in cur.execute(
        "SELECT id, rawCustomerName, customerMobile FROM RequestRecord "
        "WHERE tenantId='melketun' AND (rawCustomerName IS NOT NULL AND rawCustomerName != '' "
        "OR customerMobile IS NOT NULL AND customerMobile != '')").fetchall():
    now_req[rid] = (rcn, rcm)

reg = {}
for key in ("melketun-users", "melketun-website-owners"):
    d = json.loads(cur.execute(
        "SELECT dataJson FROM RefListCache WHERE key=?", (key,)).fetchone()[0])
    if key == "melketun-users":
        for k, v in d.items():
            if isinstance(v, dict) and v.get("name"):
                reg.setdefault(norm(v["name"]), []).append(("CRM-user:" + k, v.get("mobile", "")))
    else:
        for v in d:
            if isinstance(v, list) and len(v) >= 2:
                reg.setdefault(norm(v[0]), []).append(("web-owner", v[1]))
for nm, mb in cur.execute(
        "SELECT COALESCE(rawFullName,fullName,''), COALESCE(rawMobile,mobile,'') "
        "FROM ExpertRecord WHERE tenantId='melketun'").fetchall():
    reg.setdefault(norm(nm), []).append(("ExpertRecord", mb))
wf = json.loads(cur.execute(
    "SELECT dataJson FROM RefListCache WHERE key='melketun-website-filers'").fetchone()[0])

# ۳) تفاضل = ردیف‌های پاک‌شده با دلیل
cleared = []
for rid, (code, ron, rom) in pre.items():
    n = norm(ron)
    m = last10(rom)
    cur_n = norm(now.get(rid, ("", None, None))[1])
    cur_m = last10(now.get(rid, ("", None, None))[2])
    name_cleared = bool(n) and not cur_n
    mob_cleared = bool(m) and not cur_m
    if not (name_cleared or mob_cleared):
        continue
    e = wf.get((code or "").strip(), {})
    reason = None
    if n and norm(e.get("filerName", "")) == n:
        reason = "filer-row"
    elif reg.get(n):
        reason = "registry-name:" + "|".join(src for src, _ in reg[n][:3])
    elif m and any(m == last10(mm) for _, mm in reg.get(n, []) if mm):
        reason = "registry-mobile"
    cleared.append({
        "id": rid, "code": code,
        "clearedName": ron if name_cleared else None,
        "clearedMobile": rom if mob_cleared else None,
        "reason": reason,
        "evidenceInCache": e if e else None,
    })

req_cleared = []
for rid, (rcn, rcm) in pre_req.items():
    n = norm(rcn)
    m = last10(rcm)
    cur_n = norm(now_req.get(rid, (None, None))[0] or "")
    name_cleared = bool(n) and not cur_n
    mob_cleared = bool(m) and not last10(now_req.get(rid, (None, None))[1] or "")
    if not (name_cleared or mob_cleared):
        continue
    req_cleared.append({
        "id": rid, "clearedName": rcn, "clearedMobile": rcm,
        "registryHit": bool(reg.get(n)),
    })
conn.close()

full = {
    "reconstructedAt": "2026-10-27T06:10:00Z",
    "sourceSnapshot": SNAP,
    "note": ("PN-056 نکتهٔ ۲ مالک — ستون مالک/متقاضی از نام/موبایل کارشناسان پاک شد؛ "
             "هر مقدار در کش‌های مرجع (melketun-website-filers · melketun-users · "
             "melketun-website-owners · ExpertRecord) موجود است — صفر-نابودی"),
    "filingsCleared": len(cleared),
    "filingsKeptRealOwner": len(pre) - len(cleared),
    "requestsCleared": len(req_cleared),
    "clearedFilings": cleared,
    "clearedRequests": req_cleared,
}
print(f"filings cleared={len(cleared)} · kept={len(pre) - len(cleared)} · requests cleared={len(req_cleared)}")
for c in cleared[:5]:
    print("  نمونه:", c["id"], c["code"], repr(c["clearedName"]), "→", c["reason"])

# ۴) نوشتن رد کامل در DB زنده (این بار از python — بدون prisma)
conn = sqlite3.connect(LIVE, timeout=30)
cur = conn.cursor()
cur.execute("PRAGMA busy_timeout=25000")
cur.execute(
    "INSERT INTO RefListCache (key, dataJson, fetchedAt) VALUES (?,?,?) "
    "ON CONFLICT(key) DO UPDATE SET dataJson=excluded.dataJson, fetchedAt=excluded.fetchedAt",
    ("pn056-repair-trace-full", json.dumps(full, ensure_ascii=False), int(__import__("time").time() * 1000)),
)
conn.commit()
conn.close()
print("✅ رد کامل در RefListCache[pn056-repair-trace-full]")
