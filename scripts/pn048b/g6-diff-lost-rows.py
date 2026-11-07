#!/usr/bin/env python3
"""DIR-PN048B — G6 pre-audit repair: identify rows lost between Oct-21 snapshot and live DB.
Additive-only recovery from rolling snapshot (directive: 'شکست یکپارچگی ← rollback به snapshot + اصلاح').
This script only IDENTIFIES + reports (dry-run). Recovery is a separate explicit step.
"""
import sqlite3, json, sys

SNAP = "/home/z/my-project/upload/.data/rolling/live-2026-10-21T15-02-24-025.db"
LIVE = "/home/z/my-project/db/custom.db"

snap = sqlite3.connect(f"file:{SNAP}?mode=ro", uri=True)
live = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True)

out = {"generated_at": "2026-10-22T22:20:00Z", "snapshot": SNAP.split("/")[-1]}

for table, tenant_col in [("PropertyRecord", "tenantId"), ("RequestRecord", "tenantId")]:
    ids_snap = dict(snap.execute(f"SELECT id, 1 FROM {table} WHERE {tenant_col}='melketun'").fetchall())
    ids_live = set(r[0] for r in live.execute(f"SELECT id FROM {table} WHERE {tenant_col}='melketun'").fetchall())
    missing = sorted(set(ids_snap) - ids_live)
    # check code-level existence (re-keyed rows are NOT lost)
    code_col = "propertyCode" if table == "PropertyRecord" else "requestCode"
    details = []
    for mid in missing:
        row = snap.execute(f"SELECT {code_col} FROM {table} WHERE id=?", (mid,)).fetchone()
        code = row[0] if row else None
        exists_by_code = None
        if code:
            tenant_col2 = "tenantId"
            q = live.execute(f"SELECT COUNT(*) FROM {table} WHERE {tenant_col2}='melketun' AND {code_col}=?", (code,)).fetchone()
            exists_by_code = q[0]
        details.append({"id": mid, "code": code, "exists_in_live_by_code": exists_by_code})
    out[table] = {
        "snap_count": len(ids_snap),
        "live_count": len(ids_live),
        "missing_by_id": len(missing),
        "recovered_if_code_exists": sum(1 for d in details if d["exists_in_live_by_code"]),
        "truly_lost": [d for d in details if not d["exists_in_code_exists"] and not d["exists_in_live_by_code"]] if False else [d["id"] for d in details if d["exists_in_live_by_code"] is None or d["exists_in_live_by_code"] == 0],
        "details": details,
    }

snap.close(); live.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
