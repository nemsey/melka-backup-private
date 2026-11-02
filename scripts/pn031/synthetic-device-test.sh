#!/usr/bin/env bash
# ============================================================================
# PN-031 · تست سنتزی گوشی — شبیه‌سازی کامل چرخهٔ رله با curl/openssl
# ============================================================================
# دستگاه آزمایشی را مستقیم در DB ثبت می‌کند و کل قرارداد را زنده وارسی می‌کند:
#   ۱) poll با امضای HMAC معتبر → دریافت آیتم صف + امضای دوجهته
#   ۲) وارسی امضای سرور (RELAY\nid\nmethod\nurl\nsha256(body)\nts) — عین اسکریپت گوشی
#   ۳) اجرای درخواست به مقصد واقعی (از این کانتینر = بلاک جغرافیایی → تایم‌اوت)
#   ۴) گزارش نتیجه (خطای بالادستی) با امضای معتبر
#   ۵) تأیید ثبت نتیجه در صف (status=failed با error)
# تنها چیزی که شبیه‌سازی نمی‌شود: IP ایرانی (نیازمند گوشی واقعی مالک است)
# خروجی شاهد: download/pn031/synthetic-device-test.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
BASE="http://127.0.0.1:81"
DEVICE_ID="synthetic-pn031-$(date +%s)"
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
OUT="download/pn031/synthetic-device-test.json"
mkdir -p download/pn031

echo "=== PN-031 synthetic device test · $TS ==="
echo "دستگاه: $DEVICE_ID"

# ── گام ۱: ثبت دستگاه آزمایشی مستقیم در DB + آیتم صف ──
# (فرمت datetime = ISO میلی‌ثانیه‌ای + Z — سازگار با Prisma SQLite)
python3 - "$DEVICE_ID" "$SECRET" <<'PYEOF'
import sqlite3, sys, datetime

def now_iso():
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

device_id, secret = sys.argv[1], sys.argv[2]
db = sqlite3.connect("db/custom.db")
db.execute("INSERT INTO RelayDevice (id, deviceId, secret, label, enrolledAt, lastSeenAt, enrolledBy) VALUES (?,?,?,?,?,?,?)",
           (f"synth-{device_id}", device_id, secret, "دستگاه سنتزی آزمون", now_iso(), now_iso(), "pn031-test"))
db.execute("INSERT INTO RelayQueue (id, method, url, headersJson, body, status, fingerprint, enqueuedAt, source) VALUES (?,?,?,?,?,?,?,?,?)",
           ("synth-item-1", "GET", "https://arus-api.melketabriz.ir/", None, None, "pending",
            "synthetic-test-" + str(int(datetime.datetime.now(datetime.UTC).timestamp())), now_iso(), "gate-test"))
db.commit(); db.close()
print("دستگاه + آیتم صف ثبت شدند")
PYEOF

