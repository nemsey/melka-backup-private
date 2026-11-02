#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_all_databases() — پیاده‌سازی دستور ۱ حکم PN-050 (UNION رستاخیز داده)
==============================================================================
جایگزین منطق ممنوعهٔ «لایهٔ پرتر → جایگزینی زنده (replace / MAX)» با UNION:
همهٔ ردیف‌های همهٔ لایه‌های پایدار، بر اساس کلید یکتای هر جدول، در «زنده»
upsert می‌شوند. صفر حذف. صفر روپوشانی null. هر تغییر با AuditLog و شاهد JSON.

قوانین حاکم (PN-050):
  - دادهٔ مقدس: مقدار NULL منبع هرگز مقدار موجود زنده را رو نمی‌پوشاند.
  - قانون بقا: هیچ ردیفی حذف نمی‌شود؛ فقط INSERT/UPDATE افزایشی.
  - قانون زنجیره: هر تغییر ← شاهد (file:line · sha256 · AuditLog).
  - پیش‌نیاز قرمز: پشتیبان گرم (hot backup) پیش از هر تغییری.

اولویت ادغام میدانی (سطح رستاخیز — بازتاب دستور ۳):
  1) منبع NULL → مقدار زنده می‌ماند (دادهٔ مقدس)
  2) زنده NULL → مقدار منبع برده می‌شود (پُرکردن جای خالی)
  3) تعارض غیر-null → ردیفِ تازه‌تر می‌برد (updatedAt · lastModifiedAt ·
     createdAt بر حسب epoch-ms)؛ در تساوی/نامشخصی، منبع می‌برد.
  4) ستون‌های bookkeeping (fieldChanges · lastModifiedAt · lastModifiedBy ·
     lastSyncedAt · lastSyncedValue) فقط برای جداول هستهٔ PN-050
     (PropertyRecord · RequestRecord) سنتز می‌شوند (دستور ۲).

