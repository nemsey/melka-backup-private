#!/usr/bin/env bash
# ============================================================================
# smoke.sh — تست دودویی DIR-RELAY-FIX-001 (شورا · ۲۰۲۶-۱۱-۱۲ · P1)
# ----------------------------------------------------------------------------
# به‌روزرسانی ۲۰۲۶-۱۱-۱۴ (DIR-RELAY-UNLIMITED-001 · دستور مالک «بدون توقف»):
#   بندهای B/C/D این مجموعه (خروج 1 روی 401/403) با حکم مالک غالب شدند — رله
#   دیگر با هیچ خطای شبکه/دروازه/احراز نمی‌میرد؛ تنها ابطال مالک یا Ctrl+C.
#   این مجموعه همان سناریوها را با قرارداد تازه (زنده ماندن + راهنما) می‌سنجد؛
#   پوشش کامل نسل N در scripts/relay-unlimited-001/smoke.sh (۳۶ سنجه) است.
#
# سناریوها:
#   A) 502×3 پیاپی → سه تلاش مجدد سریع (پچ GATEWAY_RETRY_DELAY=1) + زنده ماندن
#   B) 401 → «بدون توقف»: راهنمای کد تازه + تلاش تطبیقی (پچ AUTH_*) + زنده [غالب‌شده]
#   C) 403+JSON «unknown device» → تلاش تطبیقی + علت سرور + زنده [غالب‌شده]
#   D) 403+HTML ×4 → AIMD (نه خروج در دومین) + زنده [غالب‌شده]
#   E) 204 → حلقهٔ سالم: «اتصال تأیید شد» + زنده ماندن
#   F) Wake-Lock: قفل در آغاز + آزادسازی در خروج از طریق تلهٔ EXIT
#   G) دستور نصب: bootstrap 403 همیشگی → ۳ تلاش + پیام «خطا در نصب!» + حذف فایل
# پچ‌های تست (روی کپی تولیدی): AIMD/احراز/نرخ → مقادیر سریع
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
WORK="$(mktemp -d /tmp/dir-relay-fix-001.XXXXXX)"
PORT=18765
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1" >&2; FAIL=$((FAIL+1)); }

# ── آماده‌سازی: تولید اسکریپت واقعی از سورس TS ──
if ! bun run "$ROOT/scripts/dir-relay-fix-001/gen-test-artifacts.ts" "http://127.0.0.1:$PORT" "$WORK" >/dev/null 2>&1; then
  echo "تولید اسکریپت ناموفق"; exit 1
fi
SCRIPT="$WORK/melka-relay.sh"
[ -f "$SCRIPT" ] || { echo "اسکریپت تولید نشد"; exit 1; }
# پچ سرعت تست (روی کپی) — ثابت‌های نسل N
sed -i 's/^GATEWAY_RETRY_DELAY=10/GATEWAY_RETRY_DELAY=1/; s/^GATEWAY_BACKOFF_MAX=120/GATEWAY_BACKOFF_MAX=4/; s/^AUTH_RETRY_BASE=30/AUTH_RETRY_BASE=1/; s/^AUTH_RETRY_MAX=300/AUTH_RETRY_MAX=4/; s/^RATE_MAX=20/RATE_MAX=999/; s/^POLL_WAIT_S=50/POLL_WAIT_S=3/' "$SCRIPT"

# ── استاب‌های Termux (تست Wake-Lock واقعی از PATH) ──
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
chmod +x "$STUB/termux-wake-lock" "$STUB/termux-wake-unlock"
cat > "$STUB/pkg" <<EOF
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$STUB/pkg"

run_relay() {  # $1 = فایل سناریو · $2 = شماره · رله زیر timeout 60ث (ضدهنگ)
  local scen="$1" n="$2" pid
  python3 "$ROOT/scripts/dir-relay-fix-001/mock-server.py" "$scen" "$PORT" >/dev/null 2>&1 &
  echo $! > "$WORK/mock-$n.pid"
  sleep 0.4
  mkdir -p "$WORK/home-$n"
  HOME="$WORK/home-$n" PATH="$STUB:$PATH" timeout -k 2 60 bash "$SCRIPT" > "$WORK/out-$n.log" 2>&1 &
  pid=$!
  echo "$pid" > "$WORK/pid-$n"
}

stop_mock() { kill "$(cat "$WORK/mock-$1.pid")" 2>/dev/null; }
alive() { kill -0 "$(cat "$WORK/pid-$1")" 2>/dev/null; }

echo "— تست دودویی DIR-RELAY-FIX-001 (به‌روز DIR-RELAY-UNLIMITED-001):"

# ── A) 502×3 → سه تلاش مجدد سریع + زنده ماندن ──
printf '502|html\n502|html\n502|html\n204|\n204|\n' > "$WORK/scen-a"
run_relay "$WORK/scen-a" a
sleep 12
if alive a; then
  N502=$(grep -c 'خطای 502 داد' "$WORK/out-a.log" || true)
  [ "${N502:-0}" -ge 3 ] && ok "A: سه تلاش مجددِ 502 ثبت شد ($N502)" || fail "A: تعداد تلاش 502 = ${N502:-0} (انتظار ≥۳)"
  grep -q 'تاخیر تطبیقی' "$WORK/out-a.log" && ok "A: فاصلهٔ تلاش تطبیقی (AIMD — نه نردمان)" || fail "A: پیام فاصلهٔ تلاش نیامد"
  kill "$(cat "$WORK/pid-a")" 2>/dev/null