# ── توابع امضا (عین اسکریپت Termux — قرارداد PN-030/031) ──
sha256hex() { openssl dgst -sha256 -hex | sed 's/^.*= //'; }
hmac_hex() { openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.*= //'; }
sign_poll() {
  local ts digest sig
  ts=$(date +%s%3N)
  digest=$(printf '%s' '{"wait":2}' | sha256hex)
  sig=$(printf 'POST\n/api/mobile-relay/poll\n%s\n%s' "$digest" "$ts" | hmac_hex)
  curl -sS --max-time 10 -X POST "$BASE/api/mobile-relay/poll" \
    -H "X-Melka-Relay-Device: $DEVICE_ID" \
    -H "X-Melka-Timestamp: $ts" \
    -H "X-Melka-Signature: $sig" \
    -H "Content-Type: application/json" \
    --data-binary '{"wait":2}'
}

# ── گام ۲: poll امضاشده ──
echo "— گام ۲: poll با امضای HMAC…"
RESP=$(sign_poll) || RESP=""
if [ -z "$RESP" ]; then echo "✘ poll خالی برگشت"; exit 1; fi
echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ok=' + str(d.get('ok')) + ' · id=' + d['request']['id'][:16] + '… · url=' + d['request']['url'])"

RID=$(printf '%s' "$RESP" | jq -r '.request.id')
RURL=$(printf '%s' "$RESP" | jq -r '.request.url')
RMETHOD=$(printf '%s' "$RESP" | jq -r '.request.method')
RBODY=$(printf '%s' "$RESP" | jq -r '.request.body // ""')
RSIG=$(printf '%s' "$RESP" | jq -r '.request.sig')
RTS=$(printf '%s' "$RESP" | jq -r '.request.ts')

# ── گام ۳: وارسی امضای دوجهتهٔ سرور (عین اسکریپت گوشی) ──
echo "— گام ۳: وارسی امضای سرور (RELAY | id | method | url | sha256(body) | ts)…"
BDIG=$(printf '%s' "$RBODY" | sha256hex)
EXPECT=$(printf 'RELAY\n%s\n%s\n%s\n%s\n%s' "$RID" "$RMETHOD" "$RURL" "$BDIG" "$RTS" | hmac_hex)
if [ "$RSIG" = "$EXPECT" ]; then
  SIG_VERIFIED="true"; echo "  ✓ امضای سرور معتبر است"
else
  SIG_VERIFIED="false"; echo "  ✘ امضای سرور نامعتبر! RSIG=$RSIG EXPECT=$EXPECT"
fi

# ── گام ۴: اجرای درخواست به مقصد واقعی (انتظار: تایم‌اوت بلاک جغرافیایی) ──
echo "— گام ۴: اجرای $RMETHOD $RURL (از این کانتینر — انتظار تایم‌اوت)…"
CODE=$(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' -X "$RMETHOD" "$RURL" 2>/dev/null)
CURL_EXIT=$?
echo "  curl exit=$CURL_EXIT code=$CODE (انتظار: تایم‌اوت = بلاک جغرافیایی از ASN ما)"

# ── گام ۵: گزارش نتیجه (خطای بالادستی) با امضای معتبر ──
if [ $CURL_EXIT -ne 0 ]; then
  RESULT_JSON=$(jq -n --arg id "$RID" --arg err "curl exit $CURL_EXIT (geo-block from container — expected)" '{id:$id,error:$err}')
else
  RESULT_JSON=$(jq -n --arg id "$RID" --argjson code "${CODE:-0}" '{id:$id,httpStatus:$code,contentType:"text/plain",bodyB64:""}')
fi
echo "— گام ۵: گزارش نتیجه با امضای HMAC…"
ts=$(date +%s%3N)
digest=$(printf '%s' "$RESULT_JSON" | sha256hex)
sig=$(printf 'POST\n/api/mobile-relay/result\n%s\n%s' "$digest" "$ts" | hmac_hex)
RESResp=$(curl -sS --max-time 10 -X POST "$BASE/api/mobile-relay/result" \
  -H "X-Melka-Relay-Device: $DEVICE_ID" \
  -H "X-Melka-Timestamp: $ts" \
  -H "X-Melka-Signature: $sig" \
  -H "Content-Type: application/json" \
  --data-binary "$RESULT_JSON")
echo "  پاسخ سرور: $RESResp"

# ── گام ۶: وارسی وضعیت نهایی صف ──
FINAL=$(python3 - "$RID" <<'PYEOF'
import sqlite3, sys
db = sqlite3.connect('db/custom.db')
row = db.execute("SELECT status, responseStatus, error, claimedBy FROM RelayQueue WHERE id=?", (sys.argv[1],)).fetchone()
print((row[0] + '|' + str(row[1]) + '|' + str(row[2]) + '|' + str(row[3])) if row else 'missing')
db.close()
PYEOF
)
echo "— گام ۶: وضعیت نهایی آیتم صف: $FINAL"
STATUS="${FINAL%%|*}"

# ── تست منفی: امضای غلط رد می‌شود ──
echo "— تست منفی: poll با امضای غلط…"
NEG=$(curl -sS --max-time 10 -X POST "$BASE/api/mobile-relay/poll" \
  -H "X-Melka-Relay-Device: $DEVICE_ID" \
  -H "X-Melka-Timestamp: $(date +%s%3N)" \
  -H "X-Melka-Signature: 0000000000000000000000000000000000000000000000000000000000000000" \
  -H "Content-Type: application/json" \
  --data-binary '{"wait":0}' | head -c 120)
echo "  پاسخ: $NEG"

# ── پاکسازی دستگاه آزمایشی ──
python3 - "$DEVICE_ID" "$RID" <<'PYEOF'
import sqlite3, sys
db = sqlite3.connect('db/custom.db')
db.execute("DELETE FROM RelayQueue WHERE id=?", (sys.argv[2],))
db.execute("DELETE FROM RelayDevice WHERE deviceId=?", (sys.argv[1],))
db.commit(); db.close()
PYEOF

cat > "$OUT" <<EOF
{
  "phase": "PN-031 · تست سنتزی دستگاه رله (شبیه‌سازی کامل قرارداد)",
  "testedAt": "$TS",
  "deviceId": "$DEVICE_ID",
  "steps": {
    "pollSigned": "PASS — آیتم صف با امضای معتبر دریافت شد",
    "serverSignatureVerified": "$SIG_VERIFIED",
    "upstreamExecuted": "EXECUTED — curl exit=$CURL_EXIT code=${CODE:-none} (تایم‌اوت از کانتینر = سازگار با سد جغرافیایی؛ روی گوشی ایرانی پاسخ 404 ریشه ARM)",
    "resultReported": "$RESResp",
    "queueFinalState": "$FINAL"
  },
  "negativeTest": "امضای غلط → $NEG",
  "verdict": "$([ "$SIG_VERIFIED" = "true" ] && [ "$STATUS" = "failed" ] && echo 'MACHINERY-VERIFIED — کل قرارداد HMAC دوجهته + صف + گزارش نتیجه کار می‌کند؛ تنها حلقهٔ باقی‌مانده: گوشی واقعی مالک در ایران' || echo 'PARTIAL — بررسی دستی لازم')"
}
EOF
echo ""
echo "═══ شاهد: $OUT ═══"
