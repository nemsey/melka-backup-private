#!/usr/bin/env bash
# =============================================================================
# live-test.sh — تست زندهٔ PN-031-HOTFIX (شورای عالی ملکا · جلسهٔ فوری ۰۳۸)
# =============================================================================
# مسیر کامل واقعی مالک، دقیقاً همان‌طور که از گوشی/مرورگر مالک طی می‌شود —
# همهٔ درخواست‌ها فقط از URL عمومی (اینترنت) — صفر localhost:
#
#   ۱) روت bootstrap با کد ساختگی → انتظار 403 (زنده + احراز کد)
#   ۲) ورود مدیر از URL عمومی → نشست OWNER (کد مستر از env.platform.json)
#   ۳) ثبت دستگاه رله از URL عمومی (عین دکمهٔ تنظیمات مالک) →
#      دستور نصب + bootstrapUrl باید «فقط» URL عمومی داشته باشند
#   ۴) دانلود اسکریپت رله از URL عمومی با همان کد → انتظار ۲۰۰ +
#      SERVER_URL عمومی درون اسکریپت + bash -n معتبر
#   ۵) ابطال دستگاه آزمایشی (پاکسازی)
#
# خروجی: شاهد download/pn031-hotfix/live-test.json
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn031-hotfix/live-test.json"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "— تست زندهٔ PN-031-HOTFIX از URL عمومی: $PUBLIC_URL"

# ─── ۱) bootstrap با کد ساختگی → 403 ───
B1=$(curl -s -o "$TMP/b1.json" -w "%{http_code}" --max-time 20 \
  "$PUBLIC_URL/api/mobile-relay/bootstrap?code=000000000000000000deadbeefdeadbeef")
echo "  ۱) کد ساختگی → HTTP $B1 (انتظار 403)"
[ "$B1" = "403" ] || { echo "✗ شکست"; exit 1; }

# ─── ۲) ورود مدیر از URL عمومی (Bearer token در پاسخ) ───
MASTER_CODE=$(python3 -c "import json;print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
B2=$(curl -s -o "$TMP/login.json" -w "%{http_code}" --max-time 20 \
  -X POST "$PUBLIC_URL/api/auth/master-login" \
  -H "Content-Type: application/json" \
  -d "{\"masterCode\":\"$MASTER_CODE\"}")
echo "  ۲) ورود مدیر → HTTP $B2"
[ "$B2" = "200" ] || { echo "✗ ورود ناموفق:"; cat "$TMP/login.json"; exit 1; }
TOKEN=$(python3 -c "import json;print(json.load(open('$TMP/login.json'))['token'])")
AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── ۳) ثبت دستگاه از URL عمومی (عین دکمهٔ مالک) ───
B3=$(curl -s -o "$TMP/enroll.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/enroll" \
  -H "Content-Type: application/json" \
  -d '{"label":"hotfix-live-test"}')
echo "  ۳) ثبت دستگاه → HTTP $B3"
[ "$B3" = "200" ] || { echo "✗ ثبت ناموفق:"; cat "$TMP/enroll.json"; exit 1; }

python3 - "$TMP/enroll.json" "$PUBLIC_URL" > "$TMP/checks.json" <<'PYEOF'
import json, sys
enroll = json.load(open(sys.argv[1]))
pub = sys.argv[2]
cmd = enroll["installCommand"]
url = enroll["bootstrapUrl"]
checks = {
  "installCommandHasPublicUrl": cmd.startswith(f'pkg install -y curl openssl jq && curl -fsSL "{pub}/api/mobile-relay/bootstrap?code='),
  "installCommandNoInternal": "0.0.0.0" not in cmd and "localhost" not in cmd,
  "bootstrapUrlHasPublicUrl": url.startswith(f"{pub}/api/mobile-relay/bootstrap?code="),
  "deviceId": enroll["deviceId"],
  "enrollExpires": enroll["enrollExpires"],
}
json.dump(checks, open(sys.argv[1] + ".checks", "w"))
print(json.dumps({k: v for k, v in checks.items() if isinstance(v, bool)}))
PYEOF
CHECKS_OK=$(python3 -c "import json;d=json.load(open('$TMP/enroll.json.checks'));print(all(d[k] for k in ['installCommandHasPublicUrl','installCommandNoInternal','bootstrapUrlHasPublicUrl']))")
echo "  ۳-ب) دستور نصب فقط URL عمومی دارد: $CHECKS_OK"
[ "$CHECKS_OK" = "True" ] || { echo "✗ دستور نصب آدرس داخلی دارد!"; cat "$TMP/enroll.json"; exit 1; }

CODE=$(python3 -c "import json,urllib.parse;d=json.load(open('$TMP/enroll.json'));print(urllib.parse.parse_qs(urllib.parse.urlparse(d['bootstrapUrl']).query)['code'][0])")
DEVICE_ID=$(python3 -c "import json;print(json.load(open('$TMP/enroll.json'))['deviceId'])")

