#!/usr/bin/env python3
# DIR-RELAY-ULTRA-002 · پچ نسل S — «آمار دیده نمی‌شود؛ status.sh کامل نیست»
# سه ریشه:
#   RC-A) در مسیر tmux (مسیر اصلی گوشی) خروجی هسته فقط در پنجرهٔ tmux زنده می‌ماند؛
#         relay.log هرگز ساخته نمی‌شد → «tail -f relay.log» و بخش «آخرین خطوط رله»
#         در status.sh همیشه خالی بود (هارنس قبلی خودش stdout را فایل می‌کرد و نقص پنهان ماند).
#   RC-B) کادنس آمار وابسته به چرخه: بیکاری ~۵۱ث (POLL_WAIT_S=50) و خطای شبکه/دروازه/احراز
#         خواب ۳۰..۳۰۰ث → دقیقه‌ها سکوت — نقض وعدهٔ «حداکثر هر ۳۰ث در همهٔ حالت‌ها».
#   RC-C) status.sh زمان خام epoch می‌زد، بدون حکم سلامت/تازگی، بدون بازآیدها →
#         مالک نمی‌توانست «رله درست کار می‌کند؟» را قضاوت کند (نکتهٔ بسیار مهم دستور).
import sys
from pathlib import Path

P = Path("/home/z/my-project/src/lib/melk-api/relay-script.ts")
src = P.read_text(encoding="utf8")
B = chr(92)  # بک‌اسلش — بدون درد فرار چندلایه

def rep(old: str, new: str, n: int = 1, what: str = ""):
    global src
    c = src.count(old)
    if c != n:
        print(f"FAIL [{what}]: found {c} (expected {n})")
        sys.exit(1)
    src = src.replace(old, new)
    print(f"OK   [{what}] ({n})")

# ── P1: سند نسل S در تیتر TS (سجل زمانی؛ نسل تازه در پایان تیتر) ──
# دو « */» در فایل است (تیتر + داکسترینگ کدنصب) — فقط نخستین (تیتر) هدف است.
_p1_old = "\n */\n"
assert src.count(_p1_old) == 2, f"expected 2 close-comment blocks, got {src.count(_p1_old)}"
src = src.replace(_p1_old, "\n" + """
 * نسل S = DIR-RELAY-ULTRA-002 (دستور مالک ۲۰۲۶-۱۱-۲۶ · پیگیری نسل R — «آمار در
 *   ترموکس هر ~۳۰ث دیده نمی‌شود؛ status.sh آمار کامل نشان نمی‌دهد»): سه ریشه —
 *   (۱) در مسیر tmux خروجی هسته فقط در پنجرهٔ tmux می‌ماند و relay.log هرگز
 *   ساخته نمی‌شد (کانال مستندِ «tail -f relay.log» و بخش «آخرین خطوط رله» status.sh
 *   مرده بود؛ هارنس نسل R خودش stdout را فایل می‌کرد و نقص را پنهان کرد)؛
 *   (۲) کادنس آمار وابسته به چرخهٔ poll بود — بیکاری ~۵۱ث (wait=50) و خطای
 *   شبکه/دروازه/احراز خواب ۳۰..۳۰۰ث سکوت — نقض «حداکثر هر ۳۰ث در همهٔ حالت‌ها»؛
 *   (۳) status.sh زمان خام epoch می‌زد و حکم سلامت/تازگی نداشت — مالک
 *   نمی‌توانست عملکرد صحیح رله را تشخیص دهد. درمان: tee همزمان به relay.log در
 *   مسیر ترمینال + چرخش کپی-کوته‌سازی ۲۵۶KB + POLL_WAIT_S=25 (بیکاری ~۲۶ث) +
 *   stats_sleep تکه‌ای (هیچ خواب بلندی آمار را خاموش نمی‌کند) + گارد BASHPID
 *   (کارگران fork نسخهٔ کهنهٔ شمارنده‌ها را بازنویسی نمی‌کنند) + فیلدهای pid/
 *   restarts در stats.json + status.sh با سن انسانی/حکم سلامت (فعال ✓ / کهنه ⚠).
 */
""", 1)
print("OK   [P1: TS header doc] (first of 2)")

