#!/usr/bin/env python3
# archive-realtorMobile.py — آرشیو مقدس مقادیر realtorMobile (۱۲۲۳) پیش از حذف ستون توسط prisma db push
# قانون دادهٔ مقدس: صفر حذف داده — مقادیر در JSON بادوام آرشیو می‌شوند.
import sqlite3, json, hashlib, os, sys
from datetime import datetime, timezone

SRC = "/home/z/my-project/upload/.survival/PN-048-20261021/db/custom.db"
OUTS = [
    "/home/z/my-project/db/realtorMobile-archive-20261024.json",
    "/home/z/my-project/upload/.data/realtorMobile-archive-20261024.json",
]

c = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
rows = c.execute(
    "SELECT id, propertyCode, realtorMobile FROM PropertyRecord "
    "WHERE realtorMobile IS NOT NULL AND realtorMobile != ''"
).fetchall()
total = c.execute("SELECT COUNT(*) FROM PropertyRecord").fetchone()[0]
c.close()

records = [
    {"id": r[0], "propertyCode": r[1], "realtorMobile": r[2]}
    for r in rows
]
payload = {
    "archive": "realtorMobile",
    "reason": "prisma db push (resurrect-ultimate.sh 2026-10-24) dropped column absent from schema at HEAD 762830c; zero code references",
    "source": "upload/.survival/PN-048-20261021/db/custom.db",
    "sourceTotal": total,
    "count": len(records),
    "archivedAt": datetime.now(timezone.utc).isoformat(),
    "sha256": None,
    "records": records,
}
blob = json.dumps(payload, ensure_ascii=False, indent=1).encode("utf-8")
payload["sha256"] = hashlib.sha256(blob).hexdigest()

for out in OUTS:
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"✓ archived {len(records)} values -> {out} ({os.path.getsize(out)} bytes)")

print(f"realtorMobile archived: {len(records)}/{1223} values preserved")
sys.exit(0 if len(records) >= 1223 else 1)
