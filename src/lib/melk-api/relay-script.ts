/**
 * مولد اسکریپت رلهٔ Termux — PN-031 (شورای ن۰۳۷) · نسل J=PN-035 · K=PN-036 · L=PN-041-R · M=PN-068 · M+=PN-080
 * نسل N = DIR-RELAY-UNLIMITED-001 (دستور مالک ۲۰۲۶-۱۱-۱۴: «افزایش سرعت بروزرسانی فهرست‌های چهارگانه
 * توسط ترموکس بدون توقف و بدون محدودیت حجم و زمان»)
 * ---------------------------------------------------------------------------
 * روت bootstrap این قالب را با پیکربندی دستگاه (SERVER_URL · DEVICE_ID ·
 * DEVICE_SECRET · ALT_SERVER_URL) پر می‌کند و به‌صورت text/x-shellscript تحویل می‌دهد.
 * مالک فقط یک بار آن را در Termux اجرا می‌کند — از آن پس حلقهٔ رله:
 *
 *   poll (امضاشده · دسته‌ای ۴۸تایی) → وارسی امضای سرور → پالایش روش + whitelist میزبان →
 *   استخر پویای ۱۶+۸ کارگر (نتیجه‌ها جریانی موج‌به‌موج برمی‌گردند) →
 *   poll میان‌موجی (آیتم تازهٔ بالاولویت حداکثر ~۵ث بعد به کارگر می‌رسد) → تکرار
 *
 * نسل N — DIR-RELAY-UNLIMITED-001 (چهار ستون دستور مالک):
 *   ۱) بی‌توقف (ساعت‌ها بدون توقف): سرپرایز خود‌ریستار دور حلقهٔ اصلی؛ تنها خروج
 *      عمدی = ابطال مالک (device revoked) یا Ctrl+C. خطاهای 401/403/5xx/شبکه هرگز
 *      خروج نیستند — تلاش تطبیقی (AIMD: ۱۰ث دوبرابر تا ۱۲۰ث دروازه · ۳۰ث دوبرابر
 *      تا ۳۰۰ث احراز) با راهنمای دوره‌ای. ریشهٔ «توقف پس از نیم ساعت» (گزارش مالک):
 *      exit 1 های نسل M+2 روی 401/403 + کشتار MIUI — هر دو درمان شد (تلهٔ INT/TERM
 *      پاک + Wake-Lock پابرجا + سرپرایز).
 *   ۲) سرعت (فهرست‌های چهارگانه): گلوگاه سقف نرخ ۵/دقیقه برداشته شد (← ۲۰/دقیقه) ·
 *      BATCH ۲۴ ← ۴۸ و کارگر ۱۲ ← ۱۶ · نتیجه‌ها به‌ازای موج (نه پایان دسته) جریان
 *      می‌یابند → armCall های ۳۰ثی فهرست‌ها زودتر جواب می‌گیرند · کلاس مهلت تازهٔ
 *      «فهرست» ۲۵ث (میان OTP ۱۵ث و سنگین ۵۰ث).
 *   ۳) بدون محدودیت حجم/تعداد: نتیجه تا ۱۶MB سمت سرور (gzip سیم ~۱۰ برابر کوچک‌تر) ·
 *      TTL صف ۳۰۰ث + احیای ۱۲۰ث · انبار نتیجه‌های ارسال‌نشده ۱۰دقیقه ← ۱ساعت و
 *      ۲۰۰ ← ۱۰۰۰ ردیف.
 *   ۴) اولویت‌ها: سرور ترتیب priority DESC می‌دهد؛ express (OTP/ثبت آگهی) پیش از
 *      موج اجرا می‌شود و poll میان‌موجی آیتم تازهٔ بالاولویت را حتی وسط موج سنگین
 *      می‌کَشد (کورسویی حداکثر ~۵ث + RTT).
 *
 * DIR-RELAY-FIX-001 (شورا ۲۰۲۶-۱۱-۱۲ · مبنای نسل M+2 که این نسل جانشینش می‌شود):
 *   دروازه 502/503 → تلاش هر ۱۰ث (اکنون با AIMD تا ۱۲۰ث) · Wake-Lock خودکار با
 *   آزادسازی EXIT · پیام شفاف انقضای کد — عبارت راهنما حفظ شد اما «exit 1» آن
 *   به تلاش تطبیقی تبدیل شد (دستور مالک ۲۰۲۶-۱۴-۱۴ بر آن غلبه کرد: «بدون توقف»).
 */

