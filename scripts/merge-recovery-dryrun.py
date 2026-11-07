#!/usr/bin/env python3
# merge-recovery-dryrun.py — فاز صفر: دیف کامل ستونی ردیف‌های مشترک + شمارش درج‌ها (بدون تغییر)
# خروجی: گزارش دقیق برای تصمیم ادغام افزودنی (قانون G2 · دادهٔ مقدس)
import sqlite3, json

LIVE = "/home/z/my-project/db/custom.db"
BAK = "/home/z/my-project/upload/.data/rolling/live-2026-10-23T01-18-02-777.db"

live = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True)
bak = sqlite3.connect(f"file:{BAK}?mode=ro", uri=True)

SKIP_TABLES = {"Session", "UserSession", "AppMeta", "JobLock", "CircuitBreakerState", "OtpAttempt",
               "sqlite_sequence", "RefListCache", "SyncState", "SyncCheckpoint", "SyncJobState", "SyncDeadLetter"}

def cols_of(db, table):
    return [(r[1], r[2]) for r in db.execute(f"PRAGMA table_info([{table}])")]

print("=== Per-table: pk type + insert counts ===")
tables = [r[0] for r in bak.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'")]
merge_plan = []
for t in sorted(tables):
    if t in SKIP_TABLES:
        continue
    try:
        lc = live.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        bc = bak.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
    except Exception:
        continue
    if bc == 0 and lc == 0:
        continue
    tc = cols_of(bak, t)
    lcols = {c[0] for c in cols_of(live, t)} if t in [r[0] for r in live.execute("SELECT name FROM sqlite_master WHERE type='table'")] else set()
    pk_cols = [c for c in cols_of(bak, t) if len(c) > 2]
    # pk column name
    pk = [r[1] for r in bak.execute(f"PRAGMA table_info([{t}])") if r[5] > 0]
    pk_name = pk[0] if pk else "rowid"
    pk_type = next((c[1] for c in tc if c[0] == pk_name), "TEXT")
    try:
        live_ids = {r[0] for r in live.execute(f"SELECT [{pk_name}] FROM [{t}]")}
        bak_ids = {r[0] for r in bak.execute(f"SELECT [{pk_name}] FROM [{t}]")}
    except Exception:
        continue
    ins = len(bak_ids - live_ids)
    keep = len(live_ids - bak_ids)
    if ins > 0 or keep > 0:
        print(f"  {t}: pk={pk_name}({pk_type}) · insert-from-backup={ins} · live-only(preserve)={keep}")
        merge_plan.append((t, pk_name, pk_type, ins, keep))

print()
print("=== Full column diff: shared PropertyRecord rows ===")
pcols = [c[0] for c in cols_of(bak, "PropertyRecord") if c[0] != "id"]
live_rows = {r[0]: r for r in live.execute("SELECT * FROM PropertyRecord")}
bak_rows = {r[0]: r for r in bak.execute("SELECT * FROM PropertyRecord")}
bak_colnames = [c[0] for c in cols_of(bak, "PropertyRecord")]
shared_p = set(live_rows) & set(bak_rows)
diff_counts = {}
for i, cname in enumerate(bak_colnames):
    if cname == "id": continue
    n = 0
    for rid in shared_p:
        lv, bv = live_rows[rid][i], bak_rows[rid][i]
        if lv != bv:
            n += 1
    if n: diff_counts[cname] = n
print("  differing columns (shared rows):", diff_counts or "NONE — fully identical")

print()
print("=== Full column diff: shared RequestRecord rows ===")
bak_colnames_r = [c[0] for c in cols_of(bak, "RequestRecord")]
live_rows_r = {r[0]: r for r in live.execute("SELECT * FROM RequestRecord")}
bak_rows_r = {r[0]: r for r in bak.execute("SELECT * FROM RequestRecord")}
shared_r = set(live_rows_r) & set(bak_rows_r)
diff_counts_r = {}
for i, cname in enumerate(bak_colnames_r):
    if cname == "id": continue
    n = 0
    live_richer_examples = 0
    for rid in shared_r:
        lv, bv = live_rows_r[rid][i], bak_rows_r[rid][i]
        if lv != bv:
            n += 1
            if (bv is None or bv == "") and (lv is not None and lv != ""):
                live_richer_examples += 1
    if n: diff_counts_r[cname] = (n, live_richer_examples)
print("  differing columns (shared rows): {col: (diffs, live-richer-cases)}:", diff_counts_r or "NONE — fully identical")

live.close(); bak.close()
print()
print("DRY-RUN COMPLETE — no changes made")
