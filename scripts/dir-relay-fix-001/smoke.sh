#!/usr/bin/env bash
# ============================================================================
# smoke.sh — تست دودویی DIR-RELAY-FIX-001 (شورا · ۲۰۲۶-۱۱-۱۲ · P1)
# ----------------------------------------------------------------------------
# سناریوها (هرچه اسکریپتِ تولیدیِ واقعی، نه رونوشت دستی):
#   A) 502×3 پیاپی → سه تلاش مجددِ ~۱ثانیه‌ای (پس از پچِ GATEWAY_RETRY_DELAY=1)
#      و رله همچنان زنده — «بازیابی خودکار» (دستور ۱)
#   B) 401 → خروج 1 + پیام «کد رله شما منقضی شده است… (HTTP 401)» (دستور ۱)
#   C) 403+JSON «unknown device» → خروج 1 + پیام + (سرور: unknown device) (دستور ۱)
#   D) 403+HTML ×2 → خروج 1 پس از دومین 403 پیاپی + (HTTP 403 ×2) (دستور ۱)
#   E) 204 → حلقهٔ سالم: «اتصال تأیید شد» + زنده ماندن (بدون رگرسیون مسیر خوش‌شانس)
#   F) Wake-Lock: استاب termux-wake-lock/unlock در PATH → قفل در آغاز +
#      آزادسازی در خروج از طریق تلهٔ EXIT (دستور ۳)
#   G) دستور نصب: استاب pkg + bootstrap ساختگی 403 → پیام «خطا در نصب!» +
#      حذف ~/melka-relay.sh (دستور ۲)
# پچ‌های تست (روی کپی تولیدی، نه سورس): GATEWAY_RETRY_DELAY=10→1 · سقف نرخ 5→999
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
# پچ سرعت تست (روی کپی)
sed -i 's/GATEWAY_RETRY_DELAY=10/GATEWAY_RETRY_DELAY=1/; s/-ge 5 \]; then/-ge 999 ]; then/' "$SCRIPT"

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

run_relay() {  # $1 = فایل سناریو · $2 = شماره · رله زیر timeout 30ث (ضدهنگ)
  local scen="$1" n="$2" pid
  python3 "$ROOT/scripts/dir-relay-fix-001/mock-server.py" "$scen" "$PORT" >/dev/null 2>&1 &
  echo $! > "$WORK/mock-$n.pid"
  sleep 0.4
  mkdir -p "$WORK/home-$n"
  HOME="$WORK/home-$n" PATH="$STUB:$PATH" timeout -k 2 30 bash "$SCRIPT" > "$WORK/out-$n.log" 2>&1 &
  pid=$!
  echo "$pid" > "$WORK/pid-$n"
}

stop_mock() { kill "$(cat "$WORK/mock-$1.pid")" 2>/dev/null; }

echo "— تست دودویی DIR-RELAY-FIX-001:"

# ── A) 502×3 → سه تلاش مجدد سریع + زنده ماندن ──
printf '502|html\n502|html\n502|html\n204|\n204|\n' > "$WORK/scen-a"
run_relay "$WORK/scen-a" a
sleep 10   # بوت (~2-3ث) + سه تلاش با فاصلهٔ ۱ث + حاشیه
if kill -0 "$(cat "$WORK/pid-a")" 2>/dev/null; then
  N502=$(grep -c 'خطای 502 داد' "$WORK/out-a.log" || true)
  [ "${N502:-0}" -ge 3 ] && ok "A: سه تلاش مجددِ 502 ثبت شد ($N502)" || fail "A: تعداد تلاش 502 = ${N502:-0} (انتظار ≥۳)"
  grep -q 'هر 1 ثانیه دوباره' "$WORK/out-a.log" && ok "A: فاصلهٔ تلاش = ۱۰ث→(پچ‌شده ۱ث) نه نردبان" || fail "A: پیام فاصلهٔ تلاش نیامد"
  kill "$(cat "$WORK/pid-a")" 2>/dev/null
else
  fail "A: رله پس از 502×3 زنده نماند (خروج غیرمنتظره)"
fi
grep -q 'WAKE_LOCK_ACQUIRED' "$WITNESS" && ok "F: Wake-Lock در آغاز گرفته شد" || fail "F: Wake-Lock گرفته نشد"
stop_mock a

