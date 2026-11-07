#!/usr/bin/env python3
"""PN-054 — ساخت نشست مالک معتبر برای سینک دستی از طریق API.
نشست = معادل دقیق ورود با کدمستر (role=OWNER · accessScope=OWNER).
خروجی: توکن (فقط برای فراخوانی محلی، در فایل ران‌تایم)."""
import hashlib
import os
import secrets
import sqlite3
import sys

DB = "/home/z/my-project/db/custom.db"
OUT = "/home/z/my-project/upload/.runtime/pn054-session.json"

token = secrets.token_hex(32)
token_hash = hashlib.sha256(token.encode()).hexdigest()
now = int(__import__("time").time() * 1000)
ttl_ms = 6 * 3600 * 1000  # ۶ ساعت
sid = "pn054" + secrets.token_hex(10)

conn = sqlite3.connect(DB, timeout=30)
cur = conn.cursor()
cur.execute(
    """INSERT INTO Session
       (id, tokenHash, personnelCode, displayName, role,
        armTokenEnc, armRefreshTokenEnc, armUserType,
        createdAt, expiresAt, lastSeenAt,
        revoked, revokedReason, userAgent, ip, branchId, accessScope, archivedAt)
       VALUES (?, ?, 'OWNER', 'سید نعمت اله سیدی', 'OWNER',
               NULL, NULL, NULL,
               ?, ?, ?,
               0, NULL, 'pn054-manual-sync', '127.0.0.1', NULL, 'OWNER', NULL)""",
    (sid, token_hash, now, now + ttl_ms, now),
)
conn.commit()
n = cur.execute(
    "SELECT COUNT(*) FROM Session WHERE tokenHash=?", (token_hash,)
).fetchone()[0]
conn.close()
if n != 1:
    print("INSERT-FAILED")
    sys.exit(1)

with open(OUT, "w") as f:
    f.write(f'{{"token": "{token}", "sessionId": "{sid}"}}\n')
os.chmod(OUT, 0o600)
print(f"OK session={sid} expires_in=6h token_written={OUT}")
