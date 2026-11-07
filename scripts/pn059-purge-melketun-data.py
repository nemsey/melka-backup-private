#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-059 — حذف کامل دادهٔ ملکتون از پایگاهٔ زنده (دستور صریح مالک ۱۴۰۵/۰۸/۱۱)
================================================================================
دستور: «کاشی ملکتون به طور کامل حذف شود (به همراه کلیه داده های ملکتون)»
روش ( سازگار با قانون بقا ):
  گام ۱ — آرشیو کامل تمام ردیف‌های tenantId='melketun' + فرزندان (JSONL + SHA256)
  گام ۲ — حذف از DB زنده (DELETE در تراکنش + چک‌پوینت WAL)
  گام ۳ — رد شاهد AuditLog (بدون PII خام — قانون ۱۰)
  گام ۴ — وارسی صفر-باقی‌مانده + سلامت شمارش تبریز
خروجی: backups/melketun-purge-<timestamp>/  (آرشیو + مانیفست + SHA256SUMS)
"""
import json
import hashlib
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

DB = "/home/z/my-project/db/custom.db"
TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
OUT = f"/home/z/my-project/backups/melketun-purge-{TS}"
os.makedirs(OUT, exist_ok=True)

# جداول دارای tenantId='melketun' (کشف‌شده در بازرسی پیش از حذف)
TENANT_TABLES = [
    "PropertyRecord",
    "RequestRecord",
    "ExpertRecord",
    "ExpertProfile",
    "AuditLog",
]
# جدول فرزند دارای FK آبشری (Cascade) به RequestRecord
CHILD_TABLES = {
    "RequestEventRecord": ("requestId", "RequestRecord"),
}

con = sqlite3.connect(DB, timeout=60)
con.execute("PRAGMA busy_timeout=60000")
con.row_factory = sqlite3.Row
cur = con.cursor()

manifest = {
    "schema": "melka-pn059-melketun-purge",
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "ownerOrder": "دستور مالک ۱۴۰۵/۰۸/۱۱ (۲۰۲۶-۱۱-۰۲): کاشی ملکتون به‌طور کامل حذف شود به همراه کلیهٔ داده‌های ملکتون",
    "database": DB,
    "tables": {},
    "sha256": {},
}


def rows_jsonl(table, where, params=()):
    path = os.path.join(OUT, f"{table}.jsonl")
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for r in cur.execute(f'SELECT * FROM "{table}" WHERE {where}', params):
            f.write(json.dumps(dict(r), ensure_ascii=False, default=str) + "\n")
            n += 1
    return path, n


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


print("═" * 60)
print("گام ۰ — شمارش پیش از حذف")
pre_counts = {}
for t in TENANT_TABLES:
    c = cur.execute(f"SELECT COUNT(*) FROM \"{t}\" WHERE tenantId='melketun'").fetchone()[0]
    pre_counts[t] = c
    print(f"  {t}: {c}")
# فرزندان
melketun_req_ids = [r[0] for r in cur.execute("SELECT id FROM RequestRecord WHERE tenantId='melketun'")]
child_pre = 0
if melketun_req_ids:
    q = ",".join("?" * len(melketun_req_ids))
    child_pre = cur.execute(f"SELECT COUNT(*) FROM RequestEventRecord WHERE requestId IN ({q})", melketun_req_ids).fetchone()[0]
print(f"  RequestEventRecord (فرزند درخواست‌های ملکتون): {child_pre}")

print("═" * 60)
print("گام ۱ — آرشیو")
archive = {}
for t in TENANT_TABLES:
    path, n = rows_jsonl(t, "tenantId='melketun'")
    archive[t] = (path, n)
    manifest["tables"][t] = {"archived": n, "file": os.path.basename(path)}
    manifest["sha256"][os.path.basename(path)] = sha256_file(path)
    print(f"  {t}: {n} ردیف آرشیو شد")
if melketun_req_ids:
    q = ",".join("?" * len(melketun_req_ids))
    path, n = rows_jsonl("RequestEventRecord", f"requestId IN ({q})", melketun_req_ids)
    manifest["tables"]["RequestEventRecord"] = {"archived": n, "file": os.path.basename(path)}
    manifest["sha256"][os.path.basename(path)] = sha256_file(path)
    print(f"  RequestEventRecord: {n} ردیف آرشیو شد")

print("═" * 60)
print("گام ۲ — حذف (تراکنش اتمی)")
con.execute("BEGIN IMMEDIATE")
try:
    if melketun_req_ids:
        q = ",".join("?" * len(melketun_req_ids))
        cur.execute(f"DELETE FROM RequestEventRecord WHERE requestId IN ({q})", melketun_req_ids)
        print(f"  RequestEventRecord: حذف {cur.rowcount}")
    for t in TENANT_TABLES:
        cur.execute(f"DELETE FROM \"{t}\" WHERE tenantId='melketun'")
        print(f"  {t}: حذف {cur.rowcount}")
    con.commit()
except Exception as e:
    con.rollback()
    print(f"!! خطا — rollback: {e}")
    sys.exit(1)

print("═" * 60)
print("گام ۳ — رد شاهد AuditLog (بدون PII — قانون ۱۰)")
total_deleted = sum(pre_counts.values()) + child_pre
detail = (
    f"tables={','.join(TENANT_TABLES)}+RequestEventRecord "
    f"rows={total_deleted} archive=backups/melketun-purge-{TS}"
)
cur.execute(
    """INSERT INTO AuditLog (id, action, actor, operation, entityType, recordCount,
       accessScope, tenantId, detail, createdAt)
       VALUES (lower(hex(randomblob(16))), 'MELKETUN_PURGE', 'owner-directive-PN059',
       'DELETE', 'tenant', ?, 'OWNER', 'melk-tabriz', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
    (total_deleted, detail),
)
con.commit()
print(f"  شاهد ثبت شد: {detail[:100]}…")

