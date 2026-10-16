/**
 * مولد اسکریپت رلهٔ Termux — PN-031 (شورای ن۰۳۷) · PN-031-E/G/I · نسل J = PN-035 (شورا-ن۰۵۷)
 * ---------------------------------------------------------------------------
 * روت bootstrap این قالب را با پیکربندی دستگاه (SERVER_URL · DEVICE_ID ·
 * DEVICE_SECRET · ALT_SERVER_URL) پر می‌کند و به‌صورت text/x-shellscript تحویل می‌دهد.
 * مالک فقط یک بار آن را در Termux اجرا می‌کند — از آن پس حلقهٔ رله:
 *
 *   poll (امضاشده · دسته‌ای) → وارسی امضای سرور → پالایش روش + whitelist میزبان →
 *   اجرای موازی curl (موج‌های ۸تایی) → result (امضاشده · دسته‌ای · gzip) → تکرار
 *
 * نسل J — PN-035 (شورا-ن۰۵۷ · فاز ۱+۲+۵+۶ کلاینت):
 *   · پالایش روش — فقط GET/POST/PUT/DELETE/PATCH اجرا می‌شود؛ هر روش دیگر
 *     بدون اجرا رد و به سرور «method not allowed» گزارش می‌شود (سنجهٔ ۱).
 *   · دسته‌ای — poll با batch=100؛ پاسخ items[] آرایه است؛ سازگاری عقبه:
 *     نبودِ items = تک‌آیتم request (نسل‌های قدیمی سرور).
 *   · موج‌های موازی — حداکثر ۸ کارگر همزمان (موج بعدی پس از اتمام موج)؛
 *     آیتم‌های تعاملی (OTP) به‌واسطهٔ اولویت سرور مقدم‌اند → تأخیر OTP حداقلی.
 *   · نتیجهٔ دسته‌ای — همهٔ نتیجه‌های موج در «یک» POST /result (سربار دروازه ÷N).
 *   · پایداری نتیجه — ۳ تلاش با backoff (۲/۶/۱۸ث)؛ رد قطعی سرور بدون تلاش مجدد؛
 *     شکست نهایی → ذخیرهٔ محلی ~/failed-results.jsonl (TTL ۱۰ دقیقه) و
 *     بازپخش خودکار در چرخه‌های بعد (پایان «پیامک آمد اما پاسخ برنگشت»).
 *   · gzip — بدنهٔ نتیجه > ۱KB فشرده و با Content-Encoding: gzip ارسال می‌شود؛
 *     امضا روی «همان بایت‌های فشردهٔ سیم» (قرارداد فاز ۶ سرور).
 *
 * سخت‌سازی میراثی (نسبت به نسل‌های قبلی — همه پابرجا):
 *   · PN-031-E: همگام‌سازی ساعت با سرور + خطای دقیق سرور + ضربان قلب
 *   · PN-031-G: پیش‌پرواز امضا (ts/sig خالی هرگز ارسال نمی‌شود) + missing
 *   · PN-031-I: HTTP/1.1 + UA بروزری + نردمان retry ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ + سقف
 *     نرخ ۵/۶۰ث + لاگ دیباگ redact-شده + نبض نسخه + مسیر جایگزین
 *
 * ویژگی‌های امنیتی داخلی اسکریپت (دفاع در عمق — عین سرور):
 *   · فقط https و فقط *.melketabriz.ir برای اجرای درخواست صف
 *   · پالایش روش (GET/POST/PUT/DELETE/PATCH) پیش از اجرا
 *   · امضای هر آیتم صف پیش از اجرا وارسی می‌شود (RELAY\nid\nmethod\nurl\nsha256(body)\nts)
 *   · صفر لاگ محتوا — فقط شمارنده و کد وضعیت
 *   · wake-lock Termux + امتناع از اجرا در محیط غیر Termux
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
# melka-relay — رلهٔ موبایل ملکا (نسل J · PN-035 · شورای عالی ملکا ۰۵۷)
# روی گوشی مالک (Poco F3 · Termux · IP ایرانی) اجرا می‌شود.
# این فایل را اجرا نکنید مگر اینکه از طریق «راه‌اندازی رله» در
# تنظیمات ملکا ساخته شده باشد — راز دستگاه داخلش است.
# نسل J: دسته‌ای batch=۱۰۰ · موج‌های موازی ۸تایی · نتیجهٔ دسته‌ای ·
#         retry×۳ + ذخیرهٔ محلی + gzip>۱KB · پالایش روش
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
ALT_FAIL_THRESHOLD=3               # سوئیچ به مسیر جایگزین پس از ۳ خطای پیاپی
PRIMARY_RECHECK_LOOPS=30           # هر ۳۰ چرخه، مسیر اصلی دوباره آزموده می‌شود

# ── ثابت‌های نسل J (PN-035) ──
BATCH=100                           # فاز ۵ — حداکثر آیتم هر poll
MAX_WORKERS=8                       # فاز ۵ — موج‌های کارگر موازی
RESULT_ATTEMPTS=3                   # فاز ۲ — تلاش‌های ارسال نتیجه
RESULT_BACKOFF=(2 6)                # فاز ۲ — مکث بین تلاش‌ها (۳تایی: ۲ و ۶)
GZIP_THRESHOLD=1024                 # فاز ۶ — فشرده‌سازی بدنه‌های بزرگ‌تر از ۱KB
FAILED_RESULTS="\$HOME/failed-results.jsonl"
FAILED_TTL_S=600                    # عمر ردیف نتیجهٔ ذخیره‌شده (۱۰ دقیقه)
FAILED_MAX_LINES=200                # سقف فایل نتیجه‌های ذخیره‌شده

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
cur_url() { printf '%s' "\${URLS[$URL_IDX]}"; }

# ── PN-031-I: سقف نرخ — حداکثر ۵ تماس سرور در ۶۰ ثانیه ──
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
  # $1 = مسیر روت · $2 = بدنهٔ خام (رشته) · $3.. = آرگومانهای curl بعدی
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
  curl --http1.1 -A "$UA" -sS -v --max-time 35 "\$(cur_url)$path" "$@" \\
    -H "X-Melka-Relay-Device: $DEVICE_ID" \\
    -H "X-Melka-Timestamp: $ts" \\
    -H "X-Melka-Signature: $sig" \\
    2> >(sed -u 's/^\\(> *X-Melka-Signature: \\).*/\\1<redacted>/; s/^\\(< *X-Melka-Signature: \\).*/\\1<redacted>/' >> "$RELAY_DEBUG" 2>/dev/null)
  local rc=$?
  debug_rotate
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
  # $1 = رشتهٔ JSON آرایهٔ نتیجه‌ها
  # خروجی: 0 = پذیرش سرور · 1 = شکست (ذخیره‌شده محلی)
  local payload="$1" attempt=0 delay out rc
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
      return 1
    fi
    # ۳) خطای گذرا (شبکه/دروازه/پاسخ غیرJSON) — تلاش مجدد با backoff
    if [ $attempt -lt $RESULT_ATTEMPTS ]; then
      delay="\${RESULT_BACKOFF[\$((attempt-1))]:-6}"
      log "ارسال نتیجه ناموفق (تلاش \$attempt/\$RESULT_ATTEMPTS · \$(curl_err_desc \$rc)) — \$delay ثانیه دیگر"
      sleep "$delay"
    fi
  done
  # شکست نهایی — ذخیرهٔ محلی + بازپخش در چرخه‌های بعد
  store_failed "$payload"
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
  # سقف فایل — فقط ۲۰۰ ردیف آخر می‌ماند
  [ -f "$FAILED_RESULTS" ] && tail -n "$FAILED_MAX_LINES" "$FAILED_RESULTS" > "\${FAILED_RESULTS}.tmp" 2>/dev/null && mv -f "\${FAILED_RESULTS}.tmp" "$FAILED_RESULTS" 2>/dev/null
  log "نتیجه‌ها در ~/failed-results.jsonl ذخیره شدند (بازپخش خودکار تا ۱۰ دقیقه)"
}