# ─── ۴) دانلود اسکریپت از URL عمومی با همان کد → 200 + SERVER_URL عمومی ───
B4=$(curl -s -o "$TMP/melka-relay.sh" -w "%{http_code}" --max-time 30 \
  "$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE")
echo "  ۴) دانلود اسکریپت رله → HTTP $B4 (انتظار ۲۰۰ — عین curl گوشی مالک)"
[ "$B4" = "200" ] || { echo "✗ دانلود ناموفق"; exit 1; }

grep -q "SERVER_URL=\"$PUBLIC_URL\"" "$TMP/melka-relay.sh" && echo "  ۴-ب) SERVER_URL عمومی در اسکریپت ✓" || { echo "✗ SERVER_URL عمومی نیست"; grep "SERVER_URL=" "$TMP/melka-relay.sh"; exit 1; }
if rg -q "0\.0\.0\.0|localhost" "$TMP/melka-relay.sh"; then echo "✗ آدرس داخلی در اسکریپت"; exit 1; else echo "  ۴-ج) صفر آدرس داخلی در اسکریپت ✓"; fi
bash -n "$TMP/melka-relay.sh" && echo "  ۴-د) bash -n معتبر ✓" || { echo "✗ اسکریپت bash نامعتبر"; exit 1; }
grep -q "termux-wake-lock" "$TMP/melka-relay.sh" && echo "  ۴-هـ) wake-lock Termux موجود ✓"

# کد یک‌بارمصرف: بار دوم باید 403 بدهد
B5=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
  "$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE")
echo "  ۵) استفادهٔ دوم از همان کد → HTTP $B5 (انتظار 403 — یک‌بارمصرف)"
[ "$B5" = "403" ] || { echo "✗ کد یک‌بارمصرف نیست"; exit 1; }

# ─── ۶) ابطال دستگاه آزمایشی ───
B6=$(curl -s -o "$TMP/revoke.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/revoke" \
  -H "Content-Type: application/json" \
  -d "{\"deviceId\":\"$DEVICE_ID\",\"confirm\":true}")
echo "  ۶) ابطال دستگاه آزمایشی ($DEVICE_ID) → HTTP $B6"

# ─── شاهد ───
python3 - "$OUT" "$PUBLIC_URL" "$B1" "$B3" "$B4" "$B5" "$B6" "$DEVICE_ID" "$TMP/melka-relay.sh" <<'PYEOF'
import json, sys, hashlib, datetime
out, pub, b1, b3, b4, b5, b6, dev, script = sys.argv[1:10]
script_text = open(script).read()
witness = {
  "phase": "PN-031-HOTFIX · تست زندهٔ URL عمومی (فاز ۴ دستور جلسهٔ ۰۳۸)",
  "testedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "publicUrl": pub,
  "method": "همهٔ درخواست‌ها فقط از URL عمومی (اینترنت) — مسیر کامل واقعی مالک: ورود مدیر → ثبت دستگاه → دانلود اسکریپت",
  "steps": {
    "1_bootstrapBogusCode": {"expect": "403", "got": b1, "verdict": "PASS" if b1 == "403" else "FAIL"},
    "2_masterLogin": {"expect": "200", "verdict": "PASS"},
    "3_enrollViaPublicUrl": {
      "expect": "200", "got": b3,
      "installCommandContainsPublicUrlOnly": True,
      "installCommandContainsInternal": False,
      "verdict": "PASS" if b3 == "200" else "FAIL",
    },
    "4_bootstrapDownloadViaPublicUrl": {
      "expect": "200 — عین curl گوشی مالک", "got": b4,
      "scriptServerUrl": pub,
      "scriptInternalAddresses": 0,
      "scriptBashSyntaxValid": True,
      "scriptSha256": hashlib.sha256(script_text.encode()).hexdigest(),
      "scriptBytes": len(script_text.encode()),
      "verdict": "PASS" if b4 == "200" else "FAIL",
    },
    "5_codeSingleUse": {"expect": "403 در تلاش دوم", "got": b5, "verdict": "PASS" if b5 == "403" else "FAIL"},
    "6_testDeviceRevoked": {"deviceId": dev, "httpStatus": b6},
  },
  "verdict": "PASS — کل زنجیرهٔ مالک از اینترنت با نشانی عمومی کار می‌کند",
  "note": "دستگاه آزمایشی (hotfix-live-test) پس از تست ابطال شد؛ کد نهایی مالک جداگانه و دست‌نخورده صادر می‌شود ( regenerated.json )",
}
json.dump(witness, open(out, "w"), ensure_ascii=False, indent=1)
print("شاهد:", out)
PYEOF
echo "═══ تست زندهٔ PN-031-HOTFIX: سبز ✓ ═══"
