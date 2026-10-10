#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# PN-011 اولاً — تمرین شبیه‌سازی کامل بازنشانی محیط (Drill v2 — سخت‌گیرانه)
# «این مشکل با تکرار مجدد را به هر طریق ممکن برای همیشه رفع گردد»
#
# نسخهٔ v2 از دریل اول سخت‌گیرانه‌تر است: در دریل اول، نگهبانِ از قبل زنده
# کلید را در snapshot محیطی خود داشت و تازه‌بوت شدن سرور کافی بود. اینجا
# «کل زنجیرهٔ بوت» با محیط تخریب‌شده از صفر بالا می‌آید — عین بازنشانی
# واقعی پلتفرم که در آن هیچ فرایندی حافظهٔ قبلی ندارد:
#   ۱) env.platform.json حذف + MELK_TOKEN_KEY از .env.local زدوده
#   ۲) نگهبان و سرور هر دو کشته می‌شوند (هیچ حافظه‌ای باقی نمی‌ماند)
#   ۳) بوت رسمی از start-prod-daemon (مسیر پنجمین بازنشانی پلتفرم)
# انتظار: نگهبان کلید را از escrow بادوام بازیابی می‌کند ← سرور 200
# ═══════════════════════════════════════════════════════════════════════
set -uo pipefail
cd /home/z/my-project

# بازگردانی تضمینی .env.local حتی اگر اسکریپت وسط کار شکست بخورد (idempotent)
restore_env() {
  if [[ -f /tmp/env.local.drill-backup ]]; then
    cp /tmp/env.local.drill-backup .env.local
    chmod 600 .env.local
  fi
}
trap restore_env EXIT

echo "[drill-v2] تخریب کامل محیط + ری‌استارت کل زنجیره از صفر"
BEFORE_KEY=$(grep '^MELK_TOKEN_KEY=' .env.local | cut -d= -f2 | tr -d '\n')
if [[ -z "$BEFORE_KEY" ]]; then
  # حالت idempotent: اگر کلید از اجرای قبلیِ ناتمام غایب است، از escrow برمی‌گردد
  BEFORE_KEY=$(python3 -c "import json;print(json.load(open('upload/.runtime/boot-secrets.json'))['MELK_TOKEN_KEY'])" 2>/dev/null || echo "")
  if [[ -n "$BEFORE_KEY" ]] && ! grep -q '^MELK_TOKEN_KEY=' .env.local; then
    echo "MELK_TOKEN_KEY=$BEFORE_KEY" >> .env.local
    cp .env.local /tmp/env.local.drill-backup
  fi
fi
BEFORE_FP=$(printf %s "$BEFORE_KEY" | sha256sum | cut -c1-10 | tr -d ' ')

# ۱) تخریب — عین بازنشانی پلتفرم
cp .env.local /tmp/env.local.drill-backup
grep -v '^MELK_TOKEN_KEY=' /tmp/env.local.drill-backup > .env.local
rm -f env.platform.json
echo "[drill-v2] env تخریب شد؛ کشتن کل زنجیره (نگهبان + سرور)"
touch .prod-stop
pkill -f "prod-watchdog.sh" 2>/dev/null
pkill -f "standalone/server.js" 2>/dev/null
sleep 3
rm -f .prod-stop
pkill -f "standalone/server.js" 2>/dev/null
sleep 2

# ۲) بوت رسمی از صفر — مسیر start-prod-daemon (عین پنجمین بازنشانی)
python3 scripts/start-prod-daemon.py >/dev/null 2>&1
T0=$(date +%s)
HTTP="000"
for i in $(seq 1 60); do
  sleep 1
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/api/health 2>/dev/null || echo 000)
  if [[ "$HTTP" == "200" ]]; then break; fi
done
T1=$(date +%s)
RECOVERED_SEC=$((T1 - T0))

# ۳) شواهد خوددرمانی — اثر انگشت کلیدِ بازیابی‌شده باید با قبل یکی باشد
ESCROW_FP=$(python3 -c "import json,hashlib;print(hashlib.sha256(json.load(open('upload/.runtime/boot-secrets.json'))['MELK_TOKEN_KEY'].encode()).hexdigest()[:10])" 2>/dev/null | tr -d ' \n' || echo "MISSING")
# «زنده» = کلیدی که خودِ سیستمِ بوت‌شده در env.platform.json (بازسازی‌شده در همین بوت)
# نوشته — .env.local وسط دریل عمداً خراب است و معیار نیست.
LIVE_FP=$(python3 -c "import json,hashlib;print(hashlib.sha256(json.load(open('env.platform.json'))['MELK_TOKEN_KEY'].encode()).hexdigest()[:10])" 2>/dev/null | tr -d ' \n' || echo "MISSING")
KEY_OK="false"; [[ "$BEFORE_FP" == "$ESCROW_FP" && "$BEFORE_FP" == "$LIVE_FP" ]] && KEY_OK="true"
PLATFORM_REGEN="false"; [[ -f env.platform.json ]] && PLATFORM_REGEN="true"
WATCHDOG_HEAL=$(grep -c "خوددرمانی" server.log 2>/dev/null; true)
WATCHDOG_HEAL=${WATCHDOG_HEAL:-0}

echo "[drill-v2] http=$HTTP در ${RECOVERED_SEC}s | کلید سه‌گانه یکی است: $KEY_OK | env.platform.json بازسازی: $PLATFORM_REGEN"

# ۴) بازگردانی .env.local — با trap EXIT تضمین شده است (بالا)

python3 - "$HTTP" "$RECOVERED_SEC" "$KEY_OK" "$PLATFORM_REGEN" "$WATCHDOG_HEAL" "$BEFORE_FP" "$ESCROW_FP" "$LIVE_FP" <<'PYEOF'
import json, sys
http, sec, key_ok, regen, wd_heal, fp_before, fp_escrow, fp_live = sys.argv[1:]
result = {
    "scenario": "دریل v2 — تخریب کامل env (حذف env.platform.json + کلید) + ری‌استارت کل زنجیرهٔ بوت از صفر؛ عین پنجمین بازنشانی پلتفرم",
    "verdict": "PASS" if (http == "200" and key_ok == "true") else "FAIL",
    "httpAfterColdBoot": http,
    "recoverySeconds": int(sec),
    "tokenKeyTripleMatch": key_ok == "true",
    "fingerprints": {"before": fp_before, "escrow": fp_escrow, "liveRegeneratedEnvPlatform": fp_live},
    "envPlatformRegenerated": regen == "true",
    "watchdogHealEchoes": int(wd_heal),
    "layers": [
        "لایهٔ ۱ (نگهبان پوسته): escrow_get ← export MELK_TOKEN_KEY ← spawn سرور",
        "لایهٔ ۲ (instrumentation): ensureBootSecrets ← assertProductionSecrets پاس",
        "لایهٔ ۳ (بازسازی env.platform.json): merge از رازهای سالم",
    ],
    "downtime": f"≈{sec} ثانیه — بدون هیچ مداخلهٔ دستی (پیش‌تر: قطعی کامل تا ورود مهندس)",
    "note": "PN-011 اولاً — مصوبهٔ مالک: رفع برای همیشه",
}
json.dump(result, open("download/pn011/reset-drill.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps(result, ensure_ascii=False, indent=2))
PYEOF
