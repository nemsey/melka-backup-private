#!/usr/bin/env python3
# merge-recovery-apply.py — ادغام افزودنی بکاپ چرخشی ۲۳ اکتبر به DB زنده (قانون دادهٔ مقدس)
# =============================================================================
# دکترین: snapshot محیط امروز عقب‌مانده از حالت ۲۰۲۶-۱۰-۲۳T۰۱:۱۸ بود (شاهد G6).
# بکاپ چرخشی در «همهٔ» ستون‌های متفاوتِ ردیف‌های مشترک برابر یا غنی‌تر است
# (live-richer=0) ⇒ بازگردانی پیشرو، بدون هیچ Regression.
#   ۱) اسنپ‌شات امن آنلاین از DB زنده (sqlite backup API — WAL امن)
#   ۲) درج ردیف‌های موجود در بکاپ و غایب در زنده (هر ۲۱ جدول برنامه)
#   ۳) به‌روزرسانی ستون‌های متفاوتِ ردیف‌های مشترک Property/Request از بکاپ
#      (فقط ستون‌های اثبات‌شده backup-richer-or-equal — هرگز تهی روی پر)
#   ۴) ردیف‌های فقط-زندهٔ امروز (AuditLog ۳۳، RelayDevice ۱، ...) دست‌نخورده می‌مانند
import sqlite3, shutil, os, sys, time
from datetime import datetime, timezone

REPO = "/home/z/my-project"
LIVE = f"{REPO}/db/custom.db"
BAK = f"{REPO}/upload/.data/rolling/live-2026-10-23T01-18-02-777.db"
SNAPDIR = f"{REPO}/backups"
os.makedirs(SNAPDIR, exist_ok=True)
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
SNAPSHOT = f"{SNAPDIR}/pre-merge-recovery-{STAMP}.db"

# ─── ۱) اسنپ‌شات امن آنلاین (backup API — شامل WAL) ───
src = sqlite3.connect(LIVE, timeout=30)
src.execute("PRAGMA busy_timeout=30000")
snap = sqlite3.connect(SNAPSHOT)
src.backup(snap)
snap.close()
print(f"✓ safety snapshot: {SNAPSHOT} ({os.path.getsize(SNAPSHOT):,} bytes)")

bak = sqlite3.connect(f"file:{BAK}?mode=ro", uri=True)
bak.execute("PRAGMA busy_timeout=30000")

SKIP_TABLES = {"Session", "UserSession", "AppMeta", "JobLock", "CircuitBreakerState", "OtpAttempt",
               "sqlite_sequence", "RefListCache", "SyncState", "SyncCheckpoint", "SyncJobState", "SyncDeadLetter"}

def cols_of(db, table):
    return [r[1] for r in db.execute(f"PRAGMA table_info([{table}])")]

