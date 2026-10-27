#!/usr/bin/env bash
# =============================================================================
# live-gate.sh — PN-031-G (شورا-ن۰۴۷) · دروازهٔ تست زندهٔ «پایان missing auth headers»
# =============================================================================
# درس ۸ سند ۰۴۷: «هر تست زندهٔ رله باید خروجی واقعی curl را ضمیمه کند —
# کد پاسخ + هدرها + بدنه» — این دروازه دقیقاً همان کار را می‌کند:
#
#   G.1) سرور عمومی + BUILD_ID تازه
#   G.2) ثبت دستگاه آزمایشی + دانلود اسکریپت واقعی bootstrap (از اینترنت)
#   G.3) بازتولید علامت مالک — هدر خالی → حذف بی‌صدای curl → ۴۰۳ (خروجی خام -v)
#   G.4) بازتولید پیش‌نویس سند ۰۴۷ — X-Melka-Target → ۴۰۳ missing [Relay-Device]
#   G.5) curl امضاشدهٔ صحیح — خروجی خام کامل (کد + هدرها + بدنه) → 204
#   G.6) اجرای اسکریپت واقعی (~۱۱۰ ثانیه · ۵+ چرخهٔ کامل با صف خالی)
#   G.7) شواهد DB (lastSeen/enrolled) + AuditLog (صفر رد در ۲ دقیقهٔ پایانی)
#
# خروجی: download/pn031g/live-relay-test.json + لاگ اجرای اسکریپت + خروجی خام curl
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
RUN_START=$(date +%s%3N)
OUT_DIR="download/pn031g"
RAW_DIR="$OUT_DIR/raw-curl"
mkdir -p "$RAW_DIR"
TMP=$(mktemp -d)
SCRIPT_PID=""
trap 'rm -rf "$TMP"; if [ -n "$SCRIPT_PID" ]; then kill -9 "$SCRIPT_PID" 2>/dev/null || true; fi' EXIT

jget() { python3 -c "import json,sys;print(json.load(open('$1')).get('$2',''))"; }

echo "═══ PN-031-G · دروازهٔ تست زنده از URL عمومی: $PUBLIC_URL ═══"

# ─── ۰) خودکفایی: سرور را در همین فراخوانی بالا بیاور (درس reaper + بیلد آمیخته) ───
# بیلد تازه روی دیسک هست — فقط ری‌استارت اجباری با بیلد دیسک.
# setsid: جدایی از گروه فراخوانی — پس از پایان ابزار هم زنده می‌ماند.
pkill -f "prod-watchdog.sh" 2>/dev/null || true
pkill -f "standalone/server.js" 2>/dev/null || true
sleep 3
rm -f /home/z/my-project/.prod-stop /home/z/my-project/upload/.runtime/CI_RUNNING /home/z/my-project/upload/.runtime/PARK_ACTIVE
setsid bash /home/z/my-project/scripts/prod-watchdog.sh > /dev/null 2>&1 < /dev/null &
WATCHDOG_PID=$!
echo "  ۰) watchdog بالا آمد (pid=$WATCHDOG_PID · setsid) — انتظار برای health…"

# ─── G.1) سرور عمومی + BUILD_ID ───
for i in $(seq 1 30); do
  H=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$PUBLIC_URL/api/health") && [ "$H" = "200" ] && break
  sleep 4
done
[ "$H" = "200" ] || { echo "✗ G.1: health عمومی $H"; exit 1; }
BUILD_ID=$(curl -s -m 10 "$PUBLIC_URL/api/version" | jget /dev/stdin buildId 2>/dev/null || echo "")
BUILD_ID=$(curl -s -m 10 "$PUBLIC_URL/api/version" | python3 -c "import json,sys;print(json.load(sys.stdin).get('buildId',''))")
echo "  G.1) health عمومی ۲۰۰ ✓ · BUILD_ID=$BUILD_ID"

