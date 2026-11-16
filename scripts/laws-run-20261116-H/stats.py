#!/usr/bin/env python3
"""LAW-RUN-20261116-H — quick five-laws statistics extractor (read-only).
Usage: python3 scripts/laws-run-20261116-H/stats.py
Reads db/custom.db (read-only) and prints timeline + counts used for the
five-laws round report (stabilization / survival / sacred / union / link).
"""
import sqlite3, datetime, json, sys

ROOT = "/home/z/my-project"
conn = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
conn.row_factory = sqlite3.Row

T0 = 1794760762000  # 2026-11-15T11:59:22Z — commit b612255 (start of this round's window)

def ms(v):
    try:
        return int(v)
    except Exception:
        return None

def iso(m):
    if m is None:
        return "?"
    return datetime.datetime.fromtimestamp(m / 1000, datetime.timezone.utc).strftime("%m-%d %H:%M:%SZ")

def events(action, since=T0, detail=130):
    q = ("SELECT createdAt, action, actor, substr(COALESCE(detail,''),1,%d) d FROM AuditLog "
         "WHERE action=? AND CAST(createdAt AS INTEGER) >= ? ORDER BY CAST(createdAt AS INTEGER) ASC")
    return [dict(r) for r in conn.execute(q % detail, (action, since)).fetchall()]

print("== 1. TIMELINE since commit b612255 (11:59:22Z Nov15) ==")
for act in ("HEAD_GUARD_AUTOBUILD", "resurrect_union", "resurrect_union_surgical",
            "ARM_RESET", "GOVERNANCE_CHECK_FAILED", "INFRA_ALERT", "BACKUP_ROTATION"):
    evs = events(act)
    if not evs:
        print(f"  [{act}] none in window")
        continue
    times = [ms(e["createdAt"]) for e in evs]
    print(f"  [{act}] n={len(evs)} first={iso(min(times))} last={iso(max(times))}")
    for e in evs[-2:]:
        print(f"      {iso(ms(e['createdAt']))} | {e['d']}")

print()
print("== 2. RELAY health (last RELAY_HEALTH entries) ==")
rh = events("RELAY_HEALTH")
for e in rh[-3:]:
    print(f"  {iso(ms(e['createdAt']))} | {e['d']}")

print()
print("== 3. Actions mentioning cycle/catalog since window ==")
acts = [dict(r) for r in conn.execute(
    "SELECT action, COUNT(*) c FROM AuditLog WHERE CAST(createdAt AS INTEGER) >= ? "
    "AND (LOWER(COALESCE(detail,'')) LIKE '%cycle%' OR LOWER(COALESCE(action,'')) LIKE '%catalog%') "
    "GROUP BY action ORDER BY c DESC LIMIT 12", (T0,)).fetchall()]
for a in acts:
    print(f"  {a['action']}: {a['c']}")
    last = [dict(r) for r in conn.execute(
        "SELECT createdAt, substr(COALESCE(detail,''),1,160) d FROM AuditLog WHERE action=? "
        "AND CAST(createdAt AS INTEGER) >= ? ORDER BY CAST(createdAt AS INTEGER) DESC LIMIT 2",
        (a["action"], T0)).fetchall()]
    for e in last:
        print(f"      {iso(ms(e['createdAt']))} | {e['d']}")

print()
print("== 4. RELAY queue + devices (tables) ==")
tabs = [r[0] for r in conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%elay%' OR name LIKE '%evice%')").fetchall()]
print("  tables:", tabs)
for t in tabs:
    try:
        n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        cols = [c[1] for c in conn.execute(f"PRAGMA table_info({t})").fetchall()]
        print(f"  {t}: rows={n} cols={cols[:10]}")
    except Exception as ex:
        print(f"  {t}: ERR {ex}")