# ── PN-035 (فاز ۲): بازپخش نتیجه‌های ذخیره‌شدهٔ تازه ──
replay_failed_results() {
  [ -s "$FAILED_RESULTS" ] || return 0
  local now line lts payload kept=0 replayed=0
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
    if post_results "$payload"; then
      replayed=\$((replayed+1))
    else
      printf '%s\\n' "$line" >> "$tmp"
      kept=\$((kept+1))
    fi
  done < "$FAILED_RESULTS"
  mv -f "$tmp" "$FAILED_RESULTS" 2>/dev/null || true
  [ $replayed -gt 0 ] && log "بازیابی \$replayed دستهٔ نتیجهٔ ذخیره‌شده ✓"
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

# ── PN-035 (فاز ۱+۵): اجرای «یک» آیتم صف — کارگرِ موج ──
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
  local TMP HDR CODE CTYPE B64 CURL_EXIT
  TMP=\$(mktemp); HDR=\$(mktemp)
  AUTH=\$(printf '%s' "$item" | jq -r '.headers.authorization // empty')
  CT=\$(printf '%s' "$item" | jq -r '.headers["content-type"] // empty')
  ACC=\$(printf '%s' "$item" | jq -r '.headers["accept"] // empty')

  local ARGS=(-sS --max-time 25 -D "$HDR" -o "$TMP" -w '%{http_code}' -X "$RMETHOD")
  [ -n "$AUTH" ] && ARGS+=(-H "Authorization: $AUTH")
  [ -n "$CT" ] && ARGS+=(-H "Content-Type: $CT")
  [ -n "$ACC" ] && ARGS+=(-H "Accept: $ACC")
  if [ -n "$RBODY" ] && [ "$RMETHOD" != "GET" ] && [ "$RMETHOD" != "HEAD" ]; then
    ARGS+=(--data-binary "$RBODY")
  fi

  CODE=\$(curl "\${ARGS[@]}" "$RURL" 2>/dev/null)
  CURL_EXIT=$?

  if [ $CURL_EXIT -ne 0 ]; then
    jq -nc --arg id "$RID" --arg err "curl exit \$CURL_EXIT" '{id:\$id,error:\$err}' > "$outf"
  else
    CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r$/,"");print $2;exit}' "$HDR")
    [ -z "$CTYPE" ] && CTYPE=\$(awk 'tolower($1)=="content-type:"{sub(/\\r$/,"");\$1="";sub(/^ /,"");print;exit}' "$HDR")
    B64=\$(base64 -w0 "$TMP" 2>/dev/null || base64 "$TMP" | tr -d '\\n')
    jq -nc --arg id "$RID" --argjson code "\${CODE:-0}" --arg ct "$CTYPE" --arg b64 "$B64" '{id:\$id,httpStatus:\$code,contentType:\$ct,bodyB64:\$b64}' > "$outf"
  fi
  rm -f "$TMP" "$HDR"
}

SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0
log "رلهٔ ملکا آغاز شد (نسل J · PN-035) — دستگاه: $DEVICE_ID (در حال اتصال…)"
log "مسیر اصلی: $SERVER_URL"
[ "$URL_COUNT" -gt 1 ] && log "مسیر جایگزین: $ALT_SERVER_URL (سوئیچ خودکار پس از $ALT_FAIL_THRESHOLD خطای پیاپی)"
log "حمل‌ونقل: HTTP/1.1 · UA بروزری · نردبان ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ · سقف ۵ در دقیقه"
log "نسل J: دسته batch=$BATCH · موج‌های $MAX_WORKERS کارگر · نتیجه retry×$RESULT_ATTEMPTS + ذخیرهٔ محلی · gzip>$GZIP_THRESHOLD بایت"
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

  # ── فاز ۲: بازپخش نتیجه‌های ارسال‌نشدهٔ تازه (اگر هست) ──
  replay_failed_results

  # ضربان قلب — هر ۱۰ چرخه مالک می‌بیند رله زنده است
  if [ \$((LOOPS % 10)) -eq 0 ]; then
    log "زنده — چرخهٔ \$LOOPS · مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) · \$SERVED موفق / \$ERRORS خطا / \$BATCHES دسته"
  fi

  # ── فاز ۵: poll دسته‌ای — تا ۱۰۰ آیتم در هر تماس ──
  BODY="{\\"wait\\":20,\\"batch\\":$BATCH}"
  RESP=""; CURL_EXIT=0
  RESP=\$(signed_curl "/api/mobile-relay/poll" "$BODY" \\
    -X POST -H "Content-Type: application/json" --data-binary "$BODY") || CURL_EXIT=$?

  if [ $CURL_EXIT -ne 0 ]; then
    NET_FAILS=\$((NET_FAILS+1))
    local_idx=\$(( NET_FAILS < 4 ? NET_FAILS - 1 : 4 ))
    delay="\${RETRY_DELAYS[\$local_idx]:-300}"
    log "شبکه: curl خطای $CURL_EXIT (\$(curl_err_desc $CURL_EXIT)) — \$delay ثانیه دیگر تلاش می‌کنم (خطای پیاپی: \$NET_FAILS)"
    # سوئیچ مسیر جایگزین پس از ۳ خطای پیاپی (اگر موجود است)
    if [ "$URL_COUNT" -gt 1 ] && [ "$NET_FAILS" -ge "$ALT_FAIL_THRESHOLD" ] && [ "\$(( NET_FAILS % ALT_FAIL_THRESHOLD ))" -eq 0 ]; then
      URL_IDX=\$(( (URL_IDX + 1) % URL_COUNT ))
      log "سوئیچ به مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) — تلاش بعدی از آنجا"
    fi
    sleep "\$delay"; continue
  fi

  # خالی (204/شبکه) — ادامهٔ poll (سرور تا ۲۵ث معلق نگه داشت — «۱ ثانیه» فاصلهٔ تنفس)
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
    ERRMSG=\$(printf '%s' "$RESP" | jq -r '.error // empty' 2>/dev/null)
    MISSING=\$(printf '%s' "$RESP" | jq -r 'if (.missing // []) | length > 0 then (.missing | join("، ")) else empty end' 2>/dev/null)
    if [ -n "$ERRMSG" ]; then
      if [ -n "$MISSING" ]; then
        log "خطای سرور: \$ERRMSG — هدرهای نایافته: \$MISSING — ۳۰ ثانیه صبر"
      else
        log "خطای سرور: \$ERRMSG — ۳۰ ثانیه صبر"
      fi
    else
      log "پاسخ غیرمنتظره: \$(printf '%s' "$RESP" | head -c 160) — ۳۰ ثانیه صبر"
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
  N_ITEMS=\$(printf '%s' "$RESP" | jq '.items | length' 2>/dev/null)
  if [ -z "$N_ITEMS" ] || [ "\$N_ITEMS" = "0" ] || [ "\$N_ITEMS" = "null" ]; then
    ITEMS_JSON=\$(printf '%s' "$RESP" | jq -c '[.request] // []' 2>/dev/null)
  else
    ITEMS_JSON=\$(printf '%s' "$RESP" | jq -c '[.items[]]' 2>/dev/null)
  fi

  # ── فاز ۵: اجرای موجی — هر موج حداکثر $MAX_WORKERS کارگر موازی ──
  RESULTS_DIR=\$(mktemp -d)
  IDX=0; WAVE=0
  while IFS= read -r ITEM; do
    [ -z "$ITEM" ] && continue
    IDX=\$((IDX+1))
    # نام صفرپرشده — ترتیب glob با ترتیب عددی یکی می‌شود (دستهٔ نتیجه قطعی)
    process_item "$ITEM" "\$RESULTS_DIR/\$(printf '%04d' "\$IDX").json" &
    if [ \$(( IDX % MAX_WORKERS )) -eq 0 ]; then
      WAVE=\$((WAVE+1))
      wait
    fi
  done < <(printf '%s' "$ITEMS_JSON" | jq -c '.[]' 2>/dev/null)
  wait

  # ── جمع‌آوری نتیجه‌های موج — یک POST برای همه ──
  RESULT_JSON=""
  if compgen -G "\$RESULTS_DIR/*.json" >/dev/null 2>&1; then
    RESULT_JSON=\$(jq -sc '.' "\$RESULTS_DIR"/*.json 2>/dev/null || echo "")
  fi
  rm -rf "\$RESULTS_DIR"

  if [ -n "\$RESULT_JSON" ] && [ "\$RESULT_JSON" != "[]" ] && [ "\$RESULT_JSON" != "null" ]; then
    BATCHES=\$((BATCHES+1))
    # شمارش موفق/خطا از خودِ نتیجه‌ها (کارگرها فرزندند و شمارندهٔ پدر را نمی‌بینند)
    TOTALN=\$(printf '%s' "\$RESULT_JSON" | jq 'length')
    ERRN=\$(printf '%s' "\$RESULT_JSON" | jq '[.[] | select(.error != null and .error != "")] | length')
    SERVED=\$(( SERVED + TOTALN - ERRN ))
    ERRORS=\$(( ERRORS + ERRN ))
    post_results "\$RESULT_JSON"
    log "دسته اجراشده: \$TOTALN نتیجه در \$(( WAVE + 1 )) موج → \$ERRN خطا (مجموع: \$SERVED موفق / \$ERRORS خطا / \$BATCHES دسته)"
    # تنفس — حتی پس از رد قطعی، حلقه هرگز بدون مکث نمی‌چرخد (پنجهٔ محترمانه به دروازه)
    sleep 1
  else
    # هیچ نتیجه‌ای تولید نشد (آیتم‌های بی‌شناسه) — poll بعدی
    sleep 1
  fi
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