# ── B) 401 → خروج 1 + پیام انقضا ──
printf '401|html\n' > "$WORK/scen-b"
run_relay "$WORK/scen-b" b
wait "$(cat "$WORK/pid-b")" 2>/dev/null; RC_B=$?
[ "$RC_B" -eq 1 ] && ok "B: خروج با کد 1" || fail "B: کد خروج = $RC_B (انتظار 1)"
grep -q 'کد رله شما منقضی شده است. لطفاً از داشبورد کد جدید بگیرید' "$WORK/out-b.log" && ok "B: پیام شفاف انقضا" || fail "B: پیام انقضا در خروجی نیست"
grep -q 'HTTP 401' "$WORK/out-b.log" && ok "B: نشان HTTP 401" || fail "B: نشان HTTP 401 نیست"
grep -q 'WAKE_LOCK_RELEASED' "$WITNESS" && ok "F: Wake-Lock در خروج آزاد شد (تلهٔ EXIT)" || fail "F: Wake-Lock آزاد نشد"
stop_mock b

# ── C) 403 + JSON «unknown device» → خروج 1 + پیام ──
printf '403|json-unknown\n' > "$WORK/scen-c"
run_relay "$WORK/scen-c" c
wait "$(cat "$WORK/pid-c")" 2>/dev/null; RC_C=$?
[ "$RC_C" -eq 1 ] && ok "C: خروج با کد 1" || fail "C: کد خروج = $RC_C"
grep -q 'کد رله شما منقضی شده است' "$WORK/out-c.log" && ok "C: پیام شفاف (قرارداد JSON سرور)" || fail "C: پیام نیست"
grep -q 'سرور: unknown device' "$WORK/out-c.log" && ok "C: علت دقیق سرور ذکر شد" || fail "C: علت سرور ذکر نشد"
stop_mock c

# ── D) 403 + HTML ×2 → تابلواری اول، خروج در دومین ──
printf '403|html\n403|html\n' > "$WORK/scen-d"
run_relay "$WORK/scen-d" d
wait "$(cat "$WORK/pid-d")" 2>/dev/null; RC_D=$?
[ "$RC_D" -eq 1 ] && ok "D: خروج با کد 1 پس از 403×2" || fail "D: کد خروج = $RC_D"
grep -q 'HTTP 403 ×2' "$WORK/out-d.log" && ok "D: نشان HTTP 403 ×2" || fail "D: نشان ×2 نیست"
grep -q 'تلاش 1 از ۲' "$WORK/out-d.log" && ok "D: اولین 403 گذرا تحمل شد (تلاش 1 از ۲)" || fail "D: تحمل اولین 403 ثبت نشد"
stop_mock d

# ── E) 204 → مسیر خوش‌شانس بدون رگرسیون ──
printf '204|\n204|\n204|\n' > "$WORK/scen-e"
run_relay "$WORK/scen-e" e
sleep 8
if kill -0 "$(cat "$WORK/pid-e")" 2>/dev/null; then
  grep -q 'اتصال تأیید شد' "$WORK/out-e.log" && ok "E: poll خالی 204 → «اتصال تأیید شد» + حلقهٔ سالم" || fail "E: تأیید اتصال نیامد (بدنه/کد قاطی شده؟)"
  kill "$(cat "$WORK/pid-e")" 2>/dev/null
else
  fail "E: رله در مسیر خوش‌شانس 204 مُرد (رگرسیون!)"
fi
stop_mock e

# ── G) دستور نصب: pkg استاب + bootstrap 403 → پیام + پاکسازی ──
python3 - "$PORT" <<'PYEOF' >/dev/null 2>&1 &
import sys, time
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
sed "s|https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai|http://127.0.0.1:$PORT|" "$WORK/install-command.sh" > "$WORK/install-cmd-g.sh" 2>/dev/null || cp "$CMD" "$WORK/install-cmd-g.sh"
HOME="$WORK/home-g" PATH="$STUB:$PATH" bash "$WORK/install-cmd-g.sh" > "$WORK/out-g.log" 2>&1
grep -q 'خطا در نصب! لطفاً کد جدید بگیرید.' "$WORK/out-g.log" && ok "G: پیام شفاف شکست نصب" || fail "G: پیام شکست نصب نیامد"
[ ! -f "$WORK/home-g/melka-relay.sh" ] && ok "G: فایل ناقص پاک شد (rm -f)" || fail "G: فایل melka-relay.sh پاک نشد"
kill "$MOCK_G" 2>/dev/null

echo "————————————————"
echo "نتیجه: $PASS سبز · $FAIL قرمز"
[ "$FAIL" -eq 0 ] || { echo "خروجی‌ها در: $WORK"; exit 1; }
rm -rf "$WORK"
