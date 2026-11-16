#!/usr/bin/env bash
# ============================================================================
# smoke.sh — تست دودویی DIR-RELAY-UNLIMITED-001 (دستور مالک ۲۰۲۶-۱۱-۱۴ · نسل N)
# ----------------------------------------------------------------------------
# قانون جدید: «بدون توقف» — هیچ خطای شبکه/دروازه/احراز رله را نمی‌کشد؛ تنها
# خروج = ابطال مالک (device revoked) یا سیگنال توقف (Ctrl+C/TERM).
#
# سناریوها (روی اسکریپتِ تولیدیِ واقعی، نه رونوشت دستی):
#   A) 502×3 پیاپی → AIMD (۱ث→۲ث→۴ث پس از پچ) + زنده ماندن (بدون توقف)
#   B) 401×4 → هیچ خروجی (غالب‌شدن دستور DIR-RELAY-FIX-001) + راهنمای دوره‌ای + زنده
#   C) 403+JSON «unknown device» ×3 → تلاش تطبیقی + راهنما + زنده
#   D) 403+HTML ×4 (WAF) → AIMD + زنده (خروج در نسخه قبل پس از ۲ بار!)
#   E) 204 → «اتصال تأیید شد» + حلقهٔ سالم
#   F) Wake-Lock: قفل در آغاز + SIGTERM → خروج 0 پاک + آزادسازی
#   G) دستور نصب پیشرفته: (۱) bootstrap 403 همیشگی → ۳ تلاش + پیام + پاکسازی
#      (۲) 403,403,200 → نصب موفق + bash اجرا شد (استاب) + بدون پاکسازی
#   H) device revoked → خروج 1 + پیام ابطال (تنها خروج عمدی)
#   I) items|3 با امضای نامعتبر → استخر+انبار+جریان: POST نتیجه با «bad signature»
#   J) ساختار سرپرایز: حلقهٔ ریستار + تلهٔ INT/TERM + EXIT_REVOKED + ثابت‌های نسل N
# پچ‌های تست (روی کپی تولیدی، نه سورس): AIMD/احراز/نرخ/سرپرایز → مقادیر سریع
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
WORK="$(mktemp -d /tmp/relay-unlimited-001.XXXXXX)"
PORT=18877
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1" >&2; FAIL=$((FAIL+1)); }

# ── آماده‌سازی: تولید اسکریپت واقعی از سورس TS ──
if ! bun run "$ROOT/scripts/relay-unlimited-001/gen-test-artifacts.ts" "http://127.0.0.1:$PORT" "$WORK" >/dev/null 2>&1; then
  echo "تولید اسکریپت ناموفق"; exit 1
fi
SCRIPT="$WORK/melka-relay.sh"
[ -f "$SCRIPT" ] || { echo "اسکریپت تولید نشد"; exit 1; }
# نسخهٔ دست‌نخورده برای تست‌های ساختاری (J)
cp "$SCRIPT" "$WORK/melka-relay-original.sh"
# پچ سرعت تست (روی کپی): AIMD پایه ۱ث/سقف ۴ · احراز ۱ث/۴ · نرخ ۹۹۹ · سرپرایز ۲ث
# · poll میان‌موجی/فلش ۱ث · انتظار poll ۳ث
sed -i 's/^GATEWAY_RETRY_DELAY=10/GATEWAY_RETRY_DELAY=1/; s/^GATEWAY_BACKOFF_MAX=120/GATEWAY_BACKOFF_MAX=4/; s/^AUTH_RETRY_BASE=30/AUTH_RETRY_BASE=1/; s/^AUTH_RETRY_MAX=300/AUTH_RETRY_MAX=4/; s/^RATE_MAX=20/RATE_MAX=999/; s/^SUPERVISOR_DELAY=10/SUPERVISOR_DELAY=2/; s/^EXPRESS_POLL_S=5/EXPRESS_POLL_S=1/; s/^FLUSH_AGE_S=4/FLUSH_AGE_S=1/; s/^POLL_WAIT_S=50/POLL_WAIT_S=3/' "$SCRIPT"
bash -n "$SCRIPT" || { echo "bash -n ناموفق"; exit 1; }

