#!/usr/bin/env bash
# ============================================================================
# DIR-CHANGES-EXEC-001 · اجرای مستقیم دو گام مالک روی دادهٔ زندهٔ ARM
# ----------------------------------------------------------------------------
#   گام اول: تغییر اطلاعات مالک آگهی ۵۴۴۰۲ → احد شریفی · ۰۹۱۴۴۰۱۸۶۷۷
#   گام دوم: تغییر تاریخ + آبشار کددرخواست ۵۶۰۳۱ → ۱۴۰۵/۰۸/۰۹
#
# مسیر رسمی = همان روت‌های کاشی تغییرات (DIR-CHANGES-TILE-002):
#   POST /api/changes/listing  { action: lookup | change-owner }
#   POST /api/changes/request  { action: lookup | change-date }
#   POST /api/changes/session  { action: end }  — بازگشت ظرفیت پس از کار
#
# فازها (هر فاز یک فرمان foreground — درس ۱۱-ب):
#   step1  : گام اول کامل (lookup-before → change-owner → lookup-after)
#   step2  : گام دوم کامل (lookup-before → change-date → lookup-after)
#   finish : پایان نشست تمام‌ظرفیت + جمع‌بندی JSON
# ============================================================================
set -u
REPO="/home/z/my-project"
OUT="$REPO/download/dir-changes-exec-001"
TOKF="/tmp/dir-changes-exec-001.tok"
mkdir -p "$OUT"
ts() { date -u +%FT%TZ; }
say() { echo "[$(ts)] $*" | tee -a "$OUT/run.log"; }

login() {
  local CODE LOGIN
  CODE=$(grep -E '^MASTER_ACCESS_CODE=' "$REPO/.env.local" | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'")
  [ -n "$CODE" ] || { say "❌ کد مدیر در .env.local نیست"; return 1; }
  LOGIN=$(curl -s --max-time 20 -X POST http://127.0.0.1:3000/api/auth/master-login \
    -H 'Content-Type: application/json' -d "{\"masterCode\":\"$CODE\"}")
  echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('sessionToken') or (d.get('session') or {}).get('token') or '')" > "$TOKF" 2>/dev/null
  chmod 600 "$TOKF"
  local TOK; TOK=$(cat "$TOKF")
  [ -n "$TOK" ] || { say "❌ ورود ناموفق: $(echo "$LOGIN" | head -c 200)"; return 1; }
  say "✓ ورود مالک (توکن در حافظه — چاپ نمی‌شود)"
}

api() {  # api <method> <path> <json-body|-> <outfile>
  local M="$1" P="$2" B="$3" F="$4" TOK R RC
  TOK=$(cat "$TOKF" 2>/dev/null)
  if [ "$B" = "-" ]; then
    R=$(curl -s --max-time 320 -w "\n%{http_code}" -X "$M" "http://127.0.0.1:3000$P" -H "Authorization: Bearer $TOK")
  else
    R=$(curl -s --max-time 320 -w "\n%{http_code}" -X "$M" "http://127.0.0.1:3000$P" \
        -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$B")
  fi
  RC="${R##*$'\n'}"
  printf '%s' "${R%$'\n'*}" | python3 -m json.tool > "$F" 2>/dev/null || printf '%s' "${R%$'\n'*}" > "$F"
  echo "$RC"
}

case "${1:-}" in
  login) login ;;

  step1)
    login || exit 1
    say "═══ گام اول: تغییر اطلاعات مالک آگهی ۵۴۴۰۲ → احد شریفی · ۰۹۱۴۴۰۱۸۶۷۷ ═══"
    say "۱) خواندن وضعیت (شاهد پیش از تغییر)…"
    RC=$(api POST /api/changes/listing '{"action":"lookup","code":"54402"}' "$OUT/step1-lookup-before.json")
    say "   HTTP $RC — step1-lookup-before.json"
    say "۲) اعمال تغییر اطلاعات مالک (نام + نام‌خانوادگی + موبایل)…"
    RC=$(api POST /api/changes/listing '{"action":"change-owner","spec":{"code":"54402","newFullName":"احد شریفی","newMobile":"09144018677"}}' "$OUT/step1-change-owner.json")
    say "   HTTP $RC — step1-change-owner.json"
    say "۳) خواندن وضعیت (راستی‌آزمایی پس از تغییر)…"
    RC=$(api POST /api/changes/listing '{"action":"lookup","code":"54402"}' "$OUT/step1-lookup-after.json")
    say "   HTTP $RC — step1-lookup-after.json"
    python3 - "$OUT" <<'PYEOF'
import json, sys
out = sys.argv[1]
r = json.load(open(f"{out}/step1-change-owner.json"))
print("ok:", r.get("ok"), "| خطا:", r.get("error") or "—")
for s in r.get("steps", []):
    print(f"  [{s['status']:>7}] {s['title']}: {s['detail'][:150]}")
PYEOF
    ;;

  step2)
    login || exit 1
    say "═══ گام دوم: تغییر تاریخ + آبشار کددرخواست ۵۶۰۳۱ → ۱۴۰۵/۰۸/۰۹ ═══"
    say "۱) خواندن وضعیت (شاهد پیش از تغییر — تاریخچهٔ کامل + رویدادها)…"
    RC=$(api POST /api/changes/request '{"action":"lookup","code":"56031"}' "$OUT/step2-lookup-before.json")
    say "   HTTP $RC — step2-lookup-before.json"
    say "۲) اعمال تغییر تاریخ (Δ نسبی از لنگر ایجاد مشاور + آبشار کامل)…"
    RC=$(api POST /api/changes/request '{"action":"change-date","spec":{"code":"56031","targetJalali":"1405/08/09"}}' "$OUT/step2-change-date.json")
    say "   HTTP $RC — step2-change-date.json"
    say "۳) خواندن وضعیت (راستی‌آزمایی پس از تغییر)…"
    RC=$(api POST /api/changes/request '{"action":"lookup","code":"56031"}' "$OUT/step2-lookup-after.json")
    say "   HTTP $RC — step2-lookup-after.json"
    python3 - "$OUT" <<'PYEOF'
import json, sys
out = sys.argv[1]
r = json.load(open(f"{out}/step2-change-date.json"))
print("ok:", r.get("ok"), "| خطا:", r.get("error") or "—")
for s in r.get("steps", []):
    print(f"  [{s['status']:>7}] {s['title']}: {s['detail'][:180]}")
PYEOF
    ;;

  finish)
    login || exit 1
    say "═══ پایان نشست تمام‌ظرفیت (بازگشت چرخه‌های فهرست‌ها و ظرفیت رله) ═══"
    RC=$(api POST /api/changes/session '{"action":"end"}' "$OUT/session-end.json")
    say "   HTTP $RC — session-end.json"
    ;;

  *) echo "فازهای مجاز: login | step1 | step2 | finish"; exit 1 ;;
esac
