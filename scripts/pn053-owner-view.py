#!/usr/bin/env python3
"""PN-053 — پوشش ستون‌های نمای خصوصی به تفکیک tenant (قانون مالک بدون محدودیت).
مالک = نمای عمومی + نمای خصوصی CRM (مالک واقعی + متقاضی + موبایل)."""
import sqlite3

conn = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)
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
    print(f"  tenant={tid!r}: total={tot} · realOwner={o} · ownerMobile={m}")

print("=== درخواست (RequestRecord) — کل / متقاضی / موبایل متقاضی ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM RequestRecord ORDER BY tenantId").fetchall():
    tot = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=?", (tid,))
    o = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=? "
          "AND rawCustomerName IS NOT NULL AND rawCustomerName != ''", (tid,))
    m = n("SELECT COUNT(*) FROM RequestRecord WHERE tenantId=? "
          "AND customerMobile IS NOT NULL AND customerMobile != ''", (tid,))
    print(f"  tenant={tid!r}: total={tot} · applicant={o} · applicantMobile={m}")

print("=== کارشناسان (ExpertRecord) ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM ExpertRecord ORDER BY tenantId").fetchall():
    print(f"  tenant={tid!r}: total={n('SELECT COUNT(*) FROM ExpertRecord WHERE tenantId=?', (tid,))}")

print("=== معاملات (TransactionRecord) ===")
for (tid,) in cur.execute(
        "SELECT DISTINCT tenantId FROM TransactionRecord ORDER BY tenantId").fetchall():
    print(f"  tenant={tid!r}: total={n('SELECT COUNT(*) FROM TransactionRecord WHERE tenantId=?', (tid,))}")

print("=== RefListCache (کش فهرست‌های مرجع / M9) ===")
cols = [r[1] for r in cur.execute("PRAGMA table_info(RefListCache)")]
print("  columns:", cols)
print("  rows:", n("SELECT COUNT(*) FROM RefListCache"))
try:
    gcol = cols[1] if len(cols) > 1 else cols[0]
    for k, c in cur.execute(
            f'SELECT "{gcol}", COUNT(*) FROM RefListCache GROUP BY "{gcol}"').fetchall():
        print(f"    {gcol}={k!r}: {c}")
except Exception as e:  # noqa: BLE001
    print("  group-by skip:", e)

conn.close()