# ── استاب‌های Termux (Wake-Lock واقعی از PATH) ──
STUB="$WORK/stubs"; mkdir -p "$STUB"
WITNESS="$WORK/witness.log"; touch "$WITNESS"
cat > "$STUB/termux-wake-lock" <<EOF
#!/usr/bin/env bash
echo "WAKE_LOCK_ACQUIRED" >> "$WITNESS"
EOF
cat > "$STUB/termux-wake-unlock" <<EOF
#!/usr/bin/env bash
echo "WAKE_LOCK_RELEASED" >> "$WITNESS"
EOF
cat > "$STUB/pkg" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$STUB/termux-wake-lock" "$STUB/termux-wake-unlock" "$STUB/pkg"
# bash واقعی — پیش از ساخت استابِ bash در G2 (وگرنه حلقهٔ بیرونی هم استاب می‌شود)
REAL_BASH="$(command -v bash)"

run_relay() {  # $1 = فایل سناریو · $2 = شماره · رله زیر timeout ضدهنگ
  local scen="$1" n="$2" pid
  python3 "$ROOT/scripts/relay-unlimited-001/mock-server.py" "$scen" "$PORT" "${RESULTS_DIR:-/dev/null}" >/dev/null 2>&1 &
  echo $! > "$WORK/mock-$n.pid"
  sleep 0.4
  mkdir -p "$WORK/home-$n"
  HOME="$WORK/home-$n" PATH="$STUB:$PATH" timeout -k 2 90 bash "$SCRIPT" > "$WORK/out-$n.log" 2>&1 &
  pid=$!
  echo "$pid" > "$WORK/pid-$n"
}

stop_mock() { kill "$(cat "$WORK/mock-$1.pid")" 2>/dev/null; }
alive() { kill -0 "$(cat "$WORK/pid-$1")" 2>/dev/null; }

echo "— تست دودویی DIR-RELAY-UNLIMITED-001 (نسل N · بی‌توقف):"

# ── A) 502×3 → AIMD + زنده ماندن ──
printf '502|html\n502|html\n502|html\n204|\n204|\n' > "$WORK/scen-a"
run_relay "$WORK/scen-a" a
sleep 12
if alive a; then
  N502=$(grep -c 'خطای 502 داد' "$WORK/out-a.log" || true)
  [ "${N502:-0}" -ge 3 ] && ok "A: سه تلاش مجدد 502 ثبت شد" || fail "A: تعداد تلاش 502 = ${N502:-0}"
  grep -q 'تاخیر تطبیقی' "$WORK/out-a.log" && ok "A: پیام تاخیر تطبیقی (AIMD)" || fail "A: پیام AIMD نیامد"
  kill "$(cat "$WORK/pid-a")" 2>/dev/null
else
  fail "A: رله پس از 502×3 زنده نماند (خروج غیرمنتظره — نقض قانون بی‌توقف)"
fi
grep -q 'WAKE_LOCK_ACQUIRED' "$WITNESS" && ok "F: Wake-Lock در آغاز گرفته شد" || fail "F: Wake-Lock گرفته نشد"
stop_mock a

# ── B) 401×4 → بدون خروج (غالب‌شدن DIR-RELAY-FIX-001) + راهنما + زنده ──
printf '401|html\n401|html\n401|html\n401|html\n204|\n' > "$WORK/scen-b"
run_relay "$WORK/scen-b" b
sleep 16
if alive b; then
  grep -q 'HTTP 401' "$WORK/out-b.log" && ok "B: 401 ثبت شد" || fail "B: نشان HTTP 401 نیست"
  grep -q 'توقف نمی‌کنم' "$WORK/out-b.log" && ok "B: راهنمای «توقف نمی‌کنم» (بی‌توقف)" || fail "B: راهنمای بی‌توقف نیامد"
  grep -q 'بدون توقف' "$WORK/out-b.log" && ok "B: برچسب بدون توقف در تلاش‌های بعدی" || fail "B: برچسب بدون توقف نیست"
  kill "$(cat "$WORK/pid-b")" 2>/dev/null
