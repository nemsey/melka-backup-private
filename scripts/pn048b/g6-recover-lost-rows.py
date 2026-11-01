#!/usr/bin/env python3
"""DIR-PN048B — G6 pre-audit repair: additive-only recovery of 13 rows lost in the
Oct-21→Oct-22 sandbox-reset window. Rows are copied VERBATIM from the Oct-21 rolling
snapshot (same DB lineage). G2 discipline: INSERT only — no UPDATE, no overwrite.
"""
import sqlite3, json, datetime

SNAP = "/home/z/my-project/upload/.data/rolling/live-2026-10-21T15-02-24-025.db"
LIVE = "/home/z/my-project/db/custom.db"

LOST = {
    "PropertyRecord": ["71x297591", "71x297623", "71x407458", "71x407540",
                       "71x407581", "71x407618", "71x407703", "71x407870"],
    "RequestRecord": ["13x35102", "13x35108", "13x35122", "13x407763", "13x407815"],
}

snap = sqlite3.connect(f"file:{SNAP}?mode=ro", uri=True)
live = sqlite3.connect(LIVE, timeout=30)
live.execute("PRAGMA busy_timeout=30000")

report = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "recovered": {}, "errors": []}

try:
    live.execute("BEGIN IMMEDIATE")
    for table, ids in LOST.items():
        cols = [r[1] for r in snap.execute(f"PRAGMA table_info({table})").fetchall()]
        # live must have identical schema (same lineage)
        live_cols = [r[1] for r in live.execute(f"PRAGMA table_info({table})").fetchall()]
        assert set(cols) == set(live_cols), f"schema drift in {table}"
        col_list = ",".join(f'"{c}"' for c in cols)
        qm = ",".join("?" for _ in cols)
        n = 0
        for rid in ids:
            # safety: id must NOT exist in live
            exists = live.execute(f"SELECT COUNT(*) FROM {table} WHERE id=?", (rid,)).fetchone()[0]
            if exists:
                report["errors"].append(f"{table}:{rid} already exists — skipped")
                continue
            row = snap.execute(f"SELECT {col_list} FROM {table} WHERE id=?", (rid,)).fetchone()
            if row is None:
                report["errors"].append(f"{table}:{rid} not in snapshot — skipped")
                continue
            live.execute(f"INSERT INTO {table} ({col_list}) VALUES ({qm})", row)
            n += 1
        report["recovered"][table] = n
    live.commit()
except Exception as e:
    live.rollback()
    report["errors"].append(f"FATAL: {e}")
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(1)

# verify
for table in LOST:
    tot = live.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    melk = live.execute(f"SELECT COUNT(*) FROM {table} WHERE tenantId='melketun'").fetchone()[0]
    report["recovered"][f"{table}_totals"] = {"total": tot, "melketun": melk}

snap.close(); live.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