# ── P2: سند نسل S در تیتر اسکریپت bash (لنگر ASCII) ──
rep("\n# ============================================================\nset -u",
    """
# نسل S = DIR-RELAY-ULTRA-002 (۲۰۲۶-۱۱-۲۶): کانال آمار پایدار — نمای tmux
#         همزمان در relay.log (tee) + کادنس ≤۳۰ث واقعی در همهٔ حالت‌ها
#         (POLL_WAIT_S=25 + خواب تکه‌ای آماردار) + status.sh با حکم سلامت/تازگی.
# ============================================================
set -u""", what="P2: bash header doc")

# ── P3: POLL_WAIT_S 50 → 25 ──
rep("POLL_WAIT_S=50                      # انتظار long-poll وقتی صف خالی است",
    "POLL_WAIT_S=25                      # نسل S: بیکاری هم کادنس آمار ~۲۶ث (≤۳۰ث) می‌ماند؛ poll تنها ~۲.۳/دقیقه — بسیارس زیر سقف ۲۰",
    what="P3: POLL_WAIT_S=25")

# ── P5: ثابت‌های نسل S ──
rep('STATS_FILE="' + B + '$MELKA_HOME/stats.json"    # DIR-RELAY-ULTRA-001: بقا آمار برای status.sh',
    'STATS_FILE="' + B + '$MELKA_HOME/stats.json"    # DIR-RELAY-ULTRA-001: بقا آمار برای status.sh\n'
    'RELAY_LOG="' + B + '$MELKA_HOME/relay.log"        # نسل S: کانال زندهٔ مالک — در مسیر tmux با tee نوشته می‌شود\n'
    'STATS_LOG_MAX=262144                 # نسل S: سقف relay.log (۲۵۶KB) — چرخش با نگه‌داشت نیمهٔ تازه',
    what="P5: RELAY_LOG/STATS_LOG_MAX consts")

# ── P6a: گارد BASHPID در stats_line ──
rep("stats_line() {\n  local now up",
    "stats_line() {\n"
    "  # نسل S: فقط پوستهٔ اصلی می‌نویسد — کارگرانِ fork (BASHPID ≠ $$) نسخهٔ کهنهٔ\n"
    "  # شمارنده‌ها را روی stats.json بازنویسی نکنند؛ خواب تکه‌ای داخل کارگران هم بی‌ضرر است.\n"
    '  [ "' + B + '$BASHPID" != "' + B + B + '$" ] && return 0\n'
    "  local now up",
    what="P6a: BASHPID guard in stats_line")

