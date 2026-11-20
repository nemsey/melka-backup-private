#!/usr/bin/env bash
# DIR-RELAY-ARMFENCE-001 — شبیه‌سازی زندهٔ حاکم تطبیقی ARM (همان توابع تولیدشده)
# استخراج توابع نسل P از اسکریپت تولیدی و اجرای سناریو: بن تشدیدی → پژواک → بهبود
set -u
cd /home/z/my-project
OUT=$(mktemp -d)
bun -e '
import { buildRelayScript } from "./src/lib/melk-api/relay-script";
import { writeFileSync } from "node:fs";
writeFileSync(process.argv[1], buildRelayScript({serverUrl:"https://x.example",deviceId:"d",deviceSecret:"s"}));
' "$OUT/relay.sh" 2>/dev/null || { echo "FAIL: generate"; exit 1; }

# استخراج بخش توابع حاکم + وابستگی‌ها در یک فایل قابل‌اجرای مستقل
{
  echo '#!/usr/bin/env bash'
  echo 'set -u'
  echo 'log() { echo "[$(date +%H:%M:%S)] $*"; }'
  echo 'is_interactive() { case "$1" in *"/authentication/otp"*) return 0 ;; *) return 1 ;; esac; }'
  echo 'BOOST_MODE=0'
  # ثابت‌های نسل P
  sed -n '/^ARM_RATE_MAX=/,/^ARM_REQ_TIMES=()/p' "$OUT/relay.sh"
  # توابع نسل P
  sed -n '/^arm_rate_gate()/,/^}/p' "$OUT/relay.sh"
  sed -n '/^arm_cooldown_left()/,/^}/p' "$OUT/relay.sh"
  sed -n '/^arm_waf_hit()/,/^}/p' "$OUT/relay.sh"
  sed -n '/^arm_healthy()/,/^}/p' "$OUT/relay.sh"
  # آزمون‌ها
  cat <<'EOF'
echo "── سناریو ۱: ضربهٔ نخست WAF (403 بدون Retry-After) ──"
arm_waf_hit 403 0
[ "$ARM_WAF_STREAK" -eq 1 ] && echo "PASS streak=1" || { echo "FAIL streak=$ARM_WAF_STREAK"; exit 1; }
[ "$ARM_RATE_CURRENT" -eq 30 ] && echo "PASS rate 60→30" || { echo "FAIL rate=$ARM_RATE_CURRENT"; exit 1; }
[ "$ARM_CONC" -eq 2 ] && echo "PASS conc→2" || { echo "FAIL conc=$ARM_CONC"; exit 1; }
L=$(arm_cooldown_left)
[ "$L" -gt 0 ] && [ "$L" -le 20 ] && echo "PASS cooldown≈20s (left=$L)" || { echo "FAIL left=$L"; exit 1; }

echo "── سناریو ۲: پژواک در قطع فعال → تشدید نمی‌کند ──"
S_BEFORE=$ARM_WAF_STREAK
arm_waf_hit 403 0
[ "$ARM_WAF_STREAK" -eq "$S_BEFORE" ] && echo "PASS echo ignored (streak=$ARM_WAF_STREAK)" || { echo "FAIL streak grew to $ARM_WAF_STREAK"; exit 1; }

echo "── سناریو ۳: پس از قطع، بن دوم با Retry-After سرور ──"
ARM_WAF_COOLDOWN_UNTIL=0
arm_waf_hit 420 45
[ "$ARM_WAF_STREAK" -eq 2 ] && echo "PASS streak=2" || { echo "FAIL streak=$ARM_WAF_STREAK"; exit 1; }
L=$(arm_cooldown_left)
[ "$L" -gt 40 ] && [ "$L" -le 45 ] && echo "PASS server Retry-After honored (left=$L)" || { echo "FAIL left=$L"; exit 1; }
[ "$ARM_RATE_CURRENT" -eq 15 ] && echo "PASS rate→min 15" || { echo "FAIL rate=$ARM_RATE_CURRENT"; exit 1; }

echo "── سناریو ۴: سهمیهٔ 402 با سقف کوتاه‌تر ──"
ARM_WAF_COOLDOWN_UNTIL=0; ARM_WAF_STREAK=3; ARM_RATE_CURRENT=60
arm_waf_hit 402 0
L=$(arm_cooldown_left)
[ "$L" -le 30 ] && echo "PASS 402 cap 30s (left=$L)" || { echo "FAIL left=$L"; exit 1; }

echo "── سناریو ۵: بهبود تدریجی — ۱۰ پاسخ سالم → نرخ/همزمانی صعود ──"
ARM_WAF_COOLDOWN_UNTIL=0; ARM_WAF_STREAK=2; ARM_RATE_CURRENT=15; ARM_CONC=2; ARM_HEALTHY_STREAK=0
for i in 1 2 3 4 5 6 7 8 9 10; do arm_healthy; done
[ "$ARM_RATE_CURRENT" -eq 30 ] && echo "PASS rate 15→30" || { echo "FAIL rate=$ARM_RATE_CURRENT"; exit 1; }
[ "$ARM_CONC" -eq 3 ] && echo "PASS conc 2→3" || { echo "FAIL conc=$ARM_CONC"; exit 1; }
[ "$ARM_WAF_STREAK" -eq 1 ] && echo "PASS streak halved 2→1" || { echo "FAIL streak=$ARM_WAF_STREAK"; exit 1; }

echo "── سناریو ۶: سقف نرخ در حالت boost ──"
BOOST_MODE=1; ARM_RATE_CURRENT=115
for i in $(seq 1 10); do arm_healthy; done
[ "$ARM_RATE_CURRENT" -eq 120 ] && echo "PASS boost cap 120" || { echo "FAIL rate=$ARM_RATE_CURRENT"; exit 1; }
BOOST_MODE=0
echo "── ALL GOVERNOR SCENARIOS PASSED ──"
EOF
} > "$OUT/gov-test.sh"
chmod +x "$OUT/gov-test.sh"
bash "$OUT/gov-test.sh"
RC=$?
rm -rf "$OUT"
exit $RC
