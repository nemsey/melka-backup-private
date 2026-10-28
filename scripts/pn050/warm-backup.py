#!/usr/bin/env python3
"""
PN-050 · دستور ۲ — بکاپ گرم پیش از migration ستون‌های provenance
================================================================
- بکاپ آنلاین (sqlite backup API) — امن زیر WAL بدون توقف سرور.
- خروجی: db/custom.db.pn050-pre-migration + شمار رکوردها برای قانون «صفر رکورد از دست رفته».
- هرگز روی DB اصلی نمی‌نویسد (فقط-خواندن + کپی).
"""
import sqlite3
import sys
import time
import hashlib
import os

REPO = os.environ.get("MELKA_REPO_DIR", "/home/z/my-project")
SRC = os.path.join(REPO, "db", "custom.db")
DST = os.path.join(REPO, "db", "custom.db.pn050-pre-migration")


def sha256_file(path: str, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def main() -> int:
    t0 = time.time()
    src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
    cur = src.cursor()

    # شمارش پیش از بکاپ (شاهد + مخرج — قانون ۰۲)
    before = {}
    for t in ("PropertyRecord", "RequestRecord"):
        before[t] = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]

    dst = sqlite3.connect(DST)
    src.backup(dst)  # بکاپ آنلاین — مقاوم به WAL
    dst.close()
    src.close()

    # وارسی پس از بکاپ — بکاپ باید همان شمارش‌ها را داشته باشد
    chk = sqlite3.connect(f"file:{DST}?mode=ro", uri=True)
    after = {}
    for t in ("PropertyRecord", "RequestRecord"):
        after[t] = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] if False else chk.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    integrity = chk.execute("PRAGMA integrity_check").fetchone()[0]
    chk.close()

    size = os.path.getsize(DST)
    digest = sha256_file(DST)
    ok = all(before[t] == after[t] for t in before) and integrity == "ok"

    print("WARM_BACKUP_OK" if ok else "WARM_BACKUP_FAIL")
    print(f"src={SRC}")
    print(f"dst={DST}")
    print(f"size_bytes={size}")
    print(f"duration_s={time.time() - t0:.1f}")
    print(f"counts_before={before}")
    print(f"counts_in_backup={after}")
    print(f"integrity={integrity}")
    print(f"sha256={digest}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