# ── P6b: فیلدهای pid/restarts در آرگومان‌ها + فراخوانی چرخش + دو تابع تازه ──
rep('    "' + B + '$now" "' + B + '$RELAY_START_TS" "' + B + '$MSG_RECV" "' + B + '$MSG_SENT" "' + B + '$SERVED" "' + B + '$ERRORS" "' + B + '$BATCHES" "' + B + '$LOOPS" "' + B + '$ARM_RATE_CURRENT" "' + B + '$ARM_CONC" "' + B + '$BOOST_MODE" "' + B + '$STEALTH" > "' + B + '$STATS_FILE.tmp" 2>/dev/null && mv -f "' + B + '$STATS_FILE.tmp" "' + B + '$STATS_FILE" 2>/dev/null || true\n  return 0\n}',
    '    "' + B + '$now" "' + B + '$RELAY_START_TS" "' + B + '$MSG_RECV" "' + B + '$MSG_SENT" "' + B + '$SERVED" "' + B + '$ERRORS" "' + B + '$BATCHES" "' + B + '$LOOPS" "' + B + '$ARM_RATE_CURRENT" "' + B + '$ARM_CONC" "' + B + '$BOOST_MODE" "' + B + '$STEALTH" "' + B + B + '$" "' + B + '${SUP_RESTARTS:-0}" > "' + B + '$STATS_FILE.tmp" 2>/dev/null && mv -f "' + B + '$STATS_FILE.tmp" "' + B + '$STATS_FILE" 2>/dev/null || true\n'
    '  # نسل S: pid/بازآید در بقا آمار (حکم سلامت status.sh) + چرخش relay.log\n'
    '  relay_log_rotate\n'
    '  return 0\n'
    '}\n'
    '\n'
    '# ── نسل S: چرخش relay.log — رشد بی‌کران مهار (بررسی سبک، هر خط آمار) ──\n'
    '# tee با O_APPEND می‌نویسد؛ «کپی-کوته‌سازی» (نه mv) یعنی tee پس از چرخش همان‌جا\n'
    '# ادامه می‌دهد — relay.log همیشه جریان زندهٔ رله است (نه فایل رهاشدهٔ قدیمی).\n'
    '# مقادیر با پیش‌فرض — تابع حتی در هارنس‌های آزمون بدون ثابت‌ها هم بی‌خطر است.\n'
    'relay_log_rotate() {\n'
    '  [ -f "' + B + '${RELAY_LOG:-}" ] || return 0\n'
    '  local sz\n'
    '  sz=' + B + '$(wc -c < "' + B + '$RELAY_LOG" 2>/dev/null || echo 0)\n'
    '  [ "' + B + '${sz:-0}" -lt "' + B + '${STATS_LOG_MAX:-262144}" ] && return 0\n'
    '  tail -c ' + B + '$(( ' + B + '${STATS_LOG_MAX:-262144} / 2 )) "' + B + '$RELAY_LOG" > "' + B + '$RELAY_LOG.rot" 2>/dev/null || return 0\n'
    '  cat "' + B + '$RELAY_LOG.rot" > "' + B + '$RELAY_LOG" 2>/dev/null || true\n'
    '  rm -f "' + B + '$RELAY_LOG.rot" 2>/dev/null || true\n'
    '}\n'
    '\n'
    '# ── نسل S: خواب تکه‌ای آماردار — هیچ خواب بلندی آمار را خاموش نمی‌کند ──\n'
    '# خطای شبکه/دروازه/احراز (خواب ۳۰..۳۰۰ث) اکنون در تکه‌های ≤۵ث می‌خوابد و\n'
    '# stats_line حداکثر هر ' + B + '$STATS_EVERY_S ثانیه زنده می‌ماند — «در همهٔ حالت‌ها» صادق است.\n'
    '# (داخل کارگران fork، گارد BASHPID تضمین می‌کند شمارنده‌ها کهنه نوشته نشوند.)\n'
    'stats_sleep() {\n'
    '  local remain="' + B + '${1:-0}" slice\n'
    '  case "' + B + '$remain" in ""|*[!0-9]*) sleep "' + B + '${1:-0}" 2>/dev/null; return 0 ;; esac\n'
    '  [ "' + B + '$remain" -le 0 ] && return 0\n'
    '  while [ "' + B + '$remain" -gt 0 ]; do\n'
    '    slice=' + B + '$(( remain > 5 ? 5 : remain ))\n'
    '    sleep "' + B + '$slice"\n'
    '    stats_line\n'
    '    remain=' + B + '$(( remain - slice ))\n'
    '  done\n'
    '  return 0\n'
    '}',
    what="P6b: pid/restarts args + rotate + stats_sleep")

# ── P7: فرمت printf با فیلدهای pid/restarts ──
rep('  printf \'{"ts":%s,"startTs":%s,"recv":%s,"sent":%s,"served":%s,"errors":%s,"batches":%s,"loops":%s,"rate":%s,"conc":%s,"boost":%s,"stealth":%s}' + B + B + "n' " + B + B,
    '  printf \'{"ts":%s,"startTs":%s,"recv":%s,"sent":%s,"served":%s,"errors":%s,"batches":%s,"loops":%s,"rate":%s,"conc":%s,"boost":%s,"stealth":%s,"pid":%s,"restarts":%s}' + B + B + "n' " + B + B,
    what="P7: printf format fields")

# ── P7c-1: arm_rate_gate — خواب تا ۶۱ث والد/کارگر → تکه‌ای ──
rep('    if [ "$wait_s" -gt 0 ]; then\n      sleep "$wait_s"\n    fi',
    '    if [ "$wait_s" -gt 0 ]; then\n      stats_sleep "$wait_s"\n    fi',
    n=1, what="P7c1: arm_rate_gate stats_sleep")

# ── P7c-2: rate_gate (سرور) — همان جایگزینی پس از خط لاگ ──
rep('      log "سقف نرخ (' + B + '$RATE_MAX در دقیقه) — ' + B + '$wait_s ثانیه مکث برای احترام به دروازه"\n      sleep "$wait_s"',
    '      log "سقف نرخ (' + B + '$RATE_MAX در دقیقه) — ' + B + '$wait_s ثانیه مکث برای احترام به دروازه"\n      stats_sleep "$wait_s"',
    n=1, what="P7c2: rate_gate stats_sleep")

