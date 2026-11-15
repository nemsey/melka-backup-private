#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — Step 5: when did requests/list 401s begin? token hash comparison (no secrets)
import sqlite3, datetime, hashlib, json

DB = "/home/z/my-project/db/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def fmt(ms):
    if ms is None: return "None"
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).strftime("%m-%d %H:%M:%SZ")

print("=== A) requests/list: 200 vs 401 timeline (last 24h, grouped by hour+status) ===")
for r in cur.execute("""
    SELECT CAST(enqueuedAt/3600000 AS INTEGER)*3600000 h, responseStatus, COUNT(*) cnt
    FROM RelayQueue
    WHERE url LIKE '%apm/requests/list%' AND enqueuedAt > ?
      AND responseStatus IS NOT NULL
    GROUP BY h, responseStatus ORDER BY h DESC LIMIT 40
""", (int((datetime.datetime.now(datetime.UTC).timestamp() - 86400) * 1000),)):
    print(f"  {fmt(r['h'])} http={r['responseStatus']}: {r['cnt']}")

print("\n=== B) last 6 requests/list with http=200 ===")
for r in cur.execute("""
    SELECT enqueuedAt, completedAt, url, responseStatus FROM RelayQueue
    WHERE url LIKE '%apm/requests/list%' AND responseStatus=200
    ORDER BY completedAt DESC LIMIT 6
"""):
    print(f"  done {fmt(r['completedAt'])} {r['url'].split('?')[-1][:40]}")

print("\n=== C) last 6 requests/list with http=401 ===")
for r in cur.execute("""
    SELECT enqueuedAt, completedAt, url FROM RelayQueue
    WHERE url LIKE '%apm/requests/list%' AND responseStatus=401
    ORDER BY completedAt DESC LIMIT 6
"""):
    print(f"  done {fmt(r['completedAt'])} {r['url'].split('?')[-1][:40]}")

print("\n=== D) token fingerprint per recent relay item (hash of Authorization header — no secret) ===")
rows = cur.execute("""
    SELECT url, responseStatus, completedAt, headersJson FROM RelayQueue
    WHERE url LIKE '%melketabriz.ir%' AND completedAt IS NOT NULL
      AND url LIKE '%apm/%'
    ORDER BY completedAt DESC LIMIT 400
""").fetchall()
seen = {}
for r in rows:
    try:
        h = json.loads(r["headersJson"] or "{}")
        auth = h.get("authorization") or h.get("Authorization") or ""
        fp = hashlib.sha256(auth.encode()).hexdigest()[:12] if auth else "NONE"
        key = (fp, r["responseStatus"])
        if key not in seen:
            seen[key] = (r["url"].split("ir/api/")[-1].split("?")[0][:40], fmt(r["completedAt"]))
    except Exception:
        pass
for (fp, st), (path, at) in sorted(seen.items(), key=lambda kv: kv[1][1], reverse=True):
    print(f"  tokenFP={fp} http={st} e.g. {path} @ {at}")

print("\n=== E) other ARM endpoints recent status ===")
for r in cur.execute("""
    SELECT CASE
        WHEN url LIKE '%properties/list%' THEN 'properties/list(apm)'
        WHEN url LIKE '%trade-overviews%' THEN 'trade-overviews'
        WHEN url LIKE '%requests/applicant%' THEN 'requests/applicant'
        WHEN url LIKE '%requests/details%' THEN 'requests/details'
        WHEN url LIKE '%properties/owner%' THEN 'properties/owner'
        WHEN url LIKE '%properties/details%' THEN 'properties/details'
        ELSE SUBSTR(url, INSTR(url,'apm/')+4, 30) END ep,
        responseStatus, COUNT(*) cnt, MAX(completedAt) last
    FROM RelayQueue
    WHERE url LIKE '%arus-api%' AND completedAt > ?
    GROUP BY ep, responseStatus ORDER BY last DESC LIMIT 25
""", (int((datetime.datetime.now(datetime.UTC).timestamp() - 14400) * 1000),)):
    print(f"  {r['ep']}: http={r['responseStatus']} x{r['cnt']} last={fmt(r['last'])}")

conn.close()
print("\nDONE step5")
