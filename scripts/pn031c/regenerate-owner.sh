#!/usr/bin/env bash
# =============================================================================
# regenerate-owner.sh — صدور کد تازهٔ بخشندهٔ مالک + QR (PN-031-C · فاز تحویل)
# =============================================================================
# ۱) ابطال کدهای منقضی مالک (جلسه‌های ۰۳۸/۰۳۹ — هرگز به Poll نرسیدند)
# ۲) ثبت دستگاه تازهٔ «Poco F3» از خودِ روت واقعی از URL عمومی —
#    عین دکمهٔ «راه‌اندازی رله» در تنظیمات (این بار: کد ۳تلاشی بخشنده)
# ۳) QR (PNG + SVG) از دستور نصب
# ۴) شاهد regenerated-owner.json (بدون راز)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn031c"
mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "— صدور کد تازهٔ بخشندهٔ مالک از URL عمومی: $PUBLIC_URL"

MASTER_CODE=$(python3 -c "import json;print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
B=$(curl -s -o "$TMP/login.json" -w "%{http_code}" --max-time 20 -X POST \
  "$PUBLIC_URL/api/auth/master-login" -H "Content-Type: application/json" \
  -d "{\"masterCode\":\"$MASTER_CODE\"}")
[ "$B" = "200" ] || { echo "✗ ورود مدیر: $B"; exit 1; }
TOKEN=$(python3 -c "import json;print(json.load(open('$TMP/login.json'))['token'])")
AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── ۱) ابطال کدهای منقضیِ مالک (دستگاه‌های صاحب کد که هرگز Poll نکردند) ───
STALE=$(curl -s --max-time 20 "${AUTH[@]}" "$PUBLIC_URL/api/admin/relay/status" | python3 -c "
import json, sys, datetime
d = json.load(sys.stdin)
now = datetime.datetime.now(datetime.timezone.utc)
out = []
for x in d['relay']['devices']:
    if x['revoked']: continue
    # کد زندهٔ صاحب‌دار = code/expired/… در enroll — فقط «expired» یا بدون enrolledAt
    en = x.get('enroll') or {}
    if en.get('state') in ('expired', 'burned-used', 'burned-limit') and not x['enrolledAt']:
        out.append(x['deviceId'])
    elif en.get('state') == 'absent' and not x['enrolledAt'] and not x['lastSeenAt']:
        out.append(x['deviceId'])
print(' '.join(out))" 2>/dev/null || echo "")
for D in $STALE; do
  curl -s -o /dev/null --max-time 20 "${AUTH[@]}" -X POST "$PUBLIC_URL/api/admin/relay/revoke" \
    -H "Content-Type: application/json" -d "{\"deviceId\":\"$D\",\"confirm\":true}" || true
done
echo "  ۱) ابطال کدهای منقضی قبلی: ${STALE:-هیچ}"

# ─── ۲) ثبت دستگاه تازه از روت واقعی (URL عمومی) ───
B=$(curl -s -o "$TMP/enroll.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/enroll" \
  -H "Content-Type: application/json" -d '{"label":"Poco F3"}')
[ "$B" = "200" ] || { echo "✗ ثبت دستگاه: $B"; cat "$TMP/enroll.json"; exit 1; }

python3 - "$TMP/enroll.json" "$PUBLIC_URL" > "$TMP/verify.json" <<'PYEOF'
import json, sys
enroll = json.load(open(sys.argv[1])); pub = sys.argv[2]
cmd = enroll["installCommand"]
assert cmd.startswith(f'pkg install -y curl openssl jq && curl -fsSL "{pub}/api/mobile-relay/bootstrap?code='), "URL عمومی ندارد — قانون ۰۳۸"
assert "0.0.0.0" not in cmd and "localhost" not in cmd, "آدرس داخلی در دستور!"
assert enroll.get("maxAttempts") == 3, "کد بخشنده نیست (maxAttempts != 3)!"
print(json.dumps({"verified": True, "deviceId": enroll["deviceId"], "expires": enroll["enrollExpires"]}))
PYEOF
echo "  ۲) دستگاه تازه ثبت شد: $(python3 -c "import json;print(json.load(open('$TMP/verify.json'))['deviceId'])") — کد بخشندهٔ ۳تلاشی ✓"

# ─── ۳) QR ───
CMD=$(python3 -c "import json;print(json.load(open('$TMP/enroll.json'))['installCommand'])")
bun -e "
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
const cmd = process.argv[1];
await QRCode.toFile('download/pn031c/qr-install-command.png', cmd, { errorCorrectionLevel: 'M', margin: 2, width: 640, color: { dark: '#052e2b', light: '#ffffff' } });
writeFileSync('download/pn031c/qr-install-command.svg', await QRCode.toString(cmd, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 320 }));
console.log('  ۳) QR ساخته شد (PNG + SVG)');
" "$CMD"

# ─── ۴) شاهد ───
python3 - "$TMP/enroll.json" "$STALE" <<'PYEOF'
import json, sys, datetime
enroll = json.load(open(sys.argv[1]))
w = {
  "phase": "PN-031-C · تحویل مالک — کد تازهٔ بخشنده (جلسهٔ فوق‌العاده ۰۴۰)",
  "generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "publicUrl": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  "invalidatedStale": (sys.argv[2] or "هیچ").split(),
  "newEnrollment": {
    "deviceId": enroll["deviceId"],
    "label": enroll["label"],
    "installCommand": enroll["installCommand"],
    "bootstrapUrl": enroll["bootstrapUrl"],
    "enrollExpires": enroll["enrollExpires"],
    "validityMinutes": enroll.get("validityMinutes", 30),
    "maxAttempts": enroll.get("maxAttempts", 3),
    "note": "کد بخشندهٔ ۳تلاشی — اگر تلاش اول خطا داد، همان کد را دوباره پیست کنید؛ کد فقط پس از اتصال موفق گوشی می‌سوزد (PN-031-C).",
  },
  "files": ["qr-install-command.png", "qr-install-command.svg", "regenerated-owner.json", "OWNER-GUIDE.md"],
  "verdict": "PASS — کد تازهٔ بخشنده از روت واقعی و از URL عمومی صادر شد",
}
with open("download/pn031c/regenerated-owner.json", "w", encoding="utf-8") as f:
    json.dump(w, f, ensure_ascii=False, indent=1)
print("  ۴) شاهد: download/pn031c/regenerated-owner.json")
PYEOF
echo ""
echo "═══ دستور نصب تازهٔ مالک (کد بخشنده — ۳ تلاش) ═══"
echo "$CMD"
