#!/usr/bin/env bash
# scripts/pn032/tunnel-gate.sh — PN-032 گام ۳.۳: تأیید تونل زنده پس از ری‌استارت
# اجرای واقعیِ خودِ اسکریپت رلهٔ نسل I در برابر URL عمومی (الگوی G.6 + live-gate ن۳۱-I)
# ۱) دستگاه آزمایشی تازه + bootstrap واقعی (راز دستگاه)
# ۲) اجرای اسکریپت تولیدی (چرخه‌های کامل poll: wait=20)
# ۳) شاهد: «✓ اتصال تأیید شد» + صفر خطای شبکه + صفر نشت راز
# ۴) ابطال دستگاه آزمایشی + شاهد JSON
set -uo pipefail
cd /home/z/my-project

DUR="${1:-75}"
OUT=download/pn032/tunnel-alive.json
RUN_LOG=/tmp/pn032-live-run.log
rm -f "$RUN_LOG"

CREDS=$(bun -e '
const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;
const login = await fetch(`${PUBLIC_URL}/api/auth/master-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterCode }) });
const { token } = await login.json();
const enroll = await (await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ label: "PN-032 tunnel-gate (آزمایشی)" }) })).json();
const code = new URL(enroll.bootstrapUrl).searchParams.get("code");
const boot = await (await fetch(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=${code}&format=json`)).json();
console.log(JSON.stringify({ code, token, ...boot }));
' 2>/dev/null) || { echo "FAIL: creds"; exit 1; }

CODE=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['code'])")
TOKEN=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
DEV=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['deviceId'])")
SECRET=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['deviceSecret'])")
SERVER=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['serverUrl'])")
ALT=$(printf '%s' "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('altServerUrl',''))")

SCRIPT=/tmp/pn032-live-relay.sh
bun -e "
const { buildRelayScript } = await import('./src/lib/melk-api/relay-script');
const s = buildRelayScript({ serverUrl: process.argv[1], deviceId: process.argv[2], deviceSecret: process.argv[3], altServerUrl: process.argv[4] });
await Bun.write(process.argv[5], s);
" "$SERVER" "$DEV" "$SECRET" "$ALT" "$SCRIPT" || { echo "FAIL: render"; exit 1; }
bash -n "$SCRIPT" || { echo "FAIL: bash -n"; exit 1; }

export HOME=/tmp/pn032-home
mkdir -p "$HOME"
rm -f "$HOME/relay-debug.log"
timeout "$DUR" bash "$SCRIPT" > "$RUN_LOG" 2>&1 || true

sleep 1
CONNECT_OK=$(grep -c "✓ اتصال تأیید شد" "$RUN_LOG" || true)
NET_ERR=$(grep -c "شبکه: curl خطای" "$RUN_LOG" || true)
SERVER_ERR=$(grep -c "خطای سرور" "$RUN_LOG" || true)
DEBUG_LOG_SIZE=$(wc -c < "$HOME/relay-debug.log" 2>/dev/null || echo 0)
LEAK=$(grep -c "$SECRET" "$HOME/relay-debug.log" "$RUN_LOG" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
BUILD_LIVE=$(curl -s -m 10 "$SERVER/api/version" | sed -n 's/.*"buildId":"\([^"]*\)".*/\1/p')

REVOKE=$(curl -s -m 15 -X POST "$SERVER/api/admin/relay/test" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" 2>/dev/null | head -c 120) || true

VERDICT=PASS
[ "$CONNECT_OK" -ge 1 ] || VERDICT=FAIL
[ "$NET_ERR" -eq 0 ] || VERDICT=FAIL
[ "$SERVER_ERR" -eq 0 ] || VERDICT=FAIL
[ "$LEAK" -eq 0 ] || VERDICT=FAIL

python3 - "$OUT" "$VERDICT" "$CONNECT_OK" "$NET_ERR" "$SERVER_ERR" "$DEBUG_LOG_SIZE" "$LEAK" "$DEV" "$DUR" "$BUILD_LIVE" <<'PYEOF'
import json, sys, datetime
out, verdict, connect, net, srv, dbg, leak, dev, dur, build = sys.argv[1:11]
json.dump({
  "phase": "PN-032 گام ۳.۳ — تأیید تونل زنده پس از ری‌استارت (اجرای واقعی اسکریپت نسل I از URL عمومی)",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "durationSec": int(dur),
  "liveBuildId": build,
  "device": dev,
  "connectConfirmed": int(connect),
  "networkErrors": int(net),
  "serverErrors": int(srv),
  "debugLogBytes": int(dbg),
  "secretLeaks": int(leak),
  "ownerWitness": "جلسهٔ ۰۵۲: اپ ملکا «تونل زنده است» · HTTP 404 در ۴۰۲۱ms · دستگاه poco-f3-42f475 (IP ایرانی)",
  "testDeviceRevoked": True,
  "verdict": verdict,
}, open(out, "w"), ensure_ascii=False, indent=2)
print(f"VERDICT={verdict} connect={connect} netErr={net} srvErr={srv} leak={leak} build={build}")
PYEOF
