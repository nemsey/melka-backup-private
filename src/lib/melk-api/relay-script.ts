/**
 * مولد اسکریپت رلهٔ Termux — … نسل Q = DIR-SUPER-STRUCT-001 (دستور مالک ۲۰۲۶-۱۱-۲۵ ·
 * «کدنصب فوق پیشرفته + هماهنگی کامل با فهرست‌های چهارگانه»):
 *   · نصب یکپارچه (قلاب طلایی): مالک فقط همان یک فایل bootstrap را اجرا می‌کند؛
 *     خودش core-relay و watchdog را در ~/melka-relay می‌نویسد و راه می‌اندازد.
 *   · ارکستراتور tmux: دو سشن مجازی (melka-relay + melka-watchdog) — کرش یکی
 *     هرگز دیگری را نمی‌کشد؛ بدون tmux → nohup + سرپرایز درونی (پشتیبان عقبه).
 *   · watchDog: هر ۱۵ث پروسهٔ رله را وارسی/بازآید می‌کند + هر ۳۰ث ضربان قلب
 *     (heartbeat) امضاشده به /api/mobile-relay/heartbeat می‌فرستد؛ سه ضربان
 *     غایب = داشبورد ملکا هشدار «رلهٔ ترموکس قطع شده است» می‌دهد.
 *   · صف آفلاین SQLite (offline-queue.db): قطع اینترنت (502/شبکه) دیگر یعنی
 *     «ذخیره و ادامه» — نه کرش؛ بازپخش خودکار به‌محض بازگشت (پشتیبان jsonl عقبه).
 *   · ACK ردیفی: سرور برای هر نتیجهٔ دسته حکم صادر می‌کند (.results[].ok) —
 *     فقط آیتم‌های دیده‌شده از انبار حذف می‌شوند (مانع سردرگمی ریست سرور).
 *   · مانیفست کار: پاسخ poll فیلد manifest دارد — بنر «دستور کار جاری» روی
 *     ترموکس می‌گوید مغز (فهرست‌ها) در کدام لایه (P0/P1) است (صرفاً اطلاعات).
 *   · حالت مخفی‌کاری: فیلد stealth سرور نرخ ARM انسانی می‌گوید (مثلاً ۲۰/دقیقه
 *     = هر ~۳ث) + جیتار — تسلیم در حالت تمام‌ظرفیت (ظرفیت مقدم است).
 *   نسل‌های قدیمی فیلدهای manifest/stealth را بی‌صدا نادیده می‌گیرند (عقبه کامل).
 * نسل R = DIR-RELAY-ULTRA-001 (دستور مالک ۲۰۲۶-۱۱-۲۶ · گام اول):
 *   آمار زندهٔ دریافت/ارسال پیام — خط «📊 آمار» حداکثر هر ۳۰ث در همهٔ حالت‌ها
 *   (شمارنده‌های تازهٔ MSG_RECV/MSG_SENT) + بقا در stats.json + ابزار status.sh
 *   (مالک در هر لحظه بدون tmux آمار کامل می‌بیند) + راهنمای مشاهده در کدنصب.
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
 * نسل O = DIR-CHANGES-TILE-001 (۲۰۲۶-۱۱-۱۹): حالت تمام‌ظرفیت کاشی تغییرات —
 *   پرچم boost در پاسخ poll → poll میان‌موجی ۵ث ← ۲ث + مسیر اکسپرس کنش‌های تغییر.
 * نسل P = DIR-RELAY-ARMFENCE-001 (۲۰۲۶-۱۱-۲۱): حاکم تطبیقی ARM — سقف نرخ ۶۰/۱۲۰ ·
 *   همزمانی تطبیقی ۲..۱۶ · قطع هوشمند بن (Retry-After یا دوبرابرشونده تا ۱۸۰ث) ·
 *   AIMD نزولی سریع/صعودی تدریجی. همهٔ خطاها = توقف/کاهش موقت، هرگز خروج.
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
# melka-relay — رلهٔ موبایل ملکا (نسل Q · DIR-SUPER-STRUCT-001 · ۲۰۲۶-۱۱-۲۵)
# روی گوشی مالک (Poco F3 · Termux · IP ایرانی) اجرا می‌شود.
# این فایل را اجرا نکنید مگر اینکه از طریق «راه‌اندازی رله» در
# تنظیمات ملکا ساخته شده باشد — راز دستگاه داخلش است.
# نسل N: بی‌توقف (سرپرایز خود‌ریستار · خروج فقط با ابطال مالک یا Ctrl+C) ·
#         استخر پویای ۱۶+۸ کارگر · نتیجهٔ جریانی موج‌به‌موج · poll میان‌موجی ·
#         سقف نرخ ۲۰/دقیقه (نسل M: ۵) · batch=۴۸ (نسل M: ۲۴) · بدون محدودیت حجم
# نسل O = DIR-CHANGES-TILE-001 (۲۰۲۶-۱۱-۱۹): حالت تمام‌ظرفیت کاشی تغییرات (boost) —
#         poll میان‌موجی ۵ث ← ۲ث + مسیر اکسپرس کنش‌های تغییر کد + بنر اختصاص ظرفیت.
# نسل P = DIR-RELAY-ARMFENCE-001 (۲۰۲۶-۱۱-۲۱): حاکم تطبیقی ARM — سقف نرخ ۶۰/۱۲۰ ·
#         همزمانی ۲..۱۶ · قطع بن Retry-After/دوبرابرشونده تا ۱۸۰ث · AIMD.
# نسل Q = DIR-SUPER-STRUCT-001 (۲۰۲۶-۱۱-۲۵): قلاب طلایی (هسته + نگهبان دو-سشنی
#         tmux/nohup) · ضربان قلب ۳۰ث · مانیفست کار + مخفی‌کاری سرور-آگاه ·
#         صف آفلاین SQLite + ACK ردیفی (بسته‌های ۱۰۰تایی).
# نسل R = DIR-RELAY-ULTRA-001 (۲۰۲۶-۱۱-۲۶): آمار زندهٔ دریافت/ارسال پیام — خط
#         «📊 آمار» هر ≤۳۰ث در همهٔ حالت‌ها + بقا در stats.json + ابزار status.sh.
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
EXPRESS_POLL_S_BOOST=2              # نسل O: فاصلهٔ poll میان‌موجی در «حالت تمام‌ظرفیت» کاشی تغییرات
BOOST_MODE=0                        # نسل O: ۱ = حالت تمام‌ظرفیت (پرچم boost سرور) · ۰ = عادی
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

# ── نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۳/ج): صف آفلاین + ACK + مخفی‌کاری ──
OFFLINE_DB="\$HOME/melka-relay/offline-queue.db"   # صف آفلاین SQLite (پشتیبان: jsonl بالا)
OFFLINE_TTL_S=3600                 # عمر ردیف صف آفلاین (۱ ساعت)
OFFLINE_DRAIN_MAX=100              # سقف بازپخش هر چرخه (بسته‌های ۱۰۰تایی — عین دستور)
STEALTH=0                          # حالت مخفی‌کاری خاموش (سرور با فیلد stealth روشن می‌کند)
STEALTH_RATE=20                    # سقف انسانی نرخ ARM در مخفی‌کاری (۲۰/دقیقه = هر ~۳ث)
STEALTH_JITTER=20                  # جیتار ±۲۰٪ روی فاصلهٔ تماس‌ها (رفتار انسانی)
LAST_MANIFEST=""                   # نسل Q: مانیفست کار — آخرین بنر «دستور کار جاری» (تغییر = چاپ یک‌باره)
POST_SEEN=""                       # نسل Q: ACK — شناسه‌های نتیجه‌هایی که سرور حکمشان را داد
POST_ACKED=""                      # نسل Q: ACK — شناسه‌های پذیرفته‌شده (ok=true)
POST_REJ=""                       # نسل Q: ACK — شناسه‌های رد قطعی (ok=false)
LAST_ARM_CALL_MS=0                 # نسل Q: زمان آخرین تماس ARM (گام انسانی مخفی‌کاری)
# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً — «دستور نصب فوق پیشرفته»): آمار زنده ──
MSG_RECV=0                          # شمار پیام‌های دریافتی از سرور (آیتم‌های صف رله)
MSG_SENT=0                          # شمار درخواست‌های اجراشده به مقصد (نتیجه‌دار)
STATS_EVERY_S=30                    # حداکثر فاصلهٔ چاپ خط «📊 آمار» (در همهٔ حالت‌ها)
LAST_STATS=0                        # زمان آخرین چاپ آمار (throttle)

# ── نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۲): ارکستراتور دو-سشنی ──
MELKA_HOME="\$HOME/melka-relay"      # پوشهٔ نصب: هسته + نگهبان + صف آفلاین + pid
RELAY_PID_FILE="\$MELKA_HOME/relay.pid"  # pid هسته — نگهبان هر ۱۵ث آن را وارسی می‌کند
STATS_FILE="\$MELKA_HOME/stats.json"    # DIR-RELAY-ULTRA-001: بقا آمار برای status.sh
WD_SPAWNED=0                         # ۱ = نگهبان مستقل راه افتاده (ضربان ۳۰ث از اوست)

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

# ── نسل P (DIR-RELAY-ARMFENCE-001): حاکم تطبیقی ARM — پالایهٔ WAF/بن/سهمیه ──
# درس اسکرین‌شات مالک: نرخ ۳۰۰/دقیقه در تمام‌ظرفیت → WAF ۴۰۳ + بن تشدیدی
# (۱۰←۲۰←۴۰←۸۰←۱۲۰ث) + ۴۲۰/۴۲۳ → آیتم‌ها fail → ۵۰۲ کاشی‌ها. سه اهرم:
ARM_RATE_MAX=60                     # سقف تماس ARM در دقیقه — حالت عادی
ARM_RATE_MAX_BOOST=120              # سقف تماس ARM در دقیقه — حالت تمام‌ظرفیت
ARM_RATE_MIN=15                     # کف نرخ ARM پس از تشدید بن
ARM_RATE_CURRENT=60                 # نرخ جاری (تطبیقی — با سلامت بازمی‌گردد)
ARM_CONC=6                          # همزمانی جاری ARM (تطبیقی: شروع محافظه‌کار)
ARM_CONC_MAX=16                     # سقف همزمانی ARM در سلامت کامل
ARM_CONC_MIN=2                      # کف همزمانی (حتی در جنگ با WAF دوتایی می‌ماند)
ARM_WAF_COOLDOWN_UNTIL=0            # زمان پایان قطع فعلی ARM (epoch ثانیه)
ARM_WAF_BAN_BASE=20                 # برآورد نخستین بن (ث) وقتی سرور مدت نداد
ARM_WAF_BAN_MAX=180                 # سقف قطع ARM (زیر TTL صف ۳۰۰ث — آیتم نابالغ نمی‌سوزد)
ARM_WAF_STREAK=0                    # بن‌های پیاپی (برآورد تشدیدی ۲^n)
ARM_402_QUOTA_BASE=30               # برآورد قطع سهمیهٔ ۴۰۲ (پرداخت/سهمیه ARM)
ARM_HEALTHY_STREAK=0                # پاسخ‌های سالم پیاپی — بازگشت تدریجی نرخ/همزمانی
ARM_REQ_TIMES=()                    # پنجرهٔ نرخ سمت ARM (جدا از پنجرهٔ سرور)

# ── نسل P: چرخهٔ نرخ سمت ARM (جدا از rate_gate سرور) ──
arm_rate_gate() {
  # \$1 = URL آیتم — تعاملی (OTP) معاف است: پاسخ چندثانیه‌ای، بی‌کم‌وکاست
  [ -n "\${1:-}" ] && is_interactive "\$1" && return 0
  local now t keep oldest wait_s
  now=\$(date +%s)
  keep=()
  for t in \${ARM_REQ_TIMES[@]+"\${ARM_REQ_TIMES[@]}"}; do
    [ \$(( now - t )) -lt 60 ] && keep+=("$t")
  done
  ARM_REQ_TIMES=("\${keep[@]+"\${keep[@]}"}")
  if [ "\${#ARM_REQ_TIMES[@]}" -ge "\$ARM_RATE_CURRENT" ]; then
    oldest="\${ARM_REQ_TIMES[0]}"
    wait_s=\$(( 60 - (now - oldest) + 1 ))
    if [ "$wait_s" -gt 0 ]; then
      sleep "$wait_s"
    fi
    now=\$(date +%s)
    keep=()
    for t in \${ARM_REQ_TIMES[@]+"\${ARM_REQ_TIMES[@]}"}; do
      [ \$(( now - t )) -lt 60 ] && keep+=("$t")
    done
    ARM_REQ_TIMES=("\${keep[@]+"\${keep[@]}"}")
  fi
  ARM_REQ_TIMES+=("$now")
  # ── نسل Q (بخش ج-۴ · مخفی‌کاری): گام انسانی بین تماس‌های ARM ──
  # سرور با فیلد stealth نرخ انسانی می‌گوید (مثلاً ۲۰/دقیقه = هر ~۳ث)؛ جیتار
  # درصدی رفتار را از «ضربان ساعت» به «کاربر انسانی» می‌برد. در حالت
  # تمام‌ظرفیت (BOOST) تسلیم می‌شود — ظرفیت مقدم است (طرح دستور مالک).
  if [ "$STEALTH" -eq 1 ] && [ "$BOOST_MODE" -eq 0 ]; then
    local gap j since sleep_s
    gap=$(( 60000 / STEALTH_RATE ))
    [ "$gap" -lt 1500 ] && gap=1500
    j=$(( (RANDOM % (2 * STEALTH_JITTER + 1)) - STEALTH_JITTER ))
    gap=$(( gap * (100 + j) / 100 ))
    since=$(( $(date +%s%3N) - LAST_ARM_CALL_MS ))
    if [ "$since" -lt "$gap" ]; then
      sleep_s=$(awk -v r=$(( gap - since )) 'BEGIN { printf "%.2f", r / 1000 }')
      sleep "$sleep_s"
    fi
    LAST_ARM_CALL_MS=$(date +%s%3N)
  fi
}

# ── نسل P: آیا ARM در قطع بن است؟ (خروجی: ثانیهٔ باقی‌ماندهٔ قطع) ──
arm_cooldown_left() {
  local now left
  now=\$(date +%s)
  left=\$(( ARM_WAF_COOLDOWN_UNTIL - now ))
  [ "$left" -lt 0 ] && left=0
  printf '%s' "$left"
}

# ── نسل P: ضربهٔ WAF — ۴۰۳/۴۲۰/۴۲۳ (بن/قفل) یا ۴۰۲ (سهمیه) از ARM ──
# تشدید دوبرابرشونده: هر بن پیاپی قطع را دوبرابر می‌کند (تا سقف) — عین نردمان
# بن‌های واقعی اراون‌کلود در اسکرین‌شات مالک (۱۰←۲۰←۴۰←۸۰←۱۲۰ث).
# اولین پاسخ سالم پس از قطع، تشدید را نصف می‌کند (بازگشت آرام).
arm_waf_hit() {
  # $1 = کد (403/420/423/402) · $2 = Retry-After سرور (ثانیه · ۰ = نداد)
  local code="$1" ra="\${2:-0}" left
  # در قطع فعال: تشدید نکن — ۴۰۳های درحال‌پروازِ همان موج پژواکند، نه بن تازه؛
  # فقط کف همزمانی/نرخ که در همین ضربه اعمال شده کافی است (ضد تشدید کاذب).
  left="\$(arm_cooldown_left)"
  [ "\$left" -gt 0 ] && return 0
  ARM_WAF_STREAK=\$((ARM_WAF_STREAK+1))
  local ban=\$(( ARM_WAF_BAN_BASE * 2 ** (ARM_WAF_STREAK - 1) ))
  [ "$ban" -gt "$ARM_WAF_BAN_MAX" ] && ban=$ARM_WAF_BAN_MAX
  if [ "\$ra" -gt 0 ] && [ "\$ra" -gt "\$ban" ]; then ban="\$ra"; fi
  [ "$code" = "402" ] && [ "$ban" -gt "\$ARM_402_QUOTA_BASE" ] && ban=\$ARM_402_QUOTA_BASE
  ARM_WAF_COOLDOWN_UNTIL=\$(( \$(date +%s) + ban ))
  # نزول سریع (AIMD نزولی): نرخ نصف + همزمانی سقوط به کف
  ARM_RATE_CURRENT=\$(( ARM_RATE_CURRENT / 2 ))
  [ "\$ARM_RATE_CURRENT" -lt "\$ARM_RATE_MIN" ] && ARM_RATE_CURRENT=\$ARM_RATE_MIN
  ARM_CONC=\$ARM_CONC_MIN
  ARM_HEALTHY_STREAK=0
  left="$(arm_cooldown_left)"
  if [ "$code" = "402" ]; then
    log "🛑 ARM سهمیه/پرداخت را رد کرد (402) — قطع \$banث + نرخ ← \$ARM_RATE_CURRENT/دقیقه (پیاپی: \$ARM_WAF_STREAK · بدون توقف)"
  else
    log "🛑 WAF اراون‌کلود IP را بست (\$code · پیاپی: \$ARM_WAF_STREAK) — قطع \$banث + نرخ ← \$ARM_RATE_CURRENT/دقیقه + همزمانی ← \$ARM_CONC (بدون توقف)"
  fi
}

# ── نسل P: پاسخ سالم ARM — بازگشت تدریجی (AIMD صعودی) ──
arm_healthy() {
  ARM_HEALTHY_STREAK=\$((ARM_HEALTHY_STREAK+1))
  # هر ۱۰ پاسخ سالم پیاپی: تشدید بن نصف + نرخ +۱۵ + همزمانی +۱ (تا سقفها)
  if [ "\$(( ARM_HEALTHY_STREAK % 10 ))" -eq 0 ]; then
    [ "\$ARM_WAF_STREAK" -gt 0 ] && ARM_WAF_STREAK=\$(( ARM_WAF_STREAK / 2 ))
    ARM_RATE_CURRENT=\$(( ARM_RATE_CURRENT + 15 ))
    local cap=\$ARM_RATE_MAX
    [ "\$BOOST_MODE" -eq 1 ] && cap=\$ARM_RATE_MAX_BOOST
    [ "\$ARM_RATE_CURRENT" -gt "\$cap" ] && ARM_RATE_CURRENT=\$cap
    ARM_CONC=\$(( ARM_CONC + 1 ))
    [ "\$ARM_CONC" -gt "\$ARM_CONC_MAX" ] && ARM_CONC=\$ARM_CONC_MAX
  fi
}

# ── نسل P: انتظار تا پایان قطع بن — پیش از برداشتن کار جدید ──
# حین قطع poll جدیدی زده نمی‌شود (آیتمِ نابالغ از صف برداشته نمی‌شود تا TTL
# نسوزد)؛ هر ۳۰ث یک ضربان تا مالک بداند رله زنده است و فقط منتظر WAF است.
arm_wait_cooldown() {
  local left="$(arm_cooldown_left)" waited=0
  [ "$left" -eq 0 ] && return 0
  log "⏳ انتظار \$left ثانیه تا پایان بن ARM — آیتم جدید برداشته نمی‌شود (رله زنده است · بدون توقف)"
  while [ "$(arm_cooldown_left)" -gt 0 ]; do
    sleep 2
    waited=\$((waited+2))
    if [ "\$(( waited % 30 ))" -eq 0 ]; then
      log "⏳ بن ARM: \$(arm_cooldown_left) ثانیه مانده — رله زنده است (نرخ بازیابی: \$ARM_RATE_CURRENT/دقیقه)"
    fi
  done
  log "✓ بن ARM پایان یافت — از سر گیری با نرخ \$ARM_RATE_CURRENT/دقیقه و همزمانی \$ARM_CONC"
}

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

# ── DIR-RELAY-ULTRA-001 (گام اول · ثالثاً+رابعاً): خط آمار زندهٔ دریافت/ارسال پیام ──
# ریشهٔ شکایت مالک: «در ترموکس آمار دریافت و ارسال پیام نشان داده نمی‌شود» —
# پیش‌تر تنها خط «زنده» هر ۱۰ چرخه (~۸ دقیقه در بیکاری) چاپ می‌شد و هیچ شمارندهٔ
# پیام دریافتی/درخواست ارسالی وجود نداشت. اکنون: خط «📊 آمار» مستقل، حداکثر هر
# \$STATS_EVERY_S ثانیه، در همهٔ حالت‌ها (بیکاری · موج اجرا · بن WAF · خطای شبکه)
# + بقا در stats.json + ابزار status.sh برای مشاهدهٔ هر زمان بدون tmux.
stats_line() {
  local now up
  now=\$(date +%s)
  [ \$(( now - LAST_STATS )) -lt \$STATS_EVERY_S ] && return 0
  LAST_STATS=\$now
  up=\$(( now - RELAY_START_TS )); [ "\$up" -lt 0 ] && up=0
  log "📊 آمار: دریافت \$MSG_RECV پیام · ارسال \$MSG_SENT درخواست · تحویل \$SERVED نتیجه · خطا \$ERRORS · \$BATCHES دسته · چرخه \$LOOPS · آنلاین \$(printf '%02d:%02d' \$(( up / 3600 )) \$(( (up % 3600) / 60 ))) · حاکم ARM: نرخ \$ARM_RATE_CURRENT/دقیقه · همزمانی \$ARM_CONC · مسیر \$( [ \$URL_IDX -eq 0 ] && echo اصلی || echo جایگزین )"
  printf '{"ts":%s,"startTs":%s,"recv":%s,"sent":%s,"served":%s,"errors":%s,"batches":%s,"loops":%s,"rate":%s,"conc":%s,"boost":%s,"stealth":%s}\\n' \\
    "\$now" "\$RELAY_START_TS" "\$MSG_RECV" "\$MSG_SENT" "\$SERVED" "\$ERRORS" "\$BATCHES" "\$LOOPS" "\$ARM_RATE_CURRENT" "\$ARM_CONC" "\$BOOST_MODE" "\$STEALTH" > "\$STATS_FILE.tmp" 2>/dev/null && mv -f "\$STATS_FILE.tmp" "\$STATS_FILE" 2>/dev/null || true
  return 0
}

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

# نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۳): صف آفلاین SQLite — بهترین-تلاش؛
# نبودش فاجعه نیست (پشتیبان jsonl نسل‌های قبل برقرار است) و هرگز نصب را نمی‌شکند.
if ! need_cmd sqlite3 && need_cmd pkg; then
  pkg install -y sqlite >/dev/null 2>&1 || true
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
  POST_SEEN=""; POST_ACKED=""; POST_REJ=""
  while [ $attempt -lt $RESULT_ATTEMPTS ]; do
    attempt=\$((attempt+1))
    out=""; rc=0
    out=\$(submit_batch_raw "$payload") || rc=$?
    # ۱) پذیرش — سرور ok گفت؛ نسل Q (بخش ج-۳ · ACK ردیفی): حکم هر نتیجهٔ دسته
    # در .results[] است — فقط ردیف‌های دیده‌شده از انبارها حذف می‌شوند (مانع
    # سردرگمی ریست سرور). قرارداد قدیمی (بدون .results) = کل بسته حکم گرفت.
    if [ $rc -eq 0 ] && printf '%s' "$out" | jq -e '.ok == true' >/dev/null 2>&1; then
      POST_SEEN=$(printf '%s' "$out" | jq -r '[.results[]?.id] | join(" ")' 2>/dev/null)
      POST_ACKED=$(printf '%s' "$out" | jq -r '[.results[]? | select(.ok == true) | .id] | join(" ")' 2>/dev/null)
      POST_REJ=$(printf '%s' "$out" | jq -r '[.results[]? | select(.ok != true) | .id] | join(" ")' 2>/dev/null)
      return 0
    fi
    # ۲) رد قطعی سرور (پاسخ JSON با فیلد ok) — تلاش مجدد بی‌فایده است؛
    # نسل Q: حکم‌های ردیفی (.results[].ok=false) همین‌جا برمی‌گردند تا بازپخش
    # فقط ردیف‌های بدون‌حکم را نگه دارد (بازپخش بی‌پایان ردشده ممنوع — PN-036).
    if [ $rc -eq 0 ] && printf '%s' "$out" | jq -e 'has("ok")' >/dev/null 2>&1; then
      POST_SEEN=\$(printf '%s' "$out" | jq -r '[.results[]?.id] | join(" ")' 2>/dev/null)
      POST_ACKED=\$(printf '%s' "$out" | jq -r '[.results[]? | select(.ok == true) | .id] | join(" ")' 2>/dev/null)
      POST_REJ=\$(printf '%s' "$out" | jq -r '[.results[]? | select(.ok != true) | .id] | join(" ")' 2>/dev/null)
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
    # نسل Q (بخش ب-۳): اولویت صف آفلاین SQLite (بومی گوشی — offline-queue.db)؛
    # نبود sqlite3 → پشتیبان jsonl عقبه (نسل‌های قبل) — هیچ نسل قدیمی عوض نمی‌شود.
    offline_store "$payload" || store_failed "$payload"
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

# ═══════════════════════════════════════════════════════════════════════════
# نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۳): صف آفلاین SQLite — «ذخیره و ادامه»
# قطع اینترنت (502/شبکه) دیگر کرش نیست: نتیجه‌ها در offline-queue.db درون
# گوشی می‌مانند و به‌محض بازگشت اتصال، در بسته‌های ۱۰۰تایی بازپخش می‌شوند.
# حذف فقط با حکم سرور (ACK ok=true یا رد قطعی ok=false) — «تا ملکا تاییدیه
# ندهد، بستهٔ بعدی نمی‌رود» (بخش ج-۳ دستور). پشتیبان عقبه: failed-results.jsonl
# نسل‌های قبل (نبود sqlite3) — دو مسیر هم‌زیست، هرگز جایگزینی.
# ═══════════════════════════════════════════════════════════════════════════
offline_db_ready() {
  [ -n "$OFFLINE_DB" ] && need_cmd sqlite3
}
offline_init() {
  sqlite3 "$OFFLINE_DB" 'CREATE TABLE IF NOT EXISTS pending (id TEXT PRIMARY KEY, payload TEXT NOT NULL, ts INTEGER NOT NULL)' >/dev/null 2>&1
}
# ذخیرهٔ یک دستهٔ نتیجه در صف آفلاین — هر ردیف با کلید id (تکرار = جایگزینی)
offline_store() {
  # $1 = رشتهٔ JSON آرایهٔ نتیجه‌ها
  offline_db_ready && offline_init || return 1
  local ts obj id idesc pesc
  ts=\$(date +%s)
  while IFS= read -r obj; do
    [ -z "$obj" ] && continue
    id=\$(printf '%s' "$obj" | jq -r '.id // empty' 2>/dev/null)
    [ -z "$id" ] && continue
    idesc=\$(printf '%s' "$id" | sed \"s/'/''/g\")
    pesc=\$(printf '%s' "$obj" | sed \"s/'/''/g\")
    sqlite3 "$OFFLINE_DB" "INSERT OR REPLACE INTO pending(id,payload,ts) VALUES('\$idesc','\$pesc',\$ts)" >/dev/null 2>&1 || return 1
  done < <(printf '%s' "\$1" | jq -c '.[]' 2>/dev/null)
  log "🥡 صف آفلاین: نتیجه‌های ارسال‌نشده درون گوشی ذخیره شد (بازپخش خودکار با بازگشت اتصال — بسته‌های \$OFFLINE_DRAIN_MAX تایی)"
  return 0
}
# حذف ردیف‌هایی که سرور حکمشان را داد (ACK/رد قطعی) — شناسه‌ها از سمت سرورند
offline_delete_ids() {
  [ "\$#" -gt 0 ] || return 0
  offline_db_ready && [ -f "\$OFFLINE_DB" ] || return 0
  local ids="" id
  for id in "\$@"; do
    [ -z "\$id" ] && continue
    ids+="'\$(printf '%s' "\$id" | sed \"s/'/''/g\")',"
  done
  [ -n "\$ids" ] || return 0
  ids="\${ids%,}"
  sqlite3 "\$OFFLINE_DB" "DELETE FROM pending WHERE id IN (\$ids)" >/dev/null 2>&1 || true
}
# بازپخش صف آفلاین — بسته‌های ۱۰۰تایی؛ فقط ردیف‌های دارای حکم حذف می‌شوند
offline_replay() {
  offline_db_ready && [ -f "\$OFFLINE_DB" ] || return 0
  local now n rows payload rc batch_ids
  now=\$(date +%s)
  sqlite3 "\$OFFLINE_DB" "DELETE FROM pending WHERE ts < \$(( now - OFFLINE_TTL_S ))" >/dev/null 2>&1 || true
  n=\$(sqlite3 "\$OFFLINE_DB" "SELECT COUNT(*) FROM pending" 2>/dev/null)
  [ -z "\$n" ] || [ "\$n" = "0" ] && return 0
  rows=\$(sqlite3 -separator \$'\\t' "\$OFFLINE_DB" "SELECT id, payload FROM pending ORDER BY ts LIMIT \$OFFLINE_DRAIN_MAX" 2>/dev/null)
  [ -z "\$rows" ] && return 0
  payload=\$(printf '%s\\n' "\$rows" | cut -f2- | jq -sc '.' 2>/dev/null)
  batch_ids=\$(printf '%s\\n' "\$rows" | cut -f1)
  [ -n "\$payload" ] && [ "\$payload" != "[]" ] || return 0
  log "🥡 صف آفلاین: بازپخش تا \$OFFLINE_DRAIN_MAX ردیف (از \$n ذخیره‌شده — بسته‌بندی ۱۰۰تایی عین دستور مالک)"
  post_results "\$payload" "nostore"
  rc=\$?
  if [ "\$rc" -eq 0 ]; then
    if [ -n "\$POST_ACKED" ] || [ -n "\$POST_REJ" ]; then
      # ACK ردیفی: حذف دقیقاً همان‌هایی که حکم گرفتند — باقی برای چرخهٔ بعد
      offline_delete_ids \$POST_ACKED \$POST_REJ
      log "🥡 صف آفلاین: ACK دریافت شد — ردیف‌های دیده‌شده حذف شدند (حکم‌دارها)"
    else
      # قرارداد قدیمی (بدون .results) — کل بسته پذیرفته شد
      offline_delete_ids \$batch_ids
      log "🥡 صف آفلاین: کل بسته پذیرفته شد (ACK قرارداد قدیمی)"
    fi
  elif [ "\$rc" -eq 2 ]; then
    if [ -n "\$POST_REJ" ]; then
      offline_delete_ids \$POST_REJ
    else
      offline_delete_ids \$batch_ids
    fi
    log "🥡 صف آفلاین: رد قطعی — ردیف‌های ردشده حذف شدند (بازپخش بی‌پایان ممنوع)"
  else
    log "🥡 صف آفلاین: اتصال هنوز برنگشته — ردیف‌ها برای چرخهٔ بعد می‌مانند (رله زنده است)"
  fi
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

  # ── نسل P (DIR-RELAY-ARMFENCE-001): گیت نرخ ARM — در والد (process_set) ──
  # اجرا می‌شود، نه اینجا: کارگرها fork هستند و متغیرهای حاکم در فرزند
  # از بین می‌روند (درس معماری bash). اینجا فقط اجرای خود درخواست است.

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
    # ── نسل P: پالایهٔ WAF/سهمیهٔ ARM — ۴۰۳/۴۲۰/۴۲۳ (بن اراون‌کلود) و ۴۰۲ ──
    # درس اسکرین‌شات مالک: بدون این پالایه آیتم بعدی بی‌درنگ شلیک می‌شد و بن
    # تشدید می‌شد (۱۰←۲۰←۴۰←۸۰←۱۲۰ث). اکنون: قطع کل ARM + نصف نرخ + سقوط
    # همزمانی؛ آیتم با دلیل شفاف رد می‌شود (سرور TTL خودش را می‌بَرد).
    case "\$CODE" in
      403|420|423|402)
        RA=\$(awk 'tolower(\$1)=="retry-after:"{sub(/\\r\$/,"");print \$2;exit}' "$HDR" 2>/dev/null)
        case "\${RA:-}" in ""|*[!0-9]*) RA=0 ;; esac
        # نسل P: فایل نشان برای والد — کارگر fork است و متغیرهای حاکم اینجا از بین
        # می‌روند؛ والد (process_set) در چرخهٔ خود نشان را می‌خواند و arm_waf_hit
        # را در زمینهٔ خودش اجرا می‌کند (قطع/نصف نرخ/سقوط همزمانی معتبر می‌ماند).
        printf '%s\\n' "\$CODE \$RA" > "\$(dirname "\$outf")/.waf-strike" 2>/dev/null || true
        jq -nc --arg id "$RID" --arg err "arm waf \$CODE (ban \${RA}s)" '{id:\$id,error:\$err}' > "$outf"
        rm -f "$TMP" "$HDR" "$B64F"
        return 0
        ;;
    esac
    log "✓ \$RMETHOD \${RPATH#https://} → HTTP \$CODE در \${DUR}ث (پاسخ سالم — شمارش در drain والد)"
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
    MSG_SENT=\$(( MSG_SENT + \${totaln:-0} ))
    log "جریان نتیجه: \${totaln:-0} مورد → \${errn:-0} خطا (مجموع: دریافت \$MSG_RECV · ارسال \$MSG_SENT · تحویل \$SERVED · خطا \$ERRORS / \$BATCHES دسته)"
    # نسل P: پاسخ‌های سالم ARM در والد شمرده می‌شوند — فرزندان state ندارند؛
    # بازگشت تدریجی نرخ/همزمانی (هر ۱۰ سالم: +۱۵ نرخ · +۱ همزمانی)
    OKN=\$(printf '%s' "$payload" | jq '[.[] | select((.httpStatus // 0) >= 200 and (.httpStatus // 0) < 300)] | length' 2>/dev/null)
    _ok_i=0
    while [ "\$_ok_i" -lt "\${OKN:-0}" ]; do arm_healthy; _ok_i=\$((_ok_i+1)); done
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

# ── نسل P: مصرف نشان ضربهٔ WAF — در والد (state معتبر) ──
consume_waf_marker() {
  # \$1 = پوشهٔ انبار
  local m="\${1:-}/.waf-strike" wcode wra
  [ -f "\$m" ] || return 0
  # read با rc=1 هم متغیرها را پر می‌کند (EOF بدون newline) — شکست rc مرگبار نیست
  read -r wcode wra < "\$m" 2>/dev/null || true
  rm -f "\$m"
  [ -n "\$wcode" ] || return 0
  arm_waf_hit "\$wcode" "\${wra:-0}"
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
  # Express lane (PN-036 فاز ۵ + PN-080 + نسل O DIR-CHANGES-TILE-001):
  # OTP/ثبت مقدم بر فهرست‌های سنگین — کنش‌های «تغییرات کدآگهی/کد درخواست»
  # همیشه اکسپرس. DIR-CHANGES-EXEC-001: خانواده‌های TILE-002 (properties/owner ·
  # users/update|info|delete · request-events/update|delete|list · requests/info)
  # هم‌ردهٔ اکسپرس — عین relayPriorityForUrl سرور (هم‌راستایی دو سمت).
  printf '%s' "$items_json" | jq -c '.[] | select((.url // "") | test("/authentication/otp|/properties/create|/users/create|/users/info/mobile-number|/users/update/|/users/info/|/users/delete/|/requests/create|/requests/update/|/requests/info/|/request-events/create|/request-events/update/|/request-events/delete/|/request-events/list|/properties/update/|/properties/info/by-code/|/properties/owner/"))' >> "$QUEUE" 2>/dev/null
  printf '%s' "$items_json" | jq -c '.[] | select(((.url // "") | test("/authentication/otp|/properties/create|/users/create|/users/info/mobile-number|/users/update/|/users/info/|/users/delete/|/requests/create|/requests/update/|/requests/info/|/request-events/create|/request-events/update/|/request-events/delete/|/request-events/list|/properties/update/|/properties/info/by-code/|/properties/owner/")) | not)' >> "$QUEUE" 2>/dev/null
  LAST_FLUSH=\$(date +%s)
  LAST_EXPRESS=\$(date +%s)
  while :; do
    stats_line
    # ── نسل P (DIR-RELAY-ARMFENCE-001): گیت قطع بن WAF ──
    # حین بن: شروع آیتم تازه ممنوع (درحال‌پروازها تمام می‌شوند، نتیجه‌ها
    # تخلیه می‌شوند، poll جدیدی آیتم نمی‌کشد تا TTL صف نسوزد)؛ پژواک‌های
    # ۴۰۳ِ درحال‌پرواز تشدید نمی‌کنند (arm_waf_hit خودش گارد دارد).
    if [ "\$(arm_cooldown_left)" -gt 0 ]; then
      drain_spool "$SPOOL_DIR"
      consume_waf_marker "$SPOOL_DIR"
      sleep 3
      continue
    fi
    # ── نسل P: همزمانی تطبیقی — سقف استخر = ARM_CONC (نه ۲۴ ثابت؛ درس بن) ──
    while [ -s "$QUEUE" ] && [ "\$(active_jobs)" -lt "$ARM_CONC" ]; do
      ITEM=\$(head -n 1 "$QUEUE")
      sed -i '1d' "$QUEUE" 2>/dev/null
      [ -z "$ITEM" ] && continue
      MSG_RECV=\$((MSG_RECV+1))
      # نسل P: گیت نرخ ARM در والد — کارگران fork هستند؛ اینجا زنجیرهٔ نرخ
      # واحد و معتبر است (جدا از گیت سرور؛ تعاملی/OTP معاف).
      IURL=\$(printf '%s' "$ITEM" | jq -r '.url // empty' 2>/dev/null)
      arm_rate_gate "$IURL"
      process_item_spool "$ITEM" "$SPOOL_DIR" &
    done
    BUSY=\$(active_jobs)
    drain_spool "$SPOOL_DIR"
    consume_waf_marker "$SPOOL_DIR"
    if [ "$BUSY" -eq 0 ] && [ ! -s "$QUEUE" ]; then
      break
    fi
    # poll میان‌موجی — فقط وقتی ظرفیت آزاد هست (آیتم برداشته سرگردان نمی‌شود)
    NOW=\$(date +%s)
    # نسل O: در حالت تمام‌ظرفیت (کاشی تغییرات) فاصلهٔ poll میان‌موجی ۵ث ← ۲ث
    EP_NOW=\$(( BOOST_MODE == 1 ? EXPRESS_POLL_S_BOOST : EXPRESS_POLL_S ))
    if [ \$(( NOW - LAST_EXPRESS )) -ge "\$EP_NOW" ] && [ "\$(active_jobs)" -lt "$ARM_CONC" ]; then
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
    stats_line

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
    # نسل Q (بخش ب-۳): بازپخش صف آفلاین SQLite — بسته‌های \$OFFLINE_DRAIN_MAX تایی؛
    # ردیف فقط با حکم ACK سرور حذف می‌شود (تا ملکا تاییدیه ندهد، بستهٔ بعدی نمی‌رود).
    offline_replay

    # ضربان قلب — هر ۱۰ چرخه مالک می‌بیند رله زنده است
    if [ \$((LOOPS % 10)) -eq 0 ]; then
      log "زنده — چرخهٔ \$LOOPS · مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ) · دریافت \$MSG_RECV / ارسال \$MSG_SENT / تحویل \$SERVED · خطا \$ERRORS / \$BATCHES دسته · حاکم ARM: نرخ \$ARM_RATE_CURRENT/دقیقه · همزمانی \$ARM_CONC · بن‌های پیاپی \$ARM_WAF_STREAK"
    fi
    # ── نسل Q (بخش ج-۱ · ضربان پشتیبان): اگر نگهبان مستقل راه نیفتاد (نه tmux و
    # نه fork)، خود حلقهٔ اصلی هر چرخه (~≥۵۰ث) یک ضربان امضاشده می‌فرستد — سرور
    # با پنجرهٔ سه-ضربان (۹۰ث) «زنده» قضاوت می‌کند؛ هزینه: ~۱ تماس در هر چرخه.
    if [ "\$WD_SPAWNED" -ne 1 ]; then
      BEAT_BODY="{\"alive\":true,\"restarts\":\$SUP_RESTARTS}"
      signed_curl "/api/mobile-relay/heartbeat" "\$BEAT_BODY" \
        -X POST -H "Content-Type: application/json" --data-binary "\$BEAT_BODY" >/dev/null 2>&1 || true
    fi

    # ── نسل P (DIR-RELAY-ARMFENCE-001): حین قطع بن ARM، poll نزن ──
    # poll = برداشتن آیتم جدید از صف سرور؛ اگر نتوانیم اجرایش کنیم، TTL ۳۰۰ث
    # سرور می‌سوزدش و کاشی ۵۰۲ می‌گیرد. پس تا پایان بن صبر می‌کنیم (با ضربان)
    # — سپس با نرخ/همزمانی بازیابی‌شده ادامه می‌دهیم. سرور در همین حین از
    # مسیر مستقیم (سرور خودش) هر چه تواند می‌کند — صف رله فقط مسیر تقویتی است.
    arm_wait_cooldown

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
    # ── DIR-RELAY-ACTIVATE-001 (گام اول): نخستین Poll موفق (خالی یا پر — اعم از صف شلوغ)
    # یعنی «رله فعال شد» — این خط یک‌بار چاپ می‌شود و کدنصب همان لحظه در ترموکس
    # مالک تصدیب می‌گیرد (watch_relay_activation در دستور نصب همین عبارت را می‌جوید).
    if [ "\$CONNECT_OK" -eq 0 ]; then
      CONNECT_OK=1
      log "✓ اتصال تأیید شد — رلهٔ ملکا فعال است (مسیر \$( [ $URL_IDX -eq 0 ] && echo اصلی || echo جایگزین ))"
    fi
    # ── نسل O (DIR-CHANGES-TILE-001): پرچم boost — «حالت تمام‌ظرفیت» کاشی تغییرات ──
    # سرور وقتی کاشی تغییرات فعال است boost=true برمی‌گرداند: poll میان‌موجی
    # تندتر (۲ث) + بنر یک‌بارهٔ اختصاص ظرفیت؛ پایان حالت هم با همین پرچم اعلام می‌شود.
    BOOST_SEEN=\$(printf '%s' "$RESP" | jq -r '.boost // false' 2>/dev/null)
    if [ "\$BOOST_SEEN" = "true" ] && [ "\$BOOST_MODE" -eq 0 ]; then
      BOOST_MODE=1
      log "⚡ حالت تمام‌ظرفیت کاشی تغییرات فعال شد — تمام ظرفیت این گوشی به ایجاد/تغییر کدآگهی و کد درخواست اختصاص یافت (poll میان‌موجی ۲ث)"
    elif [ "\$BOOST_SEEN" != "true" ] && [ "\$BOOST_MODE" -eq 1 ]; then
      BOOST_MODE=0
      log "حالت تمام‌ظرفیت کاشی تغییرات پایان یافت — بازگشت به سلوک عادی رله"
    fi
    # ── نسل Q (بخش ج-۲ · مانیفست کار): مغز (فهرست‌ها) به دست‌ها می‌گوید در
    # کدام لایه است — بنر «دستور کار جاری» فقط هنگام تغییر چاپ می‌شود (صرفاً
    # اطلاعات؛ دستور اجرایی همیشه آیتم امضاشدهٔ صف است — رله تصمیم‌گیر نیست).
    MNOTE=\$(printf '%s' "\$RESP" | jq -r '.manifest.note // empty' 2>/dev/null)
    if [ -n "\$MNOTE" ] && [ "\$MNOTE" != "\$LAST_MANIFEST" ]; then
      LAST_MANIFEST="\$MNOTE"
      log "📋 \$MNOTE"
    fi
    # ── نسل Q (بخش ج-۴ · مخفی‌کاری): پروفایل سرور نرخ انسانی ARM را می‌گوید
    # (مثلاً ۲۰/دقیقه = هر ~۳ث) + جیتار درصدی — ترافیک شبیه کاربر انسانی.
    # در حالت تمام‌ظرفیت تسلیم می‌شود (ظرفیت مقدم است — طرح دستور مالک).
    ST_EN=\$(printf '%s' "\$RESP" | jq -r '.stealth.enabled // false' 2>/dev/null)
    if [ "\$ST_EN" = "true" ]; then
      ST_RATE=\$(printf '%s' "\$RESP" | jq -r '.stealth.ratePerMin // 20' 2>/dev/null)
      ST_JIT=\$(printf '%s' "\$RESP" | jq -r '.stealth.jitterPct // 20' 2>/dev/null)
      case "\$ST_RATE" in ""|*[!0-9]*) ST_RATE=20 ;; esac
      case "\$ST_JIT" in ""|*[!0-9]*) ST_JIT=20 ;; esac
      if [ "\$STEALTH" -ne 1 ]; then
        log "🕶 حالت مخفی‌کاری فعال شد (دستور سرور): نرخ ARM انسانی \$ST_RATE/دقیقه + جیتار ±\$ST_JIT٪ — در حالت تمام‌ظرفیت تسلیم می‌شود"
      fi
      STEALTH=1
      STEALTH_RATE=\$ST_RATE
      STEALTH_JITTER=\$ST_JIT
    elif [ "\$STEALTH" -eq 1 ]; then
      STEALTH=0
      log "حالت مخفی‌کاری خاموش شد (سرور) — نرخ به حاکم تطبیقی ARM بازگشت"
    fi
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

SERVED=0; ERRORS=0; LOOPS=0; CONNECT_OK=0; BATCHES=0; MSG_RECV=0; MSG_SENT=0; LAST_STATS=0; RELAY_START_TS=\$(date +%s)
log "رلهٔ ملکا آغاز شد (نسل Q · DIR-SUPER-STRUCT-001 · قلاب طلایی: هسته + نگهبان دو-سشنی · صف آفلاین SQLite · ACK ردیفی · مانیفست و مخفی‌کاری سرور-آگاه · استخر \$MAX_WORKERS+\$EXPRESS_SLOTS کارگر · بی‌توقف · حالت تمام‌ظرفیت‌آگاه) — دستگاه: $DEVICE_ID (در حال اتصال…)"
log "مسیر اصلی: $SERVER_URL"
[ "$URL_COUNT" -gt 1 ] && log "مسیر جایگزین: $ALT_SERVER_URL (سوئیچ خودکار پس از $ALT_FAIL_THRESHOLD خطای پیاپی)"
log "قانون بی‌توقف: خطاهای شبکه/دروازه/احراز هرگز رله را نمی‌کشند — تنها ابطال مالک (داشبورد) یا Ctrl+C."
log "برای ساعت‌ها کار بدون توقف: اندروید → تنظیمات → برنامه‌ها → Termux → باتری → «بدون محدودیت» + در Recentها قفل کنید."
log "حمل‌ونقل: HTTP/1.1 · نردمان شبکه ۳۰/۶۰/۱۲۰/۳۰۰/۳۰۰ · دروازه 502/503/429/403: تاخیر تطبیقی \$GATEWAY_RETRY_DELAY تا \$GATEWAY_BACKOFF_MAXث (AIMD) · سقف \$RATE_MAX در دقیقه"
log "نسل N: batch=\$BATCH · استخر \$MAX_WORKERS+\$EXPRESS_SLOTS کارگر · نتیجهٔ جریانی (موج‌به‌موج) · poll میان‌موجی هر \$EXPRESS_POLL_Sث · مهلت OTP=\$LIGHT_TIMEOUTث / فهرست=\$LIST_TIMEOUTث / سنگین=\$HEAVY_TIMEOUTث · رفع jq ARG_MAX (--rawfile + stdin)"
log "لاگ دیباگ: ~/relay-debug.log (هدرها؛ مقدار امضا حذف می‌شود)"
log "نسل Q: نگهبان \$MELKA_HOME/watchdog.sh · صف آفلاین \$OFFLINE_DB (نبود sqlite3 → failed-results.jsonl) · ضربان قلب هر ۳۰ث به /api/mobile-relay/heartbeat"
log "احراز: X-Melka-Relay-Device + X-Melka-Timestamp + X-Melka-Signature"
log "نسل R (DIR-RELAY-ULTRA-001): خط «📊 آمار» حداکثر هر \$STATS_EVERY_S ثانیه چاپ می‌شود · مشاهدهٔ آمار هر زمان: bash \$MELKA_HOME/status.sh · بقا در \$STATS_FILE"
sync_clock && log "ساعت با سرور همگام شد ✓" || log "همگام‌سازی ساعت سرور ممکن نشد — ادامه با ساعت محلی"
LAST_CLOCK_SYNC=\$(date +%s)

# ═══════════ نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۲ + ج-۱): قلاب طلایی محلی ═══════════
# هستهٔ رله خودش نگهبان را می‌سازد و در سشن مستقل (tmux melka-watchdog · پشتیبان
# nohup) راه می‌اندازد — مالک هیچ پیچیدگی چندفایلی نمی‌بیند. دو پروسهٔ مستقل:
# کرش یکی هرگز دیگری را نمی‌کشد؛ نگهبان هر ۱۵ث هسته را وارسی/بازآید می‌کند و
# هر ۳۰ث ضربان قلب امضاشده به /api/mobile-relay/heartbeat می‌فرستد — سه ضربان
# غایب = داشبورد ملکا هشدار «رلهٔ ترموکس قطع شده است» می‌دهد (عین دستور مالک).
mkdir -p "\$MELKA_HOME" 2>/dev/null || true
# خود-نصب (قلاب طلایی): اگر هسته از بیرونِ پوشهٔ نصب اجرا شد، همین نسخه را در
# \$MELKA_HOME/core-relay.sh کپی می‌کند تا بازآید نگهبان همیشه مسیر پایدار داشته باشد.
if [ -f "\$0" ] && [ "\$0" != "\$MELKA_HOME/core-relay.sh" ]; then
  cp -f "\$0" "\$MELKA_HOME/core-relay.sh" 2>/dev/null || true
fi
printf '%s\\n' "\$\$" > "\$RELAY_PID_FILE" 2>/dev/null || true

# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً): ابزار status.sh — آمار در هر لحظه ──
# مالک بدون اتصال tmux با «bash ~/melka-relay/status.sh» آمار دریافت/ارسال +
# آخرین خطوط رله را می‌بیند — پاسخ مستقیم به «آمار نشان داده نمی‌شود».
cat > "\$MELKA_HOME/status.sh" <<'STATUS_EOF'
#!/usr/bin/env bash
# status.sh — DIR-RELAY-ULTRA-001 — نمایش آمار رلهٔ ملکا (هر زمان قابل اجرا)
set -u
D="\$(cd "\$(dirname "\$0")" 2>/dev/null && pwd)"
[ -n "\$D" ] || D="\$HOME/melka-relay"
echo "═══════ آمار رلهٔ ملکا (\$(date '+%H:%M:%S')) ═══════"
if [ -r "\$D/stats.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    jq -r '"پیام دریافتی از سرور: \\(.recv)\\nدرخواست ارسالی به آرم: \\(.sent)\\nنتیجهٔ تحویل‌شده به سرور: \\(.served)\\nخطا: \\(.errors)\\nدستهٔ نتیجه: \\(.batches)\\nچرخه: \\(.loops)\\nنرخ جاری ARM: \\(.rate)/دقیقه\\nهمزمانی ARM: \\(.conc)\\nآخرین به‌روزرسانی آمار: \\(.ts)"' "\$D/stats.json"
  else
    cat "\$D/stats.json"
  fi
else
  echo "آمار هنوز ساخته نشده — رله در حال راه‌اندازی است؛ چند ثانیه دیگر دوباره بزنید."
fi
RP=""
[ -r "\$D/relay.pid" ] && RP=\$(cat "\$D/relay.pid" 2>/dev/null)
if [ -n "\$RP" ] && kill -0 "\$RP" 2>/dev/null; then
  echo "وضعیت هستهٔ رله: زنده (pid \$RP)"
else
  echo "وضعیت هستهٔ رله: pid یافت نشد (نگهبان در حال بازآید است یا راه‌اندازی اولیه)"
fi
echo "──── آخرین ۱۲ خط رله ────"
if command -v tmux >/dev/null 2>&1 && tmux has-session -t melka-relay 2>/dev/null; then
  tmux capture-pane -p -t melka-relay -S -12 2>/dev/null | tail -n 12
fi
[ -f "\$D/relay.log" ] && tail -n 12 "\$D/relay.log" 2>/dev/null
[ -f "\$D/relay-restarts.log" ] && tail -n 12 "\$D/relay-restarts.log" 2>/dev/null
echo "──── نمای زنده: tmux attach -t melka-relay (خروج Ctrl+b سپس d) · لاگ: tail -f \$D/relay.log ────"
STATUS_EOF
chmod 700 "\$MELKA_HOME/status.sh" 2>/dev/null || true

spawn_watchdog() {
  umask 077
  # پیکربندی مشترک — نگهبان از device.env می‌خواند (راز فقط در گوشی می‌ماند؛
  # مقادیر از پیکربندی همین هسته در زمان نصب نوشته می‌شوند)
  cat > "\$MELKA_HOME/device.env" <<ENV_EOF
SERVER_URL='\$SERVER_URL'
DEVICE_ID='\$DEVICE_ID'
DEVICE_SECRET='\$DEVICE_SECRET'
UA='\$UA'
ENV_EOF
  # نگهبان — heredoc نقل‌شده: هیچ جانشینی در زمان نوشتن؛ همهٔ متغیرها
  # زمانِ اجرای خود نگهبان ارزیابی می‌شوند (نصب صفر-تزریق، تولید صادقانه)
  cat > "\$MELKA_HOME/watchdog.sh" <<'WD_EOF'
#!/usr/bin/env bash
# watchdog.sh — نسل Q (DIR-SUPER-STRUCT-001 · بخش ب-۲/ج-۱) — تولید توسط هستهٔ رله
# هر ۱۵ث: وارسی زنده‌بودن هسته (relay.pid) + بازآید خودکار · هر ۳۰ث: ضربان قلب
# امضاشده به /api/mobile-relay/heartbeat. سشن مستقل: کرش هسته، نگهبان را نمی‌کشد.
set -u
WD_DIR="\$(cd "\$(dirname "\$0")" 2>/dev/null && pwd)"
if [ -r "\$WD_DIR/device.env" ]; then . "\$WD_DIR/device.env" 2>/dev/null; else exit 0; fi
if [ -z "\${SERVER_URL:-}" ] || [ -z "\${DEVICE_ID:-}" ] || [ -z "\${DEVICE_SECRET:-}" ]; then exit 0; fi
RELAY_PID_FILE="\$WD_DIR/relay.pid"
CORE_RELAY="\$WD_DIR/core-relay.sh"
UA_W="\${UA:-Mozilla/5.0}"
WD_RESTARTS=0
WD_ITER=0
CLOCK_OFFSET=0
WD_LAST_SYNC=0
log_w() { echo "[\$(date '+%H:%M:%S')] [نگهبان] \$*"; }
sha256hex_w() { openssl dgst -sha256 -hex 2>/dev/null | sed 's/^.*= //'; }
hmac_hex_w() { openssl dgst -sha256 -hmac "\$DEVICE_SECRET" -hex 2>/dev/null | sed 's/^.*= //'; }
sync_clock_w() {
  local now hdr t se
  now=\$(date +%s)
  [ \$(( now - WD_LAST_SYNC )) -lt 900 ] && return 0
  WD_LAST_SYNC=\$now
  hdr=\$(mktemp)
  curl --http1.1 -A "\$UA_W" -sSI --max-time 12 -D "\$hdr" -o /dev/null "\$SERVER_URL/api/health" 2>/dev/null || { rm -f "\$hdr"; return 0; }
  t=\$(awk 'tolower(\$1)=="date:"{\$1="";sub(/^ /,"");sub(/\\r\$/,"");print;exit}' "\$hdr")
  rm -f "\$hdr"
  [ -z "\$t" ] && return 0
  se=\$(date -d "\$t" +%s 2>/dev/null) || return 0
  CLOCK_OFFSET=\$(( (se - \$(date +%s)) * 1000 ))
  return 0
}
wd_heartbeat() {
  # \$1 = زنده‌بودن هستهٔ رله (true/false) — بدنهٔ کوچک؛ خرج شبکه ~صفر
  local body ts digest sig
  body="{\\"alive\\":\$1,\\"restarts\\":\$WD_RESTARTS}"
  ts=\$(( \$(date +%s%3N) + CLOCK_OFFSET ))
  digest=\$(printf '%s' "\$body" | sha256hex_w)
  sig=\$(printf 'POST\\n/api/mobile-relay/heartbeat\\n%s\\n%s' "\$digest" "\$ts" | hmac_hex_w)
  [ -z "\$ts" ] || [ -z "\$sig" ] && return 0
  curl --http1.1 -A "\$UA_W" -sS --max-time 12 "\$SERVER_URL/api/mobile-relay/heartbeat" \\
    -X POST -H "Content-Type: application/json" --data-binary "\$body" \\
    -H "X-Melka-Relay-Device: \$DEVICE_ID" \\
    -H "X-Melka-Timestamp: \$ts" \\
    -H "X-Melka-Signature: \$sig" >/dev/null 2>&1 || true
}
log_w "نگهبان رلهٔ ملکا آغاز شد (نسل Q) — وارسی ۱۵ث · بازآید خودکار · ضربان قلب ۳۰ث"
while true; do
  WD_ITER=\$((WD_ITER+1))
  sync_clock_w
  RP=""
  [ -r "\$RELAY_PID_FILE" ] && RP=\$(cat "\$RELAY_PID_FILE" 2>/dev/null)
  ALIVE=false
  [ -n "\$RP" ] && kill -0 "\$RP" 2>/dev/null && ALIVE=true
  if [ "\$ALIVE" != "true" ] && [ -f "\$CORE_RELAY" ]; then
    WD_RESTARTS=\$((WD_RESTARTS+1))
    log_w "هستهٔ رله زنده نیست — بازآید خودکار شمارهٔ \$WD_RESTARTS …"
    ( cd "\$WD_DIR" 2>/dev/null; setsid nohup bash "\$CORE_RELAY" >> "\$WD_DIR/relay-restarts.log" 2>&1 & ) >/dev/null 2>&1
    sleep 5
    continue
  fi
  # ضربان هر دو چرخه (۱۵ث × ۲ = ۳۰ث) — عین دستور مالک؛ پیام صرفاً «من زنده‌ام»
  [ \$(( WD_ITER % 2 )) -eq 0 ] && wd_heartbeat "\$ALIVE"
  sleep 15
done
WD_EOF
  # تک‌نمونه: اگر نگهبان از قبل زنده است، دوباره نمی‌سازیم (بازآید هسته با
  # pid و فایل‌ها همتا می‌شود؛ دوباره-spawn نگهبان ممنوع)
  if pgrep -f "melka-relay/watchdog.sh" >/dev/null 2>&1; then
    WD_SPAWNED=1
    return 0
  fi
  chmod 700 "\$MELKA_HOME/watchdog.sh" 2>/dev/null || true
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s melka-watchdog "bash '\$MELKA_HOME/watchdog.sh'" >/dev/null 2>&1 && WD_SPAWNED=1
  fi
  if [ "\$WD_SPAWNED" -ne 1 ]; then
    ( setsid nohup bash "\$MELKA_HOME/watchdog.sh" >> "\$MELKA_HOME/watchdog.log" 2>&1 & ) >/dev/null 2>&1
    WD_SPAWNED=1
  fi
}
spawn_watchdog
if [ "\$WD_SPAWNED" -eq 1 ]; then
  log "🐶 نگهبان مستقل رله راه افتاد (نسل Q): وارسی ۱۵ث + بازآید خودکار + ضربان قلب ۳۰ث — دو سشن مستقل (tmux ls)"
else
  log "⚠️ نگهبان مستقل راه نیفتاد — حلقهٔ اصلی خودش ضربان پشتیبان می‌زند (نسل Q)"
fi

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

/** دستور نصب قلاب طلایی نسل Q که مالک در Termux پیست می‌کند
 *  DIR-SUPER-STRUCT-001 (دستور مالک ۲۰۲۶-۱۱-۲۵ · بخش ب — «دست‌های اجرایی»):
 *  «اسکریپت نصب یک فایل bootstrap ساده است که خودش فایل‌های core-relay و
 *  watchdog را در پس‌زمینه دانلود و اجرا می‌کند» — پیاده‌سازی صادقانه با یک
 *  دانلود: قلاب طلایی هسته را می‌گیرد؛ هستهٔ کامل (همین قالب) خودش نگهبان را
 *  می‌سازد و در سشن جدا راه می‌اندازد → کد ثبت فقط یک بار مصرف می‌شود (۲/۳
 *  باقی می‌ماند برای تلاش‌های نصب) و نبود شبکه در لحظهٔ دومین فایل، نصب را
 *  نمی‌شکند (درس قلاب طلایی DIR-RELAY-ARMFENCE: زیرساخت قلاب طلایی باید زنده بماند).
 *    ۱) نصب وابستگی‌ها با ۲ تلاش (sqlite/tmux اختیاری — سلوک عقبه: jsonl/nohup)
 *    ۲) دانلود bootstrap با تا ۱۲ تلاش و فاصلهٔ صعودی (۵←۳۰ث) — پنجرهٔ کل
 *       ~۳.۵ دقیقه؛ رستاخیز کامل سرور (~۱۵۰ث) را پوشش می‌دهد → «ریست سرور»
 *       دیگر نصب را نمی‌شکند (کد ثبت هم معتبر می‌ماند — کد تازه لازم نیست)
 *    ۳) تشخیص وضعیت HTTP: 502/503/429 = «سرور در حال ریست/رستاخیز — صبر» ·
 *       403/404 = «کد منقضی/نامعتبر» با پیام تمایز‌یافته (توقف زودهنگام بی‌مورد ممنوع)
 *    ۴) وارسی سلامت فایل (shebang + حداقل حجم + غیر-HTML) — فایل ناقص اجرا نمی‌شود
 *    ۵) تعویض تمیز: نمونه‌های قدیمی (هسته/نگهبان/مسیر قدیمی ~/melka-relay.sh) با اطلاع متوقف می‌شوند
 *    ۶) ارکستراتور tmux: دو سشن مجازی مستقل (melka-relay + melka-watchdog که
 *       هسته خودش می‌سازد) — کرش یکی، دیگری زنده؛ بدون tmux → setsid nohup
 *    ۷) شکست نهایی → پیام شفاف «همین دستور را دوباره بزنید» (نه «کد جدید» —
 *       کد فقط با ابطال از داشبورد می‌میرد؛ درس درس‌آموخته)
 *
 * DIR-RELAY-ACTIVATE-001 (گام اول مالک ۲۰۲۶-۱۱-۲۶ · «کدنصب تولید شده، رلهٔ ترموکس را
 * فعال نمی‌کند») — چهار ترمیم ریشه‌ای:
 *    ۸) پاسخ ۴۰۳ روت bootstrap «قرارداد JSON» دارد (reason: used/limit/expired/
 *       invalid/revoked) — کدنصب اکنون بدنهٔ پاسخ را می‌خواند و «کد سوخته» را
 *       با پیام دقیق همان‌جا اعلام می‌کند؛ دیگر ۱۲ بار ~۴ دقیقه به‌خاطر یک رد
 *       قطعی تلاش نمی‌کند (تنها خطاهای گذِرا retry می‌شوند).
 *    ۹) reason=used (کد قبلاً نصب شده) + هستهٔ محلی موجود → «احیای محلی»:
 *       بی‌نیاز از کد تازه، همان core-relay.sh روی گوشی (راز دستگاه درونش است)
 *       با تعویض تمیز دوباره راه می‌افتد — مالک هرگز گیر «کد تازه بگیر» نمی‌شود.
 *   ۱۰) تصدیب tmux: پس از tmux new-session با has-session وارسی می‌شود؛ شکست →
 *       nohup (پیش‌تر خطای tmux بی‌صدا «نصب موفق» جعلی چاپ می‌کرد).
 *   ۱۱) تماشای فعال‌سازی: تا ۱۵۰ث خروجی زندهٔ رله (tmux capture-pane / relay.log)
 *       بررسی می‌شود تا خط «✓ اتصال تأیید شد — رلهٔ ملکا فعال است» ظاهر شود —
 *       کدنصب خودش «رله فعال شد» را با شاهد چاپ می‌کند یا صادقانه علت را.
 *
 * DIR-RELAY-ULTRA-001 (دستور مالک ۲۰۲۶-۱۱-۲۶ · گام اول — «دستور نصب فوق پیشرفته»):
 *   شناخت فراژرف تمام اجزا + ریشهٔ «آمار دریافت/ارسال پیام در ترموکس نمایش داده
 *   نمی‌شود»: تنها خط وضعیت هر ~۸ دقیقه در بیکاری چاپ می‌شد و هیچ شمارندهٔ پیام
 *   دریافتی/درخواست ارسالی وجود نداشت. رفع ریشه‌ای (هم‌زمان در هسته و کدنصب):
 *   ۱۲) خط «📊 آمار» در هستهٔ رله: حداکثر هر ۳۰ث، در همهٔ حالت‌ها (بیکاری ·
 *       موج اجرا · بن WAF · خطای شبکه) — شمارنده‌های تازهٔ MSG_RECV/MSG_SENT.
 *   ۱۳) بقا آمار در stats.json + ابزار status.sh (bash ~/melka-relay/status.sh):
 *       مالک در هر لحظه، بدون اتصال tmux، آمار کامل + آخرین خطوط رله را می‌بیند.
 *   ۱۴) راهنمای مشاهدهٔ آمار پس از نصب موفق (print_stats_guide) + شاهد آمار در
 *       تماشای فعال‌سازی (خط «📊 آمار» در خروجی نصب چاپ می‌شود).
 */
