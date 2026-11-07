#!/usr/bin/env python3
"""PN-031-D · قفل داده — بکاپ VACUUM گرم + md5 + integrity + شاهد JSON"""
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "db", "custom.db")
TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
BACKUP = os.path.join(ROOT, "db", f"pre-pn031d-{TS}.db")
WITNESS = os.path.join(ROOT, "download", "pn031d", "entry-backup.json")

os.makedirs(os.path.dirname(WITNESS), exist_ok=True)


def md5_of(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    result = {"ok": False, "ts": TS, "source": SRC, "backup": None,
              "md5": None, "integrity": None, "error": None}
    try:
        src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
        # VACUUM INTO از اتصال فقط-خواندنی: کپی فشردهٔ سالم بدون قفل نوشتن
        src.execute("VACUUM INTO ?", (BACKUP,))
        src.close()

        result["backup"] = BACKUP
        result["sizeBytes"] = os.path.getsize(BACKUP)
        result["md5"] = md5_of(BACKUP)

        chk = sqlite3.connect(BACKUP)
        rows = chk.execute("PRAGMA quick_check;").fetchall()
        chk.close()
        result["integrity"] = rows[0][0] if rows else "unknown"
        result["ok"] = (result["integrity"] == "ok")
    except Exception as e:  # pragma: no cover
        result["error"] = f"{type(e).__name__}: {e}"

    with open(WITNESS, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
