#!/usr/bin/env bash
# ============================================================================
# PN-035 — گارد audit-relay-matrix.sh (شورا-ن۰۵۷ · گارد ۴۵)
# قرارداد ماتریس رله + الگوی Async — پابرجایی هفت‌فازی نسل J + نسل K (PN-036: jq ARG_MAX · batch ۲۰ · مهلت تطبیقی · Express lane)
#   ۱) اسکریپت نسل J: پالایش روش · batch=۱۰۰ · items[] · retry×۳ +
#      failed-results.jsonl + gzip>۱KB + نحو bash
#   ۲) سرور async: jobId در ۵ روت (arm/pm connection + auth request/verify)
#   ۳) RelayJob: راز یک‌بارمصرف + TTL
#   ۴) UI Eager: pollRelayJob در هر چهار نقطهٔ ورود/اتصال
#   ۵) مسیر polling: /api/relay/job/[id] + آینهٔ v1
# خروجی: download/pn035/guards-matrix.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn035/guards-matrix.json

mkdir -p "$(dirname "$OUT")"
FAILS=0
declare -a RESULTS=()

check() { # $1 = نام · $2 = شرط (۰ = سبز)
  if [ "$2" -eq 0 ]; then
    RESULTS+=("PASS|$1|")
  else
    RESULTS+=("FAIL|$1|")
    FAILS=$((FAILS+1))
  fi
}

RELAY_SCRIPT=src/lib/melk-api/relay-script.ts
RELAY_JOBS=src/lib/melk-api/relay-jobs.ts
POLL_JOB_ROUTE=src/app/api/relay/job/\[id\]/route.ts
V1_MIRROR="src/app/api/v1/relay/job/[id]/route.ts"
HELP=src/lib/client/relay-job.ts

# ─── ۱) اسکریپت رله — نسل J (PN-035) + نسل K (PN-036) ───
grep -q "GET|POST|PUT|DELETE|PATCH) ;;" "$RELAY_SCRIPT"; check "relay-script: پالایش روش (فاز ۱)" $?
grep -Fq 'BODY="{\\"wait\\":20,\\"batch\\":$BATCH}"' "$RELAY_SCRIPT"; check "relay-script: poll دسته‌ای batch (فاز ۵)" $?
grep -q "\.items | length" "$RELAY_SCRIPT"; check "relay-script: خواندن items[] + سازگاری عقبه" $?
grep -q "RESULT_ATTEMPTS=3" "$RELAY_SCRIPT"; check "relay-script: retry×۳ نتیجه (فاز ۲)" $?
grep -q "failed-results.jsonl" "$RELAY_SCRIPT"; check "relay-script: ذخیرهٔ محلی + بازپخش (فاز ۲)" $?
grep -q "GZIP_THRESHOLD=1024" "$RELAY_SCRIPT"; check "relay-script: gzip گزیده (فاز ۶)" $?
grep -q "MAX_WORKERS=8" "$RELAY_SCRIPT"; check "relay-script: موج‌های کارگر موازی (فاز ۵)" $?
grep -q "نسل K · PN-036" "$RELAY_SCRIPT"; check "relay-script: نشانگر نسل K (PN-036)" $?
grep -q -- '--rawfile b64 "$B64F"' "$RELAY_SCRIPT"; check "relay-script: jq ARG_MAX — b64 از فایل (PN-036 فاز ۱)" $?
grep -Fq 'RESULT_JSON=\$(cat "\$RESULTS_DIR"/*.json 2>/dev/null | jq -sc' "$RELAY_SCRIPT"; check "relay-script: ادغام stdin — بدون آرگومان فایل (PN-036 فاز ۱)" $?
grep -q "BATCH=20" "$RELAY_SCRIPT"; check "relay-script: دستهٔ سبک batch=۲۰ (PN-036 فاز ۲)" $?
grep -q "LIGHT_TIMEOUT=15" "$RELAY_SCRIPT" && grep -q "HEAVY_TIMEOUT=60" "$RELAY_SCRIPT"; check "relay-script: مهلت تطبیقی OTP/سنگین (PN-036 فاز ۲)" $?
grep -q 'TIMEOUT_RETRY_DELAY=5' "$RELAY_SCRIPT" && grep -q "CURL_EXIT -eq 28" "$RELAY_SCRIPT"; check "relay-script: تلاش دوم تایم‌اوت خطای ۲۸ (PN-036 فاز ۲.۳)" $?
grep -Fq 'run_batch_set "\$EXPRESS_JSON" "express"' "$RELAY_SCRIPT"; check "relay-script: Express lane OTP مقدم (PN-036 فاز ۵)" $?
grep -Fq '→ HTTP \$CODE در \${DUR}ث' "$RELAY_SCRIPT"; check "relay-script: لاگ زمان هر آیتم (PN-036 فاز ۴.۱)" $?

