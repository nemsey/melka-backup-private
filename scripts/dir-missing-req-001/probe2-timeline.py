#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — Step 2: timeline forensics around the missing codes + sync status
import sqlite3, json, datetime

DB = "/home/z/my-project/db/custom.db"
codes = [55647, 54842, 55615, 55583, 53295, 55095]

conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def fmt(ts):
    if ts is None: return "None"
    try:
        return datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%SZ")
    except Exception:
        return str(ts)

print("=== A) Timeline of neighbours (±8) around each missing code ===")
for c in codes:
    n = int(c)
    rows = cur.execute(
        """SELECT requestCode, createdAt, updatedAt, extractedAt, extractionBatchId, sourceRunId, customerName, actorName, status
           FROM RequestRecord WHERE CAST(requestCode AS INTEGER) BETWEEN ? AND ?
           ORDER BY CAST(requestCode AS INTEGER)""",
        (n - 8, n + 8),
    ).fetchall()
    print(f"\n--- window around {c} ---")
    for r in rows:
        mark = " <== MISSING" if str(r["requestCode"]) == str(c) else ""
        print(f"  {r['requestCode']}: created={fmt(r['createdAt'])} upd={fmt(r['updatedAt'])} xAt={fmt(r['extractedAt'])} batch={r['extractionBatchId']} run={str(r['sourceRunId'])[:20]} cust={str(r['customerName'])[:20]} status={r['status']}{mark}")

print("\n=== B) Global extractedAt batch histogram (recent 15) ===")
for r in cur.execute(
    "SELECT extractionBatchId, COUNT(*) cnt, MIN(extractedAt) mn, MAX(extractedAt) mx FROM RequestRecord WHERE extractionBatchId IS NOT NULL GROUP BY extractionBatchId ORDER BY mx DESC LIMIT 15"
):
    print(f"  batch={r['extractionBatchId']} cnt={r['cnt']} {fmt(r['mn'])} -> {fmt(r['mx'])}")

print("\n=== C) distinct sourceRunId count + last runs ===")
for r in cur.execute(
    "SELECT sourceRunId, COUNT(*) cnt, MAX(updatedAt) mx FROM RequestRecord GROUP BY sourceRunId ORDER BY mx DESC LIMIT 10"
):
    print(f"  run={str(r['sourceRunId'])[:40]} cnt={r['cnt']} lastUpd={fmt(r['mx'])}")

print("\n=== D) updatedAt recency histogram (how fresh is the list?) ===")
for r in cur.execute(
    "SELECT date(updatedAt, 'unixepoch') d, COUNT(*) cnt FROM RequestRecord GROUP BY d ORDER BY d DESC LIMIT 12"
):
    print(f"  {r['d']}: {r['cnt']}")

print("\n=== E) SyncCheckpoint / SyncState / four-lists status ===")
try:
    for t in ("SyncCheckpoint", "SyncState", "SyncJobState"):
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})")]
        print(f"  [{t}] cols={cols}")
        for r in cur.execute(f"SELECT * FROM {t} LIMIT 4"):
            d = dict(r)
            for k, v in list(d.items()):
                if isinstance(v, str) and len(v) > 300: d[k] = v[:300] + "...[trunc]"
            print(f"    {d}")
except Exception as e:
    print("  ERR", e)

print("\n=== F) SyncDeadLetter recent ===")
try:
    for r in cur.execute("SELECT * FROM SyncDeadLetter ORDER BY createdAt DESC LIMIT 8"):
        d = dict(r)
        for k, v in list(d.items()):
            if isinstance(v, str) and len(v) > 200: d[k] = v[:200] + "...[trunc]"
        print(f"    {d}")
except Exception as e:
    print("  ERR", e)

conn.close()
print("\nDONE step2")
