#!/usr/bin/env python3
"""LAW-RUN-20261117-J — window events + 401 classification + GN stamps (read-only).
Handles mixed-precision createdAt (sec/ms/µs/ns) by range-clamping to valid epoch-ms."""
import sqlite3, datetime
from collections import defaultdict, Counter

con = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)
con.row_factory = sqlite3.Row
T0 = 1794810698000   # 2026-11-16T06:31:38Z (commit f52afdb)
T7 = 1794812400000   # 2026-11-16T07:00:00Z

def norm(v):
    try:
        n = float(v)
    except Exception:
        return None
    while n > 2e12:   # larger than any valid epoch-ms → coarser precision
        n /= 1000.0
    if n < 1e12:      # seconds
        n *= 1000.0
    return n

def dt(m):
    try:
        return datetime.datetime.fromtimestamp(m / 1000, datetime.timezone.utc)
    except Exception:
        return None

rows = con.execute('SELECT action, COALESCE(detail,"") d, createdAt FROM AuditLog').fetchall()
win = defaultdict(list)
for r in rows:
    m = norm(r["createdAt"])
    if m and m >= T0:
        win[r["action"]].append((m, r["d"]))

print("== window events since 11-16 06:31:38Z ==")
for act in ("HEAD_GUARD_AUTOBUILD", "resurrect_union", "ARM_RESET", "GOVERNANCE_CHECK_FAILED",
            "INFRA_ALERT", "SACRED_BACKUP", "BACKUP_ROTATION", "DISK_PRUNE"):
    evs = win.get(act, [])
    if evs:
        f = dt(min(e[0] for e in evs)); l = dt(max(e[0] for e in evs))
        print(f"  {act}: n={len(evs)} · first={f.strftime('%m-%d %H:%MZ') if f else '?'} · last={l.strftime('%m-%d %H:%MZ') if l else '?'}")
    else:
        print(f"  {act}: none")

all401 = []
for r in rows:
    m = norm(r["createdAt"])
    if m and m >= T7 and "401" in (r["d"] or ""):
        all401.append((m, r["action"], r["d"][:100]))
print()
print("== 401 mentions since 11-16 07:00Z ==")
print("  total:", len(all401), "· by action:", dict(Counter(a for _, a, _ in all401)))
shown = 0
for m, a, d in sorted(all401):
    t = dt(m)
    if t and shown < 8:
        print(f"   [{a}] {t.strftime('%m-%d %H:%MZ')} · {d}")
        shown += 1
if len(all401) > 8:
    print(f"   … (+{len(all401)-8} more)")

print()
print("== INFRA_ALERT last 6 in window ==")
for m, d in sorted(win.get("INFRA_ALERT", []))[-6:]:
    t = dt(m)
    if t:
        print(f"  {t.strftime('%m-%d %H:%MZ')} · {d[:110]}")

print()
print("== GOVERNANCE_CHECK_FAILED last 3 in window ==")
for m, d in sorted(win.get("GOVERNANCE_CHECK_FAILED", []))[-3:]:
    t = dt(m)
    if t:
        print(f"  {t.strftime('%m-%d %H:%MZ')} · {d[:110]}")

print()
gn_rows = con.execute("SELECT CAST(createdAt AS INTEGER) c FROM GraphNode").fetchall()
def gn_norm(v):
    v = float(v)
    while v > 2e12: v /= 1000.0
    if v < 1e12: v *= 1000.0
    return v  # epoch-ms
gn_ms = [gn_norm(r["c"]) for r in gn_rows if r["c"] is not None]
mx = max(gn_ms) if gn_ms else 0
n_after_nov8 = sum(1 for v in gn_ms if v > 1794048000000 + 86400000)
mx_dt = dt(mx)
print(f"== GN: rows={len(gn_ms):,} · max stamp={mx_dt.strftime('%Y-%m-%d %H:%MZ') if mx_dt else '?'} · nodes newer than Nov 8: {n_after_nov8} ==")
