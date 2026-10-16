/**
 * مولد اسکریپت رلهٔ Termux — PN-031 (شورای ن۰۳۷) · سخت‌سازی PN-031-E · PN-031-G · PN-031-I (شورا-ن۰۵۰)
 * ---------------------------------------------------------------------------
 * روت bootstrap این قالب را با پیکربندی دستگاه (SERVER_URL · DEVICE_ID ·
 * DEVICE_SECRET · ALT_SERVER_URL) پر می‌کند و به‌صورت text/x-shellscript تحویل می‌دهد.
 * مالک فقط یک بار آن را در Termux اجرا می‌کند — از آن پس حلقهٔ رله:
 *
 *   poll (امضاشده) → وارسی امضای سرور → whitelist میزبان → اجرای curl →
 *   result (امضاشده، body پایه۶۴) → تکرار
 *
 * سخت‌سازی PN-031-E (ریشه‌یابی «Bootstrap موفق، Poll ناموفق»):
 *   · همگام‌سازی ساعت با سرور (Date header) + اصلاح خودکار ts امضا
 *   · خطای دقیق سرور نمایش داده می‌شود (error از JSON پاسخ)
 *   · خطای شبکه با کد curl و توضیح فارسی
 *   · ضربان قلب هر ۱۰ چرخه
 *
 * سخت‌سازی PN-031-G (شورا-ن۰۴۷ · ریشهٔ «missing auth headers»):
 *   · پیش‌پرواز امضا — ts/sig خالی هرگز ارسال نمی‌شود (curl هدر خالی را بی‌صدا حذف می‌کند)
 *   · پیام موفقیت صادقانه — «رلهٔ ملکا فعال است» فقط پس از اولین پاسخ واقعی سرور
 *   · نام هدرهای احرازی غایب (missing) از پاسخ ۴۰۳ در لاگ نمایش داده می‌شود
 *
 * سخت‌سازی PN-031-I (شورا-ن۰۵۰ · ریشهٔ «curl error 9» + تحمل مسیر):
 *   · اجبار HTTP/1.1 روی تمام تماسهای سرور — دروازهٔ space-z.ai با برخی
 *     جریانهای HTTP/2 از گوشی (RST_STREAM) ناسازگار است؛ HTTP/1.1 خاموش‌کنندهٔ
 *     کل طبقهٔ خطاهای کد ۹/۱۶ است.
 *   · User-Agent بروزری (Chrome روی اندروید) — دروازه/WAF درخواستهای
 *     curl/8.x را ممکن است bot تشخیص دهد و تماس را قطع کند (کد ۹).
 *   · نردبان retry پله‌ای ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ ثانیه — جایگزینِ «۵ ثانیه»ی
 *     قدیمی که ۱۲ درخواست/دقیقه = ۷۲۰ در ساعت می‌ساخت و خودش را به‌عنوان
 *     حمله به دروازه معرفی می‌کرد و قفل rate-limit/بلاک موقت IP را فعال می‌کرد.
 *   · سقف نرخ: حداکثر ۵ تماس سرور در هر پنجرهٔ ۶۰ثانیه‌ای — حتی اگر حلقه
 *     خطا بخورد (لایهٔ دفاعی مستقل از نردبان).
 *   · لاگ verbose به ~/relay-debug.log — خروجی -v فقط هدرها و اتصال؛ مقدار
 *     امضا پیش از نوشتن redact می‌شود؛ چرخش خودکار در ۵۱۲KB (آخرین ۳۲KB می‌ماند).
 *   · مسیر جایگزین (لایهٔ ۳ سند): ALT_SERVER_URL (روت /relay واکِر کلادفلیر) —
 *     پس از ۳ خطای شبکهٔ پیاپی روی مسیر اصلی، سوئیچ خودکار؛ هر ۳۰ چرخه بازگشت
 *     به آزمایش مسیر اصلی (primary مقدم است).
 *   · نبض نسخه (سلف-پینگ بیرونی): هر ۱۰ دقیقه /api/version خوانده می‌شود؛ اگر
 *     سرور روی بیلد قدیمی باشد مالک فوراً هشدار می‌بیند (کشف بازنشانی پلتفرم
 *     از بیرون — درس بازگشت دهم: گاردهای درونی خودشان قربانی می‌شوند).
 *
 * نکتهٔ پیاده‌سازی: متن bash داخل template literal است؛ هر "\${" به‌صورت
 * "\${" escape شده تا تعبیر جاوااسکریپت نشود.
 *
 * ویژگی‌های امنیتی داخلی اسکریپت (دفاع در عمق — عین سرور):
 *   · فقط https و فقط *.melketabriz.ir برای اجرای درخواست صف — هیچ مقصد دیگری اجرا نمی‌شود
 *   · امضای هر آیتم صف پیش از اجرا وارسی می‌شود (RELAY\nid\nmethod\nurl\nsha256(body)\nts)
 *   · صفر لاگ محتوا — فقط شمارنده و کد وضعیت (لاگ debug هدرها است، نه بدنه)
 *   · wake-lock Termux (بقا در پس‌زمینه) + امتناع از اجرا در محیط غیر Termux
 */