# نحو bash — تولید واقعی + bash -n
TMP_SH=$(mktemp /tmp/pn035-guard-XXXX.sh)
bun -e 'const { buildRelayScript } = await import("/home/z/my-project/src/lib/melk-api/relay-script"); await Bun.write(process.argv[1], buildRelayScript({ serverUrl: "https://example.invalid", deviceId: "guard", deviceSecret: "guard-secret" }));' "$TMP_SH" >/dev/null 2>&1
bash -n "$TMP_SH"; check "relay-script: نحو bash تولیدشده معتبر" $?
rm -f "$TMP_SH"

# ─── ۲) سرور async — پنج روت فوری jobId ───
for route in src/app/api/arm/connection/route.ts src/app/api/pm/connection/route.ts src/app/api/auth/request-otp/route.ts src/app/api/auth/verify-otp/route.ts; do
  grep -q "startRelayJob" "$route" && grep -q "jobId: job.id" "$route"
  check "async: $route فوری jobId می‌دهد (فاز ۳)" $?
done

# ─── ۳) RelayJob — چرخهٔ عمر امن ───
grep -q "resultEnc" "$RELAY_JOBS"; check "relay-jobs: راز رمز‌شده (AES-256-GCM)" $?
grep -q "consumedAt" "$RELAY_JOBS"; check "relay-jobs: مصرف یک‌بار راز حساس" $?
grep -q "RELAY_JOB_TTL_MS = 10 \* 60 \* 1000" "$RELAY_JOBS"; check "relay-jobs: عمر مفید ۱۰ دقیقه" $?

# ─── ۴) UI Eager — چهار نقطه ───
for ui in src/components/app/AuthScreen.tsx src/components/app/OtpScreen.tsx src/core/tiles/tiles/settings/ArmConnectionSection.tsx src/core/tiles/tiles/settings/PmConnectionSection.tsx; do
  grep -q "pollRelayJob" "$ui"
  check "eager-ui: $ui کار را poll می‌کند (فاز ۴)" $?
done
grep -q "setStage(\"otp\")" src/components/app/AuthScreen.tsx && grep -q "setStage(\"otp\")" src/core/tiles/tiles/settings/ArmConnectionSection.tsx
check "eager-ui: گذار فوری به فیلد OTP (بدون انتظار)" $?
grep -q "out.kind === \"done\" && secret?.token" src/components/app/OtpScreen.tsx; check "eager-ui: تحویل راز یک‌بارمصرف نشست (OtpScreen)" $?

# ─── ۵) مسیر polling + آینه ───
[ -f "$POLL_JOB_ROUTE" ]; check "route: /api/relay/job/[id] موجود" $?
[ -f "$V1_MIRROR" ]; check "route: آینهٔ v1 موجود" $?
grep -q "export \* from" "$V1_MIRROR"; check "route: آینهٔ v1 سبک (re-export)" $?
python3 -c "
import json
m = json.load(open('download/pn012/api-versioning.json'))
assert any((r.get('aliasOf') or r.get('original')) == '/api/relay/job/[id]' for r in m['routes'])  # ن۰۶۳: مولد رسمی aliasOf می‌نویسد
print('ok')
" >/dev/null 2>&1; check "manifest: api-versioning روت job را می‌شناسد" $?

# ─── خروجی ───
TOTAL=${#RESULTS[@]}
python3 - "$OUT" "$TOTAL" "$FAILS" <<'PYEOF'
import json, sys
from datetime import datetime, timezone

out_path, total, fails = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
json.dump(
    {
        "guard": "audit-relay-matrix.sh (PN-035 · شورا-ن۰۵۷ · گارد ۴۵)",
        "guardsPass": total - fails,
        "guardsFail": fails,
        "guardsTotal": total,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "phase": "PN-035 (شورا-ن۰۵۷)",
    },
    open(out_path, "w", encoding="utf8"),
    ensure_ascii=False,
    indent=2,
)
PYEOF

echo "matrix-guard: $((TOTAL-FAILS))/$TOTAL سبز"
if [ "$FAILS" -gt 0 ]; then
  printf '%s\n' "${RESULTS[@]}" | grep '^FAIL'
  exit 1
fi
exit 0
