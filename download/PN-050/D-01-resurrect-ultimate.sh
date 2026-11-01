#!/usr/bin/env bash
# ============================================================================
# resurrect-ultimate.sh — اسکریپت رستاخیز نهایی ملکا (PN-042 · جلسهٔ ۰۷۰)
# ============================================================================
# فرمان مالک (قانون «مجری کور» — پس از هر ریست، بدون تفکر، فقط اجرا):
#   ⚠️ مخزن خصوصی است — raw گیت‌هاب بدون توکن ۴۰۴ می‌دهد (کشف PN-042-A · شورا-ن۰۷۹).
#   توکن = MIRROR_URL_AUTHED در upload/.mirror/credentials.env (بادوام) یا remote گیت:
#     set -a; . upload/.mirror/credentials.env; set +a
#     TOKEN=$(printf '%s' "$MIRROR_URL_AUTHED" | sed -n 's#https://[^:]*:\([^@]*\)@.*#\1#p')
#     curl -fsSL -H "Authorization: token $TOKEN" "https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh?t=$(date +%s)" | bash
#
# هدف: بازگرداندن کد از GitHub و داده از منطقهٔ پایدار در ~۹۰ ثانیه.
#
# دکترین PN-042 (جلسهٔ ۰۷۰ — پایان چرخهٔ شکست):
#   - منبع حقیقت کد: main گیت‌هاب. این اسکریپت همیشه از همان‌جا اجرا می‌شود
#     و در هر اجرا با fetch/reset خودش و درخت را به آخرین نسخه هم‌تراز می‌کند.
#   - صفر منطق نجات در سرور: همهٔ اسکریپت‌های بازیابی موازی (recover-all ·
#     github-supreme-guard · db-fortress-guard) حذف شدند — این فایل تنها
#     مسیر رسمی است و خودش در گیت‌هاب می‌زید.
#   - دادهٔ مقدس: دیتابیس زندهٔ سالم هرگز لمس نمی‌شود (صفر مداخله)؛ فقط در
#     فقدان/عقب‌ماندگی، بهترین لایهٔ پایدار برمی‌گردد:
#       db/custom.db (زنده) → upload/.data/custom.db (قلعه) →
#       upload/.data/rolling/live-*.db (چرخشی) → upload/.survival/P*/ (بقا)
#   - PN-050 (دستور ۱ · DIR-PN050-001) — معماری UNION جایگزین منطق MAX شد:
#     هیچ لایه‌ای دیگر جایگزین زندهٔ سالم نمی‌شود؛ همهٔ لایه‌های پایدار
#     «رکوردهای خود را افزود می‌کنند» (INSERT OR IGNORE — صفر بازنویسی/حذف).
#     سناریوی پذیرش: زنده=۳۲٬۸۵۱ · چرخشی=۳۳٬۰۰۲ → زنده=۳۳٬۰۰۲ (نه ۳۲٬۸۵۱).
#   - معماری دادهٔ شورا-ن۰۶۸: زنده = db/custom.db (WAL دیسک محلی · سریع) ·
#     قلعه = upload/.data (ossfs پایدار · سنک ۵دقیقه‌ای Worker).
#   - ossfs بیمار (درس PN-041-R): هر منبع UNION با timeout مستقل — skip
#     صادقانه، نه ایستادن بوت (قانون ۱۱).
#   - قانون ۱۱ (بوت هرگز نمی‌ایستد): اگر این اجرا ناکام بماند، در خروج،
#     سرور از بیلد موجودِ محلی دوباره سرو می‌شود.
# ============================================================================
set -euo pipefail

REPO="${REPO_DIR:-/home/z/my-project}"
RAW_URL="https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh"
T0=$(date +%s)