export interface RelayScriptConfig {
  serverUrl: string;
  deviceId: string;
  deviceSecret: string;
  /** PN-031-I لایهٔ ۳: مسیر جایگزین (روت /relay واکِر) — خالی = بدون جایگزین */
  altServerUrl?: string;
}

/** UA بروزری واقع‌نما — Chrome روی اندروید (Poco F3 مالک) */
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
# melka-relay — رلهٔ موبایل ملکا (PN-031-I · شورای عالی ملکا ۰۵۰)
# روی گوشی مالک (Poco F3 · Termux · IP ایرانی) اجرا می‌شود.
# این فایل را اجرا نکنید مگر اینکه از طریق «راه‌اندازی رله» در
# تنظیمات ملکا ساخته شده باشد — راز دستگاه داخلش است.
# نسل: PN-031-I (http1.1 + UA بروزری + retry پله‌ای + مسیر جایگزین)
# ============================================================
set -u

SERVER_URL="${serverUrl}"
DEVICE_ID="${deviceId}"
DEVICE_SECRET="${deviceSecret}"
ALT_SERVER_URL="${altServerUrl}"

# ── PN-031-I: ثابت‌های حمل‌ونقل ──
UA="${BROWSER_UA}"
RELAY_DEBUG="\$HOME/relay-debug.log"
DEBUG_MAX=524288   # 512KB — چرخش لاگ دیباگ
RETRY_DELAYS=(30 60 120 300 300)   # نردبان: ۳۰ث · ۱د · ۲د · ۵د · ۵د
ALT_FAIL_THRESHOLD=3               # سوئیچ به مسیر جایگزین پس از ۳ خطای پیاپی
PRIMARY_RECHECK_LOOPS=30           # هر ۳۰ چرخه، مسیر اصلی دوباره آزموده می‌شود

log() { echo "[$(date '+%H:%M:%S')] $*"; }

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
# curl هدر با مقدار خالی را بی‌صدا حذف می‌کند → «missing auth headers» بی‌ردپا.
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
cur_url() { printf '%s' "\${URLS[$URL_IDX]}"; }