idempotent: اجرای مجدد ← همگرا (upsert همگرا)؛ بدون حذف؛ بدون عوارض جانبی.
"""
import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone

ACTOR = "pn050-union-resurrect"
SKIP_TABLES = {
    # حالتِ اجراییِ گذرا — رستاخیزِ داده دامنه‌شان نیست؛ کدبیسِ تازه خودش بازمی‌سازد
    "Session", "UserSession", "OtpAttempt", "JobLock", "CircuitBreakerState",
    "RelayJob", "RelayQueue", "ContainerIpLog", "GlmProbe", "LookupLog",
}
CORE_TABLES = {"PropertyRecord", "RequestRecord"}  # bookkeeping PN-050
BOOKCOLS = ["fieldChanges", "lastModifiedAt", "lastModifiedBy", "lastSyncedAt", "lastSyncedValue"]
RECENCY_COLS = ["updatedAt", "lastModifiedAt", "createdAt"]
PROCESS_PATROL = [b"standalone/server.js", b"prod-watchdog.sh", b"scripts/runtime/worker.ts"]
VALUE_TRUNC = 120
FC_MAX_ENTRIES = 50


def now_ms():
    return int(time.time() * 1000)


def iso(ts_ms=None):
    ms = ts_ms if ts_ms is not None else now_ms()
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def q(name):
    return '"' + str(name).replace('"', '""') + '"'


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def trunc(v):
    if v is None:
        return None
    if isinstance(v, bytes):
        v = v.decode("utf-8", "replace")
    s = str(v)
    return s[:VALUE_TRUNC]


def guard_no_processes():
    """قانون: ادغام فقط در سکوت کامل فرایندها (وگرنه نوشتن هم‌زمان = خطر)."""
    found = set()
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmd = f.read()
        except OSError:
            continue
        for pat in PROCESS_PATROL:
            if pat in cmd:
                found.add(cmd.replace(b"\x00", b" ").decode("utf-8", "replace")[:120])
    if found:
        print("❌ ABORT: فرایندهای زندهٔ سرور/Worker هنوز در حال اجرا هستند:")
        for c in found:
            print("   ", c)
        sys.exit(2)


def table_list(conn):
    rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    return sorted(r[0] for r in rows)


def table_pk(conn, t):
    info = list(conn.execute(f"PRAGMA table_info({q(t)})"))
    pks = [(r[1], r[2]) for r in info if r[5] > 0]
    if len(pks) == 1:
        return pks[0][0]
    return None


def table_cols(conn, t):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({q(t)})")]


def row_count(conn, t):
    return conn.execute(f"SELECT COUNT(*) FROM {q(t)}").fetchone()[0]


def pk_set(conn, t, pk):
    return set(r[0] for r in conn.execute(f"SELECT {q(pk)} FROM {q(t)}"))


def recency_of(rowdict, cols):
    """اولین ستون غیر-null از ترتیب بقا/به‌روزرسانی/ایجاد."""
    for c in RECENCY_COLS:
        if c in cols and rowdict.get(c) is not None:
            return rowdict[c]
    return None


def src_is_newer(s_r, l_r, s_cols, l_cols):
    a = recency_of(s_r, s_cols)
    b = recency_of(l_r, l_cols)
    if a is None and b is None:
        return True   # tie/نامشخص → منبع (بازتاب جدیدترین snapshot)
    if a is None:
        return False
    if b is None:
        return True
    try:
        return float(a) > float(b)
    except (TypeError, ValueError):
        pass
    sa, sb = str(a), str(b)
    try:
        return float(sa) > float(sb)
    except (TypeError, ValueError):
        return True  # ناهم‌نوع → منبع می‌برد (سیاست محافظه‌کارانهٔ ثبت‌شده)


def merge_field_changes(old_fc, entries):
    try:
        base = json.loads(old_fc) if old_fc else []
        if not isinstance(base, list):
            base = []
    except (ValueError, TypeError):
        base = []
    base.extend(entries)
    return base[-FC_MAX_ENTRIES:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", required=True)
    ap.add_argument("--sources", required=True, help="name=path,name=path (به ترتیب قدیم→جدید)")
    ap.add_argument("--backupdir", default="backups")
    ap.add_argument("--outdir", default="download/pn050-reset-audit")
    args = ap.parse_args()

    os.makedirs(args.backupdir, exist_ok=True)
    os.makedirs(args.outdir, exist_ok=True)
    t_start = time.time()
    guard_no_processes()

    if not os.path.exists(args.live):
        print(f"❌ ABORT: live DB یافت نشد: {args.live}")
        sys.exit(2)
    with open(args.live, "rb") as f:
        if f.read(15) != b"SQLite format 3":
            print("❌ ABORT: live DB فایل SQLite معتبر نیست")
            sys.exit(2)

    sources = []
    for part in args.sources.split(","):
        name, path = part.split("=", 1)
        sources.append({"name": name.strip(), "path": path.strip()})

    # ─── اتصال‌ها ───
    live = sqlite3.connect(args.live, isolation_level=None, timeout=60)
    live.execute("PRAGMA busy_timeout=60000")
    live_tables = table_list(live)
    pks = {t: table_pk(live, t) for t in live_tables}
    merge_tables = [t for t in live_tables if t not in SKIP_TABLES and pks[t] is not None]
    skipped = [t for t in live_tables if t not in merge_tables]

    src_conns = []
    for s in sources:
        c = sqlite3.connect(f"file:{s['path']}?mode=ro", uri=True)
        st = os.stat(s["path"])
        s.update(conn=c, sha256=sha256_file(s["path"]), mtime=iso(int(st.st_mtime * 1000)), size=st.st_size)
        src_conns.append(s)
        stables = set(table_list(c))
        missing = [t for t in merge_tables if t not in stables or table_pk(c, t) is None]
        if missing:
            print(f"❌ ABORT: منبع «{s['name']}» جداول/کلیدهای زیر را ندارد: {missing}")
            sys.exit(2)

    print(f"🥚 [{iso()}] merge_all_databases() — UNION رستاخیز PN-050")
    print(f"   live      : {args.live} ({len(live_tables)} جداول · {len(merge_tables)} ادغام · {len(skipped)} رد‌شدهٔ اجرایی)")
    for s in src_conns:
        print(f"   source    : {s['name']} = {s['path']} ({s['size']} bytes · sha256={s['sha256'][:16]}… · mtime={s['mtime']})")

    # ─── پشتیبان گرم (خط قرمز: بدون پشتیبان، دست‌نشان دیتابیس ممنوع) ───
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = os.path.join(args.backupdir, f"pre-pn050-union-{stamp}.db")
    print(f"— پشتیبان گرم → {backup_path}")
    bconn_new = sqlite3.connect(backup_path)
    live.backup(bconn_new)
    bconn_new.close()
    bck = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
    ic = bck.execute("PRAGMA integrity_check").fetchone()[0]
    if ic != "ok":
        print(f"❌ ABORT: integrity_check پشتیبان = {ic}")
        sys.exit(2)
    backup_sha = sha256_file(backup_path)
    for t in merge_tables:
        if row_count(bck, t) != row_count(live, t):
            print(f"❌ ABORT: شمارش پشتیبان ≠ زنده در جدول {t}")
            sys.exit(2)
    print(f"   ✓ پشتیبان سالم · sha256={backup_sha}")

    # ─── اضافه‌کردن افزایشی ستون‌های غایب (دستور ۲ · صفر تخریب) ───
    live_cols = {t: table_cols(live, t) for t in merge_tables}
    added_cols = {}
    for s in src_conns:
        for t in merge_tables:
            scols = table_cols(s["conn"], t)
            have = set(live_cols[t])
            for c in scols:
                if c not in have:
                    live.execute(f"ALTER TABLE {q(t)} ADD COLUMN {q(c)} TEXT")
                    live_cols[t].append(c)
                    added_cols.setdefault(t, []).append(c)
    if added_cols:
        print(f"— ستون‌های افزایشی افزوده‌شد: " + json.dumps(added_cols, ensure_ascii=False))

    # ─── انتظار ریاضی UNION (پیش از ادغام، از پشتیبان + منابع) ───
    expected = {}
    pre_pks = {}
    for t in merge_tables:
        pk = pks[t]
        u = pk_set(bck, t, pk)
        pre_pks[t] = set(u)
        for s in src_conns:
            u |= pk_set(s["conn"], t, pk)
        expected[t] = u
    print(f"— انتظار UNION آماده: PropertyRecord={len(expected['PropertyRecord'])} · RequestRecord={len(expected['RequestRecord'])}")

    # ─── ادغام — یک تراکنش اتمی per منبع ───
    stats = {t: {"pre": row_count(bck, t), "expected": 0, "post": 0, "inserted": 0, "null_fills": 0,
                 "conflict_src_won": 0, "conflict_live_kept": 0, "unchanged": 0,
                 "per_source": {}} for t in merge_tables}
    audit_rows = []

    for s in src_conns:
        scon = s["conn"]
        print(f"— ادغام از منبع «{s['name']}»…")
        live.execute("BEGIN IMMEDIATE")
        try:
            for t in merge_tables:
                pk = pks[t]
                lcols = live_cols[t]
                scols = table_cols(scon, t)
                common = [c for c in scols if c != pk and c in set(lcols)]
                core = t in CORE_TABLES
                bookc = [c for c in BOOKCOLS if c in set(lcols)] if core else []
                mergeable = [c for c in common if c not in BOOKCOLS] if core else common
                tst = stats[t]
                sst = tst["per_source"].setdefault(s["name"], {"inserted": 0, "null_fills": 0,
                                                                   "conflict_src_won": 0, "conflict_live_kept": 0,
                                                                   "unchanged": 0, "updated": 0})
                sel_cols = mergeable + bookc if core else mergeable
                cur = scon.execute(f"SELECT {q(pk)}, {', '.join(q(c) for c in sel_cols)} FROM {q(t)}")
                sel_names = [d[0] for d in cur.description]
                pk_idx = sel_names.index(pk)
                lsel = f"SELECT {', '.join(q(c) for c in sel_cols)} FROM {q(t)} WHERE {q(pk)} = ?"
                lnames = [d[0] for d in live.execute(lsel, (None,)).description]
                live_pks_current = pk_set(live, t, pk)
                for row in cur:
                    rowd = dict(zip(sel_names, row))
                    k = row[pk_idx]
                    if k is None:
                        continue
                    if k not in live_pks_current:
                        cols_ins = [c for c in sel_cols if c in rowd]
                        vals = [rowd[c] for c in cols_ins]
                        live.execute(
                            f"INSERT INTO {q(t)} ({', '.join(q(c) for c in cols_ins)}) "
                            f"VALUES ({', '.join('?' for _ in cols_ins)})", vals)
                        live_pks_current.add(k)
                        tst["inserted"] += 1
                        sst["inserted"] += 1
                        continue
                    lrowd = dict(zip(lnames, live.execute(lsel, (k,)).fetchone()))
                    taken, entries, oldvals = {}, [], {}
                    s_newer = src_is_newer(rowd, sel_names, lrowd, lnames)
                    for c in mergeable:
                        sv, lv = rowd.get(c), lrowd.get(c)
                        if sv is None:
                            continue                      # دادهٔ مقدس: null رو نمی‌پوشاند
                        if lv is None:
                            taken[c] = sv; oldvals[c] = None
                            tst["null_fills"] += 1; sst["null_fills"] += 1
                            entries.append({"field": c, "from": None, "to": trunc(sv),
                                            "at": iso(), "by": ACTOR, "layer": s["name"],
                                            "kind": "null_fill"})
                            continue
                        if sv == lv:
                            continue
                        if s_newer:
                            taken[c] = sv; oldvals[c] = lv
                            tst["conflict_src_won"] += 1; sst["conflict_src_won"] += 1
                            entries.append({"field": c, "from": trunc(lv), "to": trunc(sv),
                                            "at": iso(), "by": ACTOR, "layer": s["name"],
                                            "kind": "conflict_newer_source"})
                        else:
                            tst["conflict_live_kept"] += 1; sst["conflict_live_kept"] += 1
                    if taken:
                        sets, vals = [], list(taken.values())
                        for c in taken:
                            sets.append(f"{q(c)} = ?")
                        if core and bookc:
                            old_fc = lrowd.get("fieldChanges")
                            fc = merge_field_changes(old_fc, entries)
                            sets.append(f"{q('fieldChanges')} = ?"); vals.append(json.dumps(fc, ensure_ascii=False))
                            sets.append(f"{q('lastSyncedValue')} = ?")
                            vals.append(json.dumps({c: trunc(v) for c, v in oldvals.items()}, ensure_ascii=False))
                            nms = now_ms()
                            sets.append(f"{q('lastSyncedAt')} = ?"); vals.append(nms)
                            sets.append(f"{q('lastModifiedAt')} = ?"); vals.append(nms)
                            sets.append(f"{q('lastModifiedBy')} = ?"); vals.append(ACTOR)
                        vals.append(k)
                        live.execute(f"UPDATE {q(t)} SET {', '.join(sets)} WHERE {q(pk)} = ?", vals)
                        tst["updated"] += 1; sst["updated"] += 1
                    else:
                        tst["unchanged"] += 1; sst["unchanged"] += 1
            live.execute("COMMIT")
        except Exception as e:
            live.execute("ROLLBACK")
            print(f"❌ ROLLBACK منبع «{s['name']}»: {e}")
            raise
        print(f"   ✓ منبع «{s['name']}» commit شد")

    # ─── راستی‌آزمایی (قانون توقف: بدون سبز، توقف) ───
    failures = []
    for t in merge_tables:
        pk = pks[t]
        now_pks = pk_set(live, t, pk)
        stats[t]["post"] = len(now_pks)
        stats[t]["expected"] = len(expected[t])
        if now_pks != expected[t]:
            failures.append(f"{t}: post={len(now_pks)} expected={len(expected[t])}")
        lost = pre_pks[t] - now_pks
        if lost:
            failures.append(f"{t}: PK گم‌شده = {len(lost)}")
    if failures:
        print("❌ VERIFICATION FAILED — داده با پشتیبان قابل بازگشت است:")
        for f in failures:
            print("   ", f)
        sys.exit(3)

    # ─── AuditLog (قانون ۱۴) ───
    try:
        audit_tables = set(table_list(live))
        if "AuditLog" in audit_tables:
            acols = set(table_cols(live, "AuditLog"))
            if {"id", "action", "actor", "createdAt"} <= acols:
                def add_audit(t, sn, det):
                    live.execute(
                        f"INSERT INTO \"AuditLog\" (id, action, actor, detail, operation, entityType, recordCount, accessScope, tenantId, createdAt) "
                        f"VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (uuid.uuid4().hex, "pn050_union_merge", ACTOR,
                         json.dumps(det, ensure_ascii=False)[:1900], "PN050_UNION_MERGE", t,
                         int(det.get("inserted", 0) + det.get("updated", 0)), "system", "system", now_ms()))
                live.execute("BEGIN IMMEDIATE")
                for t in merge_tables:
                    for sn, det in stats[t]["per_source"].items():
                        add_audit(t, sn, det)
                add_audit("__global__", "all", {"sources": [s["name"] for s in src_conns],
                                                 "tables": len(merge_tables),
                                                 "elapsedMs": int((time.time() - t_start) * 1000)})
                live.execute("COMMIT")
    except Exception as e:
        try:
            live.execute("ROLLBACK")
        except sqlite3.OperationalError:
            pass
        print(f"⚠️ AuditLog نوشته نشد (sidecar JSONL معتبر است): {e}")

    live_sha = sha256_file(args.live)

    # ─── گزارش ───
    report = {
        "directive": "PN-050 D1 merge_all_databases (UNION)",
        "generatedAt": iso(),
        "elapsedMs": int((time.time() - t_start) * 1000),
        "laws": {"deletes": 0, "nullOverwrites": 0,
                 "statement": "صفر DELETE · null هرگز مقدار موجود را رو نمی‌پوشاند · فقط افزایشی"},
        "live": {"path": args.live, "sha256_post": live_sha},
        "hotBackup": {"path": backup_path, "sha256": backup_sha, "integrity": "ok"},
        "sources": [{"name": s["name"], "path": s["path"], "sha256": s["sha256"],
                     "mtime": s["mtime"], "sizeBytes": s["size"]} for s in src_conns],
        "addedColumns": added_cols,
        "skippedRuntimeTables": skipped,
        "tables": {t: stats[t] for t in merge_tables},
        "script": {"path": os.path.abspath(__file__), "sha256": sha256_file(os.path.abspath(__file__))},
    }
    rpt_path = os.path.join(args.outdir, "merge-report.json")
    with open(rpt_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    sidecar = os.path.join(args.outdir, "merge-audit.jsonl")
    with open(sidecar, "a", encoding="utf-8") as f:
        f.write(json.dumps({"at": iso(), "event": "pn050_union_merge", "backup": backup_path,
                            "backupSha256": backup_sha, "liveSha256_post": live_sha,
                            "report": rpt_path}, ensure_ascii=False) + "\n")

    print("\n══════ خلاصهٔ UNION رستاخیز (PN-050 · دستور ۱) ══════")
    for t in ["PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "GraphNode", "GraphEdge"]:
        s = stats[t]
        print(f"  {t:<20} pre={s['pre']:>7} → post={s['post']:>7} "
              f"(insert={s['inserted']}, null_fill={s['null_fills']}, src_won={s['conflict_src_won']}, live_kept={s['conflict_live_kept']})")
    print(f"  جدول‌های ادغام‌شده: {len(merge_tables)} · رد‌شدهٔ اجرایی: {len(skipped)} ({', '.join(skipped)})")
    print(f"  حذف‌ها: 0 · روپوشانی null: 0 · تازه‌سازی PK: همه سبز")
    print(f"  پشتیبان گرم: {backup_path} (sha256={backup_sha[:16]}…)")
    print(f"  گزارش: {rpt_path}")
    print(f"✅ UNION کامل — {int((time.time() - t_start))} ثانیه")


if __name__ == "__main__":
    main()
