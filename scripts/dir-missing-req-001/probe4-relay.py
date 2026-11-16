#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — Step 4: relay queue forensics + token state + last successful requests/list
import sqlite3, datetime

DB = "/home/z/my-project/db/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def fmt(ms):
    if ms is None: return "None"
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).strftime("%m-%d %H:%M:%SZ")

print("=== A) RelayQueue: last 25 completed (any status) ===")
for r in cur.execute(
    "SELECT id, method, url, status, priority, enqueuedAt, completedAt, responseStatus, SUBSTR(COALESCE(error,''),1,80) err FROM RelayQueue ORDER BY enqueuedAt DESC LIMIT 25"
):
    u = r["url"] or ""
    print(f"  {fmt(r['enqueuedAt'])} {r['status']:9} p{r['priority']} {r['method']} {u.split('irus')[-1][:60]} http={r['responseStatus']} err={r['err']}")

print("\n=== B) RelayQueue: requests/list items last 24h by status ===")
for r in cur.execute(
    "SELECT status, COUNT(*) cnt, MAX(completedAt) last FROM RelayQueue WHERE url LIKE '%requests/list%' AND enqueuedAt > ? GROUP BY status",
    (int((datetime.datetime.now(datetime.UTC).timestamp() - 86400) * 1000),),
):
    print(f"  {r['status']}: {r['cnt']} (last {fmt(r['last'])})")

print("\n=== C) RelayQueue: last 8 successful requests/list with page param ===")
for r in cur.execute(
    "SELECT url, status, completedAt, responseStatus FROM RelayQueue WHERE url LIKE '%requests/list%' AND status='done' ORDER BY completedAt DESC LIMIT 8"
):
    print(f"  {fmt(r['completedAt'])} {r['url'].split('?')[-1][:50]} http={r['responseStatus']}")

print("\n=== D) Sessions with ARM token (live?) ===")
for r in cur.execute(
    "SELECT id, personnelCode, displayName, role, createdAt, expiresAt, lastSeenAt, revoked, length(armTokenEnc) tokLen FROM Session ORDER BY lastSeenAt DESC LIMIT 6"
):
    print(f"  {r['personnelCode']} ({r['displayName']}, {r['role']}) exp={fmt(r['expiresAt'])} seen={fmt(r['lastSeenAt'])} revoked={r['revoked']} tokLen={r['tokLen']}")

print("\n=== E) ArmConnection vault ===")
for r in cur.execute("SELECT id, status, connectedAt, lastRefreshedAt, lastError, length(tokenEnc) tokLen FROM ArmConnection ORDER BY lastRefreshedAt DESC LIMIT 3"):
    print(f"  status={r['status']} connected={fmt(r['connectedAt'])} lastRefresh={fmt(r['lastRefreshedAt'])} err={str(r['lastError'])[:60]} tokLen={r['tokLen']}")

print("\n=== F) RelayQueue stats last 2h by status ===")
for r in cur.execute(
    "SELECT status, COUNT(*) cnt FROM RelayQueue WHERE enqueuedAt > ? GROUP BY status",
    (int((datetime.datetime.now(datetime.UTC).timestamp() - 7200) * 1000),),
):
    print(f"  {r['status']}: {r['cnt']}")

print("\n=== G) SyncJobState list-m2 detail ===")
for r in cur.execute("SELECT jobId, status, detailJson, updatedAt FROM SyncJobState WHERE jobId LIKE 'list-m%' OR jobId LIKE 'catalog-%'"):
    print(f"  {r['jobId']}: {r['status']} upd={fmt(r['updatedAt'])} detail={str(r['detailJson'])[:220]}")

conn.close()
print("\nDONE step4")
