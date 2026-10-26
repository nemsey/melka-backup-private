#!/usr/bin/env bash
# ============================================================================
# sacred-integrity.sh — G6 تست یکپارچگی دادهٔ مقدس (DIR-PN048-007 · موج صفر)
# ============================================================================
# سنجهٔ پس از هر موج (نه فقط آخر کار): شمارش رکوردها + پوشش PII هر tenant.
# اگر نسبت به شاهد قبلی «کاهش» دیده شد → fail (exit 1) — چون قانون دادهٔ
# مقدس رگرسیون را نمی‌پذیرد (G2: additive-only). شاهد در Persistent Zone.
#
# اجرا: bash scripts/pn048/sacred-integrity.sh [--label <wave-id>]
# خروجی: upload/.runtime/sacred-integrity-last.json + stdout JSON
# ============================================================================
set -euo pipefail
cd /home/z/my-project

LABEL="manual"
[[ "${1:-}" == "--label" && -n "${2:-}" ]] && LABEL="$2"

WITNESS="upload/.runtime/sacred-integrity-last.json"
OUT=$(python3 - "$LABEL" <<'PYEOF'
import json, sqlite3, sys, datetime
label = sys.argv[1]
conn = sqlite3.connect("file:db/custom.db?mode=ro", uri=True)
def scalar(q):
    try: return conn.execute(q).fetchone()[0]
    except Exception: return None
snap = {
    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "label": label,
    "counts": {
        "propertyRecord_total": scalar("SELECT COUNT(*) FROM PropertyRecord"),
        "propertyRecord_tabriz": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melk-tabriz'"),
        "propertyRecord_melketun": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melketun'"),
        "requestRecord_total": scalar("SELECT COUNT(*) FROM RequestRecord"),
        "requestRecord_tabriz": scalar("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melk-tabriz'"),
        "requestRecord_melketun": scalar("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun'"),
        "expertRecord_total": scalar("SELECT COUNT(*) FROM ExpertRecord"),
        "expertProfile_total": scalar("SELECT COUNT(*) FROM ExpertProfile"),
        "user_total": scalar("SELECT COUNT(*) FROM User"),
        "transaction_total": scalar("SELECT COUNT(*) FROM TransactionRecord"),
    },
    "pii_coverage": {
        "ownerName_filled": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE ownerName IS NOT NULL AND ownerName != ''"),
        "rawOwnerName_filled": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE rawOwnerName IS NOT NULL AND rawOwnerName != ''"),
        "ownerMobile_filled": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE ownerMobile IS NOT NULL AND ownerMobile != ''"),
        "address_filled": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE address IS NOT NULL AND address != ''"),
        "customerName_filled_requests": scalar("SELECT COUNT(*) FROM RequestRecord WHERE customerName IS NOT NULL AND customerName != ''"),
        "ownerNote_filled": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE ownerNote IS NOT NULL AND ownerNote != ''"),
        "expertMobile_filled": scalar("SELECT COUNT(*) FROM ExpertProfile WHERE mobile IS NOT NULL AND mobile != ''"),
    },
}
print(json.dumps(snap, ensure_ascii=False))
PYEOF
)

echo "$OUT"
echo "$OUT" > "$WITNESS.tmp" && mv -f "$WITNESS.tmp" "$WITNESS"

# مقایسه با شاهد قبلی — رگرسیون = شکست (G6)
if [ -f "$WITNESS.prev" ]; then
  if python3 - "$WITNESS.prev" "$WITNESS" <<'PYEOF'
import json, sys
prev, cur = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
bad = []
for key, val in cur["counts"].items():
    old = prev["counts"].get(key)
    if isinstance(val, int) and isinstance(old, int) and val < old:
        bad.append(f"{key}: {old} -> {val}")
for key, val in cur["pii_coverage"].items():
    old = prev["pii_coverage"].get(key)
    if isinstance(val, int) and isinstance(old, int) and val < old:
        bad.append(f"{key}: {old} -> {val}")
if bad:
    print("G6_FAIL: " + "; ".join(bad)); sys.exit(1)
print("G6_PASS")
PYEOF
  then echo "✅ G6: یکپارچگی دادهٔ مقدس برقرار (بدون رگرسیون نسبت به شاهد قبلی)"
  else echo "❌ G6: رگرسیون دادهٔ مقدس — توقف (قانون دادهٔ مقدس · DIR-PN048-007)"; exit 1; fi
else
  echo "🆕 G6: شاهد پایه ثبت شد (مقایسه از اجرای بعدی)"
fi
cp -f "$WITNESS" "$WITNESS.prev"
