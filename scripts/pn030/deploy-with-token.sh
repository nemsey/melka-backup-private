#!/usr/bin/env bash
# ============================================================================
# PN-030 · دیپلوی Worker با API Token (به‌جای مرورگر OAuth)
# معادل دقیق melka-proxy/deploy.sh مالک — فقط مسیر env و احراز متفاوت است.
#
# ورودی: توکن در upload/.runtime/cloudflare-token.env (gitignored · 0600)
# مراحل:
#   ۰) اعتبارسنجی توکن (verify + کشف پنجرهٔ زمانی not_before)
#   ۱) کشف account_id (اگر بیش از یکی: خطا با راهنما)
#   ۲) نصب وابستگی wrangler در melka-proxy/
#   ۳) wrangler deploy (ساخت Worker)
#   ۴) نصب راز MELKA_PROXY_SECRET از env.platform.json → MELKA_PROXY_SECRET
#   ۵) استخراج نشانی workers.dev + ثبت در env.platform.json (MELK_ARM_PROXY_URL)
#   ۶) تست عبوری امضادار (scripts/pn030/proxy-live-test.sh)
# خروجی: گزارش مرحله‌به‌مرحله + شاهد download/pn030/deploy-token.json
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
TOKEN_FILE="upload/.runtime/cloudflare-token.env"
WRANGLER="melka-proxy/node_modules/.bin/wrangler"
OUT_JSON="download/pn030/deploy-token.json"

fail() { echo "✘ خطا: $1" >&2; exit 1; }

[ -f "$TOKEN_FILE" ] || fail "توکن یافت نشد — upload/.runtime/cloudflare-token.env"
# shellcheck disable=SC1090
source "$TOKEN_FILE"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "CLOUDFLARE_API_TOKEN خالی است"
export CLOUDFLARE_API_TOKEN
export WRANGLER_SEND_METRICS=false

echo "═══ melka-proxy · دیپلوی با توکن · $TS ═══"

