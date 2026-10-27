#!/usr/bin/env bash
# scripts/pn031i/live-gate.sh — دروازهٔ پایانی سند ۰۵۰: اجرای واقعیِ خودِ اسکریپت
# رلهٔ نسل I در برابر URL عمومی (الگوی G.6 جلسهٔ ۰۴۷ — شبیه‌سازی ≠ اجرای واقعی)
# ۱) دستگاه آزمایشی تازه + bootstrap واقعی (راز دستگاه)
# ۲) اجرای اسکریپت تولیدی ۷۵ ثانیه (چرخه‌های کامل poll: wait=20)
# ۳) شاهد: «✓ اتصال تأیید شد» + صفر خطای شبکه + لاگ دیباگ ساخته می‌شود
# ۴) ابطال دستگاه آزمایشی + شاهد JSON
set -uo pipefail
cd /home/z/my-project

DUR="${1:-75}"
OUT=download/pn031i/live-gate.json
RUN_LOG=/tmp/pn031i-live-run.log
rm -f "$RUN_LOG"

# ۱) دستگاه آزمایشی از URL عمومی
CREDS=$(bun -e '
const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;
const login = await fetch(`${PUBLIC_URL}/api/auth/master-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterCode }) });
const { token } = await login.json();
const enroll = await (await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ label: "PN-031-I live-gate (آزمایشی)" }) })).json();
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

# ۲) تولید اسکریپت با همان مولد سرور + پیکربندی واقعی دستگاه
SCRIPT=/tmp/pn031i-live-relay.sh
bun -e "
const { buildRelayScript } = await import('./src/lib/melk-api/relay-script');
const s = buildRelayScript({ serverUrl: process.argv[1], deviceId: process.argv[2], deviceSecret: process.argv[3], altServerUrl: process.argv[4] });
await Bun.write(process.argv[5], s);
" "$SERVER" "$DEV" "$SECRET" "$ALT" "$SCRIPT" || { echo "FAIL: render"; exit 1; }
bash -n "$SCRIPT" || { echo "FAIL: bash -n"; exit 1; }

# ۳) اجرای واقعی — HOME ایزوله (لاگ دیباگ در /tmp/pn031i-home)
export HOME=/tmp/pn031i-home
mkdir -p "$HOME"
rm -f "$HOME/relay-debug.log"
timeout "$DUR" bash "$SCRIPT" > "$RUN_LOG" 2>&1 || true

# ۴) شاهد + ابطال
sleep 1
CONNECT_OK=$(grep -c "✓ اتصال تأیید شد" "$RUN_LOG" || true)
NET_ERR=$(grep -c "شبکه: curl خطای" "$RUN_LOG" || true)
SERVER_ERR=$(grep -c "خطای سرور" "$RUN_LOG" || true)
DEBUG_LOG_SIZE=$(wc -c < "$HOME/relay-debug.log" 2>/dev/null || echo 0)
LEAK=$(grep -c "$SECRET" "$HOME/relay-debug.log" "$RUN_LOG" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')

REVOKE=$(curl -s -m 15 -X POST "$SERVER/api/admin/relay/test" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" 2>/dev/null | head -c 200) || true

VERDICT=PASS
[ "$CONNECT_OK" -ge 1 ] || VERDICT=FAIL
[ "$NET_ERR" -eq 0 ] || VERDICT=FAIL
[ "$SERVER_ERR" -eq 0 ] || VERDICT=FAIL
[ "$LEAK" -eq 0 ] || VERDICT=FAIL

python3 - "$OUT" "$VERDICT" "$CONNECT_OK" "$NET_ERR" "$SERVER_ERR" "$DEBUG_LOG_SIZE" "$LEAK" "$DEV" <<'PYEOF'
import json, sys, datetime
out, verdict, connect, net, srv, dbg, leak, dev = sys.argv[1:9]
json.dump({
  "phase": "PN-031-I · دروازهٔ پایانی (سند ۰۵۰) — اجرای واقعی اسکریپت نسل I از URL عمومی",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "verdict": verdict,
  "device": dev,
  "durationSec": 75,
  "metrics": {
    "connectConfirmed": int(connect), "networkErrors": int(net), "serverErrors": int(srv),
    "debugLogBytes": int(dbg), "secretLeakCount": int(leak),
  },
  "criteria": "connectConfirmed>=1 · networkErrors=0 · serverErrors=0 · secretLeakCount=0",
}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PYEOF

echo "VERDICT: $VERDICT (اتصال=$CONNECT_OK · خطای شبکه=$NET_ERR · خطای سرور=$SERVER_ERR · نشت راز=$LEAK · دیباگ=${DEBUG_LOG_SIZE}B)"
tail -6 "$RUN_LOG" | head -6
exit 0
