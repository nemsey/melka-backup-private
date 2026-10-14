/**
 * مولد اسکریپت رلهٔ Termux — PN-031 (شورای ن۰۳۷) · سخت‌سازی PN-031-E (دستور مالک ۱۴۰۵/۰۷/۲۳)
 * ---------------------------------------------------------------------------
 * روت bootstrap این قالب را با پیکربندی دستگاه (SERVER_URL · DEVICE_ID ·
 * DEVICE_SECRET) پر می‌کند و به‌صورت text/x-shellscript تحویل می‌دهد.
 * مالک فقط یک بار آن را در Termux اجرا می‌کند — از آن پس حلقهٔ رله:
 *
 *   poll (امضاشده) → وارسی امضای سرور → whitelist میزبان → اجرای curl →
 *   result (امضاشده، body پایه۶۴) → تکرار
 *
 * سخت‌سازی PN-031-E (ریشه‌یابی «Bootstrap موفق، Poll ناموفق»):
 *   · همگام‌سازی ساعت با سرور (Date header) + اصلاح خودکار ts امضا —
 *     ریشهٔ خاموش «stale request» (اختلاف ساعت گوشی > ۵ دقیقه)
 *   · خطای دقیق سرور نمایش داده می‌شود (error از JSON پاسخ) — نه «غیرمنتظره»ی مبهم
 *   · خطای شبکه با کد curl و توضیح فارسی — تایم‌اوت/اتصال/TLS دیگر خاموش نیست
 *   · ضربان قلب هر ۱۰ چرخه — مالک می‌بیند رله زنده است
 *   · در رد stale از serverTime پاسخ سرور برای اصلاح فوری آفست استفاده می‌شود
 *
 * نکتهٔ پیاده‌سازی: متن bash داخل template literal است؛ هر "\${" به‌صورت
 * "\\${" escape شده تا تعبیر جاوااسکریپت نشود.
 *
 * ویژگی‌های امنیتی داخلی اسکریپت (دفاع در عمق — عین سرور):
 *   · فقط https و فقط *.melketabriz.ir — هیچ مقصد دیگری اجرا نمی‌شود
 *   · امضای هر آیتم صف پیش از اجرا وارسی می‌شود (RELAY\nid\nmethod\nurl\nsha256(body)\nts)
 *   · صفر لاگ محتوا — فقط شمارنده و کد وضعیت
 *   · wake-lock Termux (بقا در پس‌زمینه) + امتناع از اجرا در محیط غیر Termux
 */

export interface RelayScriptConfig {
  serverUrl: string;
  deviceId: string;
  deviceSecret: string;
}

