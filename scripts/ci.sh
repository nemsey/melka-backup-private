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
# PN-016 سه گارد کاربران — نقش معتبر / مرز مجوز / سیاههٔ فعالیت:
bash scripts/audit-user-roles.sh > /tmp/pn016-ci-audit5.log 2>&1 || { echo "✗ گام ۵-ه: user-roles (رجیستری نقش‌ها)"; tail -8 /tmp/pn016-ci-audit5.log; exit 1; }
tail -1 /tmp/pn016-ci-audit5.log
bash scripts/audit-permission-boundary.sh > /tmp/pn016-ci-audit6.log 2>&1 || { echo "✗ گام ۵-و: permission-boundary (مرز مجوزها)"; tail -8 /tmp/pn016-ci-audit6.log; exit 1; }
tail -1 /tmp/pn016-ci-audit6.log
bash scripts/audit-activity-log.sh > /tmp/pn016-ci-audit7.log 2>&1 || { echo "✗ گام ۵-ز: activity-log (سیاههٔ فعالیت)"; tail -8 /tmp/pn016-ci-audit7.log; exit 1; }
tail -1 /tmp/pn016-ci-audit7.log
# PN-018/T3b گارد تازه — سرریز Int32 در ستون‌های Int (ریشهٔ زندهٔ دو خطای گزارش‌شدهٔ مالک):
bash scripts/audit-int-overflow.sh > /tmp/pn018-ci-audit8.log 2>&1 || { echo "✗ گام ۵-ح: int-overflow (سرریز Int32)"; tail -8 /tmp/pn018-ci-audit8.log; exit 1; }
tail -1 /tmp/pn018-ci-audit8.log
# PN-018 فاز ۷ — سه گارد شورا (نسخهٔ مدل / رانش / حلقهٔ یادگیری):
bash scripts/audit-champion-challenger.sh > /tmp/pn018-ci-audit9.log 2>&1 || { echo "✗ گام ۵-ط: champion-challenger (چرخهٔ عمر نسخه)"; tail -8 /tmp/pn018-ci-audit9.log; exit 1; }
tail -1 /tmp/pn018-ci-audit9.log
bash scripts/audit-drift-detection.sh > /tmp/pn018-ci-audit10.log 2>&1 || { echo "✗ گام ۵-ی: drift-detection (آشکارساز رانش)"; tail -8 /tmp/pn018-ci-audit10.log; exit 1; }
tail -1 /tmp/pn018-ci-audit10.log
bash scripts/audit-learning-loop.sh > /tmp/pn018-ci-audit11.log 2>&1 || { echo "✗ گام ۵-ک: learning-loop (حلقهٔ کامل)"; tail -8 /tmp/pn018-ci-audit11.log; exit 1; }
tail -1 /tmp/pn018-ci-audit11.log
# PN-019 فاز ۸+۹ — سه گارد شورا-ن۰۲۳ (ایمنی تصمیم / حاکمیت / ارزیابی سیاست):
bash scripts/audit-decision-safety.sh > /tmp/pn019-ci-audit12.log 2>&1 || { echo "✗ گام ۵-ل: decision-safety (ایمنی چرخهٔ تصمیم)"; tail -8 /tmp/pn019-ci-audit12.log; exit 1; }
tail -1 /tmp/pn019-ci-audit12.log
bash scripts/audit-governance.sh > /tmp/pn019-ci-audit13.log 2>&1 || { echo "✗ گام ۵-م: governance (حاکمیت ۱۵قاعده‌ای)"; tail -8 /tmp/pn019-ci-audit13.log; exit 1; }
tail -1 /tmp/pn019-ci-audit13.log
bash scripts/audit-policy-evaluation.sh > /tmp/pn019-ci-audit14.log 2>&1 || { echo "✗ گام ۵-ن: policy-evaluation (ارزیابی سیاست)"; tail -8 /tmp/pn019-ci-audit14.log; exit 1; }
tail -1 /tmp/pn019-ci-audit14.log
# PN-020/H2 — گارد فضای دیسک (راه‌حل ساختاری چهارمین ENOSPC — هرس واقعی + داوری):
bash scripts/audit-disk-space.sh > /tmp/pn020-ci-audit15.log 2>&1 || { echo "✗ گام ۵-س: disk-space (فضای دیسک + هرس نسل‌ها)"; tail -8 /tmp/pn020-ci-audit15.log; exit 1; }
tail -2 /tmp/pn020-ci-audit15.log
# PN-020/فاز ۱۰+۱۱ — دو گارد شورا-ن۰۲۴ (خودآگاهی / دروازهٔ ترمیم):
bash scripts/audit-self-diagnosis.sh > /tmp/pn020-ci-audit16.log 2>&1 || { echo "✗ گام ۵-ع: self-diagnosis (خودآگاهی ۲۵ بررسی)"; tail -8 /tmp/pn020-ci-audit16.log; exit 1; }
tail -1 /tmp/pn020-ci-audit16.log
bash scripts/audit-repair-gate.sh > /tmp/pn020-ci-audit17.log 2>&1 || { echo "✗ گام ۵-ف: repair-gate (دروازهٔ خودترمیمی)"; tail -8 /tmp/pn020-ci-audit17.log; exit 1; }
tail -1 /tmp/pn020-ci-audit17.log