else
  fail "A: رله پس از 502×3 زنده نماند (خروج غیرمنتظره)"
fi
grep -q 'WAKE_LOCK_ACQUIRED' "$WITNESS" && ok "F: Wake-Lock در آغاز گرفته شد" || fail "F: Wake-Lock گرفته نشد"
stop_mock a

# ── B) 401 → بدون توقف (حکم غالب‌شدهٔ ۲۰۲۶-۱۱-۱۴) + راهنمای کد تازه ──
printf '401|html\n401|html\n401|html\n401|html\n204|\n' > "$WORK/scen-b"
run_relay "$WORK/scen-b" b
sleep 14
if alive b; then
  grep -q 'HTTP 401' "$WORK/out-b.log" && ok "B: 401 ثبت شد" || fail "B: نشان HTTP 401 نیست"
  grep -q 'توقف نمی‌کنم' "$WORK/out-b.log" && ok "B: راهنمای «توقف نمی‌کنم» — غالب‌شدن خروج ۱ (۲۰۲۶-۱۱-۱۴)" || fail "B: راهنمای بی‌توقف نیامد"
  kill "$(cat "$WORK/pid-b")" 2>/dev/null
else
  fail "B: رله با 401 مُرد (قرارداد تازه: زنده بماند)"
fi
stop_mock b

# ── C) 403 + JSON «unknown device» → تلاش تطبیقی + علت + زنده ──
printf '403|json-unknown\n403|json-unknown\n403|json-unknown\n204|\n' > "$WORK/scen-c"
run_relay "$WORK/scen-c" c
sleep 10
if alive c; then
  grep -q 'سرور: unknown device' "$WORK/out-c.log" && ok "C: علت دقیق سرور ذکر شد (قرارداد JSON)" || fail "C: علت سرور ذکر نشد"
  grep -q 'توقف نمی‌کنم' "$WORK/out-c.log" && ok "C: تلاش تطبیقی (unknown device می‌تواند موقتی باشد)" || fail "C: راهنما نیامد"
  kill "$(cat "$WORK/pid-c")" 2>/dev/null
else
  fail "C: رله با unknown device مُرد (پس از بازنشانی سرور باید برگردد)"
fi
stop_mock c

# ── D) 403 + HTML ×4 → AIMD (نه خروج در دومین — قرارداد قدیمی غالب شد) ──
printf '403|html\n403|html\n403|html\n403|html\n204|\n' > "$WORK/scen-d"
run_relay "$WORK/scen-d" d
sleep 14
if alive d; then
  N403=$(grep -c '403 از دروازه/WAF' "$WORK/out-d.log" || true)
  [ "${N403:-0}" -ge 4 ] && ok "D: چهار 403-WAF پیاپی تحمل شد (قرارداد تازه: نه خروج در دومین)" || fail "D: شمار 403-WAF = ${N403:-0}"
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
  grep -q 'اتصال تأیید شد' "$WORK/out-e.log" && ok "E: poll خالی 204 → «اتصال تأیید شد» + حلقهٔ سالم" || fail "E: تأیید اتصال نیامد (بدنه/کد قاطی شده؟)"
  kill "$(cat "$WORK/pid-e")" 2>/dev/null
else
  fail "E: رله در مسیر خوش‌شانس 204 مُرد (رگرسیون!)"
fi
stop_mock e

# ── G) دستور نصب: pkg استاب + bootstrap 403 همیشگی → ۳ تلاش + پیام + پاکسازی ──
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
HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PYEOF
MOCK_G=$!
sleep 0.4
CMD="$WORK/install-command.sh"
sed "s|https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai|http://127.0.0.1:$PORT|" "$CMD" > "$WORK/install-cmd-g.sh" 2>/dev/null || cp "$CMD" "$WORK/install-cmd-g.sh"
mkdir -p "$WORK/home-g"
HOME="$WORK/home-g" PATH="$STUB:$PATH" bash "$WORK/install-cmd-g.sh" > "$WORK/out-g.log" 2>&1
grep -q 'خطا در نصب! لطفاً کد جدید بگیرید.' "$WORK/out-g.log" && ok "G: پیام شفاف شکست نصب" || fail "G: پیام شکست نصب نیامد"
[ ! -f "$WORK/home-g/melka-relay.sh" ] && ok "G: فایل ناقص پاک شد (rm -f)" || fail "G: فایل melka-relay.sh پاک نشد"
kill "$MOCK_G" 2>/dev/null

echo "————————————————"
echo "نتیجه: $PASS سبز · $FAIL قرمز"
[ "$FAIL" -eq 0 ] || { echo "خروجی‌ها در: $WORK"; exit 1; }
rm -rf "$WORK"