export function buildRelayScript(cfg: RelayScriptConfig): string {
  // هر سه مقدار تزریقی از کاراکترهای خاص bash عاری‌سازی می‌شوند (تزریق فرمان را ناممکن می‌کند)
  const safe = (s: string) => s.replace(/[^A-Za-z0-9:\/._-]/g, "");
  const serverUrl = safe(cfg.serverUrl).replace(/\/+$/, "");
  const deviceId = safe(cfg.deviceId);
  const deviceSecret = safe(cfg.deviceSecret);

  return `#!/usr/bin/env bash
# ============================================================
# melka-relay — رلهٔ موبایل ملکا (PN-031 · شورای عالی ملکا ۰۳۷)
# روی گوشی مالک (Poco F3 · Termux · IP ایرانی) اجرا می‌شود.
# این فایل را اجرا نکنید مگر اینکه از طریق «راه‌اندازی رله» در
# تنظیمات ملکا ساخته شده باشد — راز دستگاه داخلش است.
# ============================================================
set -u

SERVER_URL="${serverUrl}"
DEVICE_ID="${deviceId}"
DEVICE_SECRET="${deviceSecret}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# وابستگی‌ها — فقط بار اول (Termux)
need_cmd() { command -v "$1" >/dev/null 2>&1; }
if ! need_cmd curl || ! need_cmd openssl || ! need_cmd jq; then
  if need_cmd pkg; then
    log "نصب وابستگی‌ها (بار اول — چند دقیقه صبر کنید)…"
    pkg install -y curl openssl jq || { log "نصب ناموفق — Termux را ببندید و دوباره باز کنید"; exit 1; }
  else
    log "این اسکریپت برای Termux ساخته شده (pkg یافت نشد)"
    exit 1
  fi
fi

# بقا در پس‌زمینه (MIUI) — بدون خطا اگر نبود
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null && log "قفل بیداری فعال شد (شارژر توصیه می‌شود)"

sha256hex() { openssl dgst -sha256 -hex | sed 's/^.*= //'; }
hmac_hex() { openssl dgst -sha256 -hmac "$DEVICE_SECRET" -hex | sed 's/^.*= //'; }

# ── PN-031-E: همگام‌سازی ساعت با سرور ──
# ریشهٔ خاموش شکست Poll: اختلاف ساعت گوشی با سرور بیش از ۵ دقیقه →
# «stale request» بدون هیچ ردپا. آفست محاسبه و در امضا اعمال می‌شود.
CLOCK_OFFSET=0
sync_clock() {
  local HDR T SERVER_EPOCH LOCAL_EPOCH
  HDR=\$(mktemp)
  curl -sSI --max-time 10 -D "$HDR" -o /dev/null "$SERVER_URL/api/health" 2>/dev/null || { rm -f "$HDR"; return 1; }
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
    6) echo "نام سرور حل نشد (DNS)" ;;
    7) echo "سرور اتصال را نپذیرفت" ;;
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
  curl -sS --max-time 35 "$@" \\
    -H "X-Melka-Relay-Device: $DEVICE_ID" \\
    -H "X-Melka-Timestamp: $ts" \\
    -H "X-Melka-Signature: $sig"
}

SERVED=0; ERRORS=0; LOOPS=0
log "رلهٔ ملکا فعال است — دستگاه: $DEVICE_ID"
log "سرور: $SERVER_URL"
sync_clock && log "ساعت با سرور همگام شد ✓" || log "همگام‌سازی ساعت سرور ممکن نشد — ادامه با ساعت محلی"

while true; do
  LOOPS=\$((LOOPS+1))
  # ضربان قلب — هر ۱۰ چرخه (~۳٫۵ دقیقه) مالک می‌بیند رله زنده است
  if [ \$((LOOPS % 10)) -eq 0 ]; then
    log "زنده — چرخهٔ $LOOPS · $SERVED موفق / $ERRORS خطا"
  fi

  BODY='{"wait":20}'
  RESP=""; CURL_EXIT=0
  RESP=\$(signed_curl "/api/mobile-relay/poll" "$BODY" \\
    -X POST -H "Content-Type: application/json" --data-binary "$BODY" 2>/dev/null) || CURL_EXIT=$?

  if [ $CURL_EXIT -ne 0 ]; then
    log "شبکه: curl خطای $CURL_EXIT (\$(curl_err_desc $CURL_EXIT)) — ۵ ثانیه دیگر تلاش می‌کنم"
    sleep 5; continue
  fi

  # خالی (204/شبکه) — ادامهٔ poll
  [ -z "$RESP" ] && { sleep 1; continue; }

  OK=\$(printf '%s' "$RESP" | jq -r '.ok // empty' 2>/dev/null)
  if [ "$OK" != "true" ]; then
    # PN-031-E — دلیل دقیق رد سرور نمایش داده می‌شود (نه «غیرمنتظره»ی مبهم)
    ERRMSG=\$(printf '%s' "$RESP" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$ERRMSG" ]; then
      log "خطای سرور: $ERRMSG — ۳۰ ثانیه صبر"
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
    -X POST -H "Content-Type: application/json" --data-binary "$RESULT_JSON" 2>/dev/null) || {
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
  return `pkg install -y curl openssl jq && curl -fsSL "${url}/api/mobile-relay/bootstrap?code=${code}" -o ~/melka-relay.sh && chmod 600 ~/melka-relay.sh && bash ~/melka-relay.sh`;
}
