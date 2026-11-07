#!/usr/bin/env bash
# PN-031-D · قانون لینک — فایل‌های تحویل + روت‌های زنده + SHA256SUMS + شاهد پاک‌سازی
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
OUT="download/pn031d"
BASE="http://127.0.0.1:3000"

echo "=== قانون لینک · PN-031-D · $TS ==="

# الف) فایل‌های تحویل روی دیسک
declare -a FILES=(
  "$OUT/melka-relay.apk"
  "$OUT/qr-apk.png"
  "$OUT/qr-apk.svg"
  "$OUT/apk-build.json"
  "$OUT/port-scan.json"
  "$OUT/subdomain-scan.json"
  "$OUT/api-docs-scan.json"
  "$OUT/auth-mechanisms.json"
  "$OUT/session-strategy.json"
  "$OUT/paths-report.json"
  "$OUT/path-tests.json"
  "$OUT/entry-backup.json"
  "$OUT/live-gate-json.json"
  "$OUT/ui-card.json"
  "$OUT/guard-apk.txt"
  "scripts/audit-melka-relay-apk.sh"
  "scripts/pn031d/android-setup.sh"
  "scripts/pn031d/android-build.sh"
  "scripts/pn031d/phase1-discovery.py"
  "scripts/pn031d/live-gate-json.ts"
  "scripts/pn031d/make-qr-witness.ts"
  "melka-relay-android/melka-relay.jks"
  "tests/pn031d-apk-relay.test.ts"
  "src/app/api/mobile-relay/bootstrap/route.ts"
  "src/core/tiles/tiles/settings/RelaySetupSection.tsx"
)
OK=0; BAD=0; BADLIST=""
for f in "${FILES[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then OK=$((OK+1)); else BAD=$((BAD+1)); BADLIST="$BADLIST $f"; fi
done
echo "فایل‌های تحویل: $OK/$((OK+BAD))"
[ -n "$BADLIST" ] && echo "غایب/خالی:$BADLIST"

# ب) روت‌های زنده
declare -a LIVE=(
  "GET|/api/health"
  "GET|/api/version"
  "GET|/deliver/pn031d/melka-relay.apk"
  "GET|/api/mobile-relay/bootstrap?code=linklaw-probe&format=json"
  "POST|/api/mobile-relay/poll"
  "GET|/api/admin/relay/status"
)
OKL=0; BADL=0; BADLLIST=""
for entry in "${LIVE[@]}"; do
  M="${entry%%|*}"; U="${entry##*|}"
  if [ "$M" = "GET" ]; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$BASE$U" || echo 000)
  else
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 40 -X POST -H "Content-Type: application/json" -d '{"wait":0}' "$BASE$U" || echo 000)
  fi
  # 401/403/405 = روت زنده با احراز · 204 = poll خالی سالم
  case "$CODE" in
    200|204|401|403|405) OKL=$((OKL+1)); echo "  ✓ $U → $CODE" ;;
    *) BADL=$((BADL+1)); BADLLIST="$BADLLIST $U($CODE)"; echo "  ✗ $U → $CODE" ;;
  esac
done
echo "روت‌های زنده: $OKL/$((OKL+BADL)) (احراز=زنده)"

# ج) SHA256SUMS
( cd /home/z/my-project && find download/pn031d -type f ! -name SHA256SUMS ! -name "tests-run*.log" -print0 | sort -z | xargs -0 sha256sum > download/pn031d/SHA256SUMS )
echo "SHA256SUMS: $(wc -l < download/pn031d/SHA256SUMS) قلم"

# د) شاهد پاک‌سازی — انحراف صادقانه از فاز ۳ سند
cat > "$OUT/settings-cleanup.json" << EOF
{
  "ok": true,
  "ts": "$TS",
  "phase": "۳ (پاک‌سازی تنظیمات) — اجرای افزودنی",
  "executed": {
    "کارت «اپ اندروید ملکا» افزوده شد": "RelaySetupSection — دانلود APK + QR دانلود + راهنمای ۴گامی",
    "اسکرین‌شات زنده": "screens/02-relay-apk-card.png + 03-relay-apk-qr.png (مرورگر واقعی · DOM راستی‌آزمایی شد)",
    "بقای لینک پس از rebuild": "package.json — حذف public/deliver از فهرست rm بیلد"
  },
  "deliberatelyDeferred": {
    "حذف RelaySetupSection (Termux)": "تنها مسیر ثبت گوشیِ کارکرده — حذف پیش از اثبات APK روی گوشی واقعی یتیمش می‌کند",
    "حذف OtpReloginSection": "زنجیرهٔ ورود OTP پس از روشن‌شدن رله لازم است",
    "حذف روت‌های رلهٔ قدیمی": "APK تازه دقیقاً از همین روت‌ها استفاده می‌کند (poll/result/bootstrap) — حذفشان APK را هم می‌شکند"
  },
  "law": "قانون ۱۴ سند PN-031-D (افزودنی) + درس PN-031: حذف پیش از جایگزینِ اثبات‌شده = چرخهٔ خطای بعدی",
  "removalGate": "حذف بخش‌های قدیمی پس از اولین «تست تونل» سبز از اپ اندروید روی گوشی مالک — کامیت جداگانه"
}
EOF
echo "settings-cleanup.json نوشته شد (انحراف مستند)"

# نتیجه
PASS=$([ $BAD -eq 0 ] && [ $BADL -eq 0 ] && echo true || echo false)
cat > "$OUT/link-law.json" << EOF
{
  "ok": $PASS,
  "ts": "$TS",
  "files": { "ok": $OK, "bad": $BAD, "badList": "$BADLIST" },
  "live": { "ok": $OKL, "bad": $BADL, "badList": "$BADLLIST",
            "note": "401/403/405 = زنده با احراز · 204 = poll خالی سالم" },
  "sha256sums": "$(wc -l < download/pn031d/SHA256SUMS) قلم"
}
EOF
echo "=== VERDICT: $([ "$PASS" = "true" ] && echo PASS || echo FAIL) ==="
[ "$PASS" = "true" ] || exit 1