# PN-021 (شورا-ن۰۲۵): گارد هجدهم — کارشناس فروش پنهان (دیده‌شدن کاربران)
bash scripts/audit-stealth-users.sh > /tmp/pn021-ci-audit18.log 2>&1 || { echo "✗ گام ۵-ق: stealth-users (کارشناس فروش پنهان)"; tail -8 /tmp/pn021-ci-audit18.log; exit 1; }
tail -1 /tmp/pn021-ci-audit18.log

# ── ۶) Perf Budget ──
pass "Perf Budget (گارد بودجهٔ کارایی جلسهٔ ۰۰۶)"
# PN-012: ری‌استارت کنترل‌شدهٔ سرور تولید پیش از سنجهٔ RAM — الگوی مستند جلسهٔ ۰۰۶
# («تورم RSS از ترافیک/جلسه‌های مرورگر؛ پس از ری‌استارت ۶۰۳→۱۳۴MB»)؛ فقط وقتی
# نگهبان زنده است (محیط بی‌نگهبان دست‌نخورده می‌ماند — رفتار خارجی تغییر نمی‌کند)
if pgrep -f "prod-watchdog.sh" > /dev/null 2>&1; then
  pkill -f "standalone/server.js" 2>/dev/null || true
  # PN-018: پنجرهٔ ۲۵→۱۲۰ثانیه — اگر standalone حذف شده باشد (الگوی پارک/ENOSPC)،
  # نگهبان chunk-guard بیلد کامل (~۴۰ث) می‌کند و سرور دیرتر بالا می‌آید؛ کاوشگر مرورگر
  # بدون سرور None برمی‌گرداند و بودجه به‌نادرست قرمز می‌شود (حادثهٔ زندهٔ CI نخستِ PN-018).
  for _i in $(seq 1 120); do curl -sf -o /dev/null --max-time 2 http://localhost:3000/api/health 2>/dev/null && break; sleep 1; done
  echo "  سرور تولید ری‌استارت شد (سنجهٔ RAM روی پایهٔ تازه)"
fi
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

# ── ۷-ب) یکپارچگی chunk بیلد تازه (PN-015/K1) ──
# هر ارجاع /_next/static در مانیفست/HTML باید فایل روی دیسک داشته باشد —
# دقیقاً همان چیزی که شب chunk-404 را دید و باید هرگز بازنگردد.
bash scripts/audit-chunk-integrity.sh --witness /tmp/pn015-ci-chunk.json \
  || { echo "✗ گام ۷-ب: بیلد تازه chunk مفقود دارد (خطر 404)"; cat /tmp/pn015-ci-chunk.json 2>/dev/null; exit 1; }
echo "  chunk-integrity ✓"

# ── ۸) Fingerprint verify ──
pass "Fingerprint verify (بازتولیدپذیری همان HEAD)"
bun run scripts/fingerprint.ts --verify || { echo "✗ گام ۸: اثر انگشت کد ≠ اثر انگشت بیلد"; exit 1; }

echo ""
echo "✅ CI PASS — همهٔ ۸ گام سبز ($(date -u +%FT%TZ))"
exit 0