# ─── قانون ۱۱-ب (PN-052 · درس ریست‌های ۲۰۲۵-۱۰-۲۵): جداسازی دیمن خودکار ───
# حادثه: هارنسِ محیط اجرا پس از پایان هر فراخوانی ابزار، کل گروهِ فرایندِ
# متصل به نشست را بی‌صدا SIGKILL می‌کند (بیلد وسط راه مرد · trap اجرا نشد ·
# oom_kill=0). درمان: در نخستین نفس، خود را با setsid در نشستی جدا
# بازاجرایی می‌کنیم — از این پس «curl | bash» هم مثل اجرای دیمن زنده می‌ماند.
# لاگ دیمن: $REPO/resurrect-daemon.log (همان شاهدی که قانون ۱۴ می‌خواهد)
if [ "${MELKA_RESURRECT_CHILD:-}" != "1" ]; then
  export MELKA_RESURRECT_CHILD=1
  _LOGD="$REPO/resurrect-daemon.log"
  _SELF=""
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "stdin" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    _SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && echo "$PWD/$(basename "${BASH_SOURCE[0]}")")"
  fi
  if [ -z "$_SELF" ]; then
    # حالت pipe (curl | bash): فایلِ خود از منبع حقیقت (raw گیت‌هاب) برداشته می‌شود
    # (محل رسمی در مخزن = ریشه — عین URL raw)
    _SELF="$REPO/resurrect-ultimate.sh"
    _OK=""
    curl -fsSL "${RAW_URL}?t=$(date +%s)" -o "$_SELF.dl" 2>/dev/null && _OK=1
    if [ -z "$_OK" ] && [ -f "$REPO/upload/.mirror/credentials.env" ]; then
      _TOK="$(set -a; . "$REPO/upload/.mirror/credentials.env" 2>/dev/null || true; set +a; printf '%s' "${MIRROR_URL_AUTHED:-}" | sed -n 's#https://[^:]*:\([^@]*\)@.*#\1#p')"
      [ -n "$_TOK" ] && curl -fsSL -H "Authorization: token $_TOK" "${RAW_URL}?t=$(date +%s)" -o "$_SELF.dl" 2>/dev/null && _OK=1
    fi
    if [ -n "$_OK" ] && [ -s "$_SELF.dl" ] && head -3 "$_SELF.dl" | grep -q "resurrect-ultimate"; then
      mv -f "$_SELF.dl" "$_SELF"
    else
      rm -f "$_SELF.dl" 2>/dev/null || true
      [ -f "$_SELF" ] || _SELF=""   # نه شبکه، نه فایل محلی — ادامهٔ درون‌خطی
    fi
  fi
  if [ -n "$_SELF" ]; then
    echo "🥚 [$(date -u +%FT%TZ)] فرزندِ جدا (setsid) راه افتاد — لاگ: $_LOGD"
    setsid bash "$_SELF" </dev/null >>"$_LOGD" 2>&1 &
    _CPID=$!
    disown 2>/dev/null || true
    sleep 2
    if kill -0 "$_CPID" 2>/dev/null; then
      echo "✅ [$(date -u +%FT%TZ)] دیمن رستاخیز زنده است (PID $_CPID) — لاگ را دنبال کنید: tail -f $_LOGD"
      exit 0
    fi
    echo "❌ [$(date -u +%FT%TZ)] فرزند جدا بالا نیامد — ادامهٔ درون‌خطی (رفتار پیشین)"
  fi
  echo "⚠️ [$(date -u +%FT%TZ)] جداسازی ناممکن (نه فایل، نه شبکه) — ادامهٔ درون‌خطی"
fi

cd "$REPO"
echo "🚀 [$(date -u +%FT%TZ)] شروع رستاخیز نهایی از گیت‌هاب (PN-042)…"

# قانون ۱۱: در هر شکستِ میانی، سرو از بیلد موجود ادامه می‌یابد
trap 'rc=$?; if [ $rc -ne 0 ]; then echo "❌ [$(date -u +%FT%TZ)] رستاخیز ناکام ماند (rc=$rc) — سرو از بیلد موجود (قانون ۱۱)…"; rm -f "$REPO/.prod-stop"; bash "$REPO/scripts/start-prod.sh" >/dev/null 2>&1 || true; fi' EXIT

