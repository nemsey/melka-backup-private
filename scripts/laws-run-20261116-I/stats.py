#!/usr/bin/env python3
"""LAW-RUN-20261116-I — quick five-laws statistics extractor (read-only).
Usage: python3 scripts/laws-run-20261116-I/stats.py
Reads db/custom.db (read-only) + runtime files and prints the counts used for
the five-laws round I report (stabilization / survival / sacred / union / link).
Covers the window since commit 42cb177 (2026-11-16T04:30Z, LAWS-RUN-H-final).
"""
import sqlite3, datetime, json, os

ROOT = "/home/z/my-project"
conn = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
conn.row_factory = sqlite3.Row

T0 = 1763284200000  # 2026-11-16T04:30:00Z — commit 42cb177 (start of round I window)

def ms(v):
    try:
        return int(v)
    except Exception:
        return None

def iso(m):
    if m is None:
        return "?"
    return datetime.datetime.fromtimestamp(m / 1000, datetime.timezone.utc).strftime("%m-%d %H:%M:%SZ")

def events(action, since=T0):
    q = ("SELECT createdAt, action, substr(COALESCE(detail,''),1,140) d FROM AuditLog "
         "WHERE action=? AND CAST(createdAt AS INTEGER) >= ? ORDER BY CAST(createdAt AS INTEGER) ASC")
    return [dict(r) for r in conn.execute(q, (action, since)).fetchall()]

print("== 1. Round-I window: guard/build events since 42cb177 (04:30Z) ==")
for act in ("HEAD_GUARD_AUTOBUILD", "resurrect_union", "resurrect_union_surgical",
            "ARM_RESET", "GOVERNANCE_CHECK_FAILED", "INFRA_ALERT", "BACKUP_ROTATION",
            "SACRED_BACKUP", "DISK_PRUNE"):
    evs = events(act)
    if not evs:
        print(f"  [{act}] none in window")
        continue
    times = [ms(e["createdAt"]) for e in evs]
    print(f"  [{act}] n={len(evs)} first={iso(min(times))} last={iso(max(times))}")

print()
print("== 2. Sacred counts snapshot (this round) ==")
for tbl, key in (("PropertyRecord", "P"), ("RequestRecord", "R"), ("TransactionRecord", "T"),
                 ("ExpertRecord", "ER"), ("ExpertProfile", "EP"), ("User", "User"), ("GraphNode", "GN")):
    n = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
    print(f"  {key}={n}")

print()
print("== 3. Relay last 30 minutes ==")
now = datetime.datetime.now(datetime.UTC).timestamp() * 1000
for r in conn.execute("SELECT status, COUNT(*) c FROM RelayQueue WHERE enqueuedAt > ? GROUP BY status", (now - 30 * 60 * 1000,)):
    print(f"  {r['status']}: {r['c']}")
n_dev = conn.execute("SELECT COUNT(*) FROM RelayDevice WHERE lastSeenAt > ? AND revokedAt IS NULL", (now - 5 * 60 * 1000,)).fetchone()[0]
print(f"  devices active (5m): {n_dev}")

print()
print("== 4. JobLock heartbeats ==")
for r in conn.execute("SELECT jobId, instanceId, lastHeartbeat FROM JobLock"):
    print(f"  {r['jobId']} | {r['instanceId']} | {iso(ms(r['lastHeartbeat']))}")

print()
print("== 5. Union snapshots (last 3) ==")
try:
    lines = open(f"{ROOT}/upload/.runtime/union-snapshots.jsonl", encoding="utf-8").read().strip().splitlines()
    for line in lines[-3:]:
        d = json.loads(line)
        lbl = d.get("label", "?")
        c = d.get("counts", d.get("live", {}))
        print(f"  {lbl}: {json.dumps(c, ensure_ascii=False)[:160]}")
except Exception as ex:
    print("  err:", ex)

print()
print("== 6. LCPP sweeps (checkpoint progress) ==")
try:
    s = json.load(open(f"{ROOT}/upload/.runtime/lcpp-status.json", encoding="utf-8"))
    print(f"  running={s.get('running')} phase={s.get('phase')}")
    for k, v in (s.get("lists") or {}).items():
        print(f"  {k}: phase={v.get('phase')} pct={v.get('progressPct')} fetched={v.get('fetched')} written={v.get('written')}")
except Exception as ex:
    print("  err:", ex)
