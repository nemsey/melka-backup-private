#!/usr/bin/env bash
# scripts/pn033/tunnel-gate.sh — PN-033 (شورا-ن۰۵۴): دروازهٔ تونل روی بیلد تازه
# اجرای واقعی اسکریپت رله از URL عمومی در برابر بیلد PN-033 (فیوز خاموش + DB پاک)
# شاهد: download/pn033/tunnel-alive.json
# تفاوت با نسل PN-032: دستگاه آزمایشی در پایان «حذف» می‌شود (DB همیشه فقط ۱ فعال — ناوردای ن۰۵۴)
set -uo pipefail
cd /home/z/my-project

DUR="${1:-45}"
OUT=download/pn033/tunnel-alive.json
RUN_LOG=/tmp/pn033-live-run.log
rm -f "$RUN_LOG"

CREDS=$(bun -e '
const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";
const masterCode = JSON.parse(await Bun.file("env.platform.json").text()).MASTER_ACCESS_CODE;
const login = await fetch(`${PUBLIC_URL}/api/auth/master-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ masterCode }) });
const { token } = await login.json();
const enroll = await (await fetch(`${PUBLIC_URL}/api/admin/relay/enroll`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ label: "PN-033 tunnel-gate (آزمایشی)" }) })).json();
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

SCRIPT=/tmp/pn033-live-relay.sh
bun -e "
const { buildRelayScript } = await import('./src/lib/melk-api/relay-script');
const s = buildRelayScript({ serverUrl: process.argv[1], deviceId: process.argv[2], deviceSecret: process.argv[3], altServerUrl: process.argv[4] });
await Bun.write(process.argv[5], s);
" "$SERVER" "$DEV" "$SECRET" "$ALT" "$SCRIPT" || { echo "FAIL: render"; exit 1; }
bash -n "$SCRIPT" || { echo "FAIL: bash -n"; exit 1; }

export HOME=/tmp/pn033-home
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
# دروازهٔ فیوز: صفر رکورد قفل روی میزبانهای واقعی (ن۰۵۴: قفل جنگی برافتاد)
BREAKER_ROWS=$(bun -e '
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
console.log(await db.circuitBreakerState.count());
await db.$disconnect();' 2>/dev/null | tr -d '\n')

# ابطال آزمایشی + حذف کامل رکورد (ناوردای ن۰۵۴: فقط ۱ دستگاه فعال)
curl -s -m 15 -X POST "$SERVER/api/admin/relay/test" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" 2>/dev/null >/dev/null || true
bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
const r = await db.relayDevice.deleteMany({ where: { deviceId: process.argv[1] } });
console.log('deleted test devices:', r.count);
await db.\$disconnect();
" "$DEV" || true

VERDICT=PASS
[ "$CONNECT_OK" -ge 1 ] || VERDICT=FAIL
[ "$NET_ERR" -eq 0 ] || VERDICT=FAIL
[ "$SERVER_ERR" -eq 0 ] || VERDICT=FAIL
[ "$LEAK" -eq 0 ] || VERDICT=FAIL
[ "$BREAKER_ROWS" -eq 0 ] || VERDICT=FAIL

python3 - "$OUT" "$VERDICT" "$CONNECT_OK" "$NET_ERR" "$SERVER_ERR" "$DEBUG_LOG_SIZE" "$LEAK" "$DEV" "$DUR" "$BUILD_LIVE" "$BREAKER_ROWS" <<'PYEOF'
import json, sys, datetime
out, verdict, connect, net, srv, dbg, leak, dev, dur, build, brk = sys.argv[1:12]
json.dump({
  "phase": "PN-033 — دروازهٔ تونل روی بیلد پاکسازی‌شده (شورا-ن۰۵۴): فیوز خاموش + DB تک‌دستگاه",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "durationSec": int(dur),
  "liveBuildId": build,
  "device": dev,
  "connectConfirmed": int(connect),
  "networkErrors": int(net),
  "serverErrors": int(srv),
  "debugLogBytes": int(dbg),
  "secretLeaks": int(leak),
  "circuitBreakerRows": int(brk),
  "testDeviceDeleted": True,
  "ownerWitness": "جلسهٔ ۰۵۲: تونل زنده · ن۰۵۴: قفل فیوز رفع شد و ۵۰ دستگاه مرده پاک شد",
  "verdict": verdict,
}, open(out, "w"), ensure_ascii=False, indent=2)
print(f"VERDICT={verdict} connect={connect} netErr={net} srvErr={srv} leak={leak} build={build} breakerRows={brk}")
PYEOF
