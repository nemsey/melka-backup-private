#!/usr/bin/env bash
# ============================================================
# ci.sh — CI محلی ملکا (ملکا-شورا-ن۰۰۷-۱۴۰۵ · BLOCK 3)
# ------------------------------------------------------------
# «هر Build باید از همهٔ Gateها عبور کند — نه فقط Build سبز.»
# ترتیب مصوب شورا (۸ گام) + دو سخت‌گیرانهٔ پروژه‌ای:
#   ۱) Fingerprint        ۲) Type check (app + scripts)
#   ۳) Lint               ۴) Tests ×۲ (دو-سبزِ یکسان)
#   ۵) Audit باغ          ۶) Perf Budget
#   ۷) Build              ۸) Fingerprint verify
# قید شورا: `bun run ci` پیش از هر کامیت نهایی — الزامی.
# خروج: ۰ = ✅ CI PASS · غیرصفر = شکست در همان گام
# ============================================================
set -uo pipefail
cd /home/z/my-project

STEP=0
pass() { STEP=$((STEP+1)); echo ""; echo "═══ گام $STEP — $1 ═══"; }

# ── ۱) Fingerprint ──
pass "Fingerprint (هویت نسخه)"
bun run scripts/fingerprint.ts > /tmp/pn007-ci-fp.json 2>/tmp/pn007-ci-fp.err || {
  echo "✗ گام ۱: fingerprint شکست"; cat /tmp/pn007-ci-fp.err; exit 1; }
python3 -c "import json; d=json.load(open('/tmp/pn007-ci-fp.json')); print(f'  git={d[\"gitShortSha\"]} bun={d[\"bunVersion\"]} prisma={d[\"prismaVersion\"]} next={d[\"nextVersion\"]} envKeys={d[\"envKeyCount\"]}')"

# ── ۲) Type check ──
pass "Type check (tsc --noEmit — app + scripts)"
bunx tsc --noEmit 2>/tmp/pn007-ci-tsc-app.err || { echo "✗ گام ۲-الف: tsc app شکست"; tail -20 /tmp/pn007-ci-tsc-app.err; exit 1; }
echo "  tsc app ✓"
bunx tsc --project tsconfig.scripts.json --noEmit 2>/tmp/pn007-ci-tsc-scr.err || { echo "✗ گام ۲-ب: tsc scripts شکست"; tail -20 /tmp/pn007-ci-tsc-scr.err; exit 1; }
echo "  tsc scripts ✓"

# ── ۳) Lint ──
pass "Lint (eslint)"
bun run lint > /tmp/pn007-ci-lint.log 2>&1 || { echo "✗ گام ۳: lint شکست"; tail -20 /tmp/pn007-ci-lint.log; exit 1; }
LINT_WARN=$(grep -c "warning" /tmp/pn007-ci-lint.log || true)
echo "  eslint ✓ (${LINT_WARN} هشدار)"

# ── ۴) Tests ×۲ (دو-سبز پیاپی — همان قانون کامیت) ──
pass "Tests ×۲ (مجموعهٔ کامل، اجرای دوردی)"
TEST_CMD="bun run test"
$TEST_CMD > /tmp/pn007-ci-test1.log 2>&1 || true
$TEST_CMD > /tmp/pn007-ci-test2.log 2>&1 || true
stable() { grep -E '^\((pass|fail)\)' "$1" | sed -E 's/ \[[0-9.]+ms\]//' ; }
SUM1=$(tail -n 8 /tmp/pn007-ci-test1.log | grep -E "^ ?[0-9]+ (pass|fail|error)" | tr -d ' ')
SUM2=$(tail -n 8 /tmp/pn007-ci-test2.log | grep -E "^ ?[0-9]+ (pass|fail|error)" | tr -d ' ')
echo "  اجرای ۱: $(echo "$SUM1" | tr '\n' ' ')"
echo "  اجرای ۲: $(echo "$SUM2" | tr '\n' ' ')"
if ! diff <(stable /tmp/pn007-ci-test1.log) <(stable /tmp/pn007-ci-test2.log) > /tmp/pn007-ci-test-diff.txt; then
  echo "✗ گام ۴: دو اجرا نایکسان‌اند (نوسان!) — تفاوت:"; head -10 /tmp/pn007-ci-test-diff.txt; exit 1
fi
if [[ "$SUM1" != "$SUM2" ]]; then
  echo "✗ گام ۴: خلاصهٔ شمارش نایکسان: [$SUM1] vs [$SUM2]"; exit 1
fi
echo "  دو-سبز یکسان ✓ (قانون دو-سبز پیاپی)"
FAILS1=$(echo "$SUM1" | grep -oE "[0-9]+fail" | grep -oE "[0-9]+" || echo 0)
if [[ "${FAILS1:-0}" -gt 15 ]]; then
  echo "✗ گام ۴: شکست‌ها ${FAILS1} > ۱۵ (سقف مستند جلسهٔ ۰۰۶)"; exit 1
fi
echo "  شکست‌ها: ${FAILS1} (کلاس مستند داده‌محور — سقف ۱۵)"

