# ── قلاب طلایی: نصب رلهٔ ملکا (نسل Q · DIR-SUPER-STRUCT-001) ──
# یک فایل = کل نصب. این دستور خودش هستهٔ رله (core-relay) را می‌گیرد؛ هسته
# خودش نگهبان (watchdog) را می‌سازد و هر دو در دو سشن مستقل (tmux) یا nohup
# پس‌زمینه اجرا می‌شوند — مالک با پیچیدگی چندفایلی درگیر نمی‌شود.
echo "نصب قلاب طلایی رلهٔ ملکا آغاز شد (نسل Q · DIR-SUPER-STRUCT-001)…"
deps_ok=0
for i in 1 2; do
  if pkg install -y curl openssl-tool jq sqlite tmux; then deps_ok=1; break; fi
  echo "نصب وابستگی‌ها (تلاش $i از ۲) ناموفق — ۵ ثانیه دیگر…"
  sleep 5
done
if [ "$deps_ok" != "1" ]; then
  # sqlite/tmux اختیاری‌اند (سلوک عقبه: صف jsonl + nohup) — پایه اجباری است
  if pkg install -y curl openssl-tool jq; then
    echo "نصب پایه انجام شد (بدون sqlite/tmux — سلوک عقبه: صف jsonl + nohup)"
    deps_ok=1
  fi
fi
if [ "$deps_ok" != "1" ]; then
  echo "خطا در نصب وابستگی‌ها! Termux را ببندید، دوباره باز کنید و همین دستور را دوباره بزنید."
  exit 1
fi
mkdir -p "$HOME/melka-relay"
ok=0; last_code=0
waits=(5 5 10 10 15 20 25 30 30 30 30)
for i in $(seq 1 12); do
  hdr=$(mktemp)
  body_tmp=$(mktemp)
  code_http=$(curl --http1.1 -A "Mozilla/5.0 (Linux; Android 13; Poco F3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36" -sS --max-time 30 -D "$hdr" -o "$body_tmp" -w '%{http_code}' "https://preview.example.space-z.ai/api/mobile-relay/bootstrap?code=SAMPLE-ENROLL-CODE" 2>/dev/null)
  rc=$?
  if [ "$rc" -eq 0 ] && [ "$code_http" = "200" ]; then
    mv -f "$body_tmp" "$HOME/melka-relay/core-relay.sh"; rm -f "$hdr"; ok=1; break
  fi
  rm -f "$body_tmp" "$hdr"; last_code="$code_http"
  w=${waits[$(( i < 11 ? i - 1 : 10 ))]:-30}
  if [ "$rc" -eq 28 ]; then
    echo "تلاش $i از ۱۲: تایم‌اوت (خطای ۲۸) — سرور شلوغ/شبکه ضعیف · $w ثانیه دیگر…"
  elif [ "$code_http" = "502" ] || [ "$code_http" = "503" ] || [ "$code_http" = "429" ]; then
    echo "تلاش $i از ۱۲: سرور در حال ریست/رستاخیز است (HTTP $code_http) — خودش برمی‌گردد · $w ثانیه دیگر صبر می‌کنم…"
  elif [ "$code_http" = "403" ] || [ "$code_http" = "404" ]; then
    echo "کد ثبت رد شد (HTTP $code_http) — اگر همین پیام تکرار شد از «راه‌اندازی رله» در تنظیمات ملکا کد تازه بگیرید. $w ثانیه دیگر دوباره می‌کوشم (گاهی گذراست)…"
  else
    echo "تلاش $i از ۱۲ ناموفق (کد $code_http · خطای curl $rc) — $w ثانیه دیگر…"
  fi
  sleep "$w"
done
if [ "$ok" = "1" ] && head -n 1 "$HOME/melka-relay/core-relay.sh" | grep -q '^#!' && [ "$(wc -c < "$HOME/melka-relay/core-relay.sh")" -gt 4000 ] && ! grep -q '<html' "$HOME/melka-relay/core-relay.sh" 2>/dev/null; then
  chmod 700 "$HOME/melka-relay/core-relay.sh"
  # تعویض تمیز: نمونه‌های قدیمی (هسته/نگهبان/مسیر قدیمی ~/melka-relay.sh) با اطلاع
  if pgrep -f 'melka-relay/' >/dev/null 2>&1 || pgrep -f 'melka-relay.sh' >/dev/null 2>&1; then
    echo "نمونهٔ قدیمی رله در حال اجراست — برای تعویض تمیز متوقفش می‌کنم…"
    pkill -f 'melka-relay/' 2>/dev/null
    pkill -f melka-relay.sh 2>/dev/null
    sleep 2
  fi
  command -v tmux >/dev/null 2>&1 && { tmux kill-session -t melka-relay 2>/dev/null || true; tmux kill-session -t melka-watchdog 2>/dev/null || true; }
  # ارکستراتور دو-سشنی tmux: هسته در سشن melka-relay؛ هستهٔ کامل خودش نگهبان را
  # در سشن melka-watchdog می‌سازد — هیچ‌کدام روی دیگری تداخل ندارد (عین دستور مالک:
  # «اگر یکی کرش کرد، دیگری زنده می‌ماند»). بدون tmux → setsid nohup پس‌زمینه.
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s melka-relay "bash $HOME/melka-relay/core-relay.sh"
    echo "نصب موفق ✓ (نسل Q · قلاب طلایی) — هستهٔ رله در سشن tmux «melka-relay» و نگهبان در سشن «melka-watchdog» راه افتاد."
    echo "مقاوم به ۴۰۳/۴۲۰/۴۲۳/۴۰۲/۲۸/۵۰۲ و ریست سرور (میراث نسل P · حاکم تطبیقی ARM پابرجا)."
    echo "مشاهده: tmux attach -t melka-relay (خروج بدون بستن: Ctrl+b سپس d) · لاگ نگهبان: ~/melka-relay/watchdog.log"
  else
    ( setsid nohup bash "$HOME/melka-relay/core-relay.sh" >> "$HOME/melka-relay/relay.log" 2>&1 & )
    echo "نصب موفق ✓ (نسل Q · قلاب طلایی · بدون tmux → nohup) — هسته و نگهبان مستقل در پس‌زمینه راه افتادند."
    echo "لاگ‌ها: ~/melka-relay/relay.log و ~/melka-relay/watchdog.log"
  fi
  echo "برای ساعت‌ها کار بی‌وقفه: اندروید → برنامه‌ها → Termux → باتری → «بدون محدودیت» + قفل در Recentها."
else
  echo "نصب کامل نشد (آخرین وضعیت: HTTP $last_code). سرور احتمالاً هنوز در حال رستاخیز است —"
  echo "چند لحظه بعد همین دستور را یک بار دیگر پیست کنید (کد ثبت همین می‌ماند — کد تازه فقط اگر از داشبورد ابطال شده باشد لازم است)."
  rm -f "$HOME/melka-relay/core-relay.sh"
fi