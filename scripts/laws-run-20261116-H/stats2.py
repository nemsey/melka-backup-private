#!/usr/bin/env python3
"""LAW-RUN-20261116-H — part 2: in-window counts with correct CAST comparison,
relay device/queue stats, and PII/backup witnesses. Read-only."""
import sqlite3, datetime, json

ROOT = "/home/z/my-project"
conn = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
conn.row_factory = sqlite3.Row

T0 = 1794760762000        # 2026-11-15T11:59:22Z — commit b612255
NOW_LABEL = "now"

def iso(m):
    return datetime.datetime.fromtimestamp(int(m) / 1000, datetime.timezone.utc).strftime("%m-%d %H:%M:%SZ")

def in_window(action, since=T0):
    q = ("SELECT createdAt FROM AuditLog WHERE action=? AND CAST(createdAt AS INTEGER) >= ? "
         "ORDER BY CAST(createdAt AS INTEGER) ASC")
    ts = [int(r["createdAt"]) for r in conn.execute(q, (action, since)).fetchall()]
    return ts

print("== A. In-window action counts (since 11:59:22Z Nov15, commit b612255) ==")
for act in ("ROLLING_BACKUP", "SACRED_BACKUP", "RELAY_HEALTH", "DIVAR_FILE_TTL",
            "owner.read", "INFRA_ALERT", "GOVERNANCE_CHECK_FAILED", "ARM_RESET",
            "resurrect_union", "HEAD_GUARD_AUTOBUILD", "BACKUP_ROTATION",
            "MEMORY_CONSOLIDATION", "SHADOW_DECISION_CREATED", "POLICY_VERDICT_ALERT",
            "DIAGNOSIS_ALERT", "RELAY_ENROLL_OWNER"):
    ts = in_window(act)
    if ts:
        print(f"  {act}: n={len(ts)} first={iso(min(ts))} last={iso(max(ts))}")
    else:
        print(f"  {act}: n=0")

print()
print("== B. Relay devices (lastSeen pulse) ==")
cols = [c[1] for c in conn.execute("PRAGMA table_info(RelayDevice)").fetchall()]
print("  cols:", cols)
now_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
for r in conn.execute("SELECT * FROM RelayDevice ORDER BY lastSeenAt DESC LIMIT 8"):
    d = dict(r)
    ls = d.get("lastSeenAt")
    try:
        age = (now_ms - int(ls)) / 1000
        age_s = f"{age:.0f}s ago"
    except Exception:
        age_s = "?"
    keep = {k: d.get(k) for k in ("deviceId", "label", "enabled", "lastSeenAt") if k in d}
    print(" ", keep, "→", age_s)

print()
print("== C. RelayQueue last 30 min ==")
cutoff = now_ms - 30 * 60 * 1000
try:
    for r in conn.execute(
            "SELECT status, COUNT(*) c FROM RelayQueue WHERE CAST(enqueuedAt AS INTEGER) >= ? GROUP BY status",
            (str(cutoff),)):
        print(f"  {r['status']}: {r['c']}")
except Exception as e:
    print("  ERR:", e)
    print("  cols:", [c[1] for c in conn.execute("PRAGMA table_info(RelayQueue)").fetchall()])

print()
print("== D. Sacred/rolling backup witnesses on disk ==")
import glob, os
for pat, name in ((f"{ROOT}/upload/.data/sacred/sacred-*.db", "sacred"),
                  (f"{ROOT}/upload/.data/rolling/live-*.db", "rolling"),
                  (f"{ROOT}/backups/sacred/backup-*.db", "backups/sacred")):
    files = sorted(glob.glob(pat))
    print(f"  {name}: n={len(files)} latest={os.path.basename(files[-1]) if files else 'none'}"
          f" mtime={datetime.datetime.utcfromtimestamp(os.path.getmtime(files[-1])).strftime('%m-%d %H:%M:%SZ') if files else ''}")

print()
print("== E. Sweep checkpoint (fresh read) ==")
for r in conn.execute("SELECT id, cycleId, lastCompletedPage, totalPages, phase, updatedAt FROM SyncCheckpoint WHERE id IN ('requests','listings')"):
    print(f"  {r['id']}: {r['lastCompletedPage']}/{r['totalPages']} phase={r['phase']} cycle={r['cycleId']} updatedAt={iso(r['updatedAt'])}")

print()
print("== F. 401/token errors in worker-visible AuditLog since 07:00Z Nov15 ==")
q = ("SELECT action, COUNT(*) c FROM AuditLog WHERE CAST(createdAt AS INTEGER) >= 1794738800000 "
     "AND (action LIKE '%TOKEN%' OR action LIKE '%401%' OR action LIKE '%AUTH%') GROUP BY action")
rows = list(conn.execute(q))
print("  ", rows if rows else "none")