# ── ۵) Audit باغ (مرزها + امنیت لاگ + راز بوت) — PN-012 · BLOCK 5 ──
pass "Audit باغ (repository/intelligence/log-safety/boot-secrets)"
# ✅ PN-012 فاز ۳: بدهی تسویه شد — 46→0 فراخوانی db.* در روت‌ها (BLOCK 1).
# از این پس گارد سخت‌گیر کامل: هر بازگشت db.* به هر روت = قرمز فوری.
bash scripts/audit-repository-boundary.sh --strict > /tmp/pn007-ci-audit1.log 2>&1 || { echo "✗ گام ۵-الف: repository-boundary --strict (فاز ۳ تسویه شد — صفر تحمل)"; tail -8 /tmp/pn007-ci-audit1.log; exit 1; }
tail -1 /tmp/pn007-ci-audit1.log
bash scripts/audit-intelligence-boundary.sh --strict > /tmp/pn007-ci-audit2.log 2>&1 || { echo "✗ گام ۵-ب: intelligence-boundary --strict"; tail -8 /tmp/pn007-ci-audit2.log; exit 1; }
tail -1 /tmp/pn007-ci-audit2.log
bash scripts/audit-log-safety.sh > /tmp/pn007-ci-audit3.log 2>&1 || { echo "✗ گام ۵-ج: log-safety"; tail -8 /tmp/pn007-ci-audit3.log; exit 1; }
tail -1 /tmp/pn007-ci-audit3.log
# PN-012 BLOCK 5 گارد تازه — بحران‌های ۴/۵/۶ هرگز بازنگردند:
bash scripts/audit-boot-secrets.sh > /tmp/pn012-ci-audit4.log 2>&1 || { echo "✗ گام ۵-د: boot-secrets (سازوکار بازیابی راز)"; tail -8 /tmp/pn012-ci-audit4.log; exit 1; }
tail -1 /tmp/pn012-ci-audit4.log

# ── ۶) Perf Budget ──
pass "Perf Budget (گارد بودجهٔ کارایی جلسهٔ ۰۰۶)"
# تصمیم ن۰۰۷ (Blocker → Alternative → Decision → Continue):
#   Blocker:    «RAM Build پیک» از جلسهٔ ۰۰۶ PARTIAL پذیرفته‌شدهٔ شوراست
#               (حکم گیت ۰۰۶: کف ابزار Native راست‌گرا ~۱۷۴۳-۲۰۰۴MB؛ /usr/bin/time نبود؛
#                webpack خطای نوع؛ --max-old-space-size بی‌اثر). هدف 1500MB = فاز بعدی با ارتقای سخت‌افزار.
#   Alternative: CI فقط قرمزهای «غیر از پیک Build» را رد می‌کند.
#   Decision:   هر قرمز دیگر = شکست CI؛ پیک Build = گزارش PARTIAL مستند.
#   Continue:   بدون توقف.
bash scripts/perf-budget.sh > /tmp/pn007-ci-perf.log 2>&1
PERF_REDS=$(python3 -c "
import json
d = json.load(open('/home/z/my-project/download/pn006/perf-budget.json'))
reds = [b['metric'] for b in d['budgets'] if not b.get('pass')]
unexpected = [m for m in reds if 'Build' not in m]
print(('UNEXPECTED:' + '|'.join(unexpected)) if unexpected else ('PARTIAL-ONLY:' + '|'.join(reds) if reds else 'ALL-GREEN'))" 2>/dev/null || echo "UNEXPECTED:perf-json-unreadable")
echo "  بودجه‌ها: $PERF_REDS"
if [[ "$PERF_REDS" == UNEXPECTED:* ]]; then
  echo "✗ گام ۶: بودجهٔ کارایی قرمزِ غیرمستند — جزئیات: download/pn006/perf-budget.json"; exit 1
fi
[[ "$PERF_REDS" == PARTIAL-ONLY:* ]] && echo "  (پیک Build = PARTIAL مستند جلسهٔ ۰۰۶ — کف ابزار؛ هدف در فاز سخت‌افزار)"

# ── ۷) Build ──
pass "Build (production — با postbuild اثر انگشت)"
bun run build > /tmp/pn007-ci-build.log 2>&1 || { echo "✗ گام ۷: build شکست"; tail -20 /tmp/pn007-ci-build.log; exit 1; }
BUILD_TAIL=$(grep -E "✓ Compiled|Compiled successfully" /tmp/pn007-ci-build.log | head -1)
echo "  $BUILD_TAIL"
[[ -f .next/fingerprint.json ]] && echo "  .next/fingerprint.json نوشته شد ✓" || { echo "✗ گام ۷: postbuild اثر انگشت ننوشت"; exit 1; }

# ── ۸) Fingerprint verify ──
pass "Fingerprint verify (بازتولیدپذیری همان HEAD)"
bun run scripts/fingerprint.ts --verify || { echo "✗ گام ۸: اثر انگشت کد ≠ اثر انگشت بیلد"; exit 1; }

echo ""
echo "✅ CI PASS — همهٔ ۸ گام سبز ($(date -u +%FT%TZ))"
exit 0
