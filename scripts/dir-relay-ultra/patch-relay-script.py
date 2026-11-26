#!/usr/bin/env python3
# DIR-RELAY-ULTRA-001 · پچ relay-script.ts — نسل R (آمار زندهٔ دریافت/ارسال پیام)
# ویرایش خط‌محور با راستی‌آزمایی ASCII (ایمن در برابر نویسه‌های نامرئی RTL).
# بلوک‌ها به‌صورت فهرست خطوط (بدون تلامیح نقل‌قولی سه‌گانه) ساخته می‌شوند.
import sys

PATH = "/home/z/my-project/src/lib/melk-api/relay-script.ts"
src = open(PATH, encoding="utf-8").read().splitlines()
print(f"lines={len(src)}")

def verify(i, needle, what):
    if needle not in src[i]:
        print(f"FAIL verify @L{i+1} ({what}): {needle!r} not in: {src[i][:110]!r}")
        sys.exit(2)

def insert_after(i, lines, what):
    src[i+1:i+1] = lines
    print(f"  +{len(lines)}L after L{i+1} [{what}]")

# ─── متن بلوک‌ها (هر خط یک python-string تک‌خطی) ───
DOC_R = [
    " * نسل R = DIR-RELAY-ULTRA-001 (دستور مالک ۲۰۲۶-۱۱-۲۶ · گام اول):",
    " *   آمار زندهٔ دریافت/ارسال پیام — خط «📊 آمار» حداکثر هر ۳۰ث در همهٔ حالت‌ها",
    " *   (شمارنده‌های تازهٔ MSG_RECV/MSG_SENT) + بقا در stats.json + ابزار status.sh",
    " *   (مالک در هر لحظه بدون tmux آمار کامل می‌بیند) + راهنمای مشاهده در کدنصب.",
]
GEN_HEADER_R = [
    "# نسل R = DIR-RELAY-ULTRA-001 (۲۰۲۶-۱۱-۲۶): آمار زندهٔ دریافت/ارسال پیام — خط",
    "#         «📊 آمار» هر ≤۳۰ث در همهٔ حالت‌ها + بقا در stats.json + ابزار status.sh.",
]
INIT_NEW = ["SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0; MSG_RECV=0; MSG_SENT=0; LAST_STATS=0; RELAY_START_TS=\\$(date +%s)"]
BANNER_R = ['log "نسل R (DIR-RELAY-ULTRA-001): خط «📊 آمار» حداکثر هر \\$STATS_EVERY_S ثانیه چاپ می‌شود · مشاهدهٔ آمار هر زمان: bash \\$MELKA_HOME/status.sh · بقا در \\$STATS_FILE"']
STATUS_TOOL = [
    "",
    "# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً): ابزار status.sh — آمار در هر لحظه ──",
    "# مالک بدون اتصال tmux با «bash ~/melka-relay/status.sh» آمار دریافت/ارسال +",
    "# آخرین خطوط رله را می‌بیند — پاسخ مستقیم به «آمار نشان داده نمی‌شود».",
    'cat > "\\$MELKA_HOME/status.sh" <<\'STATUS_EOF\'',
    "#!/usr/bin/env bash",
    "# status.sh — DIR-RELAY-ULTRA-001 — نمایش آمار رلهٔ ملکا (هر زمان قابل اجرا)",
    "set -u",
    'D="\\$(cd "\\$(dirname "\\$0")" 2>/dev/null && pwd)"',
    '[ -n "\\$D" ] || D="\\$HOME/melka-relay"',
    'echo "═══════ آمار رلهٔ ملکا (\\$(date \'+%H:%M:%S\')) ═══════"',
    'if [ -r "\\$D/stats.json" ]; then',
    "  if command -v jq >/dev/null 2>&1; then",
    '    jq -r \'"پیام دریافتی از سرور: \\(.recv)\\nدرخواست ارسالی به آرم: \\(.sent)\\nنتیجهٔ تحویل‌شده به سرور: \\(.served)\\nخطا: \\(.errors)\\nدستهٔ نتیجه: \\(.batches)\\nچرخه: \\(.loops)\\nنرخ جاری ARM: \\(.rate)/دقیقه\\nهمزمانی ARM: \\(.conc)\\nآخرین به‌روزرسانی آمار: \\(.ts)"\' "\\$D/stats.json"',
    "  else",
    "    cat \"\\$D/stats.json\"",
    "  fi",
    "else",
    "  echo \"آمار هنوز ساخته نشده — رله در حال راه‌اندازی است؛ چند ثانیه دیگر دوباره بزنید.\"",
    "fi",
    'RP=""',
    '[ -r "\\$D/relay.pid" ] && RP=\\$(cat "\\$D/relay.pid" 2>/dev/null)',
    'if [ -n "\\$RP" ] && kill -0 "\\$RP" 2>/dev/null; then',
    '  echo "وضعیت هستهٔ رله: زنده (pid \\$RP)"',
    "else",
    '  echo "وضعیت هستهٔ رله: pid یافت نشد (نگهبان در حال بازآید است یا راه‌اندازی اولیه)"',
    "fi",
    'echo "──── آخرین ۱۲ خط رله ────"',
    'if command -v tmux >/dev/null 2>&1 && tmux has-session -t melka-relay 2>/dev/null; then',
    "  tmux capture-pane -p -t melka-relay -S -12 2>/dev/null | tail -n 12",
    "fi",
    '[ -f "\\$D/relay.log" ] && tail -n 12 "\\$D/relay.log" 2>/dev/null',
    '[ -f "\\$D/relay-restarts.log" ] && tail -n 12 "\\$D/relay-restarts.log" 2>/dev/null',
    'echo "──── نمای زنده: tmux attach -t melka-relay (خروج Ctrl+b سپس d) · لاگ: tail -f \\$D/relay.log ────"',
    "STATUS_EOF",
    'chmod 700 "\\$MELKA_HOME/status.sh" 2>/dev/null || true',
]
STATS_FN = [
    "",
    "# ── DIR-RELAY-ULTRA-001 (گام اول · ثالثاً+رابعاً): خط آمار زندهٔ دریافت/ارسال پیام ──",
    "# ریشهٔ شکایت مالک: «در ترموکس آمار دریافت و ارسال پیام نشان داده نمی‌شود» —",
    "# پیش‌تر تنها خط «زنده» هر ۱۰ چرخه (~۸ دقیقه در بیکاری) چاپ می‌شد و هیچ شمارندهٔ",
    "# پیام دریافتی/درخواست ارسالی وجود نداشت. اکنون: خط «📊 آمار» مستقل، حداکثر هر",
    "# \\$STATS_EVERY_S ثانیه، در همهٔ حالت‌ها (بیکاری · موج اجرا · بن WAF · خطای شبکه)",
    "# + بقا در stats.json + ابزار status.sh برای مشاهدهٔ هر زمان بدون tmux.",
    "stats_line() {",
    "  local now up",
    "  now=\\$(date +%s)",
    "  [ \\$(( now - LAST_STATS )) -lt \\$STATS_EVERY_S ] && return 0",
    "  LAST_STATS=\\$now",
    '  up=\\$(( now - RELAY_START_TS )); [ "\\$up" -lt 0 ] && up=0',
    '  log "📊 آمار: دریافت \\$MSG_RECV پیام · ارسال \\$MSG_SENT درخواست · تحویل \\$SERVED نتیجه · خطا \\$ERRORS · \\$BATCHES دسته · چرخه \\$LOOPS · آنلاین \\$(printf \'%02d:%02d\' \\$(( up / 3600 )) \\$(( (up % 3600) / 60 ))) · حاکم ARM: نرخ \\$ARM_RATE_CURRENT/دقیقه · همزمانی \\$ARM_CONC · مسیر \\$( [ \\$URL_IDX -eq 0 ] && echo اصلی || echo جایگزین )"',
    '  printf \'{"ts":%s,"startTs":%s,"recv":%s,"sent":%s,"served":%s,"errors":%s,"batches":%s,"loops":%s,"rate":%s,"conc":%s,"boost":%s,"stealth":%s}\\n\' \\\\',
    '    "\\$now" "\\$RELAY_START_TS" "\\$MSG_RECV" "\\$MSG_SENT" "\\$SERVED" "\\$ERRORS" "\\$BATCHES" "\\$LOOPS" "\\$ARM_RATE_CURRENT" "\\$ARM_CONC" "\\$BOOST_MODE" "\\$STEALTH" > "\\$STATS_FILE.tmp" 2>/dev/null && mv -f "\\$STATS_FILE.tmp" "\\$STATS_FILE" 2>/dev/null || true',
    "  return 0",
    "}",
]
CONSTS_R = [
    "# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً — «دستور نصب فوق پیشرفته»): آمار زنده ──",
    "MSG_RECV=0                          # شمار پیام‌های دریافتی از سرور (آیتم‌های صف رله)",
    "MSG_SENT=0                          # شمار درخواست‌های اجراشده به مقصد (نتیجه‌دار)",
    "STATS_EVERY_S=30                    # حداکثر فاصلهٔ چاپ خط «📊 آمار» (در همهٔ حالت‌ها)",
    "LAST_STATS=0                        # زمان آخرین چاپ آمار (throttle)",
]
STATS_FILE_LINE = ['STATS_FILE="\\$MELKA_HOME/stats.json"    # DIR-RELAY-ULTRA-001: بقا آمار برای status.sh']
MSG_RECV_INCR = ["      MSG_RECV=\\$((MSG_RECV+1))"]
MSG_SENT_INCR = ["    MSG_SENT=\\$(( MSG_SENT + \\${totaln:-0} ))"]
DRAIN_LOG_NEW = ['    log "جریان نتیجه: \\${totaln:-0} مورد → \\${errn:-0} خطا (مجموع: دریافت \\$MSG_RECV · ارسال \\$MSG_SENT · تحویل \\$SERVED · خطا \\$ERRORS / \\$BATCHES دسته)"']
HEARTBEAT_NEW = ['      log "زنده — چرخهٔ \\$LOOPS · مسیر \\$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) · دریافت \\$MSG_RECV / ارسال \\$MSG_SENT / تحویل \\$SERVED · خطا \\$ERRORS / \\$BATCHES دسته · حاکم ARM: نرخ \\$ARM_RATE_CURRENT/دقیقه · همزمانی \\$ARM_CONC · بن‌های پیاپی \\$ARM_WAF_STREAK"']
INSTALL_DOC_R = [
    " *",
    " * DIR-RELAY-ULTRA-001 (دستور مالک ۲۰۲۶-۱۱-۲۶ · گام اول — «دستور نصب فوق پیشرفته»):",
    " *   شناخت فراژرف تمام اجزا + ریشهٔ «آمار دریافت/ارسال پیام در ترموکس نمایش داده",
    " *   نمی‌شود»: تنها خط وضعیت هر ~۸ دقیقه در بیکاری چاپ می‌شد و هیچ شمارندهٔ پیام",
    " *   دریافتی/درخواست ارسالی وجود نداشت. رفع ریشه‌ای (هم‌زمان در هسته و کدنصب):",
    " *   ۱۲) خط «📊 آمار» در هستهٔ رله: حداکثر هر ۳۰ث، در همهٔ حالت‌ها (بیکاری ·",
    " *       موج اجرا · بن WAF · خطای شبکه) — شمارنده‌های تازهٔ MSG_RECV/MSG_SENT.",
    " *   ۱۳) بقا آمار در stats.json + ابزار status.sh (bash ~/melka-relay/status.sh):",
    " *       مالک در هر لحظه، بدون اتصال tmux، آمار کامل + آخرین خطوط رله را می‌بیند.",
    " *   ۱۴) راهنمای مشاهدهٔ آمار پس از نصب موفق (print_stats_guide) + شاهد آمار در",
    " *       تماشای فعال‌سازی (خط «📊 آمار» در خروجی نصب چاپ می‌شود).",
]
WATCH_STATS_WITNESS = ['      printf \'%s\\\\n\' "\\$out" | grep "📊 آمار" | tail -n 1 || true']
GUIDE_DEF = [
    "",
    "# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً): راهنمای مشاهدهٔ آمار دریافت/ارسال ──",
    "print_stats_guide() {",
    '  echo "📊 آمار دریافت/ارسال پیام رله: در نشست رله، خط «📊 آمار» هر حداکثر ۳۰-۶۰ ثانیه چاپ می‌شود."',
    '  echo "مشاهدهٔ آمار در هر لحظه (بدون اتصال tmux): bash \\$HOME/melka-relay/status.sh"',
    '  echo "نمای زندهٔ رله: tmux attach -t melka-relay (خروج: Ctrl+b سپس d) — یا: tail -f \\$HOME/melka-relay/relay.log"',
    "}",
]
TMUX_RC = ["      wrc=\\$?", "      print_stats_guide", "      return \\$wrc"]
NOHUP_RC = ["  wrc=\\$?", "  print_stats_guide", "  return \\$wrc"]

