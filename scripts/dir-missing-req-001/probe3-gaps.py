#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — Step 3: full gap analysis of requestCode range + newest-600 window
import sqlite3, datetime

DB = "/home/z/my-project/db/custom.db"
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def fmt(ms):
    if ms is None: return "None"
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.UTC).strftime("%Y-%m-%d %H:%M:%SZ")

# A) all numeric codes present
codes = sorted(int(r[0]) for r in cur.execute(
    "SELECT requestCode FROM RequestRecord WHERE requestCode GLOB '[0-9]*'"))
cset = set(codes)
print(f"numeric codes in DB: {len(codes)}  min={codes[0]} max={codes[-1]}")

# B) gap analysis over full range
missing = [n for n in range(codes[0], codes[-1] + 1) if n not in cset]
print(f"missing codes in range {codes[0]}..{codes[-1]}: {len(missing)}")

# group missing into contiguous runs
runs = []
for n in missing:
    if runs and n == runs[-1][1] + 1:
        runs[-1][1] = n
    else:
        runs.append([n, n])
print(f"contiguous missing runs: {len(runs)}")
print("first 25 runs:", runs[:25])
print("last 10 runs:", runs[-10:])

# where do the 6 reported codes sit?
reported = [55647, 54842, 55615, 55583, 53295, 55095]
for c in reported:
    run = next((r for r in runs if r[0] <= c <= r[1]), None)
    print(f"reported {c}: in run {run}")

# C) newest-600 by createdAt: what code is the 600th newest?
rows = cur.execute(
    "SELECT requestCode, createdAt FROM RequestRecord ORDER BY createdAt DESC LIMIT 700").fetchall()
print(f"\nnewest row: code={rows[0]['requestCode']} created={fmt(rows[0]['createdAt'])}")
print(f"600th newest: code={rows[599]['requestCode']} created={fmt(rows[599]['createdAt'])}")
print(f"700th newest: code={rows[699]['requestCode']} created={fmt(rows[699]['createdAt'])}")
win_codes = [int(r["requestCode"]) for r in rows[:600] if r["requestCode"]]
print(f"codes inside newest-600 window: min={min(win_codes)} max={max(win_codes)}")
for c in reported:
    print(f"reported {c} inside newest-600 createdAt window? {c in win_codes}")

# D) how many missing codes are ABOVE the 600th-newest createdAt (i.e. should have been seen by fastPass)?
cut_created = rows[599]["createdAt"]
missing_above = [m for m in missing if m > 55400]
print(f"\nmissing codes >55400: {missing_above}")

# E) count of codes created after each reported code's neighbours (density check)
print("\n=== density: count of DB rows with createdAt >= X for boundary near each missing code ===")
for c in reported:
    # take the neighbour below
    below = max(x for x in codes if x < c)
    r = cur.execute("SELECT createdAt FROM RequestRecord WHERE requestCode = ?", (str(below),)).fetchone()
    cnt = cur.execute("SELECT COUNT(*) FROM RequestRecord WHERE createdAt >= ?", (r["createdAt"],)).fetchone()[0]
    print(f"missing {c}: neighbour-below {below} created={fmt(r['createdAt'])}; rows in DB created >= that: {cnt}")

# F) sourceRunId full distribution
print("\n=== sourceRunId distribution (all) ===")
for r in cur.execute("SELECT sourceRunId, COUNT(*) cnt, MIN(createdAt) mn, MAX(updatedAt) mx FROM RequestRecord GROUP BY sourceRunId ORDER BY cnt DESC"):
    print(f"  run={str(r['sourceRunId'])[:44]:44} cnt={r['cnt']:6} minCreated={fmt(r['mn'])} lastUpd={fmt(r['mx'])}")

# G) how many rows ever written/updated in last 3 days?
print("\n=== rows updated in last 3 days (by updatedAt) ===")
for r in cur.execute("SELECT COUNT(*) FROM RequestRecord WHERE updatedAt > ?", (int((datetime.datetime.now(datetime.UTC).timestamp()-3*86400)*1000),)):
    print(f"  count={r[0]}")

conn.close()
print("\nDONE step3")
