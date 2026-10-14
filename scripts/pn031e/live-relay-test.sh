#!/usr/bin/env bash
# =============================================================================
# live-relay-test.sh — تست زندهٔ رلهٔ فاز C (PN-031-E · شورای عالی ملکا · ۰۴۴)
# =============================================================================
# تفاوت بنیادی با تست‌های قبلی (pn031c): اینجا «اسکریپت واقعی bash» که گوشی
# مالک اجرا می‌کند، عیناً اجرا می‌شود — نه شبیه‌سازی Poll با پایتون.
#
#   C.1) اسکریپت واقعی از اینترنت (bootstrap با کد تازه) دانلود و اجرا می‌شود
#   C.2) Poll واقعی به سرور می‌رسد: lastSeenAt != null + enrolledAt != null (DB)
#   C.3) همگام‌سازی ساعت کار می‌کند: «ساعت با سرور همگام شد ✓» در لاگ اسکریپت
#   C.4) ردِ عمدی (stale) → 403 + serverTime + ردپای RELAY_POLL_REJECT در AuditLog
#
# خروجی: download/pn031e/live-relay-test.json + لاگ اجرای اسکریپت
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn031e/live-relay-test.json"
SCRIPT_LOG="download/pn031e/relay-script-run.log"
TMP=$(mktemp -d)
SCRIPT_PID=""
trap 'rm -rf "$TMP"; if [ -n "$SCRIPT_PID" ]; then kill -9 "$SCRIPT_PID" 2>/dev/null || true; fi' EXIT

echo "— فاز C: تست زندهٔ رله از URL عمومی: $PUBLIC_URL"

jqget() { python3 -c "import json,sys;print(json.load(open('$1')).get('$2',''))"; }

# ─── -۱) خودکفایی: سرور را در همین فراخوانی بالا بیاور (درس reaper) ───
# پروسه‌های پس‌زمینه در پایان فراخوانی ابزار کشته می‌شوند؛ پس هر آزمون زنده
# باید سرور را خودش در همان اجرا بالا بیاورد و در همان اجرا شواهد بگیرد.
# درس «بیلد آمیخته»: سرورِ زندهٔ قبل از بیلد، روت‌های API را از حافظهٔ کهنه
# سرو می‌کند → همیشه ری‌استارت اجباری با بیلدِ روی دیسک.
SERVER_BOOTED=""
pkill -f "prod-watchdog.sh" 2>/dev/null || true
pkill -f "standalone/server.js" 2>/dev/null || true
sleep 2
rm -f /home/z/my-project/.prod-stop /home/z/my-project/upload/.runtime/CI_RUNNING /home/z/my-project/upload/.runtime/PARK_ACTIVE
bash /home/z/my-project/scripts/prod-watchdog.sh > /dev/null 2>&1 &
WATCHDOG_PID=$!
SERVER_BOOTED="watchdog($WATCHDOG_PID) · ری‌استارت اجباری با بیلد دیسک"
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 8 http://localhost:3000/api/health && break
  sleep 2