export function buildInstallCommand(serverUrl: string, enrollCode: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9:\/._-]/g, "");
  const url = safe(serverUrl).replace(/\/+$/, "");
  const code = safe(enrollCode);
  // PN-031-I: همان حمل‌ونقل بقا — http1.1 + UA بروزری برای دانلود bootstrap
  // PN-034 (شورا-ن۰۵۵): openssl-tool — بستهٔ CLI واقعی Termux؛ مسیر اثبات‌شدهٔ مالک
  return `# ── قلاب طلایی: نصب رلهٔ ملکا (نسل Q · DIR-SUPER-STRUCT-001 + DIR-RELAY-ACTIVATE-001) ──
# یک فایل = کل نصب + تصدیب فعال‌سازی. این دستور خودش هستهٔ رله (core-relay) را
# می‌گیرد؛ هسته خودش نگهبان (watchdog) را می‌سازد و هر دو در دو سشن مستقل (tmux)
# یا nohup اجرا می‌شوند — و در پایان «فعال شدن واقعی رله» را با شاهد گزارش می‌کند.
echo "نصب قلاب طلایی رلهٔ ملکا آغاز شد (نسل Q · DIR-SUPER-STRUCT-001 + تصدیب فعال‌سازی)…"
deps_ok=0
for i in 1 2; do
  if pkg install -y curl openssl-tool jq sqlite tmux; then deps_ok=1; break; fi
  echo "نصب وابستگی‌ها (تلاش \$i از ۲) ناموفق — ۵ ثانیه دیگر…"
  sleep 5
done
if [ "\$deps_ok" != "1" ]; then
  # sqlite/tmux اختیاری‌اند (سلوک عقبه: صف jsonl + nohup) — پایه اجباری است
  if pkg install -y curl openssl-tool jq; then
    echo "نصب پایه انجام شد (بدون sqlite/tmux — سلوک عقبه: صف jsonl + nohup)"
    deps_ok=1
  fi
fi
if [ "\$deps_ok" != "1" ]; then
  echo "خطا در نصب وابستگی‌ها! Termux را ببندید، دوباره باز کنید و همین دستور را دوباره بزنید."
  exit 1
fi
mkdir -p "\$HOME/melka-relay"

# ── DIR-RELAY-ACTIVATE-001 (۸): تماشای فعال‌سازی — تا ۱۵۰ث خروجی زندهٔ رله ──
# بررسی می‌شود تا نخستین Poll موفق («✓ اتصال تأیید شد — رلهٔ ملکا فعال است»)
# ظاهر شود؛ کدنصب پایانش «رله فعال شد» با شاهد است، نه فقط «فایل اجرا شد».
watch_relay_activation() {
  local i out
  echo "در حال تأیید اتصال رله به سرور ملکا (تا ۱۵۰ ثانیه)…"
  for i in \$(seq 1 15); do
    sleep 10
    out=""
    if command -v tmux >/dev/null 2>&1 && tmux has-session -t melka-relay 2>/dev/null; then
      out=\$(tmux capture-pane -p -t melka-relay -S -80 2>/dev/null)
    fi
    [ -z "\$out" ] && out=\$(tail -n 80 "\$HOME/melka-relay/relay.log" 2>/dev/null)
    if printf '%s' "\$out" | grep -q "رلهٔ ملکا فعال است"; then
      echo "══════════════════════════════════════════"
      echo "✓✓ رلهٔ ترموکس فعال شد و به سرور ملکا متصل است — تأیید با نخستین Poll موفق."
      printf '%s\\n' "\$out" | grep "رلهٔ ملکا فعال است" | tail -n 1
      printf '%s\\n' "\$out" | grep "📊 آمار" | tail -n 1 || true
      echo "══════════════════════════════════════════"
      return 0
    fi
    if printf '%s' "\$out" | grep -q "device revoked"; then
      echo "⛔ سرور این دستگاه را باطل کرده است (device revoked) — از تنظیمات ملکا (بخش رلهٔ Termux) دستگاه تازه ثبت کنید."
      return 1
    fi
    echo "… بررسی اتصال (تلاش \$i از ۱۵) — رله در پس‌زمینه در حال اتصال است…"
  done
  echo "⚠ در ۱۵۰ ثانیهٔ نخست اتصالِ رله تأیید نشد — رله زنده است و در پس‌زمینه خودش تلاش می‌کند (بدون توقف)."
  echo "مشاهدهٔ زنده: tmux attach -t melka-relay (خروج: Ctrl+b سپس d) یا: tail -f ~/melka-relay/relay.log"
  echo "آخرین پیام‌های رله:"
  printf '%s\\n' "\$out" | tail -n 8
  return 1
}

# ── DIR-RELAY-ULTRA-001 (گام اول · رابعاً): راهنمای مشاهدهٔ آمار دریافت/ارسال ──
print_stats_guide() {
  echo "📊 آمار دریافت/ارسال پیام رله: در نشست رله، خط «📊 آمار» هر حداکثر ۳۰-۶۰ ثانیه چاپ می‌شود."
  echo "مشاهدهٔ آمار در هر لحظه (بدون اتصال tmux): bash \$HOME/melka-relay/status.sh"
  echo "نمای زندهٔ رله: tmux attach -t melka-relay (خروج: Ctrl+b سپس d) — یا: tail -f \$HOME/melka-relay/relay.log"
}

# ── تعویض تمیز + راه‌اندازی (tmux با تصدیب · عقبه nohup) — \$1=مسیر هسته ──
start_relay_core() {
  local core="\$1"
  chmod 700 "\$core" 2>/dev/null || true
  if pgrep -f 'melka-relay/' >/dev/null 2>&1 || pgrep -f 'melka-relay.sh' >/dev/null 2>&1; then
    echo "نمونهٔ قدیمی رله در حال اجراست — برای تعویض تمیز متوقفش می‌کنم…"
    pkill -f 'melka-relay/' 2>/dev/null
    pkill -f melka-relay.sh 2>/dev/null
    sleep 2
  fi
  command -v tmux >/dev/null 2>&1 && { tmux kill-session -t melka-relay 2>/dev/null || true; tmux kill-session -t melka-watchdog 2>/dev/null || true; }
  # DIR-RELAY-ACTIVATE-001 (۱۰): tmux با has-session تصدیب می‌شود — شکست tmux
  # دیگر هرگز «نصب موفق» جعلی چاپ نمی‌کند؛ عقبهٔ nohup خودش راه می‌افتد.
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s melka-relay "bash \$core" 2>/dev/null
    sleep 1
    if tmux has-session -t melka-relay 2>/dev/null; then
      echo "هستهٔ رله در سشن tmux «melka-relay» راه افتاد ✓ (نگهبان مستقل در سشن «melka-watchdog» خودش ساخته می‌شود)."
      watch_relay_activation
      wrc=\$?
      print_stats_guide
      return \$wrc
    fi
    echo "tmux سشن را راه نینداخت — عقبهٔ nohup پس‌زمینه…"
  fi
  ( setsid nohup bash "\$core" >> "\$HOME/melka-relay/relay.log" 2>&1 & )
  echo "هستهٔ رله در پس‌زمینه (nohup) راه افتاد ✓ — لاگ: ~/melka-relay/relay.log"
  watch_relay_activation
  wrc=\$?
  print_stats_guide
  return \$wrc
}

# ── DIR-RELAY-ACTIVATE-001 (۸): دانلود با خواندن «دلیل رد» سرور ──
ok=0; last_code=0; reject_reason=""
waits=(5 5 10 10 15 20 25 30 30 30 30)
for i in \$(seq 1 12); do
  hdr=\$(mktemp)
  body_tmp=\$(mktemp)
  code_http=\$(curl --http1.1 -A "${BROWSER_UA}" -sS --max-time 30 -D "\$hdr" -o "\$body_tmp" -w '%{http_code}' "${url}/api/mobile-relay/bootstrap?code=${code}" 2>/dev/null)
  rc=\$?
  if [ "\$rc" -eq 0 ] && [ "\$code_http" = "200" ]; then
    mv -f "\$body_tmp" "\$HOME/melka-relay/core-relay.sh"; rm -f "\$hdr"; ok=1; break
  fi
  # رد قطعی با قرارداد JSON سرور (reason) — همان‌جا اعلام؛ تلاش مجدد بی‌فایده است
  if [ "\$rc" -eq 0 ] && { [ "\$code_http" = "403" ] || [ "\$code_http" = "404" ]; }; then
    rj=\$(head -c 800 "\$body_tmp" | jq -r '.reason // empty' 2>/dev/null)
    if [ -n "\$rj" ]; then
      reject_reason="\$rj"
      rm -f "\$body_tmp" "\$hdr"; last_code="\$code_http"
      break
    fi
  fi
  rm -f "\$body_tmp" "\$hdr"; last_code="\$code_http"
  w=\${waits[\$(( i < 11 ? i - 1 : 10 ))]:-30}
  if [ "\$rc" -eq 28 ]; then
    echo "تلاش \$i از ۱۲: تایم‌اوت (خطای ۲۸) — سرور شلوغ/شبکه ضعیف · \$w ثانیه دیگر…"
  elif [ "\$code_http" = "502" ] || [ "\$code_http" = "503" ] || [ "\$code_http" = "429" ]; then
    echo "تلاش \$i از ۱۲: سرور در حال ریست/رستاخیز است (HTTP \$code_http) — خودش برمی‌گردد · \$w ثانیه دیگر صبر می‌کنم…"
  elif [ "\$code_http" = "403" ] || [ "\$code_http" = "404" ]; then
    echo "تلاش \$i از ۱۲: رد HTTP \$code_http بدون قرارداد (گذرای WAF/دروازه) — \$w ثانیه دیگر دوباره می‌کوشم…"
  else
    echo "تلاش \$i از ۱۲ ناموفق (کد \$code_http · خطای curl \$rc) — \$w ثانیه دیگر…"
  fi
  sleep "\$w"
done

# ── رد قطعی با دلیل — پیام دقیق سرور + درمان (DIR-RELAY-ACTIVATE-001 · ۸+۹) ──
if [ "\$ok" != "1" ] && [ -n "\$reject_reason" ]; then
  case "\$reject_reason" in
    used)
      # کد قبلاً با موفقیت نصب شده و رله فعال است — اگر هستهٔ محلی هست، احیای محلی
      if [ -f "\$HOME/melka-relay/core-relay.sh" ] && head -n 1 "\$HOME/melka-relay/core-relay.sh" | grep -q '^#!' && [ "\$(wc -c < "\$HOME/melka-relay/core-relay.sh")" -gt 4000 ]; then
        echo "این کد قبلاً مصرف شده (رله از قبل فعال) — هستهٔ موجود روی همین گوشی را دوباره راه می‌اندازم (بی‌نیاز از کد تازه)…"
        start_relay_core "\$HOME/melka-relay/core-relay.sh"
        echo "برای ساعت‌ها کار بی‌وقفه: اندروید → برنامه‌ها → Termux → باتری → «بدون محدودیت» + قفل در Recentها."
        exit 0
      fi
      echo "کد سوخته — این کد قبلاً با موفقیت برای راه‌اندازی همین گوشی استفاده شده."
      echo "اگر رله کار نمی‌کند: Termux را ببندید و دوباره باز کنید، سپس همین دستور را دوباره بزنید؛ اگر باز نشد از «راه‌اندازی رله» در تنظیمات ملکا کد تازه بگیرید."
      exit 1
      ;;
    limit)
      echo "کد سوخته — سقف تلاش‌های دانلود برای این کد پر شده."
      echo "درمان: از تنظیمات ملکا (بخش رلهٔ Termux) دکمهٔ تولید کد نصب را بزنید و دستور تازه را پیست کنید."
      exit 1
      ;;
    expired)
      echo "کد منقضی — پنجرهٔ اعتبار این کد گذشته است."
      echo "درمان: از تنظیمات ملکا دکمهٔ راه‌اندازی رله را دوباره بزنید تا کد تازه صادر شود و همین دستورِ تازه را پیست کنید."
      exit 1
      ;;
    invalid)
      echo "کد نامعتبر — چنین کدی صادر نشده است (ناقص کپی شده یا غلط است)."
      echo "درمان: دستور نصب را کامل از تنظیمات ملکا کپی کنید (دکمهٔ کپی دستور نصب)."
      exit 1
      ;;
    revoked)
      echo "کد باطل شده — دستگاه صاحب این کد از سمت مالک ابطال شده است."
      echo "درمان: برای راه‌اندازی مجدد، دستگاه تازه‌ای از تنظیمات ملکا ثبت کنید."
      exit 1
      ;;
  esac
fi

if [ "\$ok" = "1" ] && head -n 1 "\$HOME/melka-relay/core-relay.sh" | grep -q '^#!' && [ "\$(wc -c < "\$HOME/melka-relay/core-relay.sh")" -gt 4000 ] && ! grep -q '<html' "\$HOME/melka-relay/core-relay.sh" 2>/dev/null; then
  echo "دانلود هستهٔ رله کامل شد ✓ — راه‌اندازی دو-سشنی (هسته + نگهبان)…"
  start_relay_core "\$HOME/melka-relay/core-relay.sh"
  echo "مقاوم به ۴۰۳/۴۲۰/۴۲۳/۴۰۲/۲۸/۵۰۲ و ریست سرور (میراث نسل P · حاکم تطبیقی ARM پابرجا)."
  echo "برای ساعت‌ها کار بی‌وقفه: اندروید → برنامه‌ها → Termux → باتری → «بدون محدودیت» + قفل در Recentها."
else
  echo "نصب کامل نشد (آخرین وضعیت: HTTP \$last_code). سرور احتمالاً هنوز در حال رستاخیز است —"
  echo "چند لحظه بعد همین دستور را یک بار دیگر پیست کنید (کد ثبت همین می‌ماند — کد تازه فقط اگر از داشبورد ابطال شده باشد لازم است)."
  rm -f "\$HOME/melka-relay/core-relay.sh"
fi`;
}
