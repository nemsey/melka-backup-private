#!/usr/bin/env python3
# fix-pn033-fuse.py — نoganormalization پس از ریست: (۱) انقضای ۳ قفل فعال فیوز (۲) کلیدهای فیوز در لایه‌های boot-secrets
# دکترین شورا-ن۰۵۴ (PN-033/A): فیوز باید «برای همیشه» خاموش باشد — سرور با env غنی (CIRCUIT_DISABLED=1) بالا می‌آید؛
# این اسکریپت قفل‌های به-تازگی مسلح‌شده (۰۴:۰۱ امروز — نتیجهٔ بوت بدون env غنی) را منقضی و لایه‌های متنی را همگام می‌کند.
import sqlite3, json, os
from datetime import datetime, timezone

REPO = "/home/z/my-project"
db = sqlite3.connect(f"{REPO}/db/custom.db", timeout=30)
db.execute("PRAGMA busy_timeout=30000")

# ─── ۱) انقضای قفل‌های فعال فیوز روی میزبان‌های واقعی (ناوردای A-3) ───
hosts = ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"]
now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
past = now_ms - 3600_000  # یک ساعت پیش — قفل منقضی
db.execute("BEGIN IMMEDIATE")
try:
    rows = db.execute(
        "SELECT target, lockUntil, nextAttemptAt FROM CircuitBreakerState WHERE target IN (?,?,?)",
        tuple(hosts),
    ).fetchall()
    for t, lu, na in rows:
        print(f"  {t}: lockUntil={lu} nextAttemptAt={na} → expiring")
    db.execute(
        "UPDATE CircuitBreakerState SET lockUntil=?, nextAttemptAt=?, consecutiveFailures=0 WHERE target IN (?,?,?)",
        (past, past, *tuple(hosts)),
    )
    db.commit()
except Exception as e:
    db.rollback()
    raise
n_active = db.execute(
    "SELECT COUNT(*) FROM CircuitBreakerState WHERE target IN (?,?,?) AND (lockUntil > ? OR nextAttemptAt > ?)",
    (*tuple(hosts), now_ms, now_ms),
).fetchone()[0]
print(f"  active locks remaining: {n_active} (must be 0)")
revoked = db.execute("SELECT COUNT(*) FROM RelayDevice WHERE revokedAt IS NOT NULL").fetchone()[0]
active_dev = db.execute("SELECT COUNT(*) FROM RelayDevice WHERE revokedAt IS NULL").fetchone()[0]
print(f"  relay devices: active={active_dev} revoked={revoked} (A-3 expects revoked=0)")
db.close()

# ─── ۲) همگام‌سازی کلیدهای فیوز در لایه‌های متنی boot-secrets (B-3) ───
LAYERS = [f"{REPO}/db/.runtime/boot-secrets.json", f"{REPO}/upload/.runtime/boot-secrets.json"]
for p in LAYERS:
    if not os.path.exists(p):
        print(f"  layer missing, skip: {p}")
        continue
    d = json.load(open(p))
    d.pop("MELK_ARM_PROXY_URL", None)      # کلید دوران Worker — هرگز (ن۰۵۴)
    d.pop("MELK_RELAY_ALT_URL", None)      # طبق B-3 این کلید در لایه‌های boot-secrets غایب باشد
    d["MELK_ARM_CIRCUIT_DISABLED"] = "1"   # فیوز خاموش دائمی (رشته — قرارداد B-1/B-3)
    d["MELK_ARM_RELAY_MODE"] = "mobile"    # حالت رلهٔ Termux (ن۰۵۴)
    d["updatedAt"] = datetime.now(timezone.utc).isoformat()
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    os.replace(tmp, p)
    print(f"  ✓ layer synced: {p} -> keys: {sorted(k for k in d if not k.startswith('_'))}")
print("DONE")