# ─── ترتیب اجرا: از پایین به بالا تا شماره خطوط بالا جابه‌جا نشوند ───

# ۱۸) شاخهٔ nohup در start_relay_core
found = None
for i in range(1540, min(1660, len(src) - 3)):
    if "watch_relay_activation" in src[i] and src[i+1].strip() == "return \\$?" and (i+2 < len(src)) and "fi" not in src[i+2]:
        found = i
        break
if found is None:
    print("FAIL: nohup branch anchor"); sys.exit(2)
src[found+1:found+2] = NOHUP_RC
print(f"  nohup branch patched @L{found+1}")

# ۱۷) شاخهٔ tmux در start_relay_core
found = None
for i in range(1530, min(1650, len(src) - 3)):
    if "watch_relay_activation" in src[i] and src[i+1].strip() == "return \\$?" and src[i+2].strip() == "fi":
        found = i
        break
if found is None:
    print("FAIL: tmux branch anchor"); sys.exit(2)
src[found+1:found+2] = TMUX_RC
print(f"  tmux branch patched @L{found+1}")

# ۱۶) تعریف print_stats_guide بعد از انتهای watch_relay_activation
found = None
for i in range(1500, 1620):
    if src[i].strip() == "}" and src[i-1].strip() == "return 1":
        found = i
        break
