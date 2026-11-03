#!/usr/bin/env bash
# ============================================================================
# PN-030 · دیپلوی Worker — دو سبک احراز:
#   A) API Token (cfut_ / قدیمی): Authorization: Bearer + wrangler CLOUDFLARE_API_TOKEN
#   B) Global API Key (cfk_ — فرمت جدید): X-Auth-Key + X-Auth-Email + wrangler CLOUDFLARE_API_KEY/CLOUDFLARE_EMAIL
#
# فایل اعتبار: upload/.runtime/cloudflare-token.env (gitignored · 0600)
#   حالت A: CLOUDFLARE_API_TOKEN=<توکن>
#   حالت B: CLOUDFLARE_API_KEY=<کلید> + CLOUDFLARE_EMAIL=<ایمیل حساب>
#
# مراحل مشترک:
#   ۰) تشخیص سبک + اعتبارسنجی (A: /user/tokens/verify + پنجرهٔ زمانی · B: /accounts با هدرهای قدیمی)
#   ۱) کشف account_id
#   ۲) wrangler deploy
#   ۳) نصب راز MELKA_PROXY_SECRET
#   ۴) استخراج نشانی workers.dev + ثبت MELK_ARM_PROXY_URL در env.platform.json
#   ۵) تست عبوری امضادار (scripts/pn030/proxy-live-test.sh)
# شاهد: download/pn030/deploy-token.json
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
CRED_FILE="upload/.runtime/cloudflare-token.env"
WRANGLER="melka-proxy/node_modules/.bin/wrangler"
OUT_JSON="download/pn030/deploy-token.json"

fail() { echo "✘ خطا: $1" >&2; exit 1; }

[ -f "$CRED_FILE" ] || fail "فایل اعتبار یافت نشد — upload/.runtime/cloudflare-token.env"
# shellcheck disable=SC1090
source "$CRED_FILE"
export WRANGLER_SEND_METRICS=false

# ─── تشخیص سبک ───
AUTH_MODE=""
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  AUTH_MODE="bearer"
elif [ -n "${CLOUDFLARE_API_KEY:-}" ] && [ -n "${CLOUDFLARE_EMAIL:-}" ]; then
  AUTH_MODE="global-key"
else
  fail "اعتبار ناقص: یا CLOUDFLARE_API_TOKEN، یا CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL (ایمیل خالی است)"
fi
echo "═══ melka-proxy · دیپلوی ($AUTH_MODE) · $TS ═══"

# ─── ۰) اعتبارسنجی + کشف حساب ───
ACCOUNT_ID=""
ACCOUNT_NAME=""
if [ "$AUTH_MODE" = "bearer" ]; then
  export CLOUDFLARE_API_TOKEN
  unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL || true
  echo "— گام ۰: اعتبارسنجی توکن (Bearer)…"
  VERIFY=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify)
  STATUS=$(echo "$VERIFY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("status","unknown"))' 2>/dev/null || echo "parse-error")
  NOT_BEFORE=$(echo "$VERIFY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result",{}).get("not_before",""))' 2>/dev/null || echo "")
  echo "  توکن: status=$STATUS not_before=${NOT_BEFORE:--}"
  [ "$STATUS" = "active" ] || fail "توکن فعال نیست — پاسخ: $VERIFY"
  NOW_EPOCH=$(date -u +%s)
  NB_EPOCH=$(date -u -d "${NOT_BEFORE:-1970-01-01T00:00:00Z}" +%s 2>/dev/null || echo 0)
  [ "$NB_EPOCH" -le "$NOW_EPOCH" ] || fail "توکن هنوز فعال نشده (شروع: $NOT_BEFORE — در آینده)"
  ACCOUNTS_JSON=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts)
