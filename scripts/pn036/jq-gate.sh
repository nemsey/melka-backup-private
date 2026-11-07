#!/usr/bin/env bash
# PN-036 · فاز ۱ — دروازهٔ jq: ادغام ۱۰۰ و ۵۰۰ فایل نتیجه (رفع ARG_MAX)
# شبیه‌سازی دقیق خط‌ِ شکستهٔ گوشی: فایل‌های نتیجه با bodyB64 بزرگ (فهرست ۵۰۰رکوردی)
set -u
DIR="${1:-/tmp/pn036-jq-test}"; N="${2:-100}"; MODE="${3:-gen-k}"
rm -rf "$DIR"; mkdir -p "$DIR"

# ساخت فایل‌های نتیجه واقع‌نما — هر رکورد ~3KB base64 (فهرست سنگین)
for i in $(seq 1 "$N"); do
  BIG=$(head -c 3072 /dev/zero | base64 -w0 2>/dev/null || head -c 3072 /dev/zero | base64 | tr -d '\n')
  jq -nc --arg id "jobitem-$(printf '%04d' "$i")" --argjson code 200 --arg ct "application/json" --arg b64 "$BIG" \
    '{id:$id,httpStatus:$code,contentType:$ct,bodyB64:$b64}' > "$DIR/$(printf '%04d' "$i").json" &
  if [ $(( i % 8 )) -eq 0 ]; then wait; fi
done
wait

echo "── $N فایل ساخته شد (اندازه کل: $(du -sh "$DIR" | cut -f1))"

# ── الگوی قدیمی (نسل J — انتظار شکست برای N بزرگ) ──
if [ "$MODE" = "old" ]; then
  RESULT_JSON=$(jq -sc '.' "$DIR"/*.json 2>&1 >/dev/null) ; RC=$?
  echo "OLD merge rc=$RC: $RESULT_JSON" | head -c 200
  exit 0
fi

# ── الگوی تازه (نسل K — stdin + cat) ──
T0=$(date +%s%N)
RESULT_JSON=$(cat "$DIR"/*.json 2>/dev/null | jq -sc '.' 2>/dev/null || echo "")
T1=$(date +%s%N)
LEN=$(printf '%s' "$RESULT_JSON" | jq 'length' 2>/dev/null)
MS=$(( (T1 - T0) / 1000000 ))
echo "── NEW merge (cat | jq -sc): $LEN نتیجه در ${MS}ms · طول payload: ${#RESULT_JSON} کاراکتر"
[ "$LEN" = "$N" ] && echo "✓ PASS: jq با $N فایل — $N/$N نتیجه ادغام شد" || { echo "✗ FAIL: $LEN ≠ $N"; exit 1; }

# ── الگوی تازه (نسل K — b64 از فایل با --rawfile؛ رفع خط ۳۷۱) ──
B64F=$(mktemp)
head -c 2000000 /dev/zero | base64 -w0 > "$B64F"   # بدنهٔ ~2MB base64 — در نسل J آرگومان > سقف
T0=$(date +%s%N)
jq -nc --arg id "big-item" --argjson code 200 --arg ct "application/json" --rawfile b64 "$B64F" \
  '{id:$id,httpStatus:$code,contentType:$ct,bodyB64:$b64}' > /tmp/pn036-big-item.json 2>/tmp/pn036-big-err
RC=$?
T1=$(date +%s%N)
MS=$(( (T1 - T0) / 1000000 ))
B64LEN=$(jq -r '.bodyB64 | length' /tmp/pn036-big-item.json 2>/dev/null || echo 0)
echo "── NEW b64 (--rawfile): rc=$RC در ${MS}ms · طول bodyB64: $B64LEN"
[ "$RC" = "0" ] && [ "$B64LEN" -gt 2600000 ] && echo "✓ PASS: b64 2MB با --rawfile بدون ARG_MAX" || { echo "✗ FAIL b64"; exit 1; }
rm -f "$B64F"
echo "════ نتیجهٔ نهایی فاز ۱: $N فایل — PASS ════"
