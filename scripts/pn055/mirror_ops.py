#!/usr/bin/env python3
"""
PN-055 · mirror_ops.py — ابزار SQLite برای آینهٔ داغ صفر-اتلاف
================================================================
خودِ دستورات SQLite (بدون هیچ تغییری در اپلیکیشن):
  backup     <src> <dst>     — اسنپ‌شات سازگار با backup API (WAL را می‌خواند؛
                              هرگز cp خام روی DB زنده نیست — خط قرمز)
  counts     <db>            — شمارش جدول‌های شاهد (PropertyRecord/RequestRecord)
  quickcheck <db>            — PRAGMA quick_check
  checkpoint <db>            — PRAGMA wal_checkpoint(TRUNCATE) (نجات نفس آخر)
  witness    <file> <pr> <rq> <source> — نوشتن شاهد HIGHWATER اتمی
"""
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone


def _ro(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=60)


def cmd_backup(src: str, dst: str) -> int:
    s = _ro(src)
    d = sqlite3.connect(dst)
    for _ in range(5):
        try:
            s.backup(d)
            break
        except sqlite3.OperationalError:
            time.sleep(2)
    else:
        print("backup-failed", file=sys.stderr)
        return 1
    d.close()
    s.close()
    return 0


def cmd_counts(db: str) -> int:
    try:
        c = _ro(db)
        pr = c.execute("SELECT COUNT(*) FROM PropertyRecord").fetchone()[0]
        try:
            rq = c.execute("SELECT COUNT(*) FROM RequestRecord").fetchone()[0]
        except sqlite3.Error:
            rq = -1
        c.close()
        print(f"{pr} {rq}")
        return 0
    except Exception:
        print("-1 -1")
        return 0  # خروجی قابل‌پارس همیشه — پوسته قضاوت می‌کند


def cmd_quickcheck(db: str) -> int:
    try:
        c = _ro(db)
        r = c.execute("PRAGMA quick_check").fetchone()[0]
        c.close()
        print(r)
    except Exception as e:
        print(f"error:{str(e)[:80]}")
    return 0


def cmd_checkpoint(db: str) -> int:
    con = sqlite3.connect(db, timeout=30)
    con.execute("PRAGMA busy_timeout=30000")
    r = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
    con.close()
    print(f"busy={r[0]} log_pages={r[1]} checkpointed={r[2]}")
    return 0


def cmd_witness(file: str, pr: str, rq: str, source: str) -> int:
    w = {
        "propertyCount": int(pr),
        "requestCount": int(rq),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }
    tmp = file + ".tmp"
    with open(tmp, "w") as f:
        import json

        json.dump(w, f, ensure_ascii=False, indent=1)
    os.replace(tmp, file)
    print(json.dumps(w, ensure_ascii=False))
    return 0


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "backup" and len(args) == 2:
        return cmd_backup(args[0], args[1])
    if cmd == "counts" and len(args) == 1:
        return cmd_counts(args[0])
    if cmd == "quickcheck" and len(args) == 1:
        return cmd_quickcheck(args[0])
    if cmd == "checkpoint" and len(args) == 1:
        return cmd_checkpoint(args[0])
    if cmd == "witness" and len(args) == 4:
        return cmd_witness(args[0], args[1], args[2], args[3])
    print(f"unknown/invalid: {cmd} {args}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
