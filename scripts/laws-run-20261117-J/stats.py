#!/usr/bin/env python3
"""LAW-RUN-20261117-J — نوبت دهم پنج قانون — آمار دقیق (فقط-خواندنی).
Window: since commit f52afdb (2026-11-16T06:31:38Z, LAW-RUN-20261116-I-final).
Reads db/custom.db read-only + runtime files; prints all statistics for the
five-laws round J report (stabilization / survival / sacred / union / link).
"""
import sqlite3, datetime, json, time, glob, os

ROOT = "/home/z/my-project"
conn = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
conn.row_factory = sqlite3.Row

T0 = 1794810698000  # 2026-11-16T06:31:38Z — commit f52afdb (start of round J window)

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
    q = ("SELECT createdAt, action, substr(COALESCE(detail,''),1,150) d FROM AuditLog "
         "WHERE action=? AND CAST(createdAt AS INTEGER) >= ? ORDER BY CAST(createdAt AS INTEGER) ASC")
    return [dict(r) for r in conn.execute(q, (action, since)).fetchall()]

print("== 1. Round-J window events (since f52afdb 11-16 06:31:38Z) ==")
for act in ("HEAD_GUARD_AUTOBUILD", "resurrect_union", "resurrect_union_surgical",
            "ARM_RESET", "GOVERNANCE_CHECK_FAILED", "INFRA_ALERT", "BACKUP_ROTATION",
            "SACRED_BACKUP", "DISK_PRUNE"):
    evs = events(act)
    if not evs:
        print(f"  [{act}] none in window")
        continue
    times = [ms(e["createdAt"]) for e in evs if ms(e["createdAt"])]
    print(f"  [{act}] n={len(evs)} first={iso(min(times))} last={iso(max(times))}")

print()
print("== 2. Sacred counts (live) vs baseline LAW-RUN-20261116-I ==")
BASE = {"P": 28906, "R": 26280, "T": 844, "ER": 316, "EP": 160, "User": 4, "GN": 145179}
for tbl, key in (("PropertyRecord", "P"), ("RequestRecord", "R"), ("TransactionRecord", "T"),
                 ("ExpertRecord", "ER"), ("ExpertProfile", "EP"), ("User", "User"), ("GraphNode", "GN")):
    n = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
    d = n - BASE[key]
    print(f"  {key}={n:,} ({'+' if d>=0 else ''}{d} vs baseline)")

