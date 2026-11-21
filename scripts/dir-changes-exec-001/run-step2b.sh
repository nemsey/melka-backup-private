#!/usr/bin/env bash
# ============================================================================
# DIR-CHANGES-EXEC-001 · step2b — اجرای گام دوم با حل سرنخ مالک:
#   «کد درخواست ۵۶۰۳۱ متعلق به مالک (سیدنعمت اله سیدی)»
#   ⇒ کد ۵۶۰۳۱ در ARM موجود نیست (اثبات زنده ×۲ امروز)؛ درخواست یگانهٔ
#     متقاضی «سید نعمت اله سیدی» (۰۹۱۴۸۴۱۲۵۸۳) = ۴۸۹۶۸ — تغییر تاریخ
#     تاریخچهٔ تغییرات درخواست → ۱۴۰۵/۰۸/۰۹ (لنگر: ایجاد مشاور + آبشار کامل)
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

  step2b)
    login || exit 1
    say "═══ گام دوم (حل‌شده با سرنخ مالک): کددرخواست ۴۸۹۶۸ (متقاضی: سید نعمت اله سیدی) → تاریخ ۱۴۰۵/۰۸/۰۹ ═══"
    say "۰) شاهد تازهٔ غیبت ۵۶۰۳۱ (برای گزارش)…"
    RC=$(api POST /api/changes/request '{"action":"lookup","code":"56031"}' "$OUT/step2b-56031-recheck.json")
    say "   HTTP $RC — step2b-56031-recheck.json"
    say "۱) خواندن وضعیت ۴۸۹۶۸ (شاهد پیش از تغییر — تاریخچهٔ کامل + رویدادها)…"
    RC=$(api POST /api/changes/request '{"action":"lookup","code":"48968"}' "$OUT/step2b-lookup-before.json")
    say "   HTTP $RC — step2b-lookup-before.json"
    say "۲) اعمال تغییر تاریخ (Δ نسبی از لنگر «ایجاد مشاور» + آبشار کامل)…"
    RC=$(api POST /api/changes/request '{"action":"change-date","spec":{"code":"48968","targetJalali":"1405/08/09"}}' "$OUT/step2b-change-date.json")
    say "   HTTP $RC — step2b-change-date.json"
    say "۳) خواندن وضعیت (راستی‌آزمایی پس از تغییر)…"
    RC=$(api POST /api/changes/request '{"action":"lookup","code":"48968"}' "$OUT/step2b-lookup-after.json")
    say "   HTTP $RC — step2b-lookup-after.json"
    python3 - "$OUT" <<'PYEOF'
import json, sys
out = sys.argv[1]
for f, tag in [("step2b-56031-recheck.json","56031"),("step2b-change-date.json","change")]:
    try:
        r = json.load(open(f"{out}/{f}"))
        print(f"── {tag}: ok={r.get('ok')} خطا={r.get('error') or '—'}")
        for s in r.get("steps", []):
            print(f"  [{s['status']:>7}] {s['title']}: {s['detail'][:170]}")
        if r.get("result"): print("  result:", json.dumps(r["result"], ensure_ascii=False)[:500])
    except Exception as e:
        print(f"── {tag}: خواندن نشد ({e})")
PYEOF
    ;;

  finish)
    login || exit 1
    say "═══ پایان نشست تمام‌ظرفیت (بازگشت چرخه‌های فهرست‌ها و ظرفیت رله) ═══"
    RC=$(api POST /api/changes/session '{"action":"end"}' "$OUT/step2b-session-end.json")
    say "   HTTP $RC — step2b-session-end.json"
    ;;

  *) echo "فازهای مجاز: login | step2b | finish"; exit 1 ;;
esac
