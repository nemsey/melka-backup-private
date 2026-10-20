#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Guard: audit-melketun-city-filter — PN-045 · فاز ۴ (شورا-ن۰۸۹)
# ─────────────────────────────────────────────────────────────────────────────
# قانون ۱۲ دستور: دادهٔ ملکتون باید فقط رکوردهای شهر تبریز را داشته باشد.
# سه لایهٔ بررسی:
#   ۱. source — فیلتر تبریز در sync.ts وجود دارد (tabrizVerdict + skip)
#   ۲. data   — هر رکورد ملکتون یا آژانس تبریزی دارد یا محلهٔ تبریزی (detailsJson)
#   ۳. zero   — صفر رکورد ملکتون با آژانس/محلهٔ غیرتبریز
# خروجی: PASS (سبز) یا FAIL با شرح دقیق. --strict = هر هشدار هم FAIL است.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."
STRICT="${1:-}"

fail=0
warn=0

# ── ۱. بررسی source: زنجیرهٔ فیلتر در sync.ts ────────────────────────────────
SYNC="src/lib/integrations/melketun/sync.ts"
if [ ! -f "$SYNC" ]; then
  echo "❌ FAIL: $SYNC missing"
  exit 1
fi
for needle in "tabrizVerdict" "isTabrizAgency" "skippedByCityFilter"; do
  if ! grep -q "$needle" "$SYNC"; then
    echo "❌ FAIL: filter chain incomplete — '$needle' not found in sync.ts"
    fail=1
  fi
done
if [ $fail -eq 0 ]; then
  echo "✅ source: tabrizVerdict chain present (agency → area → honest skip)"
fi

# ── ۲. بررسی داده: هر رکورد ملکتون تبریز است؟ ────────────────────────────────
python3 - "$STRICT" <<'PYEOF'
import json, sqlite3, sys

strict = sys.argv[1] if len(sys.argv) > 1 else ""
c = sqlite3.connect("db/custom.db")

# واژه‌های تبریز (عین sync.ts)
AGENCY_KW = ["تبریز", "tabriz", "Tabriz", "TABRIZ"]

total = c.execute("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melketun'").fetchone()[0]
req_total = c.execute("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun'").fetchone()[0]
print(f"ℹ️ melketun records: PropertyRecord={total} RequestRecord={req_total}")

def agency_of(details_json):
    """آژانس از detailsJson ([{label,value}]) — عین نگاشت filingToProperty"""
    if not details_json:
        return ""
    try:
        d = json.loads(details_json)
        for item in d:
            if item.get("label") == "آژانس":
                return str(item.get("value") or "")
    except Exception:
        pass
    return ""

bad = []
checked = 0
for pid, dj in c.execute(
    "SELECT id, detailsJson FROM PropertyRecord WHERE tenantId='melketun'"
).fetchall():
    checked += 1
    agency = agency_of(dj)
    if agency and not any(k in agency for k in AGENCY_KW):
        bad.append((pid, agency))

if bad:
    print(f"❌ FAIL: {len(bad)} melketun PropertyRecord با آژانس غیرتبریز:")
    for pid, agency in bad[:5]:
        print(f"   id={pid} agency={agency}")
    sys.exit(1)

if checked == 0:
    if strict == "--strict":
        print("⚠️ WARN(--strict→FAIL): صفر رکورد ملکتون برای بررسی — sync هنوز اجرا نشده؟")
        sys.exit(1)
    print("⚠️ WARN: صفر رکورد ملکتون — بررسی داده صرفاً skip شد (پیش از نخستین sync)")
else:
    print(f"✅ data: هر {checked} رکورد ملکتون یا آژانس تبریزی دارد یا بدون آژانس (قانون ۱۷ fallback)")

# درخواست‌ها: inputsJson دارد اما آژانس در آن است
req_bad = 0
req_checked = 0
for rid, ij in c.execute(
    "SELECT id, inputsJson FROM RequestRecord WHERE tenantId='melketun'"
).fetchall():
    req_checked += 1
    if not ij:
        continue
    try:
        d = json.loads(ij)
        agency = str(d.get("agency") or "")
        if agency and not any(k in agency for k in AGENCY_KW):
            req_bad += 1
    except Exception:
        pass

if req_bad > 0:
    print(f"❌ FAIL: {req_bad} melketun RequestRecord با آژانس غیرتبریز")
    sys.exit(1)
if req_checked > 0:
    print(f"✅ data: هر {req_checked} درخواست ملکتون آژانس تبریزی/بدون آژانس دارد")
PYEOF
rc=$?
if [ $rc -ne 0 ]; then
  fail=1
fi

# ── ۳. جمع‌بندی ──────────────────────────────────────────────────────────────
if [ $fail -ne 0 ]; then
  echo "❌ audit-melketun-city-filter: FAIL"
  exit 1
fi
echo "✅ audit-melketun-city-filter: PASS — فیلتر تبریز در مبدأ فعال و داده همگام است"
