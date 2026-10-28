#!/usr/bin/env python3
"""PN-053 — شمارش رکوردهای ۸ فهرست دو اپلیکیشن + پوشش ستون‌های خصوصی CRM.
استفاده: python3 pn053-dbcount.py <db1> [db2 ...]
هر DB را فقط-خواندنی باز می‌کند: تعداد رکوردها، تفکیک tenant،
و پوشش ستون‌های نمای خصوصی (مالک واقعی/متقاضی/موبایل)."""
import sqlite3
import sys

MAIN = ("PropertyRecord", "RequestRecord", "ExpertRecord", "TransactionRecord")


def cols(cur, table):
    return [r[1] for r in cur.execute(f'PRAGMA table_info("{table}")')]


def nonempty(cur, table, col):
    return cur.execute(
        f'SELECT COUNT(*) FROM "{table}" WHERE "{col}" IS NOT NULL AND "{col}" != \'\''
    ).fetchone()[0]


for p in sys.argv[1:]:
    print(f"=== {p} ===")
    try:
        conn = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    except Exception as e:  # noqa: BLE001
        print(f"  CONNECT-ERR {e}")
        continue
    cur = conn.cursor()
    tabs = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    print("  TABLES:", ", ".join(tabs))
    for t in MAIN:
        if t not in tabs:
            print(f"  {t}: <absent>")
            continue
        n = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        c = cols(cur, t)
        extra = ""
        if t == "PropertyRecord":
            want = ("rawOwnerName", "ownerMobile")
            have = [x for x in want if x in c]
            if len(have) == len(want):
                extra = (f" | مالک‌واقعی={nonempty(cur, t, 'rawOwnerName')}"
                         f" · موبایل‌مالک={nonempty(cur, t, 'ownerMobile')}")
            else:
                extra = f" | COLUMNS-MISSING={[x for x in want if x not in c]}"
        elif t == "RequestRecord":
            want = ("rawCustomerName", "customerMobile")
            have = [x for x in want if x in c]
            if len(have) == len(want):
                extra = (f" | متقاضی={nonempty(cur, t, 'rawCustomerName')}"
                         f" · موبایل‌متقاضی={nonempty(cur, t, 'customerMobile')}")
            else:
                extra = f" | COLUMNS-MISSING={[x for x in want if x not in c]}"
        print(f"  {t}: {n}{extra}")
        if "tenantId" in c:
            for tid, cnt in cur.execute(
                    f'SELECT tenantId, COUNT(*) FROM "{t}" GROUP BY tenantId').fetchall():
                print(f"    [{tid}] {cnt}")
    conn.close()
