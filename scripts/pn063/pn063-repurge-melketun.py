#!/usr/bin/env python3
# ============================================================================
# pn063-repurge-melketun.py — پاک‌سازی مجدد ملکتون پس از آلودگی UNION (PN-063)
# ----------------------------------------------------------------------------
# زمینه: رستاخیزهای امروز (PN-062 + بوت‌های خودکار) با «قلعهٔ کهنهٔ ۲۴ اکتبر»
# (upload/.data/custom.db — پیش از حذف PN-059) UNION کردند و ردیف‌های ملکتون
# که مالک در PN-059 (۱۴۰۵/۰۸/۱۱) حذف کرده بود، بازگشتند.
# شاهد نقض: تست pn049-login-freedom §C-1 — requestMelketun=5006 (باید ۰ باشد).
#
# روش (عین رویهٔ PN-059):
#   ۱) بکاپ گرم VACUUM INTO (قانون دادهٔ مقدس — پیش از هر حذف)
#   ۲) آرشیو JSONL ردیف‌های ملکتون هر جدول + SHA256SUMS + manifest
#   ۳) DELETE ردیف‌های tenantId='melketun' از چهار جدول آلوده
#   ۴) شاهد AuditLog + راستی‌آزمایی شمارش‌ها (عین شاهد نهایی PN-059)
# صفر دست‌کاری رکورد تبریز — فقط حکم صریح مالک (PN-059) دوباره اجرا می‌شود.
# ============================================================================
import json
import hashlib
import os
import sqlite3
import sys
from datetime import datetime, timezone

REPO = "/home/z/my-project"
LIVE = f"{REPO}/db/custom.db"
TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
ARCHIVE_DIR = f"{REPO}/backups/melketun-repurge-{TS}"
TABLES = ["PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile"]
# شمارش‌های مرجع نهایی PN-059/060 (تبریز دست‌نخورده)
EXPECT_TABRIZ = {"PropertyRecord": 28377, "RequestRecord": 26038, "ExpertRecord": 307}

os.makedirs(ARCHIVE_DIR, exist_ok=True)

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

print(f"=== PN-063 پاک‌سازی مجدد ملکتون — {TS} ===")

# ── ۱) بکاپ گرم (اتمیک) ──
warm = f"{REPO}/backups/pre-melketun-repurge-{TS}.db"
print("۱) بکاپ گرم VACUUM INTO …")
src = sqlite3.connect(LIVE)
src.execute(f"VACUUM INTO '{warm}'")
src.close()
print(f"   ✓ {warm} ({os.path.getsize(warm) // (1 << 20)}MB)")

# ── ۲+۳) آرشیو + حذف (یک تراکنش) ──
print("۲) آرشیو JSONL + حذف …")
con = sqlite3.connect(LIVE)
con.execute("PRAGMA synchronous=FULL")
totals = {}
cur = con.cursor()
try:
    cur.execute("BEGIN IMMEDIATE")
    for t in TABLES:
        cols = [r[1] for r in cur.execute(f"PRAGMA table_info({t})").fetchall()]
        rows = cur.execute(
            f"SELECT * FROM {t} WHERE tenantId='melketun'"
        ).fetchall()
        jsonl = f"{ARCHIVE_DIR}/{t}.jsonl"
        with open(jsonl, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(dict(zip(cols, r)), ensure_ascii=False, default=str) + "\n")
        n = len(rows)
        if n:
            cur.execute(f"DELETE FROM {t} WHERE tenantId='melketun'")
        totals[t] = n
        print(f"   {t}: {n} ردیف آرشیو + حذف شد")
    # ۴) شاهد حسابرسی — در همان تراکنش
    witness = {
        "type": "melketun_repurge",
        "phase": "PN-063",
        "reason": "UNION با قلعهٔ کهنهٔ 20261024 ردیف‌های حذف‌شدهٔ PN-059 را بازگرداند — حکم صریح مالک دوباره اجرا شد",
        "archiveDir": f"backups/melketun-repurge-{TS}",
        "warmBackup": f"backups/pre-melketun-repurge-{TS}.db",
        "originalPurgeArchive": "backups/melketun-purge-20261101T205740Z (PN-059)",
        "deleted": totals,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    cur.execute(
        "INSERT INTO AuditLog (id, action, actor, detail, createdAt, operation, entityType, recordCount) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            f"pn063-repurge-{TS}",
            "MELKETUN_REPURGE",
            "pn063-repurge-melketun",
            json.dumps(witness, ensure_ascii=False),
            int(datetime.now(timezone.utc).timestamp() * 1000),
            None,
            None,
            sum(totals.values()),
        ),
    )
    con.commit()
    print("   ✓ تراکنش commit شد (آرشیو + حذف + شاهد)")
except Exception as e:
    con.rollback()
    print(f"   ❌ ROLLBACK: {e}")
    sys.exit(1)
finally:
    con.close()

# ── SHA256SUMS + manifest ──
sums = []
for t in TABLES:
    p = f"{ARCHIVE_DIR}/{t}.jsonl"
    if os.path.exists(p):
        sums.append(f"{sha256_file(p)}  {t}.jsonl")
sums.append(f"{sha256_file(warm)}  ../pre-melketun-repurge-{TS}.db")
with open(f"{ARCHIVE_DIR}/SHA256SUMS", "w") as f:
    f.write("\n".join(sums) + "\n")
with open(f"{ARCHIVE_DIR}/manifest.json", "w", encoding="utf-8") as f:
    json.dump(witness, f, ensure_ascii=False, indent=2)

# ── ۵) راستی‌آزمایی نهایی ──
print("۳) راستی‌آزمایی …")
v = sqlite3.connect(f"file:{LIVE}?mode=ro", uri=True)
ok = True
for t, expect in EXPECT_TABRIZ.items():
    got = v.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    melketun_left = v.execute(
        f"SELECT COUNT(*) FROM {t} WHERE tenantId='melketun'"
    ).fetchone()[0]
    status = "✓" if (got == expect and melketun_left == 0) else "✗"
    if status == "✗":
        ok = False
    print(f"   {status} {t}: {got} (انتظار {expect}) · ملکتون باقی: {melketun_left}")
v.close()

print(json.dumps({"verdict": "PASS" if ok else "FAIL", "deleted": totals,
                  "archive": ARCHIVE_DIR}, ensure_ascii=False))
sys.exit(0 if ok else 2)