print("═" * 60)
print("گام ۴ — وارسی")
fail = False
for t in TENANT_TABLES:
    c = cur.execute(f"SELECT COUNT(*) FROM \"{t}\" WHERE tenantId='melketun'").fetchone()[0]
    if c != 0:
        print(f"  ✗ {t}: {c} ردیف باقی مانده!")
        fail = True
tabriz_post = {
    t: cur.execute(f"SELECT COUNT(*) FROM \"{t}\" WHERE tenantId='melk-tabriz'").fetchone()[0]
    for t in ["PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile"]
}
print(f"  تبریز پس از حذف: {tabriz_post}")
expected = {
    "PropertyRecord": 28376,
    "RequestRecord": 25929,
    "ExpertRecord": 304,
    "ExpertProfile": 143,
}
for t, exp in expected.items():
    if tabriz_post[t] != exp:
        print(f"  ✗ {t}: انتظار {exp}، واقعیت {tabriz_post[t]}")
        fail = True
    else:
        print(f"  ✓ {t}: {tabriz_post[t]} (دست‌نخورده)")

if fail:
    print("!! وارسی شکست خورد")
    sys.exit(2)

# چک‌پوینت WAL
cur.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.close()

# مانیفست + SHA256SUMS
manifest["verification"] = {"melketunRemaining": 0, "tabrizPost": tabriz_post, "expected": expected}
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
with open(os.path.join(OUT, "SHA256SUMS"), "w", encoding="utf-8") as f:
    for name, digest in manifest["sha256"].items():
        f.write(f"{digest}  {name}\n")
    f.write(f"{sha256_file(os.path.join(OUT, 'manifest.json'))}  manifest.json\n")

print("═" * 60)
print(f"✓ حذف کامل دادهٔ ملکتون انجام شد — آرشیو: {OUT}")
print(f"  کل ردیف‌های حذف‌شده: {total_deleted}")