else
  fail "B: رله با 401 مُرد (رگرسیون DIR-RELAY-FIX-001 — باید زنده بماند)"
fi
stop_mock b

# ── C) 403+JSON unknown device ×3 → تلاش تطبیقی + زنده ──
printf '403|json-unknown\n403|json-unknown\n403|json-unknown\n204|\n' > "$WORK/scen-c"
run_relay "$WORK/scen-c" c
sleep 12
if alive c; then
  grep -q 'سرور: unknown device' "$WORK/out-c.log" && ok "C: علت دقیق سرور ذکر شد" || fail "C: علت سرور ذکر نشد"
  grep -q 'توقف نمی‌کنم' "$WORK/out-c.log" && ok "C: راهنمای بی‌توقف (unknown device موقتی)" || fail "C: راهنما نیامد"
  kill "$(cat "$WORK/pid-c")" 2>/dev/null
else
  fail "C: رله با unknown device مُرد (پس از بازنشانی سرور باید برگردد)"
fi
stop_mock c

# ── D) 403+HTML ×4 (WAF) → AIMD + زنده (نسخهٔ قبل: خروج پس از ۲) ──
printf '403|html\n403|html\n403|html\n403|html\n204|\n' > "$WORK/scen-d"
run_relay "$WORK/scen-d" d
sleep 16
if alive d; then
  N403=$(grep -c '403 از دروازه/WAF' "$WORK/out-d.log" || true)
  [ "${N403:-0}" -ge 4 ] && ok "D: چهار 403-WAF پیاپی تحمل شد (قبلاً خروج در دومین)" || fail "D: شمار 403-WAF = ${N403:-0}"
  grep -q 'تاخیر تطبیقی' "$WORK/out-d.log" && ok "D: AIMD فعال روی WAF" || fail "D: AIMD نیامد"
  kill "$(cat "$WORK/pid-d")" 2>/dev/null
else
  fail "D: رله با 403-HTML مُرد (WAF گذرا نباید مرگبار باشد)"
fi
stop_mock d

# ── E) 204 → مسیر خوش‌شانس بدون رگرسیون ──
printf '204|\n204|\n204|\n' > "$WORK/scen-e"
run_relay "$WORK/scen-e" e
sleep 8
if alive e; then
  grep -q 'اتصال تأیید شد' "$WORK/out-e.log" && ok "E: poll خالی 204 → «اتصال تأیید شد» + حلقهٔ سالم" || fail "E: تأیید اتصال نیامد"
  kill "$(cat "$WORK/pid-e")" 2>/dev/null
else
  fail "E: رله در مسیر خوش‌شانس 204 مُرد (رگرسیون!)"
fi
stop_mock e

# ── F) SIGTERM → خروج پاک 0 + آزادسازی Wake-Lock ──
printf '204|\n204|\n' > "$WORK/scen-f"
run_relay "$WORK/scen-f" f
sleep 5
if alive f; then
  kill -TERM "$(cat "$WORK/pid-f")" 2>/dev/null
  wait "$(cat "$WORK/pid-f")" 2>/dev/null; RC_F=$?
  [ "$RC_F" -eq 0 ] && ok "F: SIGTERM → خروج پاک با کد 0" || fail "F: کد خروج پس از TERM = $RC_F (انتظار 0)"
  grep -q 'خروج پاک' "$WORK/out-f.log" && ok "F: پیام خروج پاک (تلهٔ INT/TERM)" || fail "F: پیام خروج پاک نیامد"
else
  fail "F: رله پیش از TERM مرد (سناریو معیوب)"
fi
grep -q 'WAKE_LOCK_RELEASED' "$WITNESS" && ok "F: Wake-Lock در خروج آزاد شد" || fail "F: Wake-Lock آزاد نشد"
stop_mock f