if found is None:
    print("FAIL: watch fn end anchor"); sys.exit(2)
insert_after(found, GUIDE_DEF, "print_stats_guide def")

# ۱۵) شاهد آمار در تماشای فعال‌سازی
found = None
for i in range(1490, 1560):
    if "رلهٔ ملکا فعال است" in src[i] and "tail -n 1" in src[i]:
        found = i
        break
if found is None:
    print("FAIL: witness printf line not found"); sys.exit(2)
insert_after(found, WATCH_STATS_WITNESS, "watch stats witness")

# ۱۴) سند نسل R قبل از buildInstallCommand
for i in range(1460, 1520):
    if src[i].strip() == "*/" and "buildInstallCommand" in src[i+1]:
        insert_after(i, INSTALL_DOC_R, "install doc نسل R")
        break
else:
    print("FAIL: install doc end anchor"); sys.exit(2)

# ۱۳) ضربان «زنده» غنی‌شده
for i in range(1050, 1095):
    if "SERVED موفق" in src[i]:
        src[i] = HEARTBEAT_NEW[0]
        print(f"  heartbeat enriched @L{i+1}")
        break
else:
    print("FAIL: heartbeat anchor"); sys.exit(2)

# ۱۲) stats_line در حلقهٔ اصلی
for i in range(1040, 1060):
    if "LOOPS=\\$((LOOPS+1))" in src[i]:
        insert_after(i, ["    stats_line"], "main stats call")
        break