# ─── ۱) توقف فرایندهای قدیمی (درس OOM: بیلد هم‌زمان با سرور = مرگ) ───
touch .prod-stop 2>/dev/null || true     # فلگ توقف تمیز نگهبان
pkill -f "standalone/server.js"     2>/dev/null || true
pkill -f "prod-watchdog.sh"         2>/dev/null || true
pkill -f "scripts/runtime/worker.ts" 2>/dev/null || true
sleep 2

# ─── ۲) دریافت کد از گیت‌هاب — main منبع حقیقت ───
echo "— دریافت کد از گیت‌هاب…"
if [ ! -d .git ]; then
  echo "  ⚠️ مخزن گیت غایب — بازسازی از صفر (git init + credentials بقا)…"
  git init -q
  CREDS="upload/.mirror/credentials.env"
  if [ -f "$CREDS" ]; then
    set -a; . "$CREDS"; set +a
    git remote add origin "${MIRROR_URL_AUTHED:?no-token}"
  else
    git remote add origin https://github.com/nemsey/melka-backup-private.git
  fi
fi
REMOTE=origin
git remote get-url origin >/dev/null 2>&1 || REMOTE=melka-backup
if git fetch "$REMOTE" main; then
  git checkout -q -f -B main FETCH_HEAD
  git reset --hard FETCH_HEAD
  echo "  HEAD اکنون: $(git rev-parse --short HEAD)"
else
  echo "  ⚠️ fetch گیت‌هاب ناموفق (قانون ۱۱) — ادامه با درخت محلی $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
fi

# ─── ۳) بازیابی دیتابیس — معماری UNION (PN-050 · دستور ۱ · DIR-PN050-001) ───
# پایان منطق «پرترین لایه برنده و جایگزین می‌شود» (MAX → replace).
#   زندهٔ سالم     → UNION افزودنی با همهٔ لایه‌های پایدار (هیچ رکوردی حذف/بازنویسی نمی‌شود)
#   زندهٔ غایب/خراب → بوت‌استرپ از نخستین منبعِ معتبر به‌ترتیب اولویت، سپس UNION با بقیه
# هر منبع: یک فراخوان اتمی (تراکنش per-source) با timeout مستقل — کرش وسط کار →
# ROLLBACK خودکار؛ ossfs بیمار → skip صادقانه، اتحاد در رستاخیز بعدی.
is_sqlite() { [ -s "$1" ] && [ "$(head -c 15 "$1" 2>/dev/null)" = "SQLite format 3" ]; }
rowcount() { python3 -c "
import sqlite3, sys
try:
    c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
    print(c.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0])
    c.close()
except Exception:
    print(0)" "$1" 2>/dev/null || echo 0; }

LIVE="$REPO/db/custom.db"
FORT="$REPO/upload/.data/custom.db"
UNION_SCRIPT="$REPO/scripts/pn050/merge_union.py"
UNION_TIMEOUT_S="${MELKA_UNION_TIMEOUT_S:-240}"
mkdir -p "$REPO/db" "$REPO/upload/.data"

# منابع UNION به‌ترتیب اولویت: قلعه (سنک ۵دقیقه‌ای) · جدیدترین چرخشی · جدیدترین بقا
R=""
{ R=$(ls -t "$REPO"/upload/.data/rolling/live-*.db 2>/dev/null | head -1 || true); } 2>/dev/null
{ [ -n "$R" ] && is_sqlite "$R"; } 2>/dev/null || R=""
S=""
for K in $(ls -td "$REPO"/upload/.survival/P*/ 2>/dev/null || true); do
  for CAND in "${K}db/custom.db" "${K}custom.db"; do
    if is_sqlite "$CAND"; then S="$CAND"; break 2; fi
  done
