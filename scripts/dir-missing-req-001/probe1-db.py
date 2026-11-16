#!/usr/bin/env python3
# DIR-MISSING-REQ-001 — Step 1: do the 6 reported codes exist in RequestRecord?
import sqlite3, sys

DB = "/home/z/my-project/db/custom.db"
codes = ["55647", "54842", "55615", "55583", "53295", "55095"]

conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("=== A) Exact requestCode match ===")
for c in codes:
    row = cur.execute(
        "SELECT id, requestCode, source, status, customerName, actorName, createdAt, updatedAt FROM RequestRecord WHERE requestCode = ?",
        (c,),
    ).fetchone()
    print(f"requestCode={c}: {'FOUND ' + str(dict(row)) if row else 'NOT FOUND'}")

print("\n=== B) LIKE match (code as substring anywhere) ===")
for c in codes:
    rows = cur.execute(
        "SELECT id, requestCode, source, status, customerName FROM RequestRecord WHERE requestCode LIKE ? OR armRequestId LIKE ? LIMIT 5",
        (f"%{c}%", f"%{c}%"),
    ).fetchall()
    print(f"code~{c}: {len(rows)} hits -> {[dict(r) for r in rows]}")

print("\n=== C) Overall RequestRecord stats ===")
for q, label in [
    ("SELECT COUNT(*) FROM RequestRecord", "total"),
    ("SELECT COUNT(*) FROM RequestRecord WHERE source='arm'", "source=arm"),
    ("SELECT COUNT(*) FROM RequestRecord WHERE source='manual'", "source=manual"),
    ("SELECT COUNT(*) FROM RequestRecord WHERE source NOT IN ('arm','manual')", "source=other"),
    ("SELECT COUNT(*) FROM RequestRecord WHERE requestCode IS NOT NULL", "with requestCode"),
    ("SELECT COUNT(*) FROM RequestRecord WHERE requestCode IS NULL", "without requestCode"),
]:
    print(f"{label}: {cur.execute(q).fetchone()[0]}")

print("\n=== D) requestCode numeric range (castable rows) ===")
row = cur.execute(
    "SELECT MIN(CAST(requestCode AS INTEGER)), MAX(CAST(requestCode AS INTEGER)) FROM RequestRecord WHERE requestCode GLOB '[0-9]*'"
).fetchone()
print(f"min={row[0]} max={row[1]}")

print("\n=== E) neighbours of each missing code (code±3) ===")
for c in codes:
    n = int(c)
    rows = cur.execute(
        "SELECT requestCode FROM RequestRecord WHERE CAST(requestCode AS INTEGER) BETWEEN ? AND ? ORDER BY CAST(requestCode AS INTEGER)",
        (n - 3, n + 3),
    ).fetchall()
    print(f"{c}: neighbours={[r[0] for r in rows]}")

conn.close()
print("\nDONE step1")
