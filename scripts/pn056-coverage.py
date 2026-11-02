#!/usr/bin/env python3
"""PN-056 — پوشش ستون‌های نمای خصوصی به تفکیک tenant روی DB زنده (upload/.data).
مالک = نمای عمومی + نمای خصوصی CRM (مالک واقعی + متقاضی + موبایل) — قانون بدون محدودیت."""
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/upload/.data/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro&immutable=0", uri=True, timeout=30)
cur = conn.cursor()


def n(sql, args=()):
    return cur.execute(sql, args).fetchone()[0]


print("=== آگهی (PropertyRecord) — کل / مالک واقعی / موبایل مالک ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM PropertyRecord ORDER BY tenantId").fetchall():
    tot = n("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId=?", (tid,))
    o = n("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId=? "
          "AND rawOwnerName IS NOT NULL AND rawOwnerName != ''", (tid,))
    m = n("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId=? "
          "AND ownerMobile IS NOT NULL AND ownerMobile != ''", (tid,))
    # سلامت نگاشت: rawOwnerName نباید نام کارشناس باشد (نکتهٔ ۲ مالک)
    x = n("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId=? "
          "AND rawOwnerName IS NOT NULL AND rawOwnerName != '' "
          "AND rawOwnerName = ownerName", (tid,))
    print(f"  [{tid}] total={tot} · realOwner={o} · ownerMobile={m} · suspectMap={x}")

print("=== درخواست (RequestRecord) — کل / متقاضی / موبایل متقاضی ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM RequestRecord ORDER BY tenantId").fetchall():
    tot = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=?", (tid,))
    o = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=? "
          "AND rawCustomerName IS NOT NULL AND rawCustomerName != ''", (tid,))
    m = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=? "
          "AND customerMobile IS NOT NULL AND customerMobile != ''", (tid,))
    print(f"  [{tid}] total={tot} · applicant={o} · applicantMobile={m}")

print("=== کارشناسان / معاملات ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM ExpertRecord ORDER BY tenantId").fetchall():
    print(f"  ExpertRecord[{tid}] = {n('SELECT COUNT(*) FROM ExpertRecord WHERE tenantId=?', (tid,))}")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM TransactionRecord ORDER BY tenantId").fetchall():
    print(f"  TransactionRecord[{tid}] = {n('SELECT COUNT(*) FROM TransactionRecord WHERE tenantId=?', (tid,))}")

print("=== نمونهٔ ملکتون (نمایش خصوصی) ===")
for r in cur.execute(
        "SELECT id, rawOwnerName, ownerMobile, ownerName FROM PropertyRecord "
        "WHERE tenantId='melketun' AND rawOwnerName IS NOT NULL AND rawOwnerName != '' "
        "ORDER BY updatedAt DESC LIMIT 5").fetchall():
    print(f"  آگهی id={r[0]} · مالک‌واقعی={r[1]!r} · موبایل={r[2]!r} · کارشناس={r[3]!r}")
for r in cur.execute(
        "SELECT id, rawCustomerName, customerMobile FROM RequestRecord "
        "WHERE tenantId='melketun' AND rawCustomerName IS NOT NULL AND rawCustomerName != '' "
        "ORDER BY updatedAt DESC LIMIT 5").fetchall():
    print(f"  درخواست id={r[0]} · متقاضی={r[1]!r} · موبایل={r[2]!r}")
conn.close()
