#!/usr/bin/env bash
# ============================================================
# recover-all.sh — بازیابی جامع: کد + دیتا (PN-041 · فاز ۵ · شورا-ن۰۶۷)
# ------------------------------------------------------------
# «GLM، سرور ریست شده. bash scripts/recover-all.sh را اجرا کن.»
# — تنها جمله‌ای که مالک پس از هر ریست لازم دارد (~۲-۳ دقیقه · صفر دانش فنی).
#
# زنجیرهٔ چهار-لایه:
#   ۱) سپر گیت‌هاب (PN-040) — کد از origin/main (قانون ۰۳۱: همیشه سالم‌ترین)
#   ۲) گارد قلعهٔ داده (PN-041) — دیتا از بهترین لایه
#      (قلعه → چرخشی ۵د → مقدس → pre-stop → بقا → ابر)
#   ۳) بیلد اگر کهنه (درس OOM: توقف تمیز پیش از بیلد — سپر خودش انجام می‌دهد)
#   ۴) بوت نگهبان + وارسی /api/version
#
# قانون ۱۱ (توقف ناپذیری): شکست هر لایه هرگز اجرا را نمی‌ایستاند —
# سرو از بهترین وضعیت موجود ادامه می‌یابد و شکست ثبت می‌شود.
# لاگ: upload/.survival/recovery-log.jsonl · شاهد: upload/.runtime/recover-all.json
# ============================================================
set -uo pipefail
cd /home/z/my-project

echo "═══ بازیابی جامع ملکا — کد + دیتا (PN-041 · شورا-ن۰۶۷) ═══"
T0=$(date +%s)

# ── ۱) کد از گیت‌هاب (سپر PN-040 — نرخ‌حد/بیلد/ری‌استارت خودش را دارد) ──
echo "— [۱/۴] بازیابی کد از سپر گیت‌هاب…"
if [ -f scripts/recovery/github-supreme-guard.sh ]; then
  FORCE_RECOVER=1 bash scripts/recovery/github-supreme-guard.sh recover \
    || echo "⚠ کد از گیت‌هاب بازیابی نشد — سرو از نسخهٔ محلی (قانون ۱۱)"
else
  echo "⚠ سپر گیت‌هاب موجود نیست — سرو از نسخهٔ محلی"
fi

# ── ۲) دیتا از بهترین لایه (گارد قلعه) ──
echo "— [۲/۴] بازیابی دیتا از گارد قلعه…"
if [ -f scripts/recovery/db-fortress-guard.sh ]; then
  FORCE_FORTRESS=1 bash scripts/recovery/db-fortress-guard.sh recover \
    || echo "⚠ گارد قلعه بازیابی کامل انجام نداد — ادامه با وضعیت موجود (قانون ۱۱)"
else
  echo "⚠ گارد قلعه موجود نیست — ادامه با دیتابیس موجود"
fi

# ── ۳) بیلد اگر کهنه/غایب ──
echo "— [۳/۴] وارسی بیلد…"
NEED_BUILD=0
[ -f .next/standalone/server.js ] || NEED_BUILD=1
if [ "$NEED_BUILD" = "0" ] && [ -f BUILD_ID ]; then
  LIVE_SHA="$(git rev-parse HEAD 2>/dev/null || echo "?")"
  # بیلد کهنه = مهر سپر BUILD-STALE را می‌گوید؛ اینجا فقط غیبت/کهنگِ آشکار
  BUILT_AT="$(stat -c %Y .next/standalone/server.js 2>/dev/null || echo 0)"
  HEAD_AT="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
  [ "$HEAD_AT" -gt "$BUILT_AT" ] && NEED_BUILD=1
fi
if [ "$NEED_BUILD" = "1" ]; then
  echo "— بیلد تازه لازم — توقف تمیز پیش از بیلد (درس OOM)…"
  touch .prod-stop 2>/dev/null || true
  pkill -f "standalone/server.js" 2>/dev/null || true
  for _k in $(seq 1 10); do sleep 2; pgrep -f "standalone/server.js" >/dev/null 2>&1 || break; done
  if bun install && bun run build; then
    echo "✓ بیلد سبز"
  else
    echo "⚠ بیلد ناکام — بوت نگهبان با بیلد موجود (قانون ۱۱)"
  fi
  rm -f .prod-stop 2>/dev/null || true
else
  echo "✓ بیلد موجود تازه است"
fi

# ── ۴) بوت نگهبان + وارسی نهایی ──
echo "— [۴/۴] بوت نگهبان production…"
pkill -f "prod-watchdog.sh" 2>/dev/null || true
sleep 2
pgrep -f "standalone/server.js" >/dev/null 2>&1 && pkill -f "standalone/server.js" 2>/dev/null || true
python3 scripts/pn040/daemonize-watchdog.py >/dev/null 2>&1 || bash scripts/prod-watchdog.sh &

echo "— وارسی نهایی (تا ۶۰ ثانیه)…"
OK=""
for i in $(seq 1 12); do
  sleep 5
  OK="$(curl -fsS -m 8 http://localhost:3000/api/version 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('gitSha',''))" 2>/dev/null || echo "")"
  [ -n "$OK" ] && break
done
DT=$(( $(date +%s) - T0 ))
python3 - "$DT" "$OK" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
json.dump({
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "tool": "recover-all (PN-041/۵ · شورا-ن۰۶۷)",
  "durationSec": int(sys.argv[1]),
  "liveBuildSha": sys.argv[2] or "unverified",
  "steps": ["github-supreme-guard recover", "db-fortress-guard recover", "build-if-stale", "watchdog+verify"],
}, open("upload/.runtime/recover-all.json", "w"), ensure_ascii=False, indent=2)
PYEOF
if [ -n "$OK" ]; then
  echo "✅ بازیابی کامل — سرور زنده روی بیلد $OK (مدت: ${DT}s)"
  exit 0
fi
echo "⚠ سرور در مهلت وارسی پاسخ نداد — نگهبان در چرخهٔ خود می‌کوشد"
exit 1