# ── PN-031-I: سقف نرخ — حداکثر ۵ تماس سرور در ۶۰ ثانیه ──
# مستقل از نردبان retry؛ حتی در بدترین سناریوی خطا، دروازه الگوی حمله نمی‌بیند.
REQ_TIMES=()
rate_gate() {
  local now t keep i oldest wait_s
  now=\$(date +%s)
  keep=()
  for t in \${REQ_TIMES[@]+"\${REQ_TIMES[@]}"}; do
    [ \$(( now - t )) -lt 60 ] && keep+=("$t")
  done
  REQ_TIMES=("\${keep[@]+"\${keep[@]}"}")
  if [ "\${#REQ_TIMES[@]}" -ge 5 ]; then
    oldest="\${REQ_TIMES[0]}"
    wait_s=\$(( 60 - (now - oldest) + 1 ))
    if [ "$wait_s" -gt 0 ]; then
      log "سقف نرخ (۵ در دقیقه) — $wait_s ثانیه مکث برای احترام به دروازه"
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

# بقا در پس‌زمینه (MIUI) — بدون خطا اگر نبود
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null && log "قفل بیداری فعال شد (شارژر توصیه می‌شود)"

sha256hex() { openssl dgst -sha256 -hex | sed 's/^.*= //'; }
hmac_hex() { openssl dgst -sha256 -hmac "$DEVICE_SECRET" -hex | sed 's/^.*= //'; }

# ── PN-031-E: همگام‌سازی ساعت با سرور (http1.1 + UA بروزری — PN-031-I) ──
CLOCK_OFFSET=0
sync_clock() {
  local HDR T SERVER_EPOCH LOCAL_EPOCH
  HDR=\$(mktemp)
  curl --http1.1 -A "$UA" -sSI --max-time 15 -D "$HDR" -o /dev/null "\$(cur_url)/api/health" 2>/dev/null || { rm -f "$HDR"; return 1; }
  T=\$(awk 'tolower($1)=="date:"{$1="";sub(/^ /,"");sub(/\\r$/,"");print;exit}' "$HDR")
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
  # $1 = مسیر روت · $2 = بدنهٔ خام · $3.. = آرگومانهای curl بعدی
  local path="$1" body="$2"; shift 2
  local ts digest sig
  ts=\$(( \$(date +%s%3N) + CLOCK_OFFSET ))
  digest=\$(printf '%s' "$body" | sha256hex)
  sig=\$(printf 'POST\\n%s\\n%s\\n%s' "$path" "$digest" "$ts" | hmac_hex)
  # ── PN-031-G: پیش‌پرواز — هیچ هدری خاموش حذف نمی‌شود ──
  if [ -z "$ts" ] || [ -z "$sig" ]; then
    log "خطای داخلی: امضا/زمان خالی ساخته شد (date یا openssl کار نمی‌کند) — درخواست ارسال نشد"
    return 9
  fi
  rate_gate
  # ── PN-031-I: http1.1 + UA بروزری + verbose به لاگ دیباگ (امضا redact) ──
  curl --http1.1 -A "$UA" -sS -v --max-time 35 "\$(cur_url)$path" "$@" \\
    -H "X-Melka-Relay-Device: $DEVICE_ID" \\
    -H "X-Melka-Timestamp: $ts" \\
    -H "X-Melka-Signature: $sig" \\
    2> >(sed -u 's/^\\(> *X-Melka-Signature: \\).*/\\1<redacted>/; s/^\\(< *X-Melka-Signature: \\).*/\\1<redacted>/' >> "$RELAY_DEBUG" 2>/dev/null)
  local rc=$?
  debug_rotate
  return $rc
}

# ── PN-031-I: نبض نسخه (سلف-پینگ بیرونی — کشف بازنشانی پلتفرم از گوشی) ──
# هر ۱۰ دقیقه: اگر بیلد زنده سرور با HEAD آن یکی نبود، مالک همان لحظه می‌بیند.
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
      *) log "⚠️ سرور ملکا روی نسخهٔ قدیمی است ($bid ≠ $sha) — لطفاً GLM را با یک پیام کوتاه آگاه کنید" ;;
    esac
  fi
}

SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0
log "رلهٔ ملکا آغاز شد (نسل PN-031-I) — دستگاه: $DEVICE_ID (در حال اتصال…)"
log "مسیر اصلی: $SERVER_URL"
[ "$URL_COUNT" -gt 1 ] && log "مسیر جایگزین: $ALT_SERVER_URL (سوئیچ خودکار پس از $ALT_FAIL_THRESHOLD خطای پیاپی)"
log "حمل‌ونقل: HTTP/1.1 · UA بروزری · retry پله‌ای ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ · سقف ۵ در دقیقه"
log "لاگ دیباگ: ~/relay-debug.log (هدرها؛ مقدار امضا حذف می‌شود)"
log "احراز: X-Melka-Relay-Device + X-Melka-Timestamp + X-Melka-Signature"
sync_clock && log "ساعت با سرور همگام شد ✓" || log "همگام‌سازی ساعت سرور ممکن نشد — ادامه با ساعت محلی"

