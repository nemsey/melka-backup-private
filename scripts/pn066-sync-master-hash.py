#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-066 — همگام‌سازی هش کدمستر در AppMeta (توقف فوری حلقهٔ ری‌استارت ۳۲ثانیه‌ای)
ریشه: پس از هر ریست، db:push بوت DB تازه با masterCodeHash=NULL می‌سازد؛
UNION عمداً AppMeta را باز نمی‌گرداند؛ هیچ‌کس هش را همگام نمی‌کند →
وارسی auto-recovery هر بوت «تخریب» تشخیص می‌دهد → بازیابی کامل → ری‌استارت بی‌پایان.
درمان: هش SHA-256 کدمسترِ env (منبع: boot-secrets.json — همان زنجیرهٔ رسمی)
در AppMeta نوشته می‌شود — عین فرمول master-login (createHash sha256 utf8 hex).
"""
import hashlib, json, sqlite3, sys, os

for escrow in ["/home/z/my-project/db/.runtime/boot-secrets.json",
               "/home/z/my-project/upload/.runtime/boot-secrets.json"]:
    if not os.path.exists(escrow):
        continue
    code = json.load(open(escrow)).get("MASTER_ACCESS_CODE", "")
    if not code:
        continue
    h = hashlib.sha256(code.encode("utf-8")).hexdigest()
    con = sqlite3.connect("/home/z/my-project/db/custom.db", timeout=30)
    cur = con.execute("SELECT masterCodeHash FROM AppMeta WHERE id='singleton'")
    row = cur.fetchone()
    before = row[0] if row else "NO-ROW"
    con.execute("UPDATE AppMeta SET masterCodeHash=? WHERE id='singleton'", (h,))
    con.commit()
    after = con.execute("SELECT masterCodeHash FROM AppMeta WHERE id='singleton'").fetchone()[0]
    con.close()
    print(json.dumps({
        "ok": after == h,
        "before": "null" if before is None else ("set" if before else str(before)[:12]),
        "after": after[:12] + "…",
        "matchesEnvHash": after == h,
        "source": escrow.split("/")[3] + "/" + escrow.split("/")[4],
    }, ensure_ascii=False))
    sys.exit(0 if after == h else 1)
print("NO ESCROW WITH MASTER CODE FOUND", file=sys.stderr)
sys.exit(2)