tables = [r[0] for r in bak.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'")]

inserted_total = 0
updated_total = 0
report = []

src.execute("BEGIN IMMEDIATE")
try:
    # ─── ۲) درج ردیف‌های غایب ───
    for t in sorted(tables):
        if t in SKIP_TABLES:
            continue
        try:
            lc = src.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
            bc = bak.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        except Exception:
            continue
        if bc == 0:
            continue
        pk = [r[1] for r in bak.execute(f"PRAGMA table_info([{t}])") if r[5] > 0]
        pk_name = pk[0] if pk else "rowid"
        live_ids = {r[0] for r in src.execute(f"SELECT [{pk_name}] FROM [{t}]")}
        bak_ids = {r[0] for r in bak.execute(f"SELECT [{pk_name}] FROM [{t}]")}
        missing = bak_ids - live_ids
        if not missing:
            continue
        colnames = cols_of(bak, t)
        col_list = ",".join(f"[{c}]" for c in colnames)
        ph = ",".join("?" * len(colnames))
        got = 0
        # ستون‌های زنده ممکن است کمتر/بیشتر باشند — فقط ستون‌های مشترک
        live_cols = set(cols_of(src, t))
        use_cols = [c for c in colnames if c in live_cols]
        col_list = ",".join(f"[{c}]" for c in use_cols)
        ph = ",".join("?" * len(use_cols))
        sel = f"SELECT {col_list} FROM [{t}] WHERE [{pk_name}]=?"
        ins = f"INSERT OR IGNORE INTO [{t}] ({col_list}) VALUES ({ph})"
        for mid in missing:
            row = bak.execute(sel, (mid,)).fetchone()
            if row is None:
                continue
            src.execute(ins, row)
            got += 1
        if got:
            inserted_total += got
            report.append(f"  INSERT {t}: +{got}")
    src.commit()
except Exception as e:
    src.rollback()
    print(f"❌ insert phase failed: {e}")
    sys.exit(1)

# ─── ۳) به‌روزرسانی ستون‌های متفاوت ردیف‌های مشترک (فقط Property/Request) ───
UPDATE_TABLES = {"PropertyRecord": None, "RequestRecord": None}
for t in UPDATE_TABLES:
    colnames = cols_of(bak, t)
    live_cols = set(cols_of(src, t))
    pk = [r[1] for r in bak.execute(f"PRAGMA table_info([{t}])") if r[5] > 0]
    pk_name = pk[0] if pk else "rowid"
    live_ids = {r[0] for r in src.execute(f"SELECT [{pk_name}] FROM [{t}]")}
    bak_ids = {r[0] for r in bak.execute(f"SELECT [{pk_name}] FROM [{t}]")}
    shared = live_ids & bak_ids
    diff_cols = [c for c in colnames if c in live_cols and c != pk_name]
    # تشخیص ستون‌های واقعاً متفاوت
    differing = set()
    for c in diff_cols:
        n = src.execute(
            f"SELECT COUNT(*) FROM [{t}] a JOIN (SELECT [{pk_name}] pk, [{c}] v FROM [{t}]) s ON s.pk=a.[{pk_name}]"
        ).fetchone()[0] if False else None  # placeholder — دوفاز می‌کنیم در پایتون برای سادگی
    # روش ساده و دقیق: مقایسه در پایتون
    bak_rows = {r[0]: r for r in bak.execute(f"SELECT {','.join(f'[{c}]' for c in colnames)} FROM [{t}]")}
    live_rows = {r[0]: r for r in src.execute(f"SELECT {','.join(f'[{c}]' for c in colnames)} FROM [{t}]")}
    idx = {c: i for i, c in enumerate(colnames)}
    col_diff_count = {}
    updates_by_col = {c: [] for c in diff_cols}
    live_richer_violations = []
    for rid in shared:
        lr, br = live_rows[rid], bak_rows[rid]
        for c in diff_cols:
            lv, bv = lr[idx[c]], br[idx[c]]
            if lv != bv:
                col_diff_count[c] = col_diff_count.get(c, 0) + 1
                if (bv is None or bv == "") and (lv is not None and lv != ""):
                    live_richer_violations.append((rid, c, lv, bv))
                else:
                    updates_by_col[c].append(rid)
    if live_richer_violations:
        print(f"❌ ABORT: {t} has {len(live_richer_violations)} live-richer cases — manual review needed:")
        for v in live_richer_violations[:5]:
            print("   ", v)
        sys.exit(1)
    src.execute("BEGIN IMMEDIATE")
    n_updated_rows = 0
    try:
        for c in diff_cols:
            rids = updates_by_col[c]
            if not rids:
                continue
            sel = f"SELECT [{pk_name}], [{c}] FROM [{t}] WHERE [{pk_name}]=?"
            upd = f"UPDATE [{t}] SET [{c}]=? WHERE [{pk_name}]=?"
            for rid in rids:
                row = bak.execute(sel, (rid,)).fetchone()
                if row is None:
                    continue
                src.execute(upd, (row[1], rid))
            n_updated_rows += len(rids)
        src.commit()
    except Exception as e:
        src.rollback()
        print(f"❌ update phase failed for {t}: {e}")
        sys.exit(1)
    updated_total += n_updated_rows
    diffs_str = {c: col_diff_count[c] for c in col_diff_count}
    report.append(f"  UPDATE {t}: {sum(col_diff_count.values())} column-values synced across {n_updated_rows} row-ops · cols={diffs_str}")

print()
for line in report:
    print(line)
print()
print(f"MERGE COMPLETE: inserted={inserted_total} rows · column-updates applied · live-only rows preserved")
print()
print("=== Post-merge verification ===")
for t, floor in [("PropertyRecord", 32874), ("RequestRecord", 29484)]:
    n = src.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
    ok = "✓" if n >= floor else "❌"
    print(f"  {ok} {t}: {n} (floor {floor})")
for t in ["PropertyRecord", "RequestRecord"]:
    n_m = src.execute(f"SELECT COUNT(*) FROM [{t}] WHERE tenantId='melketun'").fetchone()[0]
    print(f"  · {t} melketun: {n_m}")
unsplit = 0
for (v,) in src.execute("SELECT areaNamesJson FROM RequestRecord WHERE tenantId='melketun' AND areaNamesJson IS NOT NULL"):
    try:
        arr = json.loads(v or "[]")
        if isinstance(arr, list) and len(arr) == 1 and any(ch in arr[0] for ch in "،,"):
            unsplit += 1
    except Exception:
        unsplit += 1
print(f"  · unsplit multi-area strings: {unsplit} (must be 0)")
print(f"  · integrity: {src.execute('PRAGMA integrity_check').fetchone()[0]}")
src.close(); bak.close()
print("DONE")
