#!/usr/bin/env bash
# =============================================================================
# verify-deploy-freshness.sh — گارد تازگی انتشار (P6519 / BLOCK D دستور شورا)
# =============================================================================
# قانون طلایی (AGENTS.md):
#   «هیچ پرونده‌ای بسته نمی‌شود مگر BUILD_ID لینک publish با git HEAD یکی باشد.»
#
# کار: BUILD_ID زندهٔ یک لینک عمومی (preview یا publish) را از دو مسیر مستقل
#      می‌خواند و gitSha آن را با git HEAD محلی مقایسه می‌کند:
#        ۱) GET <URL>/api/version   → { buildId, gitSha, ... }  (شاهد ماشینی)
#        ۲) HTML خام               → <meta name="app-build-id"> (شاهد بدون لاگین)
#
# استفاده:
#   scripts/verify-deploy-freshness.sh https://<name>-d.space-z.ai
#   scripts/verify-deploy-freshness.sh https://preview-<bot-id>.space-z.ai --expect-sha abcd1234
#
# خروجی: exit 0 = تازه (سبز) · exit 1 = کهنه/ناموفق (قرمز — پرونده بسته نمی‌شود)
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

URL="${1:-}"
EXPECT_SHA="${3:-}"
[ "${2:-}" = "--expect-sha" ] && EXPECT_SHA="${3:-}"

# ---- رنگ‌ها ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

fail()  { echo -e "${RED}❌ FAIL:$NC $1"; exit 1; }
pass()  { echo -e "${GREEN}✅ PASS:$NC $1"; }

echo "════════ گارد تازگی انتشار — P6519 ══════"

# ---- ورودی ----
[ -z "$URL" ] && fail "آرگومان اول = URL عمومی لازم است (مثلاً https://name-d.space-z.ai)"
URL="${URL%/}"
echo "هدف: $URL"

# ---- sha مرجع محلی ----
LOCAL_SHA="$(git rev-parse --short HEAD 2>/dev/null)"
[ -z "$LOCAL_SHA" ] && fail "git HEAD محلی خوانده نشد — در ریپو اجرا کنید"
[ -z "$EXPECT_SHA" ] && EXPECT_SHA="$LOCAL_SHA"
echo "sha انتظار (git HEAD محلی): $EXPECT_SHA"

# ---- ۱) endpoint شاهد ----
echo ""
echo "── شاهد ۱: GET $URL/api/version ──"
API_JSON="$(curl -sS -m 20 -H 'Cache-Control: no-cache' "$URL/api/version" 2>&1)"
if ! echo "$API_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["buildId"] and d["gitSha"]' 2>/dev/null; then
  echo "پاسخ: $API_JSON" | head -c 300; echo
  fail "endpoint /api/version پاسخ معتبر نداد — یا لینک مرده است یا استقرار قدیمی (پیش از P6519) است. پرونده بسته نمی‌شود."
fi
API_BID="$(echo "$API_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["buildId"])')"
API_SHA="$(echo "$API_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["gitSha"])')"
API_ENV="$(echo "$API_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("env","?"))')"
API_AT="$(echo "$API_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("builtAt","?"))')"
echo "buildId زنده: $API_BID (env=$API_ENV · ساخته: $API_AT)"

# ---- ۲) متاتگ HTML خام (بدون لاگین) ----
echo ""
echo "── شاهد ۲: متاتگ app-build-id در HTML خام ──"
META_BID="$(curl -sS -m 20 -H 'Cache-Control: no-cache' "$URL/" 2>/dev/null | grep -oE 'app-build-id" content="[^"]*"' | head -1 | sed 's/.*content="//;s/"//' || true)"
if [ -z "$META_BID" ]; then
  echo -e "${YELLOW}⚠️ متاتگ app-build-id در HTML یافت نشد (استقرار پیش از P6519؟) — ادامه با شاهد ۱$NC"
else
  echo "buildId متا:  $META_BID"
  [ "$META_BID" != "$API_BID" ] && fail "ناهم‌خوانی داخلی: متا ($META_BID) ≠ endpoint ($API_BID) — کش لایه‌ای یا استقرار دوگانه"
fi

# ---- ۳) مقایسه با git HEAD ----
echo ""
echo "── مقایسه با git HEAD محلی ──"
if [ "$API_SHA" = "$EXPECT_SHA" ]; then
  pass "لینک در حال سروی کدِ کامیت $EXPECT_SHA است — تازه ✓"
  echo ""
  echo "خلاصه شاهد: buildId=$API_BID · env=$API_ENV · builtAt=$API_AT"
  echo "ثبت در worklog: published_build_id: $API_BID"
  exit 0
else
  fail "کهنگی! لینک کد کامیت $API_SHA را سرو می‌کند ولی HEAD محلی $EXPECT_SHA است. انتشار جدید (فراخوانی Complete) لازم است — پرونده بسته نمی‌شود."
fi