while true; do
  LOOPS=\$((LOOPS+1))

  # هر ۳۰ چرخه مسیر اصلی دوباره مقدم می‌شود (primary مقدم است — PN-031-I لایهٔ ۳)
  if [ "$URL_COUNT" -gt 1 ] && [ "\$(( LOOPS % PRIMARY_RECHECK_LOOPS ))" -eq 0 ] && [ "$URL_IDX" -ne 0 ]; then
    URL_IDX=0
    log "بازگشت به مسیر اصلی برای آزمایش دوباره"
  fi

  # نبض نسخه — کشف بازنشانی پلتفرم از بیرون
  version_ping

  # ضربان قلب — هر ۱۰ چرخه (~۳٫۵ دقیقه) مالک می‌بیند رله زنده است
  if [ \$((LOOPS % 10)) -eq 0 ]; then
    log "زنده — چرخهٔ $LOOPS · مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) · $SERVED موفق / $ERRORS خطا"
  fi

  BODY='{"wait":20}'
  RESP=""; CURL_EXIT=0
  RESP=\$(signed_curl "/api/mobile-relay/poll" "$BODY" \\
    -X POST -H "Content-Type: application/json" --data-binary "$BODY") || CURL_EXIT=$?

  if [ $CURL_EXIT -ne 0 ]; then
    NET_FAILS=\$((NET_FAILS+1))
    local_idx=\$(( NET_FAILS < 4 ? NET_FAILS - 1 : 4 ))
    delay="\${RETRY_DELAYS[\$local_idx]:-300}"
    log "شبکه: curl خطای $CURL_EXIT (\$(curl_err_desc $CURL_EXIT)) — $delay ثانیه دیگر تلاش می‌کنم (خطای پیاپی: $NET_FAILS)"
    # سوئیچ مسیر جایگزین پس از ۳ خطای پیاپی (اگر موجود است)
    if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
      URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
      log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
    fi
    sleep "$delay"; continue
  fi

  # خالی (204/شبکه) — ادامهٔ poll
  # PN-031-G: اولین پاسخ موفق = نشانهٔ صادقانهٔ «رله فعال است»
  if [ -z "$RESP" ]; then
    NET_FAILS=0
    if [ "$CONNECT_OK" -eq 0 ]; then
      CONNECT_OK=1
      log "✓ اتصال تأیید شد — رلهٔ ملکا فعال است (مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ))"
    fi
    sleep 1; continue
  fi

  OK=\$(printf '%s' "$RESP" | jq -r '.ok // empty' 2>/dev/null)
  if [ "$OK" != "true" ]; then
    NET_FAILS=0
    # PN-031-E — دلیل دقیق رد سرور نمایش داده می‌شود (نه «غیرمنتظره»ی مبهم)
    ERRMSG=\$(printf '%s' "$RESP" | jq -r '.error // empty' 2>/dev/null)
    # PN-031-G — نام هدرهای احرازی غایب (پاسخ ۴۰۳ «missing auth headers»)
    MISSING=\$(printf '%s' "$RESP" | jq -r 'if (.missing // []) | length > 0 then (.missing | join("، ")) else empty end' 2>/dev/null)
    if [ -n "$ERRMSG" ]; then
      if [ -n "$MISSING" ]; then
        log "خطای سرور: $ERRMSG — هدرهای نایافته: $MISSING — ۳۰ ثانیه صبر"
      else
        log "خطای سرور: $ERRMSG — ۳۰ ثانیه صبر"
      fi
    else
      log "پاسخ غیرمنتظره: \$(printf '%s' "$RESP" | head -c 160) — ۳۰ ثانیه صبر"
    fi
    # ردِ «stale» = اختلاف ساعت — اصلاح فوری از serverTime خود پاسخ
    ST=\$(printf '%s' "$RESP" | jq -r '.serverTime // empty' 2>/dev/null)
    if [ -n "$ST" ] && [ "$ERRMSG" = "stale request" ]; then
      CLOCK_OFFSET=\$(( ST - \$(date +%s%3N) ))
      log "ساعت گوشی اصلاح شد (اختلاف \$(( CLOCK_OFFSET / 60000 )) دقیقه) — تلاش تازه"
    fi
    sleep 30; continue
  fi

  # پاسخ موفق (آیتم صف) — اجرای درخواست
  NET_FAILS=0
  RID=\$(printf '%s' "$RESP" | jq -r '.request.id // empty')
  RURL=\$(printf '%s' "$RESP" | jq -r '.request.url // empty')
  RMETHOD=\$(printf '%s' "$RESP" | jq -r '.request.method // "GET"')
  RBODY=\$(printf '%s' "$RESP" | jq -r '.request.body // ""')
  RSIG=\$(printf '%s' "$RESP" | jq -r '.request.sig // empty')
  RTS=\$(printf '%s' "$RESP" | jq -r '.request.ts // empty')

  # ── دفاع دولایه ۱: whitelist میزبان (فقط https و فقط *.melketabriz.ir) ──
  case "$RURL" in
    https://*.melketabriz.ir/*) ;;
    *) log "رد درخواست غیرمجاز (مقصد خارج از ملک تبریز)"; continue ;;
  esac

  # ── دفاع دولایه ۲: وارسی امضای سرور پیش از اجرا ──
  BDIG=\$(printf '%s' "$RBODY" | sha256hex)
  EXPECT=\$(printf 'RELAY\\n%s\\n%s\\n%s\\n%s\\n%s' "$RID" "$RMETHOD" "$RURL" "$BDIG" "$RTS" | hmac_hex)
  if [ -z "$RSIG" ] || [ "$RSIG" != "$EXPECT" ]; then
    log "امضای سرور نامعتبر — درخواست نادیده گرفته شد"
    continue
  fi

  # ── اجرای درخواست به مقصد (IP ایرانی گوشی) ──
  TMP=\$(mktemp); HDR=\$(mktemp)
  AUTH=\$(printf '%s' "$RESP" | jq -r '.request.headers.authorization // empty')
  CT=\$(printf '%s' "$RESP" | jq -r '.request.headers["content-type"] // empty')
  ACC=\$(printf '%s' "$RESP" | jq -r '.request.headers["accept"] // empty')

  ARGS=(-sS --max-time 25 -D "$HDR" -o "$TMP" -w '%{http_code}' -X "$RMETHOD")
  [ -n "$AUTH" ] && ARGS+=(-H "Authorization: $AUTH")
  [ -n "$CT" ] && ARGS+=(-H "Content-Type: $CT")
  [ -n "$ACC" ] && ARGS+=(-H "Accept: $ACC")
  if [ -n "$RBODY" ] && [ "$RMETHOD" != "GET" ] && [ "$RMETHOD" != "HEAD" ]; then
    ARGS+=(--data-binary "$RBODY")
  fi

  CODE=\$(curl "\${ARGS[@]}" "$RURL" 2>/dev/null)
  CURL_EXIT=$?

  RESULT_JSON=""
  if [ $CURL_EXIT -ne 0 ]; then
    ERRORS=\$((ERRORS+1))
    RESULT_JSON=\$(jq -n --arg id "$RID" --arg err "curl exit $CURL_EXIT" '{id:$id,error:$err}')
  else
    SERVED=\$((SERVED+1))
    CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r$/,"");print $2;exit}' "$HDR")
    [ -z "$CTYPE" ] && CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r$/,"");$1="";sub(/^ /,"");print;exit}' "$HDR")
    B64=\$(base64 -w0 "$TMP" 2>/dev/null || base64 "$TMP" | tr -d '\\n')
    RESULT_JSON=\$(jq -n --arg id "$RID" --argjson code "\${CODE:-0}" --arg ct "$CTYPE" --arg b64 "$B64" '{id:$id,httpStatus:$code,contentType:$ct,bodyB64:$b64}')
  fi
  rm -f "$TMP" "$HDR"

  # ── ارسال نتیجه (امضاشده) ──
  RRESULT=\$(signed_curl "/api/mobile-relay/result" "$RESULT_JSON" \\
    -X POST -H "Content-Type: application/json" --data-binary "$RESULT_JSON") || {
    log "ارسال نتیجه ناموفق (\$(curl_err_desc $?)) — درخواست در سرور منقضی می‌شود"
  }
  ROK=""
  [ -n "$RRESULT" ] && ROK=\$(printf '%s' "$RRESULT" | jq -r '.ok // empty' 2>/dev/null)
  [ "$ROK" = "true" ] || log "توجه: سرور نتیجه را نپذیرفت: \$(printf '%s' "$RRESULT" | head -c 120)"

  log "اجراشده: $RMETHOD $RURL → $CODE (مجموع: $SERVED موفق / $ERRORS خطا)"
done
`;
}

/** دستور نصب یک‌خطی که مالک در Termux پیست می‌کند (محتوای QR) */
export function buildInstallCommand(serverUrl: string, enrollCode: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9:\/._-]/g, "");
  const url = safe(serverUrl).replace(/\/+$/, "");
  const code = safe(enrollCode);
  // PN-031-I: همان حمل‌ونقل بقا — http1.1 + UA بروزری برای دانلود bootstrap
  // PN-034 (شورا-ن۰۵۵): openssl-tool — بستهٔ CLI واقعی Termux؛ مسیر اثبات‌شدهٔ مالک
  // (PN-031-I/J: pkg install -y openssl-tool → پیست همین دستور → Enter → اتصال ✓)
  return `pkg install -y curl openssl-tool jq && curl --http1.1 -A "${BROWSER_UA}" -fsSL "${url}/api/mobile-relay/bootstrap?code=${code}" -o ~/melka-relay.sh && chmod 600 ~/melka-relay.sh && bash ~/melka-relay.sh`;
}
