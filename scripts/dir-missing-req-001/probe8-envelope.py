#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — probe8: actual response envelopes during the sweep window
import sqlite3, json, gzip, datetime

DB = "/home/z/my-project/db/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def fmt(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).strftime("%H:%M:%SZ") if ms else "None"

print("=== A) requests/list done items 06:25-06:40 — envelope summary ===")
rows = cur.execute("""
    SELECT url, responseStatus, completedAt, responseContentType, LENGTH(responseBody) blen, responseBody
    FROM RelayQueue
    WHERE url LIKE '%apm/requests/list%' AND completedAt > (strftime('%s','2026-11-15T06:25:00Z')-0)*1000
      AND responseBody IS NOT NULL
    ORDER BY completedAt ASC LIMIT 12
""").fetchall()
for r in rows:
    body = r["responseBody"] or ""
    try:
        if r["responseContentType"] and "gzip" in r["responseContentType"]:
            body = gzip.decompress(body).decode("utf-8", "replace")
        elif body[:2] == b"\x1f\x8b" if isinstance(body, bytes) else False:
            body = gzip.decompress(body).decode("utf-8", "replace")
    except Exception as e:
        pass
    try:
        if isinstance(body, bytes):
            body = body.decode("utf-8", "replace")
        j = json.loads(body)
        d = j.get("data") if isinstance(j, dict) else None
        inner = d if isinstance(d, dict) else {}
        lst = inner.get("list") or inner.get("docs") or []
        print(f"  {fmt(r['completedAt'])} {r['url'].split('?')[-1][:22]:22} http={r['responseStatus']} keys={sorted(inner.keys())[:8]} count={inner.get('count')} totalPages={inner.get('totalPages')} pages={inner.get('pages')} page={inner.get('page')} limit={inner.get('limit')} rows={len(lst) if isinstance(lst, list) else '?'}")
    except Exception as e:
        print(f"  {fmt(r['completedAt'])} {r['url'].split('?')[-1][:22]} parse-err {e} ct={r['responseContentType']} blen={r['blen']}")

print("\n=== B) any 432-page response ever seen? (sample around sweep) ===")
r = cur.execute("""
    SELECT COUNT(*) FROM RelayQueue
    WHERE url LIKE '%apm/requests/list%' AND completedAt > (strftime('%s','2026-11-15T06:20:00Z'))*1000
""").fetchone()
print(f"  total requests/list relay items since 06:20: {r[0]}")

conn.close()
print("DONE step8")
