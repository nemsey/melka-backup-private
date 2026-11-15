#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-081 · بک‌فیل محلی سهم‌های سهام‌داران — بدون هیچ فراخوانی ARM
------------------------------------------------------------------
ریشه: نگاشت قبلی فقط primaryRealtorList/secondaryRealtorList را می‌خواند؛
ردیف‌هایی که مشاوران ثبت نشده ولی shareholderList دارند، ستون «تجمیع
حق‌السهم مشاوران» خالی می‌ماندند. دادهٔ خام (rawInfoJson) از قبل ذخیره
است → بازنگاشت محلی کافی است.

عین منطق mapTxInfoPayload گسترش‌یافته (src/lib/melk-api/tx-info-enrichment.ts):
  اگر سهم مشاوران خالی بود و shareholderList واحد داشت:
    name = دفترچهٔ ExpertRecord[shareholder_id]
    unitPercent = shareholderUnit
    confirmation = "unknown"  (صادقانه — وضعیت تأیید در مبدأ ثبت نشده)
    role = "shareholder"

قانون دادهٔ مقدس: فقط ستون NULL را پر می‌کند؛ هیچ بازنویسی/حذفی نیست.
"""
import json
import os
import sqlite3
import time

DB_PATH = None
env_url = os.environ.get("DATABASE_URL", "")
if env_url.startswith("file:"):
    bare = env_url[5:].split("?")[0]
    if bare and "test" not in bare:
        DB_PATH = bare
if not DB_PATH:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "db", "custom.db")

con = sqlite3.connect(DB_PATH)
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA busy_timeout=15000")
cur = con.cursor()

# ── دفترچهٔ نام کارشناسان (شناسهٔ ARM → نام) ──
expert_name = {}
for eid, name in cur.execute("SELECT id, fullName FROM ExpertRecord WHERE fullName IS NOT NULL AND fullName != ''"):
    expert_name[eid] = name
print(f"دفترچهٔ نام کارشناسان: {len(expert_name)} نام")

# ── ردیف‌های بدون سهم ──
rows = cur.execute(
    "SELECT txId, rawInfoJson FROM TransactionEnrichment "
    "WHERE (realtorSharesJson IS NULL OR realtorSharesJson = '') AND rawInfoJson IS NOT NULL"
).fetchall()
print(f"ردیف‌های بدون سهم (کاندید): {len(rows)}")

batch_id = f"pn081-local-{int(time.time()):x}"
filled = 0
skipped_no_names = 0
samples = []
t0 = time.time()

update_sql = (
    "UPDATE TransactionEnrichment SET realtorSharesJson = ?, extractionBatchId = ? "
    "WHERE txId = ? AND (realtorSharesJson IS NULL OR realtorSharesJson = '')"
)

for txid, raw in rows:
    try:
        d = json.loads(raw) if raw else {}
    except Exception:
        continue
    if not isinstance(d, dict):
        continue

    # سهم مشاوران (primary/secondary) — اگر هست، این ردیف اصلاً کاندید نبود؛ صرف‌نظر
    has_primary = bool(d.get("primaryRealtorList")) or bool(d.get("secondaryRealtorList"))
    if has_primary:
        continue

    shl = d.get("shareholderList")
    if not isinstance(shl, list) or len(shl) == 0:
        continue  # هیچ دادهٔ سهمی در مبدأ نیست — صادقانه خالی می‌ماند

    shares = []
    for s in shl:
        if not isinstance(s, dict):
            continue
        sid = s.get("shareholder")
        if not isinstance(sid, str) or not sid:
            continue
        name = expert_name.get(sid)
        if not name:
            continue
        unit = s.get("shareholderUnit")
        try:
            unit = float(unit) if unit is not None else 0.0
        except (TypeError, ValueError):
            unit = 0.0
        shares.append({"name": name, "unitPercent": unit, "confirmation": "unknown", "role": "shareholder"})

    if not shares:
        skipped_no_names += 1
        continue

    shares_json = json.dumps(shares, ensure_ascii=False)
    cur.execute(update_sql, (shares_json, batch_id, txid))
    if cur.rowcount > 0:
        filled += 1
        if len(samples) < 6:
            samples.append({"txId": txid, "shares": shares})

con.commit()

after_empty = cur.execute(
    "SELECT COUNT(*) FROM TransactionEnrichment WHERE realtorSharesJson IS NULL OR realtorSharesJson = ''"
).fetchone()[0]
total = cur.execute("SELECT COUNT(*) FROM TransactionEnrichment").fetchone()[0]

report = {
    "directive": "PN-081 — بک‌فیل محلی سهم‌های سهام‌داران (بدون ARM)",
    "dbPath": DB_PATH,
    "batchId": batch_id,
    "durationMs": int((time.time() - t0) * 1000),
    "candidates": len(rows),
    "filled": filled,
    "skippedShareholdersWithoutLocalName": skipped_no_names,
    "emptySharesBefore": len(rows),
    "emptySharesAfter": after_empty,
    "totalEnrichments": total,
    "withSharesAfter": total - after_empty,
    "samples": samples,
}
print(json.dumps(report, ensure_ascii=False, indent=2))

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "download", "PN-081")
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "backfill-shares-local.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print("شاهد: download/PN-081/backfill-shares-local.json")
con.close()