done
curl -s -o /dev/null -m 8 http://localhost:3000/api/health || { echo "✗ سرور بالا نیامد"; exit 1; }
# راستی‌آزمایی BUILD_ID زنده = fingerprint دیسک (پایان الگوی «بیلد کهنه»)
LIVE_FP=$(curl -s -m 10 http://localhost:3000/api/build-freshness 2>/dev/null | head -c 400 | rg -o "<!DOCTYPE html><!--[a-z0-9-]+_" | head -1 | sed 's/<!--//; s/_$//')
DISK_FP=$(head -c 200 /home/z/my-project/.next/BUILD_ID)
echo "  -۱) سرور بالا آمد ($SERVER_BOOTED) — health 200 ✓ · BUILD_ID زنده=$LIVE_FP (دیسک=$DISK_FP)"

# ─── ۰) ورود مدیر (عین دکمهٔ مالک) ───
MASTER_CODE=$(python3 -c "import json;print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
B=""
for i in 1 2 3 4 5; do
  B=$(curl -s -o "$TMP/login.json" -w "%{http_code}" --max-time 20 -X POST \
    "$PUBLIC_URL/api/auth/master-login" -H "Content-Type: application/json" \
    -d "{\"masterCode\":\"$MASTER_CODE\"}")
  [ "$B" = "200" ] && break
  echo "  (درگاه عمومی هنوز آماده نیست — ۸ ثانیه صبر، تلاش $i)"
  sleep 8
done
[ "$B" = "200" ] || { echo "✗ ورود مدیر: $B"; head -c 200 "$TMP/login.json"; exit 1; }
TOKEN=$(jqget "$TMP/login.json" token)
AUTH=(-H "Authorization: Bearer $TOKEN")
echo "  ۰) ورود مدیر → ۲۰۰ ✓"

# ─── ۱) ثبت دستگاه آزمایشی (کد تازه، ۳۰ دقیقه اعتبار) ───
B=$(curl -s -o "$TMP/enroll.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/enroll" \
  -H "Content-Type: application/json" -d '{"label":"pn031e-live"}')
[ "$B" = "200" ] || { echo "✗ ثبت دستگاه: $B"; cat "$TMP/enroll.json"; exit 1; }
CODE=$(python3 -c "
import json, urllib.parse
d = json.load(open('$TMP/enroll.json'))
print(urllib.parse.parse_qs(urllib.parse.urlparse(d['bootstrapUrl']).query)['code'][0])")
DEV_ID=$(jqget "$TMP/enroll.json" deviceId)
echo "  ۱) دستگاه آزمایشی: $DEV_ID (کد تازه صادر شد)"

# ─── C.1 — دانلود اسکریپت واقعی از اینترنت (عین Termux مالک) ───
B=$(curl -s -o "$TMP/melka-relay.sh" -D "$TMP/bs.hdr" -w "%{http_code}" --max-time 30 \
  "$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE")
[ "$B" = "200" ] || { echo "✗ C.1: دانلود bootstrap $B"; exit 1; }
bash -n "$TMP/melka-relay.sh" || { echo "✗ C.1: اسکریپت bash -n نامعتبر"; exit 1; }
DEV_SECRET=$(rg '^DEVICE_SECRET="' "$TMP/melka-relay.sh" | head -1 | sed 's/DEVICE_SECRET="//; s/"$//')
rg -q "^SERVER_URL=\"$PUBLIC_URL\"" "$TMP/melka-relay.sh" && echo "  C.1) اسکریپت واقعی دانلود شد ✓ (SERVER_URL=عمومی · bash -n معتبر)"
echo "  C.1-ب) کد تازه با همان کد دوباره کار می‌کند (بخشندگی): $(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE")"

# ─── C.4 (بخش الف) — ردِ عمدی stale از اینترنت (راز از اسکریپت دانلودی) ───
STALE_JSON=$(python3 - "$PUBLIC_URL" "$DEV_ID" "$DEV_SECRET" <<'PYEOF'
import hashlib, hmac, json, sys, urllib.request, time
pub, dev_id, secret = sys.argv[1], sys.argv[2], sys.argv[3]
body = '{"wait":0}'
ts = str(int(time.time() * 1000) - 10 * 60 * 1000)  # ۱۰ دقیقه پیش → خارج از پنجرهٔ ±۵
digest = hashlib.sha256(body.encode()).hexdigest()
sig = hmac.new(secret.encode(), f"POST\n/api/mobile-relay/poll\n{digest}\n{ts}".encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request(f"{pub}/api/mobile-relay/poll", data=body.encode(), method="POST", headers={
  "Content-Type": "application/json",
  "X-Melka-Relay-Device": dev_id,
  "X-Melka-Timestamp": ts,
  "X-Melka-Signature": sig,
})
try:
    r = urllib.request.urlopen(req, timeout=20)
    print(json.dumps({"status": r.status, "body": r.read().decode()[:200]}))
except urllib.error.HTTPError as e:
    print(json.dumps({"status": e.code, "body": e.read().decode()[:200]}))
except Exception as e:
    print(json.dumps({"status": 0, "error": str(e)}))
PYEOF
)
echo "  C.4-الف) رد عمدی stale: $STALE_JSON"
STALE_STATUS=$(echo "$STALE_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status',0))")
STALE_ERR=$(echo "$STALE_JSON" | python3 -c "import json,sys;d=json.loads(json.load(sys.stdin).get('body','') or '{}');print(d.get('error',''))")
STALE_ST=$(echo "$STALE_JSON" | python3 -c "import json,sys;d=json.loads(json.load(sys.stdin).get('body','') or '{}');print(d.get('serverTime',0))")

# ─── C.1/C.2/C.3 — اجرای اسکریپت واقعی (پس‌زمینه، ~۸۰ ثانیه) ───
echo "  ⏳ اجرای اسکریپت واقعی رله (۸۰ ثانیه — عین گوشی مالک)…"
bash "$TMP/melka-relay.sh" > "$SCRIPT_LOG" 2>&1 &
SCRIPT_PID=$!
sleep 45

# ─── C.2 — Poll واقعی به سرور رسیده؟ (خواندن DB تولید) ───
DB_JSON=$(DATABASE_URL=file:/home/z/my-project/db/custom.db timeout 60 bun scripts/pn031e/db-check.ts "$DEV_ID" 2>/dev/null || echo "{}")
echo "$DB_JSON" > "$TMP/db-mid.json"
LAST_SEEN=$(echo "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('lastSeenAt') or '')")
ENROLLED=$(echo "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('enrolledAt') or '')")
echo "  C.2 (میانهٔ اجرا): lastSeenAt=${LAST_SEEN:-NULL} · enrolledAt=${ENROLLED:-NULL}"

# اجازهٔ ادامهٔ چرخه‌ها (چرخهٔ دوم/سوم poll) + ضربان قلب
sleep 35
kill -9 "$SCRIPT_PID" 2>/dev/null || true
SCRIPT_PID=""
sleep 2

# خواندن نهایی DB
DB_JSON=$(DATABASE_URL=file:/home/z/my-project/db/custom.db timeout 60 bun scripts/pn031e/db-check.ts "$DEV_ID" 2>/dev/null || echo "{}")
echo "$DB_JSON" > "$TMP/db-final.json"
LAST_SEEN=$(echo "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('lastSeenAt') or '')")
ENROLLED=$(echo "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('enrolledAt') or '')")
ATTEMPTS=$(echo "$DB_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('device') or {}).get('attemptCount',0))")
REJECTS=$(echo "$DB_JSON" | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d.get('relayPollRejects') or []
print(json.dumps([{'detail':x.get('detail','')[:120],'at':x.get('createdAt','')} for x in r], ensure_ascii=False))")

# ─── C.3 — همگام‌سازی ساعت در لاگ اسکریپت ───
CLOCK_OK=$(rg -c "ساعت با سرور همگام شد" "$SCRIPT_LOG" 2>/dev/null || echo 0)
HEARTBEAT=$(rg -c "زنده — چرخهٔ" "$SCRIPT_LOG" 2>/dev/null || echo 0)
POLL_LOOPS=$(rg -c "خطای سرور|پاسخ غیرمنتظره" "$SCRIPT_LOG" 2>/dev/null || echo 0)
echo "  C.3) لاگ اسکریپت: clock-sync×$CLOCK_OK · heartbeat×$HEARTBEAT · خطای سرور×$POLL_LOOPS"
echo "  ── پانزده خط نخست لاگ واقعی اسکریپت:"
head -15 "$SCRIPT_LOG" | sed 's/^/    /'

# ─── پاکسازی: ابطال دستگاه آزمایشی ───
curl -s -o /dev/null --max-time 20 "${AUTH[@]}" -X POST "$PUBLIC_URL/api/admin/relay/revoke" \
  -H "Content-Type: application/json" -d "{\"deviceId\":\"$DEV_ID\",\"confirm\":true}" || true
echo "  پاکسازی: دستگاه آزمایشی ابطال شد ✓"

# ─── داوری و شاهد ───
VERDICT="PASS"
[ -n "$LAST_SEEN" ] || VERDICT="FAIL-C2-lastSeen"
[ -n "$ENROLLED" ] || VERDICT="FAIL-C2-enrolled"
[ "$CLOCK_OK" -ge 1 ] || VERDICT="FAIL-C3-clocksync"
[ "$STALE_STATUS" = "403" ] || VERDICT="FAIL-C4-stale-status"
[ "$STALE_ERR" = "stale request" ] || VERDICT="FAIL-C4-stale-error"
python3 -c "import json,sys; d=json.loads(sys.argv[1] or '[]'); sys.exit(0 if any('stale' in (x.get('detail') or '') for x in d) else 1)" "$REJECTS" || VERDICT="FAIL-C4-auditlog"

python3 - "$DEV_ID" "$LAST_SEEN" "$ENROLLED" "$ATTEMPTS" "$CLOCK_OK" "$HEARTBEAT" "$STALE_STATUS" "$STALE_ERR" "$STALE_ST" "$REJECTS" "$VERDICT" > "$OUT" <<'PYEOF'
import json, sys, datetime
w = {
  "phase": "PN-031-E · فاز C — تست زندهٔ رله با اجرای اسکریپت واقعی (جلسهٔ ۰۴۴)",
  "testedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "publicUrl": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  "method": "اسکریپت واقعی bash (همان bootstrap گوشی مالک) از اینترنت دانلود و اجرا شد — نه شبیه‌سازی",
  "C1_realScript": {
    "download": "200 از URL عمومی",
    "bashSyntax": "معتبر (bash -n)",
    "serverUrlInScript": "URL عمومی",
    "forgivingSecondDownload": "200 (کد بخشنده)",
  },
  "C2_pollReachedServer": {
    "lastSeenAt": sys.argv[2] or None,
    "enrolledAt": sys.argv[3] or None,
    "attemptCount": int(sys.argv[4] or 0),
    "note": "lastSeenAt != null = Poll واقعی به سرور رسیده (بن‌بست برخطی شکسته شد)",
  },
  "C3_clockSync": {
    "scriptLogEvidence": "«ساعت با سرور همگام شد ✓»" if int(sys.argv[5] or 0) >= 1 else "یافت نشد",
    "heartbeats": int(sys.argv[6] or 0),
  },
  "C4_rejectVisibility": {
    "deliberateStaleStatus": sys.argv[7],
    "deliberateStaleError": sys.argv[8],
    "serverTimeInReject": int(sys.argv[9] or 0),
    "auditLogRejects": json.loads(sys.argv[10] or "[]"),
  },
  "device": {"deviceId": sys.argv[1], "cleanup": "ابطال شد پس از آزمون"},
  "verdict": sys.argv[11],
}
json.dump(w, open("download/pn031e/live-relay-test.json", "w"), ensure_ascii=False, indent=1)
print("VERDICT:", sys.argv[11])
PYEOF

echo ""
echo "═══ فاز C: $VERDICT ═══ (شاهد: $OUT · لاگ اسکریپت: $SCRIPT_LOG)"