else
  export CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
  unset CLOUDFLARE_API_TOKEN || true
  echo "— گام ۰: اعتبارسنجی کلید سراسری (X-Auth-Key + $CLOUDFLARE_EMAIL)…"
  ACCOUNTS_JSON=$(curl -s --max-time 15 -H "X-Auth-Key: $CLOUDFLARE_API_KEY" -H "X-Auth-Email: $CLOUDFLARE_EMAIL" https://api.cloudflare.com/client/v4/accounts)
fi

read -r ACCOUNT_ID ACCOUNT_NAME < <(echo "$ACCOUNTS_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("success"): print("AUTHFAIL", "AUTHFAIL"); raise SystemExit
rs = d.get("result") or []
if not rs: print("EMPTY", "EMPTY"); raise SystemExit
if len(rs) > 1: print("MULTI", "MULTI"); raise SystemExit
print(rs[0]["id"], rs[0]["name"].replace(" ", "_"))')
[ "$ACCOUNT_ID" != "AUTHFAIL" ] || fail "احراز رد شد — $(echo "$ACCOUNTS_JSON" | head -c 300)"
[ "$ACCOUNT_ID" != "EMPTY" ] || fail "هیچ حسابی یافت نشد"
[ "$ACCOUNT_ID" != "MULTI" ] || fail "چند حساب — نیاز به تعیین account_id"
echo "  حساب: $ACCOUNT_NAME ($ACCOUNT_ID)"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

# ─── ۱) wrangler ───
echo "— گام ۱: وارسی wrangler…"
[ -x "$WRANGLER" ] || (cd melka-proxy && bun install >/dev/null 2>&1)
[ -x "$WRANGLER" ] || fail "wrangler نصب نشد"
echo "  $("$WRANGLER" --version 2>/dev/null | head -1)"

# ─── ۲) دیپلوی ───
echo "— گام ۲: دیپلوی Worker…"
(cd melka-proxy && ./node_modules/.bin/wrangler deploy 2>&1 | tee /tmp/wrangler-deploy.log) || fail "دیپلوی شکست خورد — /tmp/wrangler-deploy.log"
grep -E "Uploaded|Deployed|workers.dev" /tmp/wrangler-deploy.log | sed 's/^/  /'

# ─── ۳) نصب راز ───
echo "— گام ۳: نصب راز MELKA_PROXY_SECRET (هرگز چاپ نمی‌شود)…"
SECRET=$(python3 -c '
import json, sys, re
s = (json.load(open("env.platform.json")).get("MELK_PROXY_SECRET") or "").strip()
if not re.fullmatch(r"[0-9a-fA-F]{64}", s): sys.exit("راز ۶۴ هگز نیست")
print(s)')
printf '%s' "$SECRET" | (cd melka-proxy && ./node_modules/.bin/wrangler secret put MELKA_PROXY_SECRET 2>&1 | tail -2 | sed 's/^/  /')

# ─── ۴) نشانی Worker + ثبت ───
echo "— گام ۴: نشانی workers.dev…"
if [ "$AUTH_MODE" = "bearer" ]; then
  SUBDOMAIN=$(curl -s --max-time 15 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("subdomain",""))')
else
  SUBDOMAIN=$(curl -s --max-time 15 -H "X-Auth-Key: $CLOUDFLARE_API_KEY" -H "X-Auth-Email: $CLOUDFLARE_EMAIL" "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("subdomain",""))')
fi
[ -n "$SUBDOMAIN" ] || fail "زیردامنه کشف نشد"
WORKER_URL="https://melka-proxy.$SUBDOMAIN.workers.dev"
echo "  Worker: $WORKER_URL"
python3 - "$WORKER_URL" <<'PYEOF'
import json, sys
d = json.load(open("env.platform.json"))
d["MELK_ARM_PROXY_URL"] = sys.argv[1]
json.dump(d, open("env.platform.json", "w"), ensure_ascii=False, indent=2)
print("  ثبت شد در env.platform.json")
PYEOF

# ─── ۵) تست عبوری ───
echo "— گام ۵: تست زندهٔ عبوری…"
bash scripts/pn030/proxy-live-test.sh || true
WORKER_PROBE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$WORKER_URL" || echo "000")
echo "  پروب خام Worker: HTTP $WORKER_PROBE (انتظار: 403)"

cat > "$OUT_JSON" <<EOF
{
  "phase": "PN-030 · دیپلوی Worker",
  "deployedAt": "$TS",
  "authMode": "$AUTH_MODE",
  "workerUrl": "$WORKER_URL",
  "accountId": "$ACCOUNT_ID",
  "secretInstalled": "MELKA_PROXY_SECRET",
  "workerRawProbe": "$WORKER_PROBE"
}
EOF
echo ""
echo "═══ پایان دیپلوی — شاهد: $OUT_JSON ═══"
echo "گام بعد (online-mode.json): برداشتن MELK_ARM_OFFLINE → ری‌استارت → OTP مالک"