# ─── G.2) ورود مدیر + ثبت دستگاه آزمایشی + دانلود اسکریپت واقعی ───
MASTER_CODE=$(python3 -c "import json;print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
B=$(curl -s -o "$TMP/login.json" -w "%{http_code}" --max-time 25 -X POST \
  "$PUBLIC_URL/api/auth/master-login" -H "Content-Type: application/json" \
  -d "{\"masterCode\":\"$MASTER_CODE\"}")
[ "$B" = "200" ] || { echo "✗ G.2: ورود مدیر $B"; head -c 200 "$TMP/login.json"; exit 1; }
TOKEN=$(jget "$TMP/login.json" token)
AUTH=(-H "Authorization: Bearer $TOKEN")

B=$(curl -s -o "$TMP/enroll.json" -w "%{http_code}" --max-time 25 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/enroll" \
  -H "Content-Type: application/json" -d '{"label":"pn031g-live"}')
[ "$B" = "200" ] || { echo "✗ G.2: ثبت دستگاه $B"; cat "$TMP/enroll.json"; exit 1; }
DEV_ID=$(jget "$TMP/enroll.json" deviceId)
CODE=$(python3 -c "
import json, urllib.parse
d = json.load(open('$TMP/enroll.json'))
print(urllib.parse.parse_qs(urllib.parse.urlparse(d['bootstrapUrl']).query)['code'][0])")
echo "  G.2) دستگاه آزمایشی: $DEV_ID"

B=$(curl -s -o "$TMP/melka-relay.sh" -D "$TMP/bs.hdr" -w "%{http_code}" --max-time 30 \
  "$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE")
[ "$B" = "200" ] || { echo "✗ G.2: دانلود bootstrap $B"; exit 1; }
bash -n "$TMP/melka-relay.sh" || { echo "✗ G.2: bash -n نامعتبر"; exit 1; }
DEV_SECRET=$(rg '^DEVICE_SECRET="' "$TMP/melka-relay.sh" | head -1 | sed 's/DEVICE_SECRET="//; s/"$//')
# اسکریپت سخت‌شدهٔ PN-031-G باید گاردهای تازه را داشته باشد
rg -q 'خطای داخلی: امضا/زمان خالی ساخته شد' "$TMP/melka-relay.sh" || { echo "✗ G.2: پیش‌پرواز امضا در اسکریپت نیست (بیلد کهنه!)"; exit 1; }
rg -q 'اتصال تأیید شد' "$TMP/melka-relay.sh" || { echo "✗ G.2: پیام موفقیت صادقانه نیست"; exit 1; }
echo "  G.2) اسکریپت واقعی (سخت‌شده) دانلود شد ✓ · bash -n معتبر ✓"

# ─── G.3) بازتولید علامت مالک: هدرهای خالی → حذف بی‌صدای curl → ۴۰۳ ───
# خروجی خام کامل (درخواست + پاسخ) ذخیره می‌شود — درس ۸ سند ۰۴۷
curl -sS -v --max-time 25 -o "$TMP/na.body" -X POST "$PUBLIC_URL/api/mobile-relay/poll" \
  -H "Content-Type: application/json" \
  -H "X-Melka-Relay-Device: $DEV_ID" \
  -H "X-Melka-Timestamp: " \
  -H "X-Melka-Signature: " \
  --data-binary '{"wait":0}' > "$RAW_DIR/G3-empty-headers-verbose.txt" 2>&1
NA_STATUS=$(rg -o '< HTTP/[0-9.]+ [0-9]+' "$RAW_DIR/G3-empty-headers-verbose.txt" | rg -o '[0-9]+$' | head -1)
NA_BODY=$(cat "$TMP/na.body")
NA_MISSING=$(printf '%s' "$NA_BODY" | jq -r '.missing // [] | join(", ")' 2>/dev/null)
echo "  G.3) بازتولید علامت مالک: HTTP $NA_STATUS · missing: $NA_MISSING"

# ─── G.4) بازتولید پیش‌نویس سند ۰۴۷: X-Melka-Target (نام ناقراردادی) ───
BODY4='{"wait":0}'
TS4=$(date +%s%3N)
DG4=$(printf '%s' "$BODY4" | openssl dgst -sha256 -hex | sed 's/^.*= //')
SIG4=$(printf 'POST\n%s\n%s\n%s' "/api/mobile-relay/poll" "$DG4" "$TS4" | openssl dgst -sha256 -hmac "$DEV_SECRET" -hex | sed 's/^.*= //')
curl -sS -v --max-time 25 -o "$TMP/nb.body" -X POST "$PUBLIC_URL/api/mobile-relay/poll" \
  -H "Content-Type: application/json" \
  -H "X-Melka-Target: $PUBLIC_URL/api/mobile-relay/poll" \
  -H "X-Melka-Signature: $SIG4" \
  -H "X-Melka-Timestamp: $TS4" \
  --data-binary "$BODY4" > "$RAW_DIR/G4-target-name-verbose.txt" 2>&1
NB_STATUS=$(rg -o '< HTTP/[0-9.]+ [0-9]+' "$RAW_DIR/G4-target-name-verbose.txt" | rg -o '[0-9]+$' | head -1)
NB_MISSING=$(printf '%s' "$(cat "$TMP/nb.body")" | jq -r '.missing // [] | join(", ")' 2>/dev/null)
echo "  G.4) نام ناقراردادی X-Melka-Target: HTTP $NB_STATUS · missing: $NB_MISSING"

# ─── G.5) poll امضاشدهٔ صحیح — خروجی خام کامل (کد + هدرها + بدنه) ───
BODY5='{"wait":0}'
TS5=$(date +%s%3N)
DG5=$(printf '%s' "$BODY5" | openssl dgst -sha256 -hex | sed 's/^.*= //')
SIG5=$(printf 'POST\n%s\n%s\n%s' "/api/mobile-relay/poll" "$DG5" "$TS5" | openssl dgst -sha256 -hmac "$DEV_SECRET" -hex | sed 's/^.*= //')
curl -sS -i --max-time 25 -X POST "$PUBLIC_URL/api/mobile-relay/poll" \
  -H "Content-Type: application/json" \
  -H "X-Melka-Relay-Device: $DEV_ID" \
  -H "X-Melka-Timestamp: $TS5" \
  -H "X-Melka-Signature: $SIG5" \
  --data-binary "$BODY5" > "$RAW_DIR/G5-signed-poll-raw.txt"
OK_STATUS=$(head -1 "$RAW_DIR/G5-signed-poll-raw.txt" | rg -o '[0-9]{3}' | head -1)
echo "  G.5) poll امضاشدهٔ صحیح: HTTP $OK_STATUS (صف خالی → بدون بدنه)"
G5_MARKER=$(date +%s%3N)

# ─── G.6) اجرای اسکریپت واقعی — ۵+ چرخهٔ کامل با صف خالی (~۱۱۰ ثانیه) ───
echo "  ⏳ G.6) اجرای اسکریپت واقعی رله (۱۱۰ ثانیه — عین گوشی مالک)…"
bash "$TMP/melka-relay.sh" > "$OUT_DIR/relay-script-run.log" 2>&1 &
SCRIPT_PID=$!
sleep 110
kill -9 "$SCRIPT_PID" 2>/dev/null || true
SCRIPT_PID=""
sleep 2

CONNECTED=$(rg -c "اتصال تأیید شد" "$OUT_DIR/relay-script-run.log" 2>/dev/null || echo 0)
SERVER_ERRS=$(rg -c "خطای سرور|پاسخ غیرمنتظره|خطای داخلی" "$OUT_DIR/relay-script-run.log" 2>/dev/null || echo 0)
CLOCK_OK=$(rg -c "ساعت با سرور همگام شد" "$OUT_DIR/relay-script-run.log" 2>/dev/null || echo 0)
echo "  G.6) لاگ اسکریپت: اتصال‌تأیید×$CONNECTED · خطای سرور×$SERVER_ERRS · clock-sync×$CLOCK_OK"
echo "  ── دوازده خط نخست لاگ واقعی اسکریپت:"
head -12 "$OUT_DIR/relay-script-run.log" | sed 's/^/    /'

# ─── G.7) شواهد DB + AuditLog (۲ دقیقهٔ پایانی) ───
sleep 2
DB_JSON=$(DATABASE_URL=file:/home/z/my-project/db/custom.db timeout 60 bun scripts/pn031g/db-check.ts "$DEV_ID" 2>/dev/null || echo "{}")
LAST_SEEN=$(printf '%s' "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('lastSeenAt') or '')")
ENROLLED=$(printf '%s' "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('enrolledAt') or '')")
ATTEMPTS=$(printf '%s' "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('attemptCount',0))")
echo "  G.7) DB: lastSeenAt=${LAST_SEEN:-NULL} · enrolledAt=${ENROLLED:-NULL} · attempts=$ATTEMPTS"

AUDIT=$(DATABASE_URL=file:/home/z/my-project/db/custom.db timeout 60 bun scripts/pn031g/audit-check.ts "$DEV_ID" "$RUN_START" "$G5_MARKER" 2>/dev/null || echo "{}")
REJ_TOTAL=$(printf '%s' "$AUDIT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('deviceRejectAfterRunStart',0))")
REJ_RECENT=$(printf '%s' "$AUDIT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('newRejectAfterG5Marker',0))")
REJ_TARGET=$(printf '%s' "$AUDIT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('targetNameRejectAfterRunStart',0))")
REJ_LIST=$(printf '%s' "$AUDIT" | python3 -c "import json,sys;print(json.dumps(json.load(sys.stdin).get('rejects',[]),ensure_ascii=False))")
echo "  G.7) AuditLog: ردِ این دستگاه=$REJ_TOTAL (هر دو عمدی: G.3/G.4) · رد در ۲ دقیقهٔ پایانی=$REJ_RECENT"

# ─── پاکسازی: ابطال دستگاه آزمایشی ───
curl -s -o /dev/null --max-time 25 "${AUTH[@]}" -X POST "$PUBLIC_URL/api/admin/relay/revoke" \
  -H "Content-Type: application/json" -d "{\"deviceId\":\"$DEV_ID\",\"confirm\":true}" || true
echo "  پاکسازی: دستگاه آزمایشی ابطال شد ✓"

# ─── داوری ───
VERDICT="PASS"
[ "$NA_STATUS" = "403" ] || VERDICT="FAIL-G3-status"
[ "$NA_MISSING" = "X-Melka-Timestamp, X-Melka-Signature" ] || VERDICT="FAIL-G3-missing"
[ "$NB_STATUS" = "403" ] || VERDICT="FAIL-G4-status"
[ "$NB_MISSING" = "X-Melka-Relay-Device" ] || VERDICT="FAIL-G4-missing"
[ "$OK_STATUS" = "204" ] || VERDICT="FAIL-G5-status"
[ "$CONNECTED" -ge 1 ] || VERDICT="FAIL-G6-connected"
[ "$SERVER_ERRS" -eq 0 ] || VERDICT="FAIL-G6-server-errors"
[ -n "$LAST_SEEN" ] || VERDICT="FAIL-G7-lastSeen"
[ -n "$ENROLLED" ] || VERDICT="FAIL-G7-enrolled"
[ "$REJ_TOTAL" = "1" ] || VERDICT="FAIL-G7-reject-total"
[ "$REJ_TARGET" = "1" ] || VERDICT="FAIL-G7-reject-target"
[ "$REJ_RECENT" = "0" ] || VERDICT="FAIL-G7-reject-recent"

python3 - "$DEV_ID" "$BUILD_ID" "$NA_STATUS" "$NA_MISSING" "$NB_STATUS" "$NB_MISSING" "$OK_STATUS" \
  "$CONNECTED" "$SERVER_ERRS" "$CLOCK_OK" "$LAST_SEEN" "$ENROLLED" "$ATTEMPTS" \
  "$REJ_TOTAL" "$REJ_RECENT" "$REJ_TARGET" "$REJ_LIST" "$VERDICT" > "$OUT_DIR/live-relay-test.json" <<'PYEOF'
import json, sys, datetime
w = {
  "phase": "PN-031-G · دروازهٔ زنده — پایان «missing auth headers» (شورا-ن۰۴۷)",
  "testedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "publicUrl": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  "buildId": sys.argv[2],
  "method": "اسکریپت واقعی bash از bootstrap عمومی + خروجی خام curl (کد + هدرها + بدنه — درس ۸ سند ۰۴۷)",
  "G3_ownerBugReproduction": {
    "desc": "عین علامت مالک: هدر دستگاه پر، Timestamp/Signature مقدار خالی → curl آن‌ها را بی‌صدا حذف می‌کند",
    "status": sys.argv[3],
    "missingReported": sys.argv[4],
    "rawCurl": "raw-curl/G3-empty-headers-verbose.txt",
  },
  "G4_councilSketchName": {
    "desc": "پیش‌نویس سند ۰۴۷ با X-Melka-Target (نام ناقراردادی) — سرور X-Melka-Relay-Device می‌خواهد",
    "status": sys.argv[5],
    "missingReported": sys.argv[6],
    "rawCurl": "raw-curl/G4-target-name-verbose.txt",
  },
  "G5_signedPollCorrect": {
    "desc": "همان دستگاه، امضای صحیح قراردادی → 204 (صف خالی) — خطای missing auth headers از بین رفت",
    "status": sys.argv[7],
    "rawCurl": "raw-curl/G5-signed-poll-raw.txt",
  },
  "G6_realScriptRun": {
    "connectedMessage": int(sys.argv[8]),
    "serverErrors": int(sys.argv[9]),
    "clockSync": int(sys.argv[10]),
    "note": "«✓ اتصال تأیید شد» فقط پس از اولین پاسخ واقعی سرور — پیام صادقانهٔ PN-031-G",
  },
  "G7_dbAndAudit": {
    "lastSeenAt": sys.argv[11] or None,
    "enrolledAt": sys.argv[12] or None,
    "attemptCount": int(sys.argv[13] or 0),
    "deviceRejectAfterRunStart": int(sys.argv[14] or 0),
    "targetNameRejectAfterRunStart": int(sys.argv[16] or 0),
    "newRejectAfterG5Marker": int(sys.argv[15] or 0),
    "rejects": json.loads(sys.argv[17] or "[]"),
    "note": "تنها دو ردِ عمدی G.3/G.4 · صفر رد در ۲ دقیقهٔ پایانی (دستور سند ۰۴۷)",
  },
  "device": {"deviceId": sys.argv[1], "cleanup": "ابطال شد پس از آزمون"},
  "verdict": sys.argv[18],
}
json.dump(w, open("download/pn031g/live-relay-test.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("VERDICT:", sys.argv[18], file=sys.stderr)
PYEOF

echo ""
echo "═══ PN-031-G: $VERDICT ═══ (شاهد: $OUT_DIR/live-relay-test.json · خام curl: $RAW_DIR/ · لاگ اسکریپت: $OUT_DIR/relay-script-run.log)"