# ── G) دستور نصب پیشرفته ──
# G1: bootstrap همیشه 403 → سه تلاش (۵ث فاصله) + پیام + پاکسازی
python3 - "$PORT" <<'PYEOF' >/dev/null 2>&1 &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(403)
        body = b'{"ok":false,"reason":"expired"}'
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self): self.do_GET()
HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PYEOF
MOCK_G1=$!
sleep 0.4
sed "s|https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai|http://127.0.0.1:$PORT|" "$WORK/install-command.sh" > "$WORK/install-g1.sh"
mkdir -p "$WORK/home-g1"
HOME="$WORK/home-g1" PATH="$STUB:$PATH" bash "$WORK/install-g1.sh" > "$WORK/out-g1.log" 2>&1
grep -q 'خطا در نصب! لطفاً کد جدید بگیرید.' "$WORK/out-g1.log" && ok "G1: پیام شفاف شکست نصب" || fail "G1: پیام شکست نصب نیامد"
[ ! -f "$WORK/home-g1/melka-relay.sh" ] && ok "G1: فایل ناقص پاک شد" || fail "G1: فایل پاک نشد"
kill "$MOCK_G1" 2>/dev/null

# G2: 403, 403, سپس 200 با اسکریپت واقعی → تلاش سوم موفق + bash استاب اجرا شد
python3 - "$PORT" "$WORK/melka-relay-original.sh" <<'PYEOF' >/dev/null 2>&1 &
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
PORT = int(sys.argv[1]); SCRIPT = open(sys.argv[2], "rb").read()
STATE = {"n": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        STATE["n"] += 1
        if STATE["n"] <= 2:
            self.send_response(403)
            body = b'{"ok":false,"reason":"expired"}'
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/x-shellscript")
        self.send_header("Content-Length", str(len(SCRIPT)))
        self.end_headers()
        self.wfile.write(SCRIPT)
    def do_POST(self): self.do_GET()
HTTPServer(("127.0.0.1", PORT), H).serve_forever()
PYEOF
MOCK_G2=$!
sleep 0.4
MARKER="$WORK/bash-invoked"
cat > "$STUB/bash" <<EOF
#!/bin/bash
echo "BASH_INVOKED" >> "$MARKER"
EOF
chmod +x "$STUB/bash"
sed "s|https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai|http://127.0.0.1:$PORT|" "$WORK/install-command.sh" > "$WORK/install-g2.sh"
mkdir -p "$WORK/home-g2"
HOME="$WORK/home-g2" PATH="$STUB:$PATH" "$REAL_BASH" "$WORK/install-g2.sh" > "$WORK/out-g2.log" 2>&1
grep -q 'تلاش دانلود 2 از ۳ ناموفق' "$WORK/out-g2.log" && ok "G2: تلاش مجدد دانلود ثبت شد (شبکهٔ لرزان)" || fail "G2: پیام تلاش مجدد نیامد"
grep -q 'نصب موفق' "$WORK/out-g2.log" && ok "G2: پیام نصب موفق" || fail "G2: پیام نصب موفق نیامد"
[ -f "$MARKER" ] && ok "G2: bash ~/melka-relay.sh اجرا شد (رله آغاز شد)" || fail "G2: bash اجرا نشد"
[ -f "$WORK/home-g2/melka-relay.sh" ] && ok "G2: اسکریپت سالم پاک نشد" || fail "G2: اسکریپت سالم پاک شد (باگ!)"
kill "$MOCK_G2" 2>/dev/null
rm -f "$STUB/bash"

# ── H) device revoked → تنها خروج عمدی (کد 1 + پیام ابطال) ──
printf '403|json-revoked\n' > "$WORK/scen-h"
run_relay "$WORK/scen-h" h
wait "$(cat "$WORK/pid-h")" 2>/dev/null; RC_H=$?
[ "$RC_H" -eq 1 ] && ok "H: revoked → خروج 1 (تنها خروج عمدی)" || fail "H: کد خروج = $RC_H (انتظار 1)"
grep -q 'دستگاه رله از داشبورد باطل شده است' "$WORK/out-h.log" && ok "H: پیام ابطال شفاف" || fail "H: پیام ابطال نیامد"
grep -q 'خروج نهایی — دستگاه از داشبورد باطل شد' "$WORK/out-h.log" && ok "H: سرپرایز پایان عمدی را ثبت کرد" || fail "H: پیام سرپرایز نیامد"
stop_mock h

# ── I) items|3 با امضای نامعتبر → استخر + انبار + جریان نتیجه ──
RESULTS_DIR="$WORK/results-i.jsonl"; : > "$RESULTS_DIR"
printf 'items|3\n204|\n' > "$WORK/scen-i"
run_relay "$WORK/scen-i" i
sleep 10
kill "$(cat "$WORK/pid-i")" 2>/dev/null
stop_mock i
if [ -s "$RESULTS_DIR" ]; then
  python3 - "$RESULTS_DIR" <<'PYEOF' || fail "I: نتیجه‌های POST نامعتبر بودند"
import sys, json, base64, gzip
ok_ids = set()
bad_sig = 0
for line in open(sys.argv[1]):
    rec = json.loads(line)
    w = base64.b64decode(rec["body_b64"])
    text = gzip.decompress(w).decode() if rec["headers"].get("content-encoding") == "gzip" else w.decode()
    for item in json.loads(text):
        ok_ids.add(item.get("id"))
        if item.get("error") == "bad signature":
            bad_sig += 1
assert ok_ids == {"smoke-item-001", "smoke-item-002", "smoke-item-003"}, ok_ids
assert bad_sig == 3, bad_sig
print("VALID")
PYEOF
  [ $? -eq 0 ] && ok "I: سه نتیجهٔ bad-signature در POST نتیجه رساند (استخر+انبار+جریان)"
  grep -q 'امضای سرور نامعتبر' "$WORK/out-i.log" && ok "I: دفاع دولایهٔ امضا فعال" || fail "I: لاگ رد امضا نیامد"
  grep -q 'جریان نتیجه: 3 مورد' "$WORK/out-i.log" && ok "I: تخلیهٔ جریانی ثبت شد" || fail "I: لاگ جریان نتیجه نیامد"
else
  fail "I: هیچ POST نتیجه‌ای ثبت نشد (استخر/انبار نشت می‌کند)"
fi

# ── J) ساختار نسل N (روی نسخهٔ دست‌نخورده) ──
ORIG="$WORK/melka-relay-original.sh"
grep -q 'BATCH=48' "$ORIG" && ok "J: BATCH=48" || fail "J: BATCH=48 نیست"
grep -q 'MAX_WORKERS=16' "$ORIG" && ok "J: MAX_WORKERS=16" || fail "J: MAX_WORKERS=16 نیست"
grep -q 'RATE_MAX=20' "$ORIG" && ok "J: سقف نرخ ۲۰/دقیقه (نسل M: ۵)" || fail "J: RATE_MAX=20 نیست"
grep -q "return \$EXIT_REVOKED" "$ORIG" && ok "J: خروج عمدی فقط با EXIT_REVOKED" || fail "J: return EXIT_REVOKED نیست"
grep -q 'سرپرایز: چرخهٔ اصلی پایان یافت' "$ORIG" && ok "J: حلقهٔ سرپرایز خود‌ریستار" || fail "J: سرپرایز نیست"
grep -q "trap 'log \"دستور توقف دریافت شد" "$ORIG" && ok "J: تلهٔ INT/TERM (خروج پاک)" || fail "J: تلهٔ INT/TERM نیست"
grep -q 'FAILED_TTL_S=3600' "$ORIG" && ok "J: انبار نتیجهٔ ارسال‌نشده ۱ ساعت" || fail "J: FAILED_TTL_S=3600 نیست"
grep -q 'AUTH_RETRY_BASE=30' "$ORIG" && ok "J: تلاش تطبیقی احراز ۳۰→۳۰۰ث" || fail "J: AUTH_RETRY_BASE نیست"
grep -q 'express_poll_items' "$ORIG" && ok "J: poll میان‌موجی (برداشت زنده حین موج)" || fail "J: express_poll_items نیست"
grep -q 'maybe_resync_clock' "$ORIG" && ok "J: همگام‌سازی دورهٔ ساعت (هر ۱۵دقیقه)" || fail "J: maybe_resync_clock نیست"

echo "————————————————"
echo "نتیجه: $PASS سبز · $FAIL قرمز"
[ "$FAIL" -eq 0 ] || { echo "خروجی‌ها در: $WORK"; exit 1; }
rm -rf "$WORK"
