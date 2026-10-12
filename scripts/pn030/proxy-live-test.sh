#!/usr/bin/env bash
# ============================================================================
# PN-030 · مرحلهٔ ۴ — تست زنده (بدون OTP — فقط TCP/TLS/HTTP)
# سند: ملکا-شورا-ن۰۳۵-۱۴۰۵ · فهرست کارها #۵
#   الف) پروب مستقیم به سه میزبان API ملک تبریز — توثیق baseline بلاک
#   ب) کنترل‌های دیفرانسیل (خارجی + ایرانی) — سلامت مسیر خروج
#   پ) آمادگی Worker (سورس + راز + قفل ترتیب MELK_ARM_PROXY_URL)
#   ت) اگر MELK_ARM_PROXY_URL تنظیم شده باشد → تست عبوری از پروکسی
# خروجی: download/pn030/proxy-live-test.json
# صفر تلاش احراز هویت · صفر OTP · فقط خواندن
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT="download/pn030/proxy-live-test.json"
TS=$(date -u +%FT%TZ)
RAW="download/pn030/proxy-live-test-raw.txt"

HOSTS="arus-api.melketabriz.ir pm-api.melketabriz.ir gap-api.melketabriz.ir"
echo "=== PN-030 live-test $TS ===" | tee "$RAW"

probe_http() { # host → "code|ms"
  local h="$1"
  local out
  out=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 8 "https://$h/" 2>/dev/null || echo "000|-1")
  echo "$out"
}

echo "--- A) مستقیم: سه میزبان ملک تبریز ---" | tee -a "$RAW"
declare -A DIRECT_CODE=() DIRECT_MS=()
for h in $HOSTS; do
  r=$(probe_http "$h")
  DIRECT_CODE[$h]="${r%%|*}"; DIRECT_MS[$h]="${r##*|}"
  echo "DIRECT $h -> ${DIRECT_CODE[$h]} @ ${DIRECT_MS[$h]}s" | tee -a "$RAW"
done

echo "--- B) کنترل‌های دیفرانسیل ---" | tee -a "$RAW"
CTRL_GITHUB=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 8 https://github.com 2>/dev/null || echo "000|-1")
CTRL_DIVAR=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 8 https://api.divar.ir 2>/dev/null || echo "000|-1")
echo "CONTROL github -> $CTRL_GITHUB" | tee -a "$RAW"
echo "CONTROL divar  -> $CTRL_DIVAR" | tee -a "$RAW"

echo "--- P) آمادگی Worker ---" | tee -a "$RAW"
WORKER_SRC=$([ -f melka-proxy/src/index.ts ] && echo "present" || echo "missing")
WORKER_TOML=$([ -f melka-proxy/wrangler.toml ] && echo "present" || echo "missing")
DEPLOY_SH=$([ -x melka-proxy/deploy.sh ] && echo "present-executable" || echo "missing")
SECRET_HEX=$(python3 -c 'import json; s=(json.load(open("env.platform.json")).get("MELK_PROXY_SECRET") or "").strip(); print("ok64" if len(s)==64 else "invalid")' 2>/dev/null || echo "read-error")
PROXY_URL=$(python3 -c 'import json; print((json.load(open("env.platform.json")).get("MELK_ARM_PROXY_URL") or "").strip())' 2>/dev/null || echo "")
echo "worker src=$WORKER_SRC toml=$WORKER_TOML deploy=$DEPLOY_SH secret=$SECRET_HEX proxyUrl='$PROXY_URL'" | tee -a "$RAW"

# ─── ت) تست عبوری از پروکسی (اگر URL تنظیم شده) ───
PROXY_TEST="not-configured"
PROXY_CODE="-"
if [ -n "$PROXY_URL" ]; then
  echo "--- T) عبوری از پروکسی: $PROXY_URL ---" | tee -a "$RAW"
  # امضای HMAC همان قرارداد client (بدون بدنه، GET به مسیر ریشه)
  SECRET=$(python3 -c 'import json; print((json.load(open("env.platform.json")).get("MELK_PROXY_SECRET") or "").strip())')
  TSIG=$(python3 - "$SECRET" <<'PYEOF'
import hashlib, hmac, sys, time
secret, = sys.argv[1:]
ts = str(int(time.time() * 1000))
target = "https://arus-api.melketabriz.ir/"
path = "/"
body_digest = hashlib.sha256(b"").hexdigest()
msg = f"GET\n{path}\n{body_digest}\n{ts}"
print(ts + " " + hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest())
PYEOF
)
  T=$(echo "$TSIG" | cut -d' ' -f1); SIG=$(echo "$TSIG" | cut -d' ' -f2)
  r=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" --max-time 12 \
    -H "X-Melka-Target: $target" -H "X-Melka-Timestamp: $T" -H "X-Melka-Signature: $SIG" \
    "$PROXY_URL" 2>/dev/null || echo "000|-1")
  PROXY_CODE="${r%%|*}"
  PROXY_TEST="tested code=$PROXY_CODE ms=${r##*|}"
  echo "PROXY->ARM -> $r" | tee -a "$RAW"