else:
    print("FAIL: main loop anchor"); sys.exit(2)

# ۱۱) stats_line در حلقهٔ process_set
for i in range(970, 1000):
    if src[i] == "  while :; do":
        insert_after(i, ["    stats_line"], "process_set stats call")
        break
else:
    print("FAIL: process_set while anchor"); sys.exit(2)

# ۱۰) خط drain غنی‌شده
for i in range(900, 940):
    if "totaln:-0}" in src[i] and "log" in src[i] and "خطا" in src[i]:
        src[i] = DRAIN_LOG_NEW[0]
        print(f"  drain log enriched @L{i+1}")
        break
else:
    print("FAIL: drain log anchor"); sys.exit(2)

# ۹) MSG_SENT در drain_spool
for i in range(890, 940):
    if "BATCHES=\\$((BATCHES+1))" in src[i]:
        insert_after(i, MSG_SENT_INCR, "MSG_SENT incr")
        break
else:
    print("FAIL: drain anchor"); sys.exit(2)

# ۸) MSG_RECV در حلقهٔ برداشت
for i in range(980, 1020):
    if '"$ITEM"' in src[i]:
        insert_after(i, MSG_RECV_INCR, "MSG_RECV incr")
        break
else:
    print("FAIL: spawn loop anchor"); sys.exit(2)