export interface RelayScriptConfig {
  serverUrl: string;
  deviceId: string;
  deviceSecret: string;
  altServerUrl?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 13; Poco F3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36";

export function buildRelayScript(cfg: RelayScriptConfig): string {
  // هر سه مقدار تزریقی از کاراکترهای خاص bash عاری‌سازی می‌شوند (تزریق فرمان را ناممکن می‌کند)
  const safe = (s: string) => s.replace(/[^A-Za-z0-9:\/._-]/g, "");
  const serverUrl = safe(cfg.serverUrl).replace(/\/+$/, "");
  const deviceId = safe(cfg.deviceId);
  const deviceSecret = safe(cfg.deviceSecret);
  const altServerUrl = safe(cfg.altServerUrl ?? "").replace(/\/+$/, "");

  return `#!/usr/bin/env bash
# ============================================================
# melka-relay — رلهٔ موبایل ملکا (نسل N · DIR-RELAY-UNLIMITED-001 · ۲۰۲۶-۱۱-۱۴)
# روی گوشی مالک (Poco F3 · Termux · IP ایرانی) اجرا می‌شود.
# این فایل را اجرا نکنید مگر اینکه از طریق «راه‌اندازی رله» در
# تنظیمات ملکا ساخته شده باشد — راز دستگاه داخلش است.
# نسل N: بی‌توقف (سرپرایز خود‌ریستار · خروج فقط با ابطال مالک یا Ctrl+C) ·
#         استخر پویای ۱۶+۸ کارگر · نتیجهٔ جریانی موج‌به‌موج · poll میان‌موجی ·
#         سقف نرخ ۲۰/دقیقه (نسل M: ۵) · batch=۴۸ (نسل M: ۲۴) · بدون محدودیت حجم
# ============================================================
set -u

SERVER_URL="${serverUrl}"
DEVICE_ID="${deviceId}"
DEVICE_SECRET="${deviceSecret}"
ALT_SERVER_URL="${altServerUrl}"

# ── ثابت‌های حمل‌ونقل (PN-031-I) ──
UA="${BROWSER_UA}"
RELAY_DEBUG="\$HOME/relay-debug.log"
DEBUG_MAX=524288   # 512KB — چرخش لاگ دیباگ
RETRY_DELAYS=(30 60 120 300 300)   # نردمان شبکه: ۳۰ث · ۱د · ۲د · ۵د · ۵د
GATEWAY_RETRY_DELAY=10             # DIR-RELAY-FIX-001: پایهٔ تلاش دروازه — با AIMD دوبرابر/نیم می‌شود
GATEWAY_BACKOFF_MAX=120            # نسل N: سقف تاخیر تطبیقی دروازه (502/503/429/403-WAF)
ALT_FAIL_THRESHOLD=3               # سوئیچ به مسیر جایگزین پس از ۳ خطای پیاپی
PRIMARY_RECHECK_LOOPS=30           # هر ۳۰ چرخه، مسیر اصلی دوباره آزموده می‌شود

# ── نسل N (DIR-RELAY-UNLIMITED-001 · حداکثر سرعت بی‌محدودیت) ──
BATCH=48                            # ۲۴ ← ۴۸ — سرور تا ۲۰۰ آیتم در هر poll می‌دهد
MAX_WORKERS=16                      # ۱۲ ← ۱۶ کارگر همزمان (Poco F3 · Snapdragon 870)
EXPRESS_SLOTS=8                     # ظرفیت اضافی برای آیتم‌های برداشتی poll میان‌موجی
POOL_SLOTS=\$(( MAX_WORKERS + EXPRESS_SLOTS ))
RATE_MAX=20                         # نسل M: ۵ — گلوگاه سرعت اصلی؛ ۲۰/دقیقه با احترام به دروازه
POLL_WAIT_S=50                      # انتظار long-poll وقتی صف خالی است
EXPRESS_POLL_S=5                    # فاصلهٔ poll میان‌موجی (برداشت زندهٔ آیتم تازه حین اجرا)
EXPRESS_POLL_BATCH=12               # اندازهٔ برداشت poll میان‌موجی
FLUSH_MIN=48                        # فلش جریان نتیجه وقتی انبار پر شد…
FLUSH_AGE_S=4                       # …یا قدیمی‌ترین نتیجهٔ ارسال‌نشده ۴ث شد
FLUSH_BYTES=6000000                 # …یا حجم انبار از ۶MB گذشت (سقف سرور ۱۶MB)

# ── ثابت‌های نسل J/K (PN-035/036) + نسل N ──
RESULT_ATTEMPTS=3                   # فاز ۲ — تلاش‌های ارسال نتیجه
RESULT_BACKOFF=(2 6)                # فاز ۲ — مکث بین تلاش‌ها (۳تایی: ۲ و ۶)
GZIP_THRESHOLD=1024                 # فاز ۶ — فشرده‌سازی بدنه‌های بزرگ‌تر از ۱KB
FAILED_RESULTS="\$HOME/failed-results.jsonl"
FAILED_TTL_S=3600                   # نسل N: ۶۰۰ ← ۳۶۰۰ — عمر ردیف نتیجهٔ ذخیره‌شده (۱ ساعت)
FAILED_MAX_LINES=1000               # نسل N: ۲۰۰ ← ۱۰۰۰ — سقف فایل نتیجه‌های ذخیره‌شده

# ── مهلت‌های تطبیقی (نسل K/M + کلاس تازهٔ «فهرست» در نسل N) ──
LIGHT_TIMEOUT=15                    # مسیر تعاملی (OTP) — پاسخ چندثانیه‌ای
LIST_TIMEOUT=25                     # نسل N: صفحات فهرست چهارگانه/سینک اصلی (~۲-۸ث واقعی + حاشیه)
HEAVY_TIMEOUT=50                    # غنی‌سازی/جزئیات سنگین — داخل بودجهٔ سرور
TIMEOUT_RETRY_DELAY=5               # فاصلهٔ تلاش دوم برای خطای ۲۸ (تایم‌اوت)

# ── نسل N: بی‌توقف — تلاش تطبیقی احراز (401/403 نهایی) و سرپرایز ──
AUTH_RETRY_BASE=30                  # نخستین مکث پس از رد احراز
AUTH_RETRY_MAX=300                  # سقف مکث (۵ دقیقه)
AUTH_GUIDE_EVERY=5                  # هر ۵ تلاش، راهنمای «کد تازه» دوباره چاپ می‌شود
CLOCK_RESYNC_S=900                  # همگام‌سازی دورهٔ ساعت با سرور (هر ۱۵ دقیقه)
SUPERVISOR_DELAY=10                 # مکث سرپرایز پیش از راه‌اندازی مجدد
EXIT_REVOKED=10                     # تنها کد خروج عمدی (ابطال مالک از داشبورد)

# آیا آیتم تعاملی است؟ (OTP/ورود — مهلت کوتاه)
# الگو عین relayPriorityForUrl سرور: /authentication/otp در مسیر URL
is_interactive() {
  case "$1" in
    *"/authentication/otp"*) return 0 ;;
    *) return 1 ;;
  esac
}

# PN-080 — آیا آیتم «ثبت آگهی» است؟ (اولویت ۵ سمت سرور؛ مهلت سنگین می‌ماند)
is_registration() {
  case "$1" in
    *"/properties/create"*|*"/users/create"*|*"/users/info/mobile-number"*) return 0 ;;
    *) return 1 ;;
  esac
}

# نسل N — آیا صفحهٔ «فهرست» است؟ (چهارگانهٔ داشبورد + سینک اصلی — کلاس مهلت ۲۵ث)
is_list() {
  case "$1" in
    *"/requests/list"*|*"/properties/list"*|*"/realtors/list"*|*"/visits/list"*|*"/realtor-reports/"*|*"/trade-overviews/"*) return 0 ;;
    *) return 1 ;;
  esac
}

log() { echo "[$(date '+%H:%M:%S')] \$*"; }

debug_rotate() {
  [ -f "$RELAY_DEBUG" ] || return 0
  local sz; sz=\$(wc -c < "$RELAY_DEBUG" 2>/dev/null || echo 0)
  [ "\${sz:-0}" -lt "$DEBUG_MAX" ] && return 0
  tail -c 32768 "$RELAY_DEBUG" > "\${RELAY_DEBUG}.tmp" 2>/dev/null && mv -f "\${RELAY_DEBUG}.tmp" "$RELAY_DEBUG" 2>/dev/null || true
}

# وابستگی‌ها — فقط بار اول (Termux)
need_cmd() { command -v "$1" >/dev/null 2>&1; }
if ! need_cmd curl || ! need_cmd openssl || ! need_cmd jq; then
  if need_cmd pkg; then
    log "نصب وابستگی‌ها (بار اول — چند دقیقه صبر کنید)…"
    # PN-034 (شورا-ن۰۵۵): openssl-tool — بستهٔ CLI واقعی Termux (مسیر اثبات‌شدهٔ مالک در PN-031-I/J)
    pkg install -y curl openssl-tool jq || { log "نصب ناموفق — Termux را ببندید و دوباره باز کنید"; exit 1; }
  else
    log "این اسکریپت برای Termux ساخته شده (pkg یافت نشد)"
    exit 1
  fi
fi

# ── PN-031-G: وارسی پیکربندی — مقادیر احراز باید نان‌خالی باشند ──
if [ -z "$SERVER_URL" ] || [ -z "$DEVICE_ID" ] || [ -z "$DEVICE_SECRET" ]; then
  log "پیکربندی ناقص (شناسه/راز/نشانی خالی) — اسکریپت تازه را از «راه‌اندازی رله» در تنظیمات ملکا بگیرید"
  exit 1
fi

# ── PN-031-I: انتخاب مسیر (اصلی + جایگزین اختیاری) ──
URLS=("$SERVER_URL")
[ -n "$ALT_SERVER_URL" ] && [ "$ALT_SERVER_URL" != "$SERVER_URL" ] && URLS+=("$ALT_SERVER_URL")
URL_COUNT=\${#URLS[@]}
URL_IDX=0
NET_FAILS=0
GATEWAY_RETRY_STREAK=0   # خطاهای پیاپی دروازه (502/503/429/403-WAF)
GATEWAY_BACKOFF=\$GATEWAY_RETRY_DELAY
AUTH_FAILS=0             # نسل N: ردهای پیاپی احراز — هرگز خروج، فقط تلاش تطبیقی
LAST_HTTP_CODE=0         # کد وضعیت HTTP آخرین تماس امضاشده
cur_url() { printf '%s' "\${URLS[$URL_IDX]}"; }

# ── نسل N: سقف نرخ — حداکثر \$RATE_MAX تماس سرور در ۶۰ ثانیه (نسل M: ۵) ──
# این همان گلوگاه اصلی «سرعت پایین» بود: هر چرخه poll+نتیجه ۲ تماس می‌خواست و
# سقف ۵/دقیقه عملاً رله را به ~۲.۵ چرخه در دقیقه مهار می‌کرد. ۲۰/دقیقه با
# احترام به دروازه (AIMD در خطاها به آن برمی‌گردد) اما بی‌گلوگاه در کار سالم.
REQ_TIMES=()
rate_gate() {
  local now t keep oldest wait_s
  now=\$(date +%s)
  keep=()
  for t in \${REQ_TIMES[@]+"\${REQ_TIMES[@]}"}; do
    [ \$(( now - t )) -lt 60 ] && keep+=("$t")
  done
  REQ_TIMES=("\${keep[@]+"\${keep[@]}"}")
  if [ "\${#REQ_TIMES[@]}" -ge "$RATE_MAX" ]; then
    oldest="\${REQ_TIMES[0]}"
    wait_s=\$(( 60 - (now - oldest) + 1 ))
    if [ "$wait_s" -gt 0 ]; then
      log "سقف نرخ (\$RATE_MAX در دقیقه) — \$wait_s ثانیه مکث برای احترام به دروازه"
      sleep "$wait_s"
    fi
    now=\$(date +%s)
    keep=()
    for t in \${REQ_TIMES[@]+"\${REQ_TIMES[@]}"}; do
      [ \$(( now - t )) -lt 60 ] && keep+=("$t")
    done
    REQ_TIMES=("\${keep[@]+"\${keep[@]}"}")
  fi
  REQ_TIMES+=("$now")
}

# DIR-RELAY-FIX-001 (دستور ۳ · شورا): Wake-Lock خودکار — در ابتدای کار قفل بیداری
# گرفته می‌شود تا اگر کاربر ترموکس را باز نگه داشته، سیستم‌عامل اندروید (MIUI)
# پروسه را نکشد؛ در «هر» خروج (طبیعی، خطا، توقف عمدی) با تلهٔ EXIT آزاد می‌شود.
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
    log "🔒 Wake Lock فعال شد تا سیستم‌عامل اسکریپت را نکشد."
fi
relay_exit() {
  # DIR-RELAY-FIX-001 (دستور ۳): آزادسازی Wake-Lock در هر خروج
  if command -v termux-wake-unlock >/dev/null 2>&1; then
      termux-wake-unlock 2>/dev/null
      log "🔓 Wake Lock آزاد شد."
  fi
  return 0
}
trap relay_exit EXIT
# نسل N: توقف عمدی (Ctrl+C / بستن Termux) → خروج پاک (نه کشته‌شدن در سیگنال)
trap 'log "دستور توقف دریافت شد — خروج پاک (Wake-Lock آزاد می‌شود)"; exit 0' INT TERM

sha256hex() { openssl dgst -sha256 -hex | sed 's/^.*= //'; }
hmac_hex() { openssl dgst -sha256 -hmac "$DEVICE_SECRET" -hex | sed 's/^.*= //'; }

# ── PN-031-E: همگام‌سازی ساعت با سرور (http1.1 + UA بروزری — PN-031-I) ──
CLOCK_OFFSET=0
LAST_CLOCK_SYNC=0
sync_clock() {
  local HDR T SERVER_EPOCH LOCAL_EPOCH
  HDR=\$(mktemp)
  curl --http1.1 -A "$UA" -sSI --max-time 15 -D "$HDR" -o /dev/null "\$(cur_url)/api/health" 2>/dev/null || { rm -f "$HDR"; return 1; }
  T=\$(awk 'tolower($1)=="date:"{$1="";sub(/^ /,"");sub(/\\r\$/,"");print;exit}' "$HDR")
  rm -f "$HDR"
  [ -z "$T" ] && return 1
  SERVER_EPOCH=\$(date -d "$T" +%s 2>/dev/null) || return 1
  LOCAL_EPOCH=\$(date +%s)
  CLOCK_OFFSET=\$(( (SERVER_EPOCH - LOCAL_EPOCH) * 1000 ))
  if [ \${CLOCK_OFFSET#-} -gt 60000 ]; then
    log "هشدار: ساعت این گوشی حدود \$(( CLOCK_OFFSET / 60000 )) دقیقه با سرور اختلاف دارد — امضا با ساعت سرور اصلاح می‌شود"
  fi
  return 0
}
# نسل N: همگام‌سازی دوره‌ای (هر ۱۵ دقیقه) — رانش ساعت حین کار طولانی دیگر
# به رشتهٔ «stale request» ختم نمی‌شود (پیش‌گیرانه، نه فقط پس از خطا).
maybe_resync_clock() {
  local now; now=\$(date +%s)
  if [ \$(( now - LAST_CLOCK_SYNC )) -ge "$CLOCK_RESYNC_S" ]; then
    LAST_CLOCK_SYNC=$now
    sync_clock || true
  fi
}

# توضیح فارسی کدهای خطای curl — دیگر هیچ شکستی خاموش نیست
curl_err_desc() {
  case "$1" in
    2) echo "راه‌اندازی curl ناموفق — آرگومان ناقص" ;;
    6) echo "نام سرور حل نشد (DNS)" ;;
    7) echo "سرور اتصال را نپذیرفت" ;;
    9) echo "دروازه اجازهٔ ادامه نداد (HTTP/2 یا تشخیص ربات) — با HTTP/1.1 و UA بروزری تلاش می‌شود" ;;
    16) echo "خطای قاب‌بندی HTTP/2 — با HTTP/1.1 تلاش می‌شود" ;;
    28) echo "تایم‌اوت — سرور در مهلت پاسخ نداد" ;;
    35|53|56|60|64|66|77|80|82|83|90|91) echo "خطای TLS/SSL" ;;
    52) echo "پاسخ خالی از سرور" ;;
    *) echo "کد $1" ;;
  esac
}

# ── امضای درخواست گوشی → سرور (قرارداد PN-030/031 · ts با آفست سرور) ──
signed_curl() {
  # $1 = مسیر روت · $2 = بدنهٔ خام (رشته) · $3.. = آرگومانهای curl بعدی
  # MELKA_CURL_TIMEOUT (محیط، اختیاری): مهلت curl — پیش‌فرض ۳۵ث؛ روت poll
  # آن را «انتظار + ۱۵» می‌گذارد (سرور تا wait ثانیه معلق نگه می‌دارد + حاشیه)
  local path="$1" body="$2"; shift 2
  local ts digest sig timeout_s raw rc
  timeout_s="\${MELKA_CURL_TIMEOUT:-35}"
  ts=\$(( \$(date +%s%3N) + CLOCK_OFFSET ))
  digest=\$(printf '%s' "$body" | sha256hex)
  sig=\$(printf 'POST\\n%s\\n%s\\n%s' "$path" "$digest" "$ts" | hmac_hex)
  # ── PN-031-G: پیش‌پرواز — هیچ هدری خاموش حذف نمی‌شود ──
  if [ -z "$ts" ] || [ -z "$sig" ]; then
    log "خطای داخلی: امضا/زمان خالی ساخته شد (date یا openssl کار نمی‌کند) — درخواست ارسال نشد"
    return 9
  fi
  rate_gate
  # DIR-RELAY-FIX-001 (دستور ۱): کد وضعیت HTTP با -w به انتهای خروجی می‌چسبد؛
  # خط آخر جدا و در LAST_HTTP_CODE می‌نشیند — بدنه عیناً روی stdout می‌ماند
  raw=\$(curl --http1.1 -A "$UA" -sS -v --max-time "$timeout_s" "\$(cur_url)$path" "$@" \\
    -H "X-Melka-Relay-Device: $DEVICE_ID" \\
    -H "X-Melka-Timestamp: $ts" \\
    -H "X-Melka-Signature: $sig" \\
    -w '\\n%{http_code}' \\
    2> >(sed -u 's/^\\(> *X-Melka-Signature: \\).*/\\1<redacted>/; s/^\\(< *X-Melka-Signature: \\).*/\\1<redacted>/' >> "$RELAY_DEBUG" 2>/dev/null))
  rc=$?
  debug_rotate
  LAST_HTTP_CODE="\${raw##*\$'\\n'}"
  LAST_HTTP_CODE="\${LAST_HTTP_CODE//[!0-9]/}"
  [ -z "$LAST_HTTP_CODE" ] && LAST_HTTP_CODE=0
  printf '%s' "\${raw%\$'\\n'*}"
  return $rc
}

# ── PN-035 (فاز ۶): امضای بدنهٔ فایلی (gzip) — امضا روی بایت‌های فشردهٔ سیم ──
signed_curl_file() {
  # $1 = مسیر روت · $2 = فایل بدنه (بایت خام) · $3 = Content-Encoding (مثلاً gzip)
  local path="$1" file="$2" enc="$3"
  local ts digest sig
  ts=\$(( \$(date +%s%3N) + CLOCK_OFFSET ))
  digest=\$(sha256hex < "$file")
  sig=\$(printf 'POST\\n%s\\n%s\\n%s' "$path" "$digest" "$ts" | hmac_hex)
  if [ -z "$ts" ] || [ -z "$sig" ]; then
    log "خطای داخلی: امضا/زمان خالی ساخته شد — درخواست ارسال نشد"
    return 9
  fi
  rate_gate
  local enc_args=()
  [ -n "$enc" ] && enc_args=(-H "Content-Encoding: $enc")
  curl --http1.1 -A "$UA" -sS -v --max-time 60 "\$(cur_url)$path" \\
    -X POST -H "Content-Type: application/json" "\${enc_args[@]+"\${enc_args[@]}"}" --data-binary @"$file" \\
    -H "X-Melka-Relay-Device: $DEVICE_ID" \\
    -H "X-Melka-Timestamp: $ts" \\
    -H "X-Melka-Signature: $sig" \\
    2> >(sed -u 's/^\\(> *X-Melka-Signature: \\).*/\\1<redacted>/; s/^\\(< *X-Melka-Signature: \\).*/\\1<redacted>/' >> "$RELAY_DEBUG" 2>/dev/null)
  local rc=$?
  debug_rotate
  return $rc
}

# ── PN-035 (فاز ۶): ارسال یک بدنهٔ نتیجه — gzip اگر > آستانه ──
submit_batch_raw() {
  # $1 = رشتهٔ JSON آرایهٔ نتیجه‌ها → خروجی: پاسخ سرور روی stdout
  local payload="$1"
  if [ "\${#payload}" -gt "$GZIP_THRESHOLD" ] && need_cmd gzip; then
    local gz; gz=\$(mktemp)
    if printf '%s' "$payload" | gzip -c > "$gz" 2>/dev/null; then
      signed_curl_file "/api/mobile-relay/result" "$gz" "gzip"
      local rc=$?
      rm -f "$gz"
      return $rc
    fi
    rm -f "$gz"
    log "gzip ناموفق — ارسال فشرده نشده"
  fi
  signed_curl "/api/mobile-relay/result" "$payload" \\
    -X POST -H "Content-Type: application/json" --data-binary "$payload"
}

# ── PN-035 (فاز ۲): ارسال نتیجه با پایداری — ۳ تلاش + backoff + ذخیرهٔ محلی ──
post_results() {
  # $1 = رشتهٔ JSON آرایهٔ نتیجه‌ها · $2 = "nostore" اختیاری (فراخوانی از replay —
  #   ردیف اصلی در فایل هست؛ ذخیرهٔ دوباره = تکرار ردیف = رشد فایل)
  # خروجی (PN-036 جلسهٔ ۰۵۸ — ریشهٔ شکایت ۴ مالک: بازپخش بی‌پایان):
  #   0 = پذیرش سرور · 1 = شکست گذرا (ذخیره‌شده محلی) · 2 = رد قطعی سرور
  #   (نه retry و نه ذخیره — بازپخش در چرخه‌های بعد هم رخ نمی‌دهد)
  local payload="$1" nostore="\${2:-}" attempt=0 delay out rc
  while [ $attempt -lt $RESULT_ATTEMPTS ]; do
    attempt=\$((attempt+1))
    out=""; rc=0
    out=\$(submit_batch_raw "$payload") || rc=$?
    # ۱) پذیرش — سرور ok گفت
    if [ $rc -eq 0 ] && printf '%s' "$out" | jq -e '.ok == true' >/dev/null 2>&1; then
      return 0
    fi
    # ۲) رد قطعی سرور (پاسخ JSON با فیلد ok) — تلاش مجدد بی‌فایده است
    if [ $rc -eq 0 ] && printf '%s' "$out" | jq -e 'has("ok")' >/dev/null 2>&1; then
      log "سرور نتیجه را نپذیرفت: \$(printf '%s' "$out" | head -c 120)"
      return 2
    fi
    # ۳) خطای گذرا (شبکه/دروازه/پاسخ غیرJSON) — تلاش مجدد با backoff
    if [ $attempt -lt $RESULT_ATTEMPTS ]; then
      delay="\${RESULT_BACKOFF[\$((attempt-1))]:-6}"
      log "ارسال نتیجه ناموفق (تلاش \$attempt/\$RESULT_ATTEMPTS · \$(curl_err_desc \$rc)) — \$delay ثانیه دیگر"
      sleep "$delay"
    fi
  done
  # شکست نهایی — ذخیرهٔ محلی + بازپخش در چرخه‌های بعد (مگر در حالت replay —
  # ردیف اصلی در فایل هست؛ ذخیرهٔ دوباره = دوبرابر شدن ردیف در هر بازپخش)
  if [ "$nostore" != "nostore" ]; then
    store_failed "$payload"
  fi
  return 1
}

# ── PN-035 (فاز ۲): ذخیرهٔ محلی نتیجه‌های ارسال‌نشده ──
store_failed() {
  # $1 = رشتهٔ JSON آرایهٔ نتیجه‌ها
  local rec
  rec=\$(jq -nc --argjson ts "\$(date +%s)" --argjson p "\$1" '{_ts:\$ts,payload:\$p}' 2>/dev/null) || rec=""
  if [ -z "$rec" ]; then
    # JSON نامعتبر (نباید رخ دهد) — خام ذخیره می‌شود تا ناشناخته نماند
    printf '%s\\n' "{\\"_ts\\":\$(date +%s),\\"payload_raw\\":true}" >> "$FAILED_RESULTS"
  else
    printf '%s\\n' "$rec" >> "$FAILED_RESULTS"
  fi
  # سقف فایل — فقط \$FAILED_MAX_LINES ردیف آخر می‌ماند (نسل N: ۱۰۰۰)
  [ -f "$FAILED_RESULTS" ] && tail -n "$FAILED_MAX_LINES" "$FAILED_RESULTS" > "\${FAILED_RESULTS}.tmp" 2>/dev/null && mv -f "\${FAILED_RESULTS}.tmp" "$FAILED_RESULTS" 2>/dev/null
  log "نتیجه‌ها در ~/failed-results.jsonl ذخیره شدند (بازپخش خودکار تا \$(( FAILED_TTL_S / 60 )) دقیقه)"
}

# ── PN-035 (فاز ۲): بازپخش نتیجه‌های ذخیره‌شدهٔ تازه ──
replay_failed_results() {
  [ -s "$FAILED_RESULTS" ] || return 0
  local now line lts payload kept=0 replayed=0 dropped=0 rc
  now=\$(date +%s)
  local tmp; tmp=\$(mktemp)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    lts=\$(printf '%s' "$line" | jq -r '._ts // 0' 2>/dev/null)
    # ردیف منقضی (TTL) یا خراب — حذف بی‌صدا
    if [ -z "$lts" ] || [ "\$(( now - lts ))" -gt "$FAILED_TTL_S" ]; then
      continue
    fi
    payload=\$(printf '%s' "$line" | jq -c '.payload // empty' 2>/dev/null)
    [ -z "$payload" ] && continue
    # PN-036 (جلسهٔ ۰۵۸ · ریشهٔ شکایت ۴): رد قطعی = حذف ردیف — بازپخشِ
    # «هر چرخه دوباره POST» برای رد قطعی ممنوع؛ فقط شکست گذرا نگه داشته می‌شود.
    post_results "$payload" "nostore"
    rc=$?
    if [ $rc -eq 0 ]; then
      replayed=\$((replayed+1))
    elif [ $rc -eq 2 ]; then
      dropped=\$((dropped+1))
    else
      printf '%s\\n' "$line" >> "$tmp"
      kept=\$((kept+1))
    fi
  done < "$FAILED_RESULTS"
  mv -f "$tmp" "$FAILED_RESULTS" 2>/dev/null || true
  [ $replayed -gt 0 ] && log "بازیابی \$replayed دستهٔ نتیجهٔ ذخیره‌شده ✓"
  [ $dropped -gt 0 ] && log "رد قطعی در بازپخش: \$dropped ردیف حذف شد (دیگر بازپخش نمی‌شود)"
  return 0
}

# ── PN-031-I: نبض نسخه (سلف-پینگ بیرونی — کشف بازنشانی پلتفرم از گوشی) ──
VERSION_CHECK_AT=0
version_ping() {
  local now v bid sha
  now=\$(date +%s)
  [ \$(( now - VERSION_CHECK_AT )) -lt 600 ] && return 0
  VERSION_CHECK_AT=$now
  v=\$(curl --http1.1 -A "$UA" -sS --max-time 15 "\$(cur_url)/api/version" 2>/dev/null) || return 0
  [ -z "$v" ] && return 0
  bid=\$(printf '%s' "$v" | jq -r '.buildId // empty' 2>/dev/null)
  sha=\$(printf '%s' "$v" | jq -r '.gitSha // empty' 2>/dev/null)
  if [ -n "$bid" ] && [ -n "$sha" ]; then
    case "$bid" in
      "$sha"*) ;;
      *) log "⚠️ سرور ملکا روی نسخهٔ قدیمی است (\$bid ≠ \$sha) — لطفاً GLM را با یک پیام کوتاه آگاه کنید" ;;
    esac
  fi
}

# ── PN-035 (فاز ۱+۵): اجرای «یک» آیتم صف — کارگرِ استخر نسل N ──
# ورودی: $1 = آبجکت JSON آیتم · $2 = فایل خروجی نتیجه (JSON)
# امنیت: پالایش روش + whitelist میزبان + وارسی امضای سرور — همه پیش از اجرا
process_item() {
  local item="$1" outf="$2"
  local RID RURL RMETHOD RBODY RSIG RTS BDIG EXPECT AUTH CT ACC
  RID=\$(printf '%s' "$item" | jq -r '.id // empty')
  RURL=\$(printf '%s' "$item" | jq -r '.url // empty')
  RMETHOD=\$(printf '%s' "$item" | jq -r '.method // "GET"')
  RBODY=\$(printf '%s' "$item" | jq -r '.body // ""')
  RSIG=\$(printf '%s' "$item" | jq -r '.sig // empty')
  RTS=\$(printf '%s' "$item" | jq -r '.ts // empty')

  # آیتم بی‌شناسه — نادیده (نتیجه‌ای هم گزارش نمی‌شود؛ سرور خودش TTL را می‌بَرد)
  if [ -z "$RID" ]; then
    log "آیتم بی‌شناسه — نادیده گرفته شد"
    return 0
  fi

  # ── فاز ۱: پالایش روش — فقط پنج روش مجاز اجرا می‌شوند ──
  case "$RMETHOD" in
    GET|POST|PUT|DELETE|PATCH) ;;
    *)
      log "رد آیتم: روش \$RMETHOD مجاز نیست"
      jq -nc --arg id "$RID" --arg err "method \$RMETHOD not allowed" '{id:\$id,error:\$err}' > "$outf"
      return 0
      ;;
  esac

  # ── دفاع دولایه ۱: whitelist میزبان (فقط https و فقط *.melketabriz.ir) ──
  case "$RURL" in
    https://*.melketabriz.ir/*) ;;
    *)
      log "رد درخواست غیرمجاز (مقصد خارج از ملک تبریز)"
      jq -nc --arg id "$RID" --arg err "host not allowed" '{id:\$id,error:\$err}' > "$outf"
      return 0
      ;;
  esac

  # ── دفاع دولایه ۲: وارسی امضای سرور پیش از اجرا ──
  BDIG=\$(printf '%s' "$RBODY" | sha256hex)
  EXPECT=\$(printf 'RELAY\\n%s\\n%s\\n%s\\n%s\\n%s' "$RID" "$RMETHOD" "$RURL" "$BDIG" "$RTS" | hmac_hex)
  if [ -z "$RSIG" ] || [ "$RSIG" != "$EXPECT" ]; then
    log "امضای سرور نامعتبر — درخواست نادیده گرفته شد"
    jq -nc --arg id "$RID" --arg err "bad signature" '{id:\$id,error:\$err}' > "$outf"
    return 0
  fi

  # ── اجرای درخواست به مقصد (IP ایرانی گوشی · PN-035: پشتیبانی کامل POST) ──
  # نسل N: سه کلاس مهلت — تعاملی (OTP) ۱۵ث · فهرست (چهارگانه/سینک) ۲۵ث ·
  # سنگین (غنی‌سازی/جزئیات) ۵۰ث — موج فهرست‌محور دیگر پشت آیتم کُند نمی‌ماند.
  local TMP HDR CODE CTYPE B64F CURL_EXIT T0 DUR RPATH
  TMP=\$(mktemp); HDR=\$(mktemp); B64F=\$(mktemp)
  AUTH=\$(printf '%s' "$item" | jq -r '.headers.authorization // empty')
  CT=\$(printf '%s' "$item" | jq -r '.headers["content-type"] // empty')
  ACC=\$(printf '%s' "$item" | jq -r '.headers["accept"] // empty')

  if is_interactive "$RURL"; then
    local MAX_TIME="$LIGHT_TIMEOUT"
  elif is_list "$RURL"; then
    local MAX_TIME="$LIST_TIMEOUT"
  else
    local MAX_TIME="$HEAVY_TIMEOUT"
  fi
  # مسیر برای لاگ زمان (بدون کوئری — صفر لاگ محتوا؛ هیچ توکنی در URL نیست)
  RPATH=\${RURL%%\\?*}

  local ARGS=(-sS --max-time "$MAX_TIME" -D "$HDR" -o "$TMP" -w '%{http_code}' -X "$RMETHOD")
  [ -n "$AUTH" ] && ARGS+=(-H "Authorization: $AUTH")
  [ -n "$CT" ] && ARGS+=(-H "Content-Type: $CT")
  [ -n "$ACC" ] && ARGS+=(-H "Accept: $ACC")
  if [ -n "$RBODY" ] && [ "$RMETHOD" != "GET" ] && [ "$RMETHOD" != "HEAD" ]; then
    ARGS+=(--data-binary "$RBODY")
  fi

  T0=\$(date +%s)
  CODE=\$(curl "\${ARGS[@]}" "$RURL" 2>/dev/null)
  CURL_EXIT=$?
  DUR=\$(( \$(date +%s) - T0 ))

  # PN-036 فاز ۲.۳: خطای ۲۸ (تایم‌اوت) یک بار با ۵ث فاصله دوباره می‌شود
  if [ $CURL_EXIT -eq 28 ]; then
    log "تایم‌اوت \$RMETHOD \${RPATH#https://} — \$DURث (تلاش ۱/۲) — \$TIMEOUT_RETRY_DELAY ثانیه دیگر"
    sleep "$TIMEOUT_RETRY_DELAY"
    T0=\$(date +%s)
    CODE=\$(curl "\${ARGS[@]}" "$RURL" 2>/dev/null)
    CURL_EXIT=$?
    DUR=\$(( \$(date +%s) - T0 ))
  fi

  # PN-036 فاز ۲.۴ + ۴.۱: لاگ زمان هر آیتم — روش + میزبان/مسیر + نتیجه + مدت
  if [ $CURL_EXIT -ne 0 ]; then
    log "⚔ \$RMETHOD \${RPATH#https://} → خطای curl \$CURL_EXIT پس از \${DUR}ث"
    jq -nc --arg id "$RID" --arg err "curl exit \$CURL_EXIT" '{id:\$id,error:\$err}' > "$outf"
  else
    log "✓ \$RMETHOD \${RPATH#https://} → HTTP \$CODE در \${DUR}ث"
    CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r\$/,"");print $2;exit}' "$HDR")
    [ -z "$CTYPE" ] && CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r\$/,"");\$1="";sub(/^ /,"");print;exit}' "$HDR")
    # PN-036 فاز ۱ — رفع ARG_MAX: بدنهٔ base64 در فایل می‌نشیند و jq آن را
    # با --rawfile می‌خواند؛ دیگر هیچ آرگومان خط‌فرمانی از سقف ~۱۲۸KB عبور نمی‌کند
    base64 -w0 "$TMP" 2>/dev/null > "$B64F" || base64 "$TMP" 2>/dev/null | tr -d '\\n' > "$B64F"
    jq -nc --arg id "$RID" --argjson code "\${CODE:-0}" --arg ct "$CTYPE" --rawfile b64 "$B64F" '{id:\$id,httpStatus:\$code,contentType:\$ct,bodyB64:\$b64}' > "$outf"
  fi
  rm -f "$TMP" "$HDR" "$B64F"
}

# ── نسل N: کارگرِ استخر — نتیجه را «اتمی» در انبار می‌نشاند ──
# هر کارگر نتیجه‌اش را ابتدا در فایل موقت می‌نویسد و سپس با mv (اتمی) به نام
# نهایی می‌برد — drain_spool فقط فایل‌های کامل را می‌بیند؛ هیچ نتیجه‌ای نیم‌کاره
# یا درهم‌آمیخته با کارگر دیگر نمی‌شود (رفع خطر الصاق هم‌زمان).
process_item_spool() {
  # $1 = آبجکت JSON آیتم · $2 = پوشهٔ انبار نتیجه‌ها
  local item="$1" sdir="$2"
  local outf final
  outf=\$(mktemp "$sdir/.tmp.XXXXXX")
  process_item "$item" "$outf"
  final="$sdir/\$(date +%s%3N)-\$\$.json"
  mv -f "$outf" "$final" 2>/dev/null || rm -f "$outf"
}

# ── نسل N: تخلیهٔ جریانی انبار — نتیجه‌ها موج‌به‌موج به سرور می‌رسند ──
# پیش‌تر کل دسته باید تمام می‌شد تا «یک» POST بزرگ برود؛ حالا هر ~۴ث یا هر
# \$FLUSH_MIN نتیجه یا هر ۶MB، یک دسته می‌پرد — armCall های فهرست‌ها (بودجهٔ
# ۳۰ث) زودتر جواب می‌گیرند. post_results همان پایداری سه‌تلاشی + ذخیرهٔ محلی
# + بازپخش را دارد؛ شکست گذرا هیچ نتیجه‌ای از بین نمی‌برد.
LAST_FLUSH=0
drain_spool() {
  # $1 = پوشهٔ انبار · $2 = "force" برای فلش بی‌قید (پایان مجموعه)
  # نکتهٔ هم‌زمانی: فهرست فایل‌ها یک‌بار عکسبندی می‌شود و پس از POST همان
  # فهرست حذف می‌شود — نتیجه‌ای که هم‌زمان با drain می‌رسد (mv اتمی) در
  # فلش بعدی می‌ماند، هرگز بی‌پست حذف نمی‌شود.
  local sdir="$1" force="\${2:-}"
  local files n bytes now payload rc totaln errn
  files=\$(ls "\$sdir"/*.json 2>/dev/null)
  [ -z "$files" ] && return 0
  n=\$(printf '%s\\n' "\$files" | wc -l)
  if [ "$force" != "force" ]; then
    now=\$(date +%s)
    bytes=\$(du -sb "$sdir" 2>/dev/null | cut -f1)
    if [ "\${n:-0}" -lt "$FLUSH_MIN" ] && [ "\${bytes:-0}" -lt "$FLUSH_BYTES" ] && [ \$(( now - LAST_FLUSH )) -lt "$FLUSH_AGE_S" ]; then
      return 0
    fi
  fi
  payload=\$(printf '%s\\n' "\$files" | xargs cat 2>/dev/null | jq -sc '.' 2>/dev/null)
  if [ -n "$payload" ] && [ "$payload" != "[]" ] && [ "$payload" != "null" ]; then
    post_results "$payload"
    rc=$?
    totaln=\$(printf '%s' "$payload" | jq 'length' 2>/dev/null)
    errn=\$(printf '%s' "$payload" | jq '[.[] | select(.error != null and .error != "")] | length' 2>/dev/null)
    SERVED=\$(( SERVED + \${totaln:-0} - \${errn:-0} ))
    ERRORS=\$(( ERRORS + \${errn:-0} ))
    BATCHES=\$((BATCHES+1))
    log "جریان نتیجه: \${totaln:-0} مورد → \${errn:-0} خطا (مجموع: \$SERVED موفق / \$ERRORS خطا / \$BATCHES دسته)"
  fi
  # حذف دقیقاً همان فایل‌هایی که در payload بودند — نه یک بایت بیشتر
  printf '%s\\n' "\$files" | xargs rm -f 2>/dev/null
  LAST_FLUSH=\$(date +%s)
}

# ── نسل N: poll میان‌موجی — برداشت زندهٔ آیتم تازه حین اجرای موج ──
# ریشهٔ «کندی فهرست‌ها»: تا پیش از این گوشی در طول اجرای دسته کر بود؛ آیتمِ
# تازه (اولویت بالا) باید می‌ایستاد تا کل موج تمام شود. حالا هر ~۵ث یک poll
# سبک (wait=0) آیتم‌های تازه را می‌کشد و بلافاصله به کارگر آزاد می‌سپارد.
express_poll_items() {
  local BODY RESP_F
  BODY="{\\"wait\\":0,\\"batch\\":$EXPRESS_POLL_BATCH}"
  RESP_F=\$(mktemp)
  MELKA_CURL_TIMEOUT=20 signed_curl "/api/mobile-relay/poll" "$BODY" \\
    -X POST -H "Content-Type: application/json" --data-binary "$BODY" > "$RESP_F" 2>/dev/null || { rm -f "$RESP_F"; return 0; }
  if [ -s "$RESP_F" ] && jq -e '.ok == true' "$RESP_F" >/dev/null 2>&1; then
    jq -c '(.items // [(.request // empty)])[]' "$RESP_F" 2>/dev/null || true
  fi
  rm -f "$RESP_F"
  return 0
}

# ── نسل N: استخر پویای کارگران — قلب سرعت ──
# به‌جای «موج‌های قفل‌شده + انتظار برای کل دسته»: کارگران تا سقف POOL_SLOTS
# (۱۶+۸) پیوسته از صف می‌گیرند؛ هر جای آزاد فوراً پر می‌شود؛ express (OTP/
# ثبت آگهی) همیشه صف را می‌بُرد؛ نتیجه‌ها جریانی تخلیه می‌شوند؛ poll میان‌موجی
# آیتم تازه را می‌آورد. پایان: همهٔ کارگران تمام شدند و صف خالی — فلش نهایی.
process_set() {
  # $1 = آرایهٔ JSON آیتم‌های این poll
  local items_json="$1"
  local QUEUE SPOOL_DIR ITEM NOW BUSY
  QUEUE=\$(mktemp); SPOOL_DIR=\$(mktemp -d)
  # Express lane (PN-036 فاز ۵ + PN-080): OTP/ثبت آگهی مقدم بر فهرست‌های سنگین
  printf '%s' "$items_json" | jq -c '.[] | select((.url // "") | test("/authentication/otp|/properties/create|/users/create|/users/info/mobile-number"))' >> "$QUEUE" 2>/dev/null
  printf '%s' "$items_json" | jq -c '.[] | select(((.url // "") | test("/authentication/otp|/properties/create|/users/create|/users/info/mobile-number")) | not)' >> "$QUEUE" 2>/dev/null
  LAST_FLUSH=\$(date +%s)
  LAST_EXPRESS=\$(date +%s)
  while :; do
    # پر کردن ظرفیت استخر از صف
    while [ -s "$QUEUE" ] && [ "\$(active_jobs)" -lt "$POOL_SLOTS" ]; do
      ITEM=\$(head -n 1 "$QUEUE")
      sed -i '1d' "$QUEUE" 2>/dev/null
      [ -z "$ITEM" ] && continue
      process_item_spool "$ITEM" "$SPOOL_DIR" &
    done
    BUSY=\$(active_jobs)
    drain_spool "$SPOOL_DIR"
    if [ "$BUSY" -eq 0 ] && [ ! -s "$QUEUE" ]; then
      break
    fi
    # poll میان‌موجی — فقط وقتی ظرفیت آزاد هست (آیتم برداشته سرگردان نمی‌شود)
    NOW=\$(date +%s)
    if [ \$(( NOW - LAST_EXPRESS )) -ge "$EXPRESS_POLL_S" ] && [ "\$(active_jobs)" -lt "$POOL_SLOTS" ]; then
      LAST_EXPRESS=$NOW
      express_poll_items >> "$QUEUE" 2>/dev/null || true
    fi
    sleep 0.8
  done
  drain_spool "$SPOOL_DIR" "force"
  rm -f "$QUEUE"; rm -rf "$SPOOL_DIR"
}

# شمار کارگران زندهٔ این پوسته (jobs خودشان را reap می‌کند)
active_jobs() { jobs -pr | wc -l; }

# ── نسل N: تلاش تطبیقی احراز — «بدون توقف» حتی وقتی کد/دستگاه رد می‌شود ──
# درس نیم‌ساعتهٔ مالک: exit 1 روی 401/403 (نسل M+2) رله را می‌کشت؛ حالا:
# تلاش با مکث دوبرابرشونده (۳۰→۳۰۰ث) + راهنمای دوره‌ای. اگر سرور پس از
# بازنشانی، دستگاه را برگرداند رله خودش زنده می‌ماند؛ اگر واقعاً کد تازه
# لازم باشد مالک پیام روشن می‌بیند اما اسکریپت هرگز بی‌کار نمی‌ماند.
auth_delay() {
  # $1 = برچسب علت (برای لاگ)
  AUTH_FAILS=\$((AUTH_FAILS+1))
  local d
  d=\$(( AUTH_RETRY_BASE * 2 ** (AUTH_FAILS - 1) ))
  [ "$d" -gt "$AUTH_RETRY_MAX" ] && d=$AUTH_RETRY_MAX
  if [ \$(( AUTH_FAILS % AUTH_GUIDE_EVERY )) -eq 1 ]; then
    log "⚠️ \$1 — تلاش \$AUTH_FAILS: اگر کد تازه از داشبورد گرفته‌اید نصبش کنید؛ در غیر این صورت مشکل احتمالاً موقتی است و رله خودش برمی‌گردد. توقف نمی‌کنم — \$d ثانیه دیگر تلاش می‌کنم."
  else
    log "\$1 (تلاش \$AUTH_FAILS) — \$d ثانیه دیگر (بدون توقف)"
  fi
  sleep "$d"
}

# ── حلقهٔ اصلی (داخل تابع — سرپرایز نسل N دورش است) ──
relay_main() {
  while true; do
    LOOPS=\$((LOOPS+1))

    # هر ۳۰ چرخه مسیر اصلی دوباره مقدم می‌شود (primary مقدم است — PN-031-I لایهٔ ۳)
    if [ "$URL_COUNT" -gt 1 ] && [ "\$(( LOOPS % PRIMARY_RECHECK_LOOPS ))" -eq 0 ] && [ "$URL_IDX" -ne 0 ]; then
      URL_IDX=0
      log "بازگشت به مسیر اصلی برای آزمایش دوباره"
    fi

    # نبض نسخه — کشف بازنشانی پلتفرم از بیرون
    version_ping

    # نسل N: همگام‌سازی دوره‌ای ساعت (پیش‌گیرانه — هر ۱۵ دقیقه)
    maybe_resync_clock

    # ── فاز ۲: بازپخش نتیجه‌های ارسال‌نشدهٔ تازه (اگر هست) ──
    replay_failed_results

    # ضربان قلب — هر ۱۰ چرخه مالک می‌بیند رله زنده است
    if [ \$((LOOPS % 10)) -eq 0 ]; then
      log "زنده — چرخهٔ \$LOOPS · مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) · \$SERVED موفق / \$ERRORS خطا / \$BATCHES دسته"
    fi

    # ── فاز ۵: poll دسته‌ای — تا \$BATCH آیتم در هر تماس ──
    BODY="{\\"wait\\":$POLL_WAIT_S,\\"batch\\":$BATCH}"
    RESP=""; CURL_EXIT=0
    # نسل L و برتر: مهلت curl = انتظار + حاشیه
    # DIR-RELAY-FIX-001: خروجی به فایل موقت ریدایرکت می‌شود (نه $()) — در غیر این
    # صورت signed_curl داخل subshellِ جای‌گذاری فرمان اجرا می‌شود و LAST_HTTP_CODE
    # هرگز به حلقهٔ اصلی نمی‌رسد (stdout منتقل می‌شود؛ متغیر نه — درس تست دودویی).
    RESP_F=\$(mktemp)
    MELKA_CURL_TIMEOUT=\$(( POLL_WAIT_S + 15 )) signed_curl "/api/mobile-relay/poll" "$BODY" \\
      -X POST -H "Content-Type: application/json" --data-binary "$BODY" > "$RESP_F" || CURL_EXIT=$?
    RESP=\$(cat "$RESP_F")
    rm -f "$RESP_F"

    if [ $CURL_EXIT -ne 0 ]; then
      NET_FAILS=\$((NET_FAILS+1))
      local_idx=\$(( NET_FAILS < 4 ? NET_FAILS - 1 : 4 ))
      delay="\${RETRY_DELAYS[\$local_idx]:-300}"
      log "شبکه: curl خطای $CURL_EXIT (\$(curl_err_desc $CURL_EXIT)) — \$delay ثانیه دیگر تلاش می‌کنم (خطای پیاپی: \$NET_FAILS · بدون توقف)"
      # سوئیچ مسیر جایگزین پس از ۳ خطای پیاپی (اگر موجود است)
      if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
        URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
        log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
      fi
      sleep "\$delay"; continue
    fi

    # ── دروازهٔ موقتاً ناساز (502/503/429) — AIMD: مکث دوبرابر تا سقف، بازگشت نصف ──
    # DIR-RELAY-FIX-001 (دستور ۱): پایه ۱۰ث (نه نردمان ۳۰/۶۰/۱۲۰/۳۰۰). نسل N:
    # قطعی طولانی مکث را تا ۱۲۰ث دوبرابر می‌کند (باتری/دروازه) و اولین موفقیت
    # نصفش می‌کند — «بدون توقف» با «تشنه‌کوبی» یکی نیست.
    if [ "\$LAST_HTTP_CODE" = "502" ] || [ "\$LAST_HTTP_CODE" = "503" ] || [ "\$LAST_HTTP_CODE" = "429" ]; then
      NET_FAILS=\$((NET_FAILS+1))
      GATEWAY_RETRY_STREAK=\$((GATEWAY_RETRY_STREAK+1))
      delay=\$GATEWAY_BACKOFF
      GATEWAY_BACKOFF=\$(( GATEWAY_BACKOFF * 2 ))
      [ "\$GATEWAY_BACKOFF" -gt "\$GATEWAY_BACKOFF_MAX" ] && GATEWAY_BACKOFF=\$GATEWAY_BACKOFF_MAX
      log "دروازهٔ سرور خطای \$LAST_HTTP_CODE داد (قطعی موقت · پیاپی: \$GATEWAY_RETRY_STREAK) — \$delay ثانیه دیگر (تاخیر تطبیقی تا سقف \$GATEWAY_BACKOFF_MAXث · بدون توقف)"
      if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
        URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
        log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
      fi
      sleep "\$delay"; continue
    fi

    # ── 401 — رد احراز؛ نسل N: هرگز خروج (قانون بی‌توقف) — تلاش تطبیقی ──
    if [ "\$LAST_HTTP_CODE" = "401" ]; then
      auth_delay "احراز رد شد (HTTP 401)"
      continue
    fi

    # ── 403ِ بدون قرارداد JSON سرور (دروازه/WAF) — AIMD مثل دروازه؛ هرگز خروج ──
    # درس DIR-RELAY-FIX-001 (دو 403 پیاپی = خروج) با گزارش نیم‌ساعتهٔ مالک تصادم
    # داشت: WAF گاهی دقیقه‌ها 403 می‌دهد؛ رله باید زنده بماند و آرام‌تر بکوشد.
    if [ "\$LAST_HTTP_CODE" = "403" ] && ! printf '%s' "$RESP" | jq -e 'has("ok")' >/dev/null 2>&1; then
      NET_FAILS=\$((NET_FAILS+1))
      GATEWAY_RETRY_STREAK=\$((GATEWAY_RETRY_STREAK+1))
      delay=\$GATEWAY_BACKOFF
      GATEWAY_BACKOFF=\$(( GATEWAY_BACKOFF * 2 ))
      [ "\$GATEWAY_BACKOFF" -gt "\$GATEWAY_BACKOFF_MAX" ] && GATEWAY_BACKOFF=\$GATEWAY_BACKOFF_MAX
      log "خطای 403 از دروازه/WAF (پیاپی: \$GATEWAY_RETRY_STREAK) — \$delay ثانیه دیگر (تاخیر تطبیقی · بدون توقف)"
      if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
        URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
        log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
      fi
      sleep "\$delay"; continue
    fi

    # خالی (204/شبکه) — ادامهٔ poll (سرور تا \$POLL_WAIT_S معلق نگه داشت — «۱ ثانیه» فاصلهٔ تنفس)
    if [ -z "$RESP" ]; then
      NET_FAILS=0
      GATEWAY_RETRY_STREAK=0
      AUTH_FAILS=0
      GATEWAY_BACKOFF=\$(( GATEWAY_BACKOFF / 2 ))
      [ "\$GATEWAY_BACKOFF" -lt "\$GATEWAY_RETRY_DELAY" ] && GATEWAY_BACKOFF=\$GATEWAY_RETRY_DELAY
      if [ "$CONNECT_OK" -eq 0 ]; then
        CONNECT_OK=1
        log "✓ اتصال تأیید شد — رلهٔ ملکا فعال است (مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ))"
      fi
      sleep 1; continue
    fi

    OK=\$(printf '%s' "$RESP" | jq -r '.ok // empty' 2>/dev/null)
    if [ "$OK" != "true" ]; then
      ERRMSG=\$(printf '%s' "$RESP" | jq -r '.error // empty' 2>/dev/null)
      MISSING=\$(printf '%s' "$RESP" | jq -r 'if (.missing // []) | length > 0 then (.missing | join("، ")) else empty end' 2>/dev/null)
      if [ -n "$ERRMSG" ]; then
        # ── نسل N: تنها خروج عمدی = ابطال مالک. بقیهٔ ردها = تلاش تطبیقی ──
        # (unknown device پس از بازنشانی سرور می‌تواند موقتی باشد — سرور دیتابیس
        #  را از آینه برمی‌گرداند و رلهٔ زنده خودش وصل می‌شود؛ forbidden هم با
        #  همگام‌سازی ساعت/بازنشانی ممکن است پاک شود. راهنمای کد تازه دوره‌ای چاپ
        #  می‌شود اما اسکریپت هرگز نمی‌میرد — دستور مالک ۲۰۲۶-۱۱-۱۴.)
        case "\$ERRMSG" in
          "device revoked")
            log "⛔ دستگاه رله از داشبورد باطل شده است (device revoked) — تنها علت توقف عمدی. برای ادامه، کد تازه بگیرید."
            return \$EXIT_REVOKED
            ;;
          "unknown device"|"forbidden")
            auth_delay "سرور: \$ERRMSG"
            continue
            ;;
        esac
        # پاسخ JSON معتبر از سرور خودمان (قرارداد خطای احراز) — سرور در دسترس است
        NET_FAILS=0
        if [ -n "$MISSING" ]; then
          log "خطای سرور: \$ERRMSG — هدرهای نایافته: \$MISSING — ۳۰ ثانیه صبر"
        else
          log "خطای سرور: \$ERRMSG — ۳۰ ثانیه صبر"
        fi
      else
        # R7 (فرمان ۲۰۲۶-۱۱-۰۱ — درس توقف رله): پاسخ بدون قرارداد JSON (صفحهٔ خطای
        # HTML پروکسی/۵۰۰) یعنی «مسیر حمل‌ونقل خراب است» نه «سرور خطای معتبر داد» —
        # مثل خطای شبکه شمرده می‌شود: شمارش NET_FAILS + چرخش مسیر در آستانه +
        # backoff واقعی → بازگشت خودکار به مسیر اصلی.
        NET_FAILS=\$((NET_FAILS+1))
        local_idx=\$(( NET_FAILS < 4 ? NET_FAILS - 1 : 4 ))
        delay="\${RETRY_DELAYS[\$local_idx]:-30}"
        log "پاسخ غیرمنتظره (مسیر حمل‌ونقل خراب؟): \$(printf '%s' "$RESP" | head -c 120) — \$delay ثانیه دیگر (خطای پیاپی: \$NET_FAILS · بدون توقف)"
        if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
          URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
          log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
        fi
        sleep "\$delay"; continue
      fi
      ST=\$(printf '%s' "$RESP" | jq -r '.serverTime // empty' 2>/dev/null)
      if [ -n "$ST" ] && [ "$ERRMSG" = "stale request" ]; then
        CLOCK_OFFSET=\$(( ST - \$(date +%s%3N) ))
        log "ساعت گوشی اصلاح شد (اختلاف \$(( CLOCK_OFFSET / 60000 )) دقیقه) — تلاش تازه"
      fi
      sleep 30; continue
    fi

    # ── پاسخ موفق — استخراج دسته (items[]) با سازگاری عقبه (request تک‌آیتمی) ──
    NET_FAILS=0
    GATEWAY_RETRY_STREAK=0
    AUTH_FAILS=0
    GATEWAY_BACKOFF=\$(( GATEWAY_BACKOFF / 2 ))
    [ "\$GATEWAY_BACKOFF" -lt "\$GATEWAY_RETRY_DELAY" ] && GATEWAY_BACKOFF=\$GATEWAY_RETRY_DELAY
    N_ITEMS=\$(printf '%s' "$RESP" | jq '.items | length' 2>/dev/null)
    if [ -z "$N_ITEMS" ] || [ "$N_ITEMS" = "0" ] || [ "$N_ITEMS" = "null" ]; then
      ITEMS_JSON=\$(printf '%s' "$RESP" | jq -c '[.request] // []' 2>/dev/null)
    else
      ITEMS_JSON=\$(printf '%s' "$RESP" | jq -c '[.items[]]' 2>/dev/null)
    fi

    if [ -n "\$ITEMS_JSON" ] && [ "\$ITEMS_JSON" != "[]" ] && [ "\$ITEMS_JSON" != "null" ]; then
      process_set "\$ITEMS_JSON"
    else
      # هیچ نتیجه‌ای تولید نشد (آیتم‌های بی‌شناسه) — poll بعدی
      sleep 1
    fi
  done
}

SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0
log "رلهٔ ملکا آغاز شد (نسل N · DIR-RELAY-UNLIMITED-001 · استخر \$MAX_WORKERS+\$EXPRESS_SLOTS کارگر · بی‌توقف) — دستگاه: $DEVICE_ID (در حال اتصال…)"
log "مسیر اصلی: $SERVER_URL"
[ "$URL_COUNT" -gt 1 ] && log "مسیر جایگزین: $ALT_SERVER_URL (سوئیچ خودکار پس از $ALT_FAIL_THRESHOLD خطای پیاپی)"
log "قانون بی‌توقف: خطاهای شبکه/دروازه/احراز هرگز رله را نمی‌کشند — تنها ابطال مالک (داشبورد) یا Ctrl+C."
log "برای ساعت‌ها کار بدون توقف: اندروید → تنظیمات → برنامه‌ها → Termux → باتری → «بدون محدودیت» + در Recentها قفل کنید."
log "حمل‌ونقل: HTTP/1.1 · نردمان شبکه ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ · دروازه 502/503/429/403: تاخیر تطبیقی \$GATEWAY_RETRY_DELAY تا \$GATEWAY_BACKOFF_MAXث (AIMD) · سقف \$RATE_MAX در دقیقه"
log "نسل N: batch=\$BATCH · استخر \$MAX_WORKERS+\$EXPRESS_SLOTS کارگر · نتیجهٔ جریانی (موج‌به‌موج) · poll میان‌موجی هر \$EXPRESS_POLL_Sث · مهلت OTP=\$LIGHT_TIMEOUTث / فهرست=\$LIST_TIMEOUTث / سنگین=\$HEAVY_TIMEOUTث · رفع jq ARG_MAX (--rawfile + stdin)"
log "لاگ دیباگ: ~/relay-debug.log (هدرها؛ مقدار امضا حذف می‌شود)"
log "احراز: X-Melka-Relay-Device + X-Melka-Timestamp + X-Melka-Signature"
sync_clock && log "ساعت با سرور همگام شد ✓" || log "همگام‌سازی ساعت سرور ممکن نشد — ادامه با ساعت محلی"
LAST_CLOCK_SYNC=\$(date +%s)

# ── نسل N: سرپرایز — هر شکست غیرمنتظرهٔ حلقهٔ اصلی، پس از ۱۰ث دوباره ──
# تنها پایان عمدی: ابطال مالک (\$EXIT_REVOKED) یا سیگنال توقف (INT/TERM).
# اگر MIUI پروسه را بکشد، سرپرایز در همین پوسته نیست — اما Wake-Lock +
# راهنمای باتری همان لایه را پوشش می‌دهند و کاربر با یک Enter دوباره برمی‌گردد.
SUP_RESTARTS=0
while true; do
  relay_main
  RC=$?
  if [ "\$RC" -eq "\$EXIT_REVOKED" ]; then
    log "خروج نهایی — دستگاه از داشبورد باطل شد (توقف عمدی مالک)."
    exit 1
  fi
  SUP_RESTARTS=\$((SUP_RESTARTS+1))
  log "سرپرایز: چرخهٔ اصلی پایان یافت (کد \$RC) — راه‌اندازی مجدد خودکار در \$SUPERVISOR_DELAY ثانیه (بازسازی شماره \$SUP_RESTARTS)"
  sleep "\$SUPERVISOR_DELAY"
done
`;
}

/** دستور نصب پیشرفتهٔ نسل N که مالک در Termux پیست می‌کند
 *  DIR-RELAY-UNLIMITED-001 (دستور ۳ مالک: «کدنصب بسیار پیشرفته… تمام محدودیت‌ها
 *  و مشکلات و موانع در آن پیش‌بینی و رفع شده باشد»):
 *    ۱) نصب وابستگی‌ها با پیام خطای مستقل و راهنمای تلاش دوباره
 *    ۲) دانلود bootstrap با تا ۳ تلاش و ۵ث فاصله (شبکهٔ لرزان موبایل)
 *    ۳) وارسی سلامت فایل (shebang + حداقل حجم) — فایل ناقص/خطای HTML اجرا نمی‌شود
 *    ۴) اجرا با دستور کار چندساعته (راهنمای باتری MIUI چاپ می‌شود)
 *    ۵) شکست نصب → پیام شفاف + پاکسازی فایل ناقص (عین DIR-RELAY-FIX-001)
 */
export function buildInstallCommand(serverUrl: string, enrollCode: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9:\/._-]/g, "");
  const url = safe(serverUrl).replace(/\/+$/, "");
  const code = safe(enrollCode);
  // PN-031-I: همان حمل‌ونقل بقا — http1.1 + UA بروزری برای دانلود bootstrap
  // PN-034 (شورا-ن۰۵۵): openssl-tool — بستهٔ CLI واقعی Termux؛ مسیر اثبات‌شدهٔ مالک
  // (PN-031-I/J: pkg install -y openssl-tool → پیست همین دستور → Enter → اتصال ✓)
  return `# ── نصب رلهٔ ملکا (نسل N · بی‌توقف · بی‌محدودیت) ──
if pkg install -y curl openssl-tool jq; then
  ok=0
  for i in 1 2 3; do
    if curl --http1.1 -A "${BROWSER_UA}" -fsSL "${url}/api/mobile-relay/bootstrap?code=${code}" -o ~/melka-relay.sh; then ok=1; break; fi
    echo "تلاش دانلود \$i از ۳ ناموفق — ۵ ثانیه دیگر…"
    sleep 5
  done
  if [ "\$ok" = "1" ] && head -n 1 ~/melka-relay.sh | grep -q '^#!' && [ "\$(wc -c < ~/melka-relay.sh)" -gt 4000 ]; then
    chmod 700 ~/melka-relay.sh
    echo "نصب موفق ✓ — رله آغاز می‌شود. برای ساعت‌ها کار بی‌وقفه: اندروید → برنامه‌ها → Termux → باتری → «بدون محدودیت»."
    bash ~/melka-relay.sh
  else
    echo "خطا در نصب! لطفاً کد جدید بگیرید."
    rm -f ~/melka-relay.sh
  fi
else
  echo "خطا در نصب وابستگی‌ها! Termux را ببندید، دوباره باز کنید و همین دستور را دوباره بزنید."
fi`;
}