# ── P7d: auth_delay — خواب ۳۰..۳۰۰ث ──
rep('  sleep "$d"\n}',
    '  stats_sleep "$d"\n}',
    n=1, what="P7d: auth_delay stats_sleep")

# ── P7e: چهار شاخهٔ backoff حلقهٔ اصلی ──
rep('sleep "' + B + '$delay"; continue',
    'stats_sleep "' + B + '$delay"; continue',
    n=4, what="P7e: relay_main backoff stats_sleep x4")

# ── P7f: خطای سرور ۳۰ث ──
rep('      sleep 30; continue',
    '      stats_sleep 30; continue',
    n=1, what="P7f: server-error stats_sleep")

# ── P8: tee به relay.log در مسیر ترمینال (tmux گوشی) — پیش از بنر آغاز ──
rep('SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0; MSG_RECV=0; MSG_SENT=0; LAST_STATS=0; RELAY_START_TS=' + B + '$(date +%s)',
    '# ── نسل S: کانال relay.log — نمای tmux و فایل، همزمان ──\n'
    '# ریشهٔ شکایت: در مسیر tmux (مسیر اصلی گوشی) خروجی هسته فقط در پنجرهٔ tmux زنده\n'
    '# می‌ماند و relay.log هرگز ساخته نمی‌شد → «tail -f relay.log» و بخش «آخرین خطوط\n'
    '# رله» در status.sh همیشه خالی بود. اکنون وقتی خروجی ترمینال زنده است، همان\n'
    '# خروجی همزمان در relay.log نیز می‌رود (tee)؛ مسیرهای nohup و بازآید نگهبان مستقیم\n'
    '# به همین فایل می‌ریزند (تک‌نسخه) و چرخش ۲۵۶KB رشد را مهار می‌کند.\n'
    'mkdir -p "' + B + '$MELKA_HOME" 2>/dev/null || true\n'
    'if [ -t 1 ] && command -v tee >/dev/null 2>&1; then\n'
    '  exec > >(tee -a "' + B + '$RELAY_LOG") 2>&1\n'
    'fi\n'
    '\n'
    'SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0; MSG_RECV=0; MSG_SENT=0; LAST_STATS=0; RELAY_START_TS=' + B + '$(date +%s)',
    what="P8: tee wiring before banner")

# ── P9: بازآید نگهبان به همان relay.log (کانال واحد زنده) ──
rep('( cd "' + B + '$WD_DIR" 2>/dev/null; setsid nohup bash "' + B + '$CORE_RELAY" >> "' + B + '$WD_DIR/relay-restarts.log" 2>&1 & ) >/dev/null 2>&1',
    '( cd "' + B + '$WD_DIR" 2>/dev/null; setsid nohup bash "' + B + '$CORE_RELAY" >> "' + B + '$WD_DIR/relay.log" 2>&1 & ) >/dev/null 2>&1  # نسل S: همان کانال زندهٔ مالک',
    n=1, what="P9: watchdog restart into relay.log")

# ── P13: بنر آغاز — خط نسل S پس از خط نسل R (درج خط‌محور) ──
_lines = src.split("\n")
_p13 = 0
for i, l in enumerate(_lines):
    if l.startswith('log "نسل R (DIR-RELAY-ULTRA-001):'):
        _lines.insert(i + 1,
            'log "نسل S (DIR-RELAY-ULTRA-002): کادنس آمار ' + B + '$STATS_EVERY_Sث در همهٔ حالت‌ها (خواب تکه‌ای) · نمای tmux همزمان در ' + B + '$RELAY_LOG (tail -f) · status.sh با حکم سلامت (فعال ✓ / کهنه ⚠) و pid/بازآید"')
        _p13 = 1
        break
if _p13 != 1:
    print("FAIL [P13: startup banner gen-S line]: نسل R banner not found")
    sys.exit(1)
src = "\n".join(_lines)
print("OK   [P13: startup banner gen-S line]")

P.write_text(src, encoding="utf8")
print("\nALL PATCHES APPLIED")