# ۷) STATS_FILE
for i in range(140, 165):
    if "RELAY_PID_FILE" in src[i]:
        insert_after(i, STATS_FILE_LINE, "STATS_FILE const")
        break
else:
    print("FAIL: pid const anchor"); sys.exit(2)

# ۶) ثابت‌های آمار
for i in range(140, 160):
    if "LAST_ARM_CALL_MS=0" in src[i]:
        insert_after(i, CONSTS_R, "stats consts")
        break
else:
    print("FAIL: consts anchor"); sys.exit(2)

# ۵) تابع stats_line بعد از log()
for i in range(315, 340):
    if "log() { echo" in src[i]:
        insert_after(i, STATS_FN, "stats_line fn")
        break
else:
    print("FAIL: log anchor"); sys.exit(2)

# ۴) مولد status.sh بعد از نوشتن pid
for i in range(1290, 1380):
    if "RELAY_PID_FILE" in src[i] and "printf" in src[i]:
        insert_after(i, STATUS_TOOL, "status.sh generator")
        break
else:
    print("FAIL: pid write anchor"); sys.exit(2)

# ۳) بنر راهنما بعد از خط «احراز:»
for i in range(1280, 1340):
    if "X-Melka-Signature" in src[i] and src[i].startswith("log"):
        insert_after(i, BANNER_R, "banner stats")
        break
else:
    print("FAIL: banner anchor"); sys.exit(2)

# ۲) init شمارنده‌ها
for i in range(1270, 1330):
    if "SERVED=0;" in src[i]:
        src[i] = INIT_NEW[0]
        print(f"  init vars @L{i+1}")
        break
else:
    print("FAIL: init anchor"); sys.exit(2)

# ۱) سربرگ اسکریپت تولیدی (بولت «صف آفلاین SQLite»)
for i in range(85, 100):
    if "SQLite" in src[i] and src[i].startswith("#"):
        insert_after(i, GEN_HEADER_R, "gen header نسل R")
        break
else:
    print("FAIL: gen header anchor"); sys.exit(2)

# ۰) سند نسل R در سربرگ فایل
for i in range(10, 25):
    if "manifest/stealth" in src[i]:
        insert_after(i, DOC_R, "doc نسل R")
        break
else:
    print("FAIL: doc anchor"); sys.exit(2)

open(PATH, "w", encoding="utf-8").write("\n".join(src) + "\n")
print("OK — relay-script.ts patched:", len(src), "lines")