print()
print("== 3. PII coverage ==")
def filled(tbl, col):
    return conn.execute(f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NOT NULL AND {col} != ''").fetchone()[0]
pii = {
    "ownerName": filled("PropertyRecord", "ownerName"),
    "rawOwnerName": filled("PropertyRecord", "rawOwnerName"),
    "ownerMobile": filled("PropertyRecord", "ownerMobile"),
    "address": filled("PropertyRecord", "address"),
    "customerName": filled("RequestRecord", "customerName"),
    "ownerNote": filled("PropertyRecord", "ownerNote"),
    "expertMobile": filled("ExpertProfile", "mobile"),
}
print(" ", json.dumps(pii, ensure_ascii=False))

print()
print("== 4. Today windows (screenshot cross-check) ==")
def parse(v):
    if v is None: return None
    s = str(v)
    if s.isdigit() and len(s) >= 12: return int(s)
    try:
        return int(datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000)
    except Exception:
        return None
now = time.time() * 1000
for tbl, key in (("PropertyRecord", "M1"), ("RequestRecord", "M2")):
    rows = conn.execute(f"SELECT createdAt FROM {tbl}").fetchall()
    c24 = sum(1 for (v,) in rows if (m := parse(v)) and m >= now - 86400_000)
    print(f"  {key} today(24h): {c24}")
m1_realtors = conn.execute("SELECT COUNT(DISTINCT ownerName) FROM PropertyRecord WHERE ownerName IS NOT NULL AND ownerName != ''").fetchone()[0]
m2_actors = conn.execute("SELECT COUNT(DISTINCT actorName) FROM RequestRecord WHERE actorName IS NOT NULL AND actorName != ''").fetchone()[0]
print(f"  M1 activeRealtors(distinct ownerName): {m1_realtors}")
print(f"  M2 registeringExperts(distinct actorName): {m2_actors}")

print()
print("== 5. Sweeps (SyncCheckpoint) ==")
for r in conn.execute("SELECT id, cycleId, lastCompletedPage, totalPages, totalAtSource, phase, updatedAt FROM SyncCheckpoint"):
    print(f"  {r['id']}: {r['lastCompletedPage']}/{r['totalPages']} pages · phase={r['phase']} · src={r['totalAtSource']} · hb={iso(ms(r['updatedAt']))}")

print()
print("== 6. Relay (30 min) ==")
now_ms = now
for r in conn.execute("SELECT status, COUNT(*) c FROM RelayQueue WHERE enqueuedAt > ? GROUP BY status", (now_ms - 30*60*1000,)):
    print(f"  {r['status']}: {r['c']}")
n_dev = conn.execute("SELECT COUNT(*) FROM RelayDevice WHERE lastSeenAt > ? AND revokedAt IS NULL", (now_ms - 5*60*1000,)).fetchone()[0]
n_dev30 = conn.execute("SELECT COUNT(*) FROM RelayDevice WHERE lastSeenAt > ? AND revokedAt IS NULL", (now_ms - 30*60*1000,)).fetchone()[0]
print(f"  devices active 5m: {n_dev} · 30m: {n_dev30}")
err30 = conn.execute("SELECT COUNT(*) FROM RelayQueue WHERE status='failed' AND enqueuedAt > ?", (now_ms - 30*60*1000,)).fetchone()[0]
print(f"  failed in 30m: {err30}")

print()
print("== 7. JobLock heartbeats ==")
for r in conn.execute("SELECT jobId, instanceId, lastHeartbeat FROM JobLock"):
    print(f"  {r['jobId']} | {r['instanceId']} | {iso(ms(r['lastHeartbeat']))}")

print()
print("== 8. Token/401 health since 07:00Z Nov 16 (DIR-MISSING-REQ-001 survival) ==")
t7 = 1763266800000  # 2026-11-16T07:00:00Z
n401 = conn.execute("SELECT COUNT(*) FROM AuditLog WHERE action LIKE '%TOKEN%' AND detail LIKE '%401%' AND CAST(createdAt AS INTEGER) >= ?", (t7,)).fetchone()[0]
n401b = conn.execute("SELECT COUNT(*) FROM AuditLog WHERE detail LIKE '%401%' AND CAST(createdAt AS INTEGER) >= ?", (t7,)).fetchone()[0]
print(f"  AuditLog rows mentioning 401 since 11-16 07:00Z: {n401b}")

print()
print("== 9. GN honest check (build stamps) ==")
stamps = conn.execute("SELECT substr(CAST(createdAt AS TEXT),1,10) d, COUNT(*) c FROM GraphNode GROUP BY d ORDER BY c DESC LIMIT 5").fetchall()
for s in stamps:
    print(f"  GraphNode createdAt-day {s['d']}: {s['c']:,}")

print()
print("== 10. Backups on disk ==")
sacred = sorted(glob.glob(f"{ROOT}/upload/.data/sacred/sacred-*.db"))
rolling = sorted(glob.glob(f"{ROOT}/upload/.data/rolling/live-*.db"))
print(f"  sacred gens: {len(sacred)} · latest: {os.path.basename(sacred[-1]) if sacred else '-'} ({os.path.getsize(sacred[-1])//2**20 if sacred else 0}MB)")
print(f"  rolling gens: {len(rolling)} · latest: {os.path.basename(rolling[-1]) if rolling else '-'} ({os.path.getsize(rolling[-1])//2**20 if rolling else 0}MB)")
print(f"  custom.db size: {os.path.getsize(f'{ROOT}/db/custom.db')//2**20}MB")

print()
print("== 11. Union snapshots (last 2) ==")
try:
    lines = open(f"{ROOT}/upload/.runtime/union-snapshots.jsonl", encoding="utf-8").read().strip().splitlines()
    for line in lines[-2:]:
        d = json.loads(line)
        print(f"  {d.get('label','?')} @ {d.get('at','?')}: {json.dumps(d.get('counts', d.get('live', {})), ensure_ascii=False)[:180]}")
except Exception as ex:
    print("  err:", ex)
