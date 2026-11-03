#!/usr/bin/env python3
# diff-live-vs-backup.py — مقایسهٔ دوسویهٔ DB زنده با بکاپ چرخشی ۲۰۲۶-۱۰-۲۳T۰۱:۱۸
# هدف رستاخیز داده: یافتن رکوردهای گم‌شدهٔ ۲۳+۱۳ و غنای فیلدها (قانون دادهٔ مقدس)
import sqlite3, json, sys

LIVE = "/home/z/my-project/db/custom.db"
BAK = "/home/z/my-project/upload/.data/rolling/live-2026-10-23T01-18-02-777.db"

live = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True)
bak = sqlite3.connect(f"file:{BAK}?mode=ro", uri=True)

print("=== TABLE ROW COUNTS: live vs backup ===")
tables = [r[0] for r in bak.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'")]
for t in sorted(tables):
    try:
        lc = live.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
    except Exception:
        lc = "ERR(no-table)"
    bc = bak.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
    marker = "  <-- BAK RICHER" if isinstance(lc, int) and bc > lc else ("  <-- LIVE RICHER" if isinstance(lc, int) and lc > bc else "")
    print(f"  {t}: live={lc} backup={bc}{marker}")

print()
print("=== PropertyRecord: id diff ===")
live_ids = {r[0] for r in live.execute("SELECT id FROM PropertyRecord")}
bak_ids = {r[0] for r in bak.execute("SELECT id FROM PropertyRecord")}
missing_in_live = bak_ids - live_ids
missing_in_bak = live_ids - bak_ids
print(f"  in backup but NOT live (recoverable): {len(missing_in_live)}")
print(f"  in live but NOT backup (must preserve): {len(missing_in_bak)}")

print()
print("=== RequestRecord: id diff ===")
live_rids = {r[0] for r in live.execute("SELECT id FROM RequestRecord")}
bak_rids = {r[0] for r in bak.execute("SELECT id FROM RequestRecord")}
r_missing_live = bak_rids - live_rids
r_missing_bak = live_rids - bak_rids
print(f"  in backup but NOT live (recoverable): {len(r_missing_live)}")
print(f"  in live but NOT backup (must preserve): {len(r_missing_bak)}")

print()
print("=== RequestRecord: areaNamesJson enrichment (shared ids) ===")
shared = live_rids & bak_rids
live_area = dict(live.execute("SELECT id, areaNamesJson FROM RequestRecord"))
bak_area = dict(bak.execute("SELECT id, areaNamesJson FROM RequestRecord"))
richer = emptier = same = 0
unsplit_live = unsplit_bak = 0
for rid in shared:
    l, b = live_area.get(rid), bak_area.get(rid)
    if l == b:
        same += 1
    elif (b is not None and b not in ("", "[]")) and (l is None or l in ("", "[]")):
        richer += 1
    elif (l is not None and l not in ("", "[]")) and (b is None or b in ("", "[]")):
        emptier += 1
    else:
        # both non-empty but different — count as richer if backup parses to more areas
        richer += 1
def count_unsplit(area_map):
    n = 0
    for v in area_map.values():
        try:
            arr = json.loads(v or "[]")
            if isinstance(arr, list) and len(arr) == 1 and any(c in arr[0] for c in "،,"):
                n += 1
        except Exception:
            n += 1
    return n
print(f"  shared={len(shared)} · same={same} · backup-richer={richer} · live-richer={emptier}")
print(f"  unsplit-multiarea strings: live={count_unsplit(live_area)} backup={count_unsplit(bak_area)}")

print()
print("=== Other enriched fields on shared RequestRecords (backup fills empty live) ===")
# فیلدهای کلیدی گام ۲/۳: متقاضی (customerName/customerMobile raw), مالک, مناطق
for col in ["customerName", "customerMobile", "rawCustomerName", "rawCustomerMobile", "actorNameNorm", "customerNameNorm"]:
    try:
        lm = dict(live.execute(f"SELECT id, [{col}] FROM RequestRecord"))
        bm = dict(bak.execute(f"SELECT id, [{col}] FROM RequestRecord"))
    except Exception as e:
        print(f"  {col}: column error {e}")
        continue
    fill = sum(1 for rid in shared if (bm.get(rid) not in (None, "")) and (lm.get(rid) in (None, "")))
    print(f"  {col}: backup-would-fill-empty={fill}")

print()
print("=== PropertyRecord owner enrichment (shared ids) ===")
for col in ["ownerName", "ownerMobile", "realtorNameNorm"]:
    try:
        lm = dict(live.execute(f"SELECT id, [{col}] FROM PropertyRecord"))
        bm = dict(bak.execute(f"SELECT id, [{col}] FROM PropertyRecord"))
    except Exception as e:
        print(f"  {col}: column error {e}")
        continue
    shared_p = live_ids & bak_ids
    fill = sum(1 for rid in shared_p if (bm.get(rid) not in (None, "")) and (lm.get(rid) in (None, "")))
    print(f"  {col}: backup-would-fill-empty={fill}")

print()
print("=== Timestamps ===")
for db, name in [(live, "live"), (bak, "backup")]:
    try:
        mx = db.execute("SELECT MAX(updatedAt) FROM PropertyRecord").fetchone()[0]
        mr = db.execute("SELECT MAX(updatedAt) FROM RequestRecord").fetchone()[0]
        print(f"  {name}: PropertyRecord.maxUpdatedAt={mx} · RequestRecord.maxUpdatedAt={mr}")
    except Exception as e:
        print(f"  {name}: {e}")

live.close(); bak.close()
