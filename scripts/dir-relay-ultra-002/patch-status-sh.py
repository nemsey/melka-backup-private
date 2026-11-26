#!/usr/bin/env python3
# DIR-RELAY-ULTRA-002 · پچ ۲ — بازنویسی status.sh (نسل S) + به‌روزرسانی راهنمای آمار
# RC-C: status.sh پیشتر زمان خام epoch می‌زد («آخرین به‌روزرسانی آمار: 1795690658»)،
# بدون حکم سلامت/تازگی، و بخش «آخرین ۱۲ خط رله» به relay.log وابسته بود که در مسیر
# tmux هرگز ساخته نمی‌شد. اکنون: ساعت انسانی + سن ثانیه + حکم سلامت (✓ فعال /
# ⚠ کهنه با راهنمای درمان) + pid/بازآید + نمایش سشن tmux + آخرین خطوط از relay.log.
import sys
from pathlib import Path

P = Path("/home/z/my-project/src/lib/melk-api/relay-script.ts")
src = P.read_text(encoding="utf8")

# ─── محتوای تولیدی status.sh (فرم bash نهایی — تک‌بک‌اسلش‌ها عیناً همین رندر می‌شوند) ───
GEN = r'''#!/usr/bin/env bash
# status.sh — DIR-RELAY-ULTRA-002 — نمایش آمار رلهٔ ملکا (هر زمان قابل اجرا)
# نسل S: ساعت انسانی + سن آمار (ثانیه) + حکم سلامت (فعال ✓ / کهنه ⚠) + pid/بازآید
# + آخرین خطوط از relay.log (که اکنون در مسیر tmux با tee زنده نوشته می‌شود).
set -u
D="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
[ -n "$D" ] || D="$HOME/melka-relay"
NOW=$(date +%s)
echo "═══════ آمار رلهٔ ملکا ($(date '+%H:%M:%S')) ═══════"
if [ -r "$D/stats.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    TS=$(jq -r '.ts // 0' "$D/stats.json" 2>/dev/null)
    case "$TS" in ""|*[!0-9]*) TS=0 ;; esac
    AGE=$(( NOW - TS )); [ "$AGE" -lt 0 ] && AGE=0
    jq -r '"پیام دریافتی از سرور: \(.recv)\nدرخواست ارسالی به آرم: \(.sent)\nنتیجهٔ تحویل‌شده به سرور: \(.served)\nخطا: \(.errors)\nدستهٔ نتیجه: \(.batches)\nچرخه: \(.loops)\nنرخ جاری ARM: \(.rate)/دقیقه\nهمزمانی ARM: \(.conc)\nبازآید پس از خرابی: \(.restarts // 0)"' "$D/stats.json"
    echo "آخرین به‌روزرسانی آمار: $(date -d @"$TS" '+%H:%M:%S' 2>/dev/null || echo "$TS") — $AGE ثانیه پیش"
    if [ "$AGE" -le 90 ]; then
      echo "وضعیت کلی: ✓ هستهٔ رله فعال و در حال کار است (آمار تازه است)"
    else
      echo "وضعیت کلی: ⚠ هشدار — آمار $AGE ثانیه کهنه است؛ رله یا متوقف است یا اندروید آن را خوابانده است. درمان: Termux را باز کنید و در Recentها قفل کنید + تنظیمات اندروید ← برنامه‌ها ← Termux ← باتری «بدون محدودیت»."
    fi
  else
    cat "$D/stats.json"
  fi
else
  echo "آمار هنوز ساخته نشده — رله در حال راه‌اندازی است؛ چند ثانیه دیگر دوباره بزنید."
fi
RP=""
[ -r "$D/relay.pid" ] && RP=$(cat "$D/relay.pid" 2>/dev/null)
if [ -n "$RP" ] && kill -0 "$RP" 2>/dev/null; then
  echo "وضعیت هستهٔ رله: زنده (pid $RP)"
else
  echo "وضعیت هستهٔ رله: pid یافت نشد (نگهبان در حال بازآید است یا راه‌اندازی اولیه)"
fi
if command -v tmux >/dev/null 2>&1 && tmux has-session -t melka-relay 2>/dev/null; then
  echo "سشن tmux رله: موجود (melka-relay — نمای زنده)"
else
  echo "سشن tmux رله: یافت نشد (مسیر nohup یا متوقف)"
fi
echo "──── آخرین ۱۲ خط رله (relay.log) ────"
if [ -s "$D/relay.log" ]; then
  tail -n 12 "$D/relay.log" 2>/dev/null
else
  echo "(relay.log هنوز ساخته نشده یا خالی است)"
fi
if command -v tmux >/dev/null 2>&1 && tmux has-session -t melka-relay 2>/dev/null; then
  echo "──── آخرین ۱۲ خط از پنجرهٔ tmux ────"
  tmux capture-pane -p -t melka-relay -S -12 2>/dev/null | tail -n 12
fi
[ -f "$D/relay-restarts.log" ] && tail -n 12 "$D/relay-restarts.log" 2>/dev/null
echo "──── نمای زنده: tmux attach -t melka-relay (خروج Ctrl+b سپس d) · لاگ: tail -f $D/relay.log ────"'''

# فرم منبع TS: همهٔ بک‌اسلش‌ها دوتایی می‌شوند (رندر قالب، نصف می‌کند)؛ $ امن است.
TS_FORM = GEN.replace("\\", "\\\\")

# ─── جایگزینی بلوک heredoc status.sh در منبع ───
START = 'cat > "' + chr(92) + '$MELKA_HOME/status.sh" <<' + "'" + 'STATUS_EOF' + "'" + '\n'
END = "\nSTATUS_EOF"
s = src.find(START)
if s < 0:
    print("FAIL: status.sh heredoc start marker not found")
    sys.exit(1)
e = src.find(END, s + len(START))
if e < 0:
    print("FAIL: status.sh heredoc end marker not found")
    sys.exit(1)
new_block = START + TS_FORM + END
src = src[:s] + new_block + src[e + len(END):]
print("OK   [status.sh heredoc rewritten]")

# ─── به‌روزرسانی print_stats_guide (خط ۱ + خط حکم سلامت تازه) ───
lines = src.split("\n")
hit = 0
for i, l in enumerate(lines):
    if "۳۰-۶۰ ثانیه چاپ می‌شود" in l and l.strip().startswith("echo"):
        lines[i] = '  echo "📊 آمار دریافت/ارسال پیام رله: در نمای زنده (tmux attach یا tail -f relay.log) خط «📊 آمار» هر حداکثر ~۳۰ ثانیه چاپ می‌شود."'
        lines.insert(i + 1, '  echo "راهنمای قضاوت فوری: bash $HOME/melka-relay/status.sh علاوه بر آمار کامل، حکم سلامت هم می‌دهد — «✓ فعال و آمار تازه» یا «⚠ کهنه» (کهنه = رله متوقف/خوابانده)."')
        hit = 1
        break
if hit != 1:
    print("FAIL: print_stats_guide line not found")
    sys.exit(1)
src = "\n".join(lines)
print("OK   [print_stats_guide updated]")

P.write_text(src, encoding="utf8")
print("\nPATCH-2 APPLIED")
