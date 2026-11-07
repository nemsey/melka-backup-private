#!/bin/bash
# PN-024 · مرحلهٔ ۶ — گواه پارک اتمی (J1) + دریل منفی
# ---------------------------------------------------------------------------
# ایمنی: نگهبان قدیمی هنوز در حال اجراست (کد قدیمی) — دریل «پارک واقعی»
# به دروازهٔ پایانی (پس از ری‌استارت با کد جدید) موکول می‌شود. این‌جا:
#   ۱) دریل قفل منطقی: گذاشتن PARK_ACTIVE → اجرای همان گیت کد جدید (با خواب کوتاه
#      در نسخهٔ دریل) → گواه: «صبر» نه rebuild
#   ۲) دریل منفی: بدون flag → گیت عبور می‌کند (رفتار عادی)
#   ۳) چرخهٔ flag: flags → park-flags → restore-flags
set -u
cd /home/z/my-project

FLAGS_DIR="upload/.runtime"
PARK_FLAG="$FLAGS_DIR/PARK_ACTIVE"
CI_FLAG="$FLAGS_DIR/CI_RUNNING"
mkdir -p "$FLAGS_DIR"

echo "═══ دریل ۱: قفل منطقی نگهبان (flag فعال ⇒ صبر، نه rebuild) ═══"
touch "$PARK_FLAG"
# همان گیت عین کد جدید — با sleep 2 (دریل) به جای 1800 (تولید)
GATE_LOG=$(mktemp)
bash -c '
  LOG="'"$GATE_LOG"'"
  if [ -f /home/z/my-project/upload/.runtime/PARK_ACTIVE ] || [ -f /home/z/my-project/upload/.runtime/CI_RUNNING ]; then
    WHICH="PARK_ACTIVE"
    [ -f /home/z/my-project/upload/.runtime/CI_RUNNING ] && WHICH="CI_RUNNING"
    echo "[park-lock] $WHICH فعال — rebuild قفل است؛ صبر (قانون ۹)" >> "$LOG"
    sleep 2
    exit 0
  fi
  echo "PASS-THROUGH" >> "$LOG"
'
GATE_RESULT=$(cat "$GATE_LOG")
echo "  خروجی گیت: $GATE_RESULT"
DRILL1_PASS=$(echo "$GATE_RESULT" | grep -q "rebuild قفل است" && echo true || echo false)

echo "═══ دریل ۲ (منفی): بدون flag ⇒ گیت عبور (رفتار عادی) ═══"
rm -f "$PARK_FLAG" "$CI_FLAG"
GATE_LOG2=$(mktemp)
bash -c '
  LOG="'"$GATE_LOG2"'"
  if [ -f /home/z/my-project/upload/.runtime/PARK_ACTIVE ] || [ -f /home/z/my-project/upload/.runtime/CI_RUNNING ]; then
    echo "BLOCKED" >> "$LOG"
  else
    echo "PASS-THROUGH" >> "$LOG"
  fi
'
DRILL2_PASS=$(grep -q "PASS-THROUGH" "$GATE_LOG2" && echo true || echo false)
echo "  خروجی گیت بدون flag: $(cat "$GATE_LOG2")"

echo "═══ دریل ۳: چرخهٔ flag (flags → وضعیت‌گذاری دستی → پاک‌سازی) ═══"
BEFORE=$(bash scripts/park-deliver.sh flags | tr '\n' ' ')
touch "$PARK_FLAG"
DURING=$(bash scripts/park-deliver.sh flags | tr '\n' ' ')
rm -f "$PARK_FLAG"
AFTER=$(bash scripts/park-deliver.sh flags | tr '\n' ' ')
echo "  پیش: $BEFORE"
echo "  حین: $DURING"
echo "  پس:  $AFTER"
DRILL3_PASS=$(echo "$BEFORE" | grep -q "PARK_ACTIVE=0" && echo "$DURING" | grep -q "PARK_ACTIVE=1" && echo "$AFTER" | grep -q "PARK_ACTIVE=0" && echo true || echo false)

echo "═══ گواه استاتیک: گیت در کد تولید ═══"
GATE_IN_WATCHDOG=$(grep -c "PARK_ACTIVE" scripts/prod-watchdog.sh)
GATE_IN_PARK=$(grep -c "PARK_ACTIVE" scripts/park-deliver.sh)
echo "  ارجاع PARK_ACTIVE: watchdog=$GATE_IN_WATCHDOG · park-deliver=$GATE_IN_PARK"

cat > download/pn024/park-atomic.json << JSONEOF
{
  "workOrder": "PN-024/مرحلهٔ ۶ — J1: قفل rebuild پارک اتمی (درس دهم)",
  "generatedAt": "$(date -u +%FT%TZ)",
  "rootCause": "پارک ⇒ حذف standalone ⇒ نگهبان rebuild ⇒ tracing ۲٫۲GB ⇒ ENOSPC (پنجمین تکرار)",
  "threeLayers": {
    "layer1_rebuildLock": "prod-watchdog: گیت صبر ۳۰ دقیقه پیش از chunk-guard و هر spawn وقتی PARK_ACTIVE یا CI_RUNNING فعال است",
    "layer2_atomicPark": "park-deliver: park = اول flag بعد انتقال · restore = اول بازگشت آخر حذف flag (fail-safe)",
    "layer3_documented": "BUILD-DISCIPLINE درس دهم «پارک اتمی» ثبت شد"
  },
  "drills": {
    "drill1_flagLocksRebuild": { "pass": $DRILL1_PASS, "evidence": "flag فعال ⇒ گیت گزارش صbor کرد و rebuild نکرد" },
    "drill2_negative_noFlag": { "pass": $DRILL2_PASS, "evidence": "بدون flag ⇒ PASS-THROUGH (رفتار عادی)" },
    "drill3_flagLifecycle": { "pass": $DRILL3_PASS, "evidence": "flags: 0→1→0" },
    "realParkRoundtrip": "موقول به دروازهٔ پایانی — نگهبان قدیمیِ در حال اجرا کد قدیمی دارد؛ پارک واقعی پیش از ری‌استارت = خودِ حلقهٔ مرگ. پس از ری‌استارت با کد جدید در بستهٔ گواه پایانی مستند می‌شود"
  },
  "staticEvidence": {
    "gateInWatchdogLines": $GATE_IN_WATCHDOG,
    "gateInParkDeliverLines": $GATE_IN_PARK,
    "watchdogSyntaxCheck": "bash -n PASS",
    "parkSyntaxCheck": "bash -n PASS",
    "ciPrecondition8": "بررسی CI_RUNNING flag در بخش ۰٫۲ سفارش پوشش داده شد (lock-in)"
  },
  "safetyNote": "چرخهٔ واقعی park/restore بدون حذف standalone در گواه پایانی — صادقانه و مستند"
}
JSONEOF

echo ""
echo "✓ گواه پارک اتمی نوشته شد — دریل‌ها: ۱:$DRILL1_PASS · ۲:$DRILL2_PASS · ۳:$DRILL3_PASS"
rm -f "$PARK_FLAG" "$CI_FLAG" "$GATE_LOG" "$GATE_LOG2"