# ─── ۰) اعتبارسنجی توکن ───
echo "— گام ۰: اعتبارسنجی توکن…"
VERIFY=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify)
STATUS=$(echo "$VERIFY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("status","unknown"))' 2>/dev/null || echo "parse-error")
NOT_BEFORE=$(echo "$VERIFY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("not_before",""))' 2>/dev/null || echo "")
EXPIRES=$(echo "$VERIFY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("expires_on",""))' 2>/dev/null || echo "")
echo "  توکن: status=$STATUS not_before=${NOT_BEFORE:-—} expires=${EXPIRES:-—}"
[ "$STATUS" = "active" ] || fail "توکن فعال نیست (status=$STATUS) — پاسخ کامل: $VERIFY"
NOW_EPOCH=$(date -u +%s)
NB_EPOCH=$(date -u -d "${NOT_BEFORE:-1970-01-01T00:00:00Z}" +%s 2>/dev/null || echo 0)
if [ "$NB_EPOCH" -gt "$NOW_EPOCH" ]; then
  fail "توکن معتبر اما هنوز فعال نشده — پنجرهٔ شروع: $NOT_BEFORE (آینده). در داشبورد کلودفلیر تاریخ شروع را به «الان» تغییر دهید."
fi

# ─── ۱) کشف حساب ───
echo "— گام ۱: کشف حساب کلودفلیر…"
ACCOUNTS_JSON=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts)
read -r ACCOUNT_ID ACCOUNT_NAME < <(echo "$ACCOUNTS_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
rs = d.get("result") or []
if not rs: print("EMPTY EMPTY"); raise SystemExit
if len(rs) > 1: print("MULTI EMPTY"); raise SystemExit
print(rs[0]["id"], rs[0]["name"].replace(" ", "_"))')
[ "$ACCOUNT_ID" != "EMPTY" ] || fail "توکن به هیچ حسابی دسترسی ندارد — دسترسی Account/Workers را در تنظیمات توکن بدهید."
[ "$ACCOUNT_ID" != "MULTI" ] || fail "توکن به چند حساب دسترسی دارد — account_id را مشخصی در فایل توکن بنویسید (نیازمند اصلاح اسکریپت)."
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
echo "  حساب: $ACCOUNT_NAME ($ACCOUNT_ID)"

# ─── ۲) wrangler ───
echo "— گام ۲: وارسی wrangler…"
[ -x "$WRANGLER" ] || (cd melka-proxy && bun install >/dev/null 2>&1)
[ -x "$WRANGLER" ] || fail "wrangler نصب نشد"
"$WRANGLER" --version | head -1

# ─── ۳) دیپلوی ───
echo "— گام ۳: دیپلوی Worker…"
(cd melka-proxy && "$PWD/node_modules/.bin/wrangler" deploy 2>&1 | tee /tmp/wrangler-deploy.log) || fail "دیپلوی شکست خورد — لاگ: /tmp/wrangler-deploy.log"
cat /tmp/wrangler-deploy.log | sed 's/^/  /'

# ─── ۴) نصب راز ───
echo "— گام ۴: نصب راز MELKA_PROXY_SECRET (از env.platform.json — هرگز چاپ نمی‌شود)…"
SECRET=$(python3 -c '
import json, sys, re
s = (json.load(open("env.platform.json")).get("MELK_PROXY_SECRET") or "").strip()
if not re.fullmatch(r"[0-9a-fA-F]{64}", s):
    sys.exit("خطا: MELK_PROXY_SECRET در env.platform.json باید ۶۴ هگز باشد")
print(s)')
printf '%s' "$SECRET" | (cd melka-proxy && "$PWD/node_modules/.bin/wrangler" secret put MELKA_PROXY_SECRET 2>&1 | tail -2 | sed 's/^/  /')

# ─── ۵) نشانی Worker + ثبت در env.platform.json ───
echo "— گام ۵: استخراج نشانی workers.dev…"
SUBDOMAIN=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/subdomain" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("subdomain",""))')
[ -n "$SUBDOMAIN" ] || fail "زیردامنهٔ workers.dev کشف نشد"
WORKER_URL="https://melka-proxy.$SUBDOMAIN.workers.dev"
echo "  نشانی Worker: $WORKER_URL"
python3 - "$WORKER_URL" <<'PYEOF'
import json, sys
url = sys.argv[1]
p = "env.platform.json"
d = json.load(open(p))
d["MELK_ARM_PROXY_URL"] = url
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print(f"  MELK_ARM_PROXY_URL ثبت شد در env.platform.json")
PYEOF

# ─── ۶) تست عبوری ───
echo "— گام ۶: تست زندهٔ عبوری (انتظار: 2xx/401/403/404 از ARM از طریق پروکسی)…"
bash scripts/pn030/proxy-live-test.sh || true

# پروب خام خود Worker (بدون احراز → انتظار 403 «missing auth headers»)
WORKER_PROBE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WORKER_URL" || echo "000")
echo "  پروب خام Worker: HTTP $WORKER_PROBE (انتظار: 403)"

cat > "$OUT_JSON" <<EOF
{
  "phase": "PN-030 · دیپلوی Worker با API Token",
  "deployedAt": "$TS",
  "workerUrl": "$WORKER_URL",
  "accountId": "$ACCOUNT_ID",
  "secretInstalled": "MELKA_PROXY_SECRET",
  "workerRawProbe": "$WORKER_PROBE",
  "note": "دیپلوی با توکن مالک (به‌جای OAuth مرورگر) — معادل مرحلهٔ ۲ سند شورا-ن۰۳۵"
}
EOF
echo ""
echo "═══ پایان دیپلوی — شاهد: $OUT_JSON ═══"
echo "گام بعدی (رویهٔ online-mode.json): برداشتن پرچم MELK_ARM_OFFLINE → ری‌استارت → OTP مالک"
