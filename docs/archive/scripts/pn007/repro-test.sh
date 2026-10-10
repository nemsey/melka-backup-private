#!/usr/bin/env bash
# ============================================================
# PN-007 BLOCK 1.3 — آزمون بازتولیدپذیری Build
# ملکا-شورا-ن۰۰۷-۱۴۰۵ · فاز ۰.۵
# ------------------------------------------------------------
# ۱) Build شمارهٔ ۱ → اثر انگشت ۱
# ۲) rm -rf .next
# ۳) Build شمارهٔ ۲ → اثر انگشت ۲
# ۴) مقایسهٔ فیلد‌به‌فیلد — باید یکسان باشند «مگر builtAt»
# شاهد: download/pn007/fingerprint-proof.json
# معیار پذیرش: ≥ ۹۵٪ فیلدهای قابل‌مقایسه یکسان + صفر تفاوت غیرمجاز
# ============================================================
set -uo pipefail
cd /home/z/my-project
mkdir -p scripts/pn007/results download/pn007

run_build () {
  local LABEL="$1"
  local LOG="scripts/pn007/results/build-${LABEL}.buildlog"
  echo "[repro-test] Build ${LABEL} — شروع $(date -u +%T)"
  local SECS=0; SECONDS=0
  bun run build > "$LOG" 2>&1 &
  local BPID=$!
  python3 scripts/pn006/tree-peak.py "$BPID" "scripts/pn007/results/build-${LABEL}.tree.json" --label "$LABEL" > /dev/null 2>&1 &
  local PPID2=$!
  wait $BPID; local CODE=$?
  local WALL=$SECONDS
  kill $PPID2 2>/dev/null || true; wait $PPID2 2>/dev/null || true
  echo "[repro-test] Build ${LABEL} — پایان، کد=${CODE}، زمان=${WALL}s"
  if [[ $CODE -ne 0 ]]; then echo "[repro-test] ✗ بیلد شکست خورد — لاگ: $LOG"; exit 1; fi
}

echo "═══ ۱) بیلد اول ═══"
run_build "pn007-repro-1"
cp .next/fingerprint.json download/pn007/fingerprint-1.json
cp .next/BUILD_ID scripts/pn007/results/build-1.BUILD_ID.txt
echo "BUILD_ID₁ = $(cat .next/BUILD_ID)"

echo "═══ ۲) پاک‌سازی کامل خروجی ═══"
rm -rf .next
[[ ! -d .next ]] && echo ".next حذف شد ✓"

echo "═══ ۳) بیلد دوم (از صفر) ═══"
run_build "pn007-repro-2"
cp .next/fingerprint.json download/pn007/fingerprint-2.json
cp .next/BUILD_ID scripts/pn007/results/build-2.BUILD_ID.txt
echo "BUILD_ID₂ = $(cat .next/BUILD_ID)"

echo "═══ ۴) مقایسهٔ اثر انگشت ═══"
bun run scripts/pn007/compare-fingerprints.ts \
  download/pn007/fingerprint-1.json \
  download/pn007/fingerprint-2.json \
  download/pn007/fingerprint-proof.json
CODE=$?
if [[ $CODE -eq 0 ]]; then echo "✅ آزمون بازتولیدپذیری PASS"; else echo "✗ آزمون FAIL"; exit 1; fi