fi

# ─── حکم مرحلهٔ ۵ (پرچم آفلینی) ───
# قفل ترتیب سند: برداشتن پرچم فقط پس از «۲۰۰ یا ۴۰۱/403/404 از ARM از طریق پروکسی»
FLAG_DECISION="KEEP (پرچم آفلینی پابرجا — دیپلوی Worker در انتظار ۱۵ ثانیه تأیید OAuth مالک)"
if [ "$PROXY_TEST" != "not-configured" ]; then
  case "$PROXY_CODE" in
    200|301|302|400|401|403|404|405) FLAG_DECISION="REMOVE-CANDIDATE (پاسخ از ARM از طریق پروکسی آمد: $PROXY_CODE — آمادهٔ برداشتن پرچم پس از تست تأییدی)" ;;
    *) FLAG_DECISION="KEEP (پاسخ غیرمنتظره از پروکسی: $PROXY_CODE — بررسی دستی قبل از برداشتن پرچم)" ;;
  esac
fi
echo "--- VERDICT: $FLAG_DECISION ---" | tee -a "$RAW"

cat > "$OUT" <<EOF
{
  "phase": "PN-030 · مرحلهٔ ۴ — تست زندهٔ بدون OTP (فهرست کارها #۵ سند شورا-ن۰۳۵)",
  "testedAt": "$TS",
  "direct": {
    "arus-api.melketabriz.ir": { "httpCode": "${DIRECT_CODE[arus-api.melketabriz.ir]}", "seconds": "${DIRECT_MS[arus-api.melketabriz.ir]}" },
    "pm-api.melketabriz.ir": { "httpCode": "${DIRECT_CODE[pm-api.melketabriz.ir]}", "seconds": "${DIRECT_MS[pm-api.melketabriz.ir]}" },
    "gap-api.melketabriz.ir": { "httpCode": "${DIRECT_CODE[gap-api.melketabriz.ir]}", "seconds": "${DIRECT_MS[gap-api.melketabriz.ir]}" }
  },
  "controls": {
    "github.com": { "httpCode": "${CTRL_GITHUB%%|*}", "seconds": "${CTRL_GITHUB##*|}" },
    "api.divar.ir": { "httpCode": "${CTRL_DIVAR%%|*}", "seconds": "${CTRL_DIVAR##*|}" }
  },
  "workerReadiness": {
    "source": "$WORKER_SRC",
    "wranglerToml": "$WORKER_TOML",
    "deployScript": "$DEPLOY_SH",
    "hmacSecretInEnvPlatform": "$SECRET_HEX",
    "proxyUrlConfigured": $([ -n "$PROXY_URL" ] && echo "true" || echo "false")
  },
  "proxyTest": {
    "status": "$PROXY_TEST",
    "code": "$PROXY_CODE",
    "note": "تست عبوری فقط پس از دیپلوی Worker (۱۵ ثانیه OAuth مالک) و ثبت MELK_ARM_PROXY_URL انجام می‌شود"
  },
  "offlineFlagDecision": "$FLAG_DECISION",
  "interpretation": {
    "directBlockedControlsAlive": "اگر مستقیمها 000/timeout و کنترلها پاسخگو باشند، ریشه=الف (بلاک ASN) همچنان پابرجاست — سازگار با تشخیص نهایی PN-029",
    "expectation": "پس از دیپلوی: پاسخ ۲۰۰/۴۰۱/403/404 از ARM از طریق پروکسی = مسیر باز → برداشتن پرچم → تست e2e با OTP مالک"
  }
}
EOF
echo "شاهد: $OUT"