done

# UNION یک منبع — اتمی + timeout + skip صادقانه (سطر JSON خروجی = شاهد روی لاگ)
union_one() {
  # $1=مسیر منبع · $2=برچسب لایه
  [ -n "$1" ] || return 1
  echo "  ⤳ UNION با لایهٔ $2: $1"
  local out rc
  out=$(timeout "$UNION_TIMEOUT_S" python3 "$UNION_SCRIPT" --live "$LIVE" --source "$1" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "  ✓ UNION با $2 کامل شد — شاهد: $(printf '%s' "$out" | tail -1 | head -c 300)"
    return 0
  fi
  echo "  ⚠️ UNION با $2 ناتمام/تایم‌اوت (rc=$rc · سقف ${UNION_TIMEOUT_S}s — ossfs بیمار؟) — skip صادقانه؛ اتحاد در رستاخیز بعدی"
  printf '%s' "$out" | tail -2 | head -c 300; echo
  return 1
}

if is_sqlite "$LIVE"; then
  LC=$(rowcount "$LIVE")
  echo "  ✓ دیتابیس زندهٔ سالم ($LC آگهی) — صفر مداخله روی رکوردهای موجود (قانون بقا · PN-050)"
  # UNION افزودنی: هر لایه فقط «می‌افزاید» — رکورد موجود هرگز بازنویسی نمی‌شود
  if is_sqlite "$FORT"; then union_one "$FORT" "قلعه" || true; else echo "  ⚠️ قلعه نامعتبر/ناموجود — skip"; fi
  if [ -n "$R" ]; then union_one "$R" "چرخشی" || true; else echo "  ⚠️ چرخشی نامعتبر/ناموجود — skip"; fi
  if [ -n "$S" ]; then union_one "$S" "بقا" || true; else echo "  ℹ️ بستهٔ بقا لازم نبود (قلعه/چرخشی حاضرند یا ناموجودند)"; fi
  LC2=$(rowcount "$LIVE")
  if [ "$LC2" -lt "$LC" ]; then
    echo "❌ FATAL: UNION شمارش را کاهش داد ($LC → $LC2) — نقض قانون بقا؛ توقف"
    exit 1
  fi
  echo "  ✓ پس از UNION: $LC2 آگهی (پیش از UNION: $LC — رشدی/برابر، هرگز کاهشی)"
fi
if ! is_sqlite "$LIVE"; then
  if [ -e "$LIVE" ]; then
    mv -f "$LIVE" "$LIVE.broken-$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null || true
  fi
  SRC=""; SRCN=""
  if is_sqlite "$FORT"; then SRC="$FORT"; SRCN="قلعهٔ پایدار"
  elif [ -n "$R" ] && is_sqlite "$R"; then SRC="$R"; SRCN="چرخشی"
  elif [ -n "$S" ]; then SRC="$S"; SRCN="بقا"
  fi
  if [ -n "$SRC" ]; then
    echo "  ⚠️ دیتابیس زنده یافت نشد — بوت‌استرپ از $SRCN…"
    # کپی اتمی: tmp + mv — کپی ناتمام هرگز سرور تغذیه نمی‌کند
    if timeout "$UNION_TIMEOUT_S" cp -f "$SRC" "$LIVE.bootstrap-tmp"; then
      mv -f "$LIVE.bootstrap-tmp" "$LIVE"
      echo "  ✓ بوت‌استرپ از $SRCN کامل شد ($(rowcount "$LIVE") آگهی)"
    else
      rm -f "$LIVE.bootstrap-tmp" 2>/dev/null || true
      echo "  ⚠️ کپی $SRCN ناتمام/تایم‌اوت — skip صادقانه"
    fi
  else
    echo "  ⚠️ هشدار: هیچ دیتابیس معتبری یافت نشد. سرور با دیتابیس خالی بالا می‌آید."
  fi
  # بوت‌استرپ موفق → UNION با بقیهٔ لایه‌ها (مبنای بوت‌استرپ حذف می‌شود — خودش در live است)
  if is_sqlite "$LIVE" && [ -n "$SRC" ]; then
    { [ "$SRC" != "$FORT" ] && is_sqlite "$FORT" && union_one "$FORT" "قلعه"; } || true
    { [ -n "$R" ] && [ "$SRC" != "$R" ] && union_one "$R" "چرخشی"; } || true
    { [ -n "$S" ] && [ "$SRC" != "$S" ] && union_one "$S" "بقا"; } || true
    echo "  ✓ پس از UNION با بقیهٔ لایه‌ها: $(rowcount "$LIVE") آگهی"
  fi
fi

# ─── ۴) رازها و env (escrow سه‌مکانی — PN-012-B · اولویت PN-043-A) ───
# Secret priority (PN-043-A · شورا-ن۰۷۹): منبع راز باید در لایهٔ پایدار باشد
SECRET_FOUND=""
if [ -f "upload/.runtime/boot-secrets.json" ]; then
  SECRET_FOUND="upload/.runtime/boot-secrets.json (priority 1)"
elif [ -d "upload/.runtime/" ] && [ -n "$(ls -A upload/.runtime/ 2>/dev/null)" ]; then
  SECRET_FOUND="upload/.runtime/ (priority 2)"
elif [ -f "env.escrow.enc" ]; then
  SECRET_FOUND="env.escrow.enc (priority 3)"
fi
if [ -z "$SECRET_FOUND" ]; then
  echo "❌ FATAL: No secret found in any priority layer"
  exit 1
fi
echo "✅ Secret source: $SECRET_FOUND"
if [ -f scripts/pn012/escrow-manager.ts ]; then
  bun scripts/pn012/escrow-manager.ts restore >/dev/null 2>&1 || true
fi
set -a; { [ -f .env.local ] && . ./.env.local; } || true; set +a

# ─── ۵) نصب و بیلد ───
echo "— نصب وابستگی‌ها و بیلد…"
bun install
bunx prisma generate
bunx prisma db push --accept-data-loss
bun run build

# ─── ۵-ب) G3 — دروازهٔ سخت بیلد=HEAD (DIR-PN048-007 · موج صفر · D-0a) ───
# درس رویداد ریست ۱۰:۲۱ امروز: درخت قدیمی + بیلد کهنه → سرور کد کهنه سرو می‌کرد.
# از این پس: بیلد باید دقیقاً از HEAD فعلی باشد وگرنه Worker استارت نمی‌شود
# (قانون توقف: «build != HEAD و Worker استارت شد → توقف فوری»).
HEAD_SHA=$(git rev-parse --verify HEAD 2>/dev/null || echo "")
if ! printf '%s' "$HEAD_SHA" | grep -qE '^[0-9a-f]{40}$'; then HEAD_SHA=""; fi
BUILD_SHA=$(jq -r '.gitSha // empty' "$REPO/.next/fingerprint.json" 2>/dev/null || echo "")
STANDALONE_BUILD_SHA=$(jq -r '.gitSha // empty' "$REPO/.next/standalone/.next/fingerprint.json" 2>/dev/null || echo "")
if [ -z "$BUILD_SHA" ] || [ -z "$HEAD_SHA" ] || [ "$HEAD_SHA" != "$BUILD_SHA" ] || [ "$HEAD_SHA" != "$STANDALONE_BUILD_SHA" ]; then
  echo "❌ G3 GATE: بیلد ≠ HEAD — بیلد کهنه سرو/Worker استارت نمی‌شود (drift: HEAD=$HEAD_SHA · main-build=$BUILD_SHA · standalone=$STANDALONE_BUILD_SHA)"
  exit 1
fi
echo "  ✓ G3: بیلد = HEAD ($(git rev-parse --short HEAD)) — هم در main هم در standalone"

# G1 (Worker boot precondition): محافظ stripProtectedNulls باید در سورس باشد
SYNC_GUARD="$REPO/src/lib/integrations/melketun/protected-nulls.ts"
if [ ! -f "$SYNC_GUARD" ] || ! grep -q "G1_STRIP_PROTECTED_NULLS = true" "$SYNC_GUARD" \
   || ! grep -q "stripProtectedNulls" "$REPO/src/lib/integrations/melketun/sync.ts"; then
  echo "❌ G1 GATE: stripProtectedNulls در مسیرهای upsert یافت نشد — Worker استارت نمی‌شود (قانون دادهٔ مقدس)"
  exit 1
fi
echo "  ✓ G1: محافظ stripProtectedNulls حاضر است (protected-nulls.ts + ۶ نقطهٔ upsert)"

# ─── ۶) راه‌اندازی سرور (دیمن double-fork + ری‌استارت خودکار ۵ث) ───
echo "— راه‌اندازی سرور…"
bash scripts/start-prod.sh

# ─── ۶-ب) تأیید مجدد G3 پیش از استارت Worker ───
# (بین start-prod و Worker، درخت تغییر نکرده باشد — سنجهٔ نهایی همان‌طور که مالک خواست)
HEAD_SHA2=$(git rev-parse --verify HEAD 2>/dev/null || echo "")
if ! printf '%s' "$HEAD_SHA2" | grep -qE '^[0-9a-f]{40}$'; then HEAD_SHA2=""; fi
if [ -z "$HEAD_SHA2" ] || [ "$HEAD_SHA2" != "$BUILD_SHA" ]; then
  echo "❌ G3 RE-CHECK: HEAD حین راه‌اندازی تغییر کرد (HEAD=$HEAD_SHA2 · BUILD=$BUILD_SHA) — Worker استارت نمی‌شود"
  exit 1
fi

# PN-042-D: Worker restart (پس از رستاخیز)
pkill -f "scripts/runtime/worker" 2>/dev/null || true
sleep 1
nohup bun scripts/runtime/worker.ts > /tmp/worker-restart.log 2>&1 &
sleep 2
echo "✅ Worker restarted"

# ─── ۷) تأیید — پیام موفقیت فقط با شاهد زنده ───
EXPECT=$(git rev-parse --short HEAD)
VERSION=""
for i in $(seq 1 24); do
  if curl -fsS -m 5 http://localhost:3000/api/version >/tmp/resurrect-version.json 2>/dev/null; then
    VERSION=$(jq -r '.gitSha // empty' /tmp/resurrect-version.json 2>/dev/null || true)
    [ -n "$VERSION" ] && break
  fi
  sleep 5
done
if [ -z "$VERSION" ]; then
  echo "❌ RESURRECTION FAILED — سرور پس از ۱۲۰ ثانیه پاسخ نداد. لاگ: server.log"
  exit 1
fi
if [ "${VERSION:0:${#EXPECT}}" != "$EXPECT" ]; then
  echo "❌ RESURRECTION FAILED — سرور $VERSION سرو می‌کند ولی HEAD=$EXPECT است (drift)."
  exit 1
fi
trap - EXIT
T1=$(date +%s)
ROWCOUNT_FINAL=$(python3 -c "import sqlite3; print(sqlite3.connect('db/custom.db').execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0])" 2>/dev/null || echo 0)
if [ "$ROWCOUNT_FINAL" -lt 1000 ]; then
  echo "❌ FATAL: PropertyRecord=$ROWCOUNT_FINAL < 1000 — data restoration failed"
  exit 1
fi
echo "✅ Data verified: $ROWCOUNT_FINAL PropertyRecord"
echo "✅ RESURRECTION COMPLETE — Version: ${VERSION} — مدت: $((T1-T0)) ثانیه"
echo "✅ رستاخیز کامل شد. منبع حقیقت: $RAW_URL"
