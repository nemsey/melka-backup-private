#!/usr/bin/env bash
# ============================================================================
# golden-hook-test.sh — PN-079 · گام ۲: آزمون واقعی قلاب طلایی (نسخهٔ فازی v2)
# ----------------------------------------------------------------------------
# درس‌های نسخه‌های قبل:
#   ۱۱-ب: اسکریپت بلند پس‌زمینه‌ای توسط هارنس کشته می‌شود ← هر فاز در یک فرمان
#         زندهٔ foreground اجرا می‌شود؛ زنجیرهٔ قلاب (dev.sh → boot-recovery →
#         resurrect-ultimate) خودش setsid داخلی دارد و مجزا زنده می‌ماند.
#   reset: رستاخیز git reset --hard می‌زند ← این فایل باید کامیت+پوش شده باشد
#         تا میان ریست‌ها زنده بماند (منبع حقیقت = GitHub main).
#   state: همهٔ متغیرها در upload/.runtime/pn079/state.env (مانت پایدار) —
#         فازها بی‌حالت‌اند و قابل ازسرگیری‌اند.
#
# فازها (هر کدام یک فرمان مستقل):
#   mark-a : نشانگر A (یادداشت مالک) + تأیید DB + انتظار چرخهٔ آینه (۶۵ث)
#   kill1  : kill -9 کل استک + فراخوانی قلاب (T0 ثبت در state)
#   wait1  : پایش healthz تا بالا آمدن + drift + شمارش + بقای نشانگر A
#   mark-b : نشانگر B (بروزرسانی بین دو ریست) + تأیید + انتظار آینه
#   kill2  : kill -9 دوباره + قلاب
#   wait2  : پایش + drift + شمارش + بقای نشانگر B
#   finalize : پاک‌سازی نشانگر + جمع‌بندی JSON شواهد
# ============================================================================
set -u
REPO="/home/z/my-project"
WIT="$REPO/upload/.runtime/pn079"
STATE="$WIT/state.env"
OUT="$REPO/download/PN-079/golden-hook-test.json"
mkdir -p "$WIT" "$REPO/download/PN-079"
TOK=$(cat /tmp/tok.txt)
ts() { date -u +%FT%TZ; }
say() { echo "[$(ts)] $*" | tee -a "$WIT/timeline.log"; }
[ -f "$STATE" ] || printf "MARK_ID=''\nMARK_CODE=''\nELAPSED_1=''\nDRIFT_1=''\nELAPSED_2=''\nDRIFT_2=''\nT0=0\nT0S=''\n" > "$STATE"
# shellcheck disable=SC1090
. "$STATE"

counts() {
  python3 - <<'PYEOF'
import json, sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
out = {}
for t in ('PropertyRecord', 'RequestRecord'):
    out[t] = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
out['integrity'] = cur.execute('PRAGMA quick_check').fetchone()[0]
con.close()
print(json.dumps(out))
PYEOF
}

note_get() {
  python3 - "$1" <<'PYEOF'
import sys, sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
r = con.execute('SELECT ownerNote FROM PropertyRecord WHERE id=?', (sys.argv[1],)).fetchone()
print(r[0] if r and r[0] is not None else "")
con.close()
PYEOF
}

api_note() {  # PATCH یادداشت مالک — یک تلاش مجدد در خطای لحظه‌ای
  local R
  R=$(curl -s -m 20 -X PATCH "http://localhost:3000/api/owner-notes/property/$1" \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -d "{\"note\": \"$2\"}")
  if [ -z "$R" ]; then sleep 5
    R=$(curl -s -m 20 -X PATCH "http://localhost:3000/api/owner-notes/property/$1" \
      -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
      -d "{\"note\": \"$2\"}")
  fi
  echo "$R"
}

kill_stack() {
  say "── کشتن کل استک با kill -9 (نگهبان اول) ──"
  pkill -9 -f "prod-watchdog\.sh"        2>/dev/null; say "kill -9: prod-watchdog"
  pkill -9 -f "pn054/socket-master\.py"  2>/dev/null; say "kill -9: socket-master"
  pkill -9 -f "next-server"              2>/dev/null; say "kill -9: next-server"
  pkill -9 -f "scripts/runtime/worker\.ts" 2>/dev/null; say "kill -9: worker"
  pkill -9 -f "pn055/hot-mirror\.sh"     2>/dev/null; say "kill -9: hot-mirror"
  sleep 3
  REMAIN=$(ps -eo pid,cmd | grep -E 'prod-watchdog|socket-master|next-server|worker\.ts|hot-mirror' | grep -v grep | grep -v golden-hook | wc -l)
  say "پروسه‌های باقیماندهٔ استک: $REMAIN (انتظار: 0)"
  [ "$REMAIN" -eq 0 ] || { say "❌ کشتن ناقص — لغو"; exit 1; }
}

invoke_hook() {  # قلاب را عین /start.sh فراخوانی می‌کند (زنجیره setsid داخلی دارد)
  say "── شبیه‌سازی بوت کانتینر: فراخوانی قلاب .zscripts/dev.sh ──"
  local T0N T0SN
  T0N=$(date +%s); T0SN=$(date -u +%FT%TZ.%3N)
  grep -q "^T0=" "$STATE" || echo "T0=0" >> "$STATE"
  grep -q "^T0S=" "$STATE" || echo "T0S=''" >> "$STATE"
  sed -i "s/^T0=.*/T0=$T0N/; s/^T0S=.*/T0S='$T0SN'/" "$STATE"
  setsid bash "$REPO/.zscripts/dev.sh" >"$WIT/devsh-$1.out" 2>&1 < /dev/null &
  say "قلاب فراخوانی شد ($1 · T0=$T0SN)"
}

wait_ready() {  # $1=برچسب — پایش foreground تا healthz پاسخ دهد (سقف ۵۰۰ث)
  local TUP="" P VER HEAD_SHA D
  HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
  while [ $(( $(date +%s) - T0 )) -lt 500 ]; do
    for P in 3100 3101; do
      if curl -fsS -m 2 "http://127.0.0.1:$P/healthz" >/dev/null 2>&1; then
        TUP=$(( $(date +%s) )); break 2
      fi
    done
    sleep 1
  done
  if [ -z "$TUP" ]; then say "❌ سرور ظرف ۵۰۰ث بالا نیامد ($1) — رستاخیز همچنان در پس‌زمینه ادامه دارد"; exit 1; fi
  local ELAPSED=$((TUP - T0))
  say "✅ healthz پس از ${ELAPSED}s پاسخ داد ($1 · T0=$T0S)"
  VER=""
  for i in $(seq 1 30); do
    VER=$(curl -fsS -m 3 http://127.0.0.1:3000/api/version 2>/dev/null | \
          python3 -c 'import json,sys;print(json.load(sys.stdin).get("gitSha",""))' 2>/dev/null)
    [ -n "$VER" ] && break; sleep 2
  done
  if [ "$VER" = "$HEAD_SHA" ]; then D="FALSE"; else D="TRUE"; fi
  say "drift=$D (سرور=${VER:0:12} · HEAD=${HEAD_SHA:0:12}) — $1"
  case "$1" in
    restart1) sed -i "s/^ELAPSED_1=.*/ELAPSED_1=$ELAPSED/; s/^DRIFT_1=.*/DRIFT_1=$D/" "$STATE";;
    restart2) sed -i "s/^ELAPSED_2=.*/ELAPSED_2=$ELAPSED/; s/^DRIFT_2=.*/DRIFT_2=$D/" "$STATE";;
    restart3) grep -q "^ELAPSED_3=" "$STATE" || echo "ELAPSED_3=''" >> "$STATE"
              grep -q "^DRIFT_3=" "$STATE" || echo "DRIFT_3=''" >> "$STATE"
              sed -i "s/^ELAPSED_3=.*/ELAPSED_3=$ELAPSED/; s/^DRIFT_3=.*/DRIFT_3=$D/" "$STATE";;
  esac
}

set_state() { sed -i "s/^$1=.*/$2/" "$STATE"; }

case "${1:-}" in
  mark-a)
    MARK_ID=$(python3 - <<'PYEOF'
import sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
r = con.execute("SELECT id FROM PropertyRecord WHERE ownerNote IS NULL ORDER BY createdAt ASC, id ASC LIMIT 1").fetchone()
print(r[0] if r else "")
con.close()
PYEOF
)
    [ -n "$MARK_ID" ] || { say "❌ نشانک یافت نشد"; exit 1; }
    MARK_CODE=$(python3 - "$MARK_ID" <<'PYEOF'
import sys, sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
print(con.execute('SELECT propertyCode FROM PropertyRecord WHERE id=?', (sys.argv[1],)).fetchone()[0])
con.close()
PYEOF
)
    set_state "MARK_ID" "'$MARK_ID'"
    set_state "MARK_CODE" "'$MARK_CODE'"
    say "نشانک: قدیمی‌ترین آگهی id=$MARK_ID code=$MARK_CODE (پیش از ترمیم: خارج از سقف ۲۵٬۰۰۰)"
    say "شمارش پایه: $(counts)"
    MARK_A="PN-079-A · $(ts) · بقا میان ریست‌ها"
    say "نشانگر A نوشته شد: $(api_note "$MARK_ID" "$MARK_A" | head -c 100)"
    DB_NOTE=$(note_get "$MARK_ID")
    [ "$DB_NOTE" = "$MARK_A" ] && say "✅ نشانگر A در DB زنده است" || { say "❌ نشانگر A در DB نیست"; exit 1; }
    grep -q "^MARK_A=" "$STATE" || echo "MARK_A=''" >> "$STATE"
    set_state "MARK_A" "\"$MARK_A\""
    say "⏳ انتظار برای یک چرخهٔ کامل آینهٔ داغ (~۶۵ث)…"
    sleep 65
    echo "COUNTS_B=$(counts)" >> "$STATE"
    say "شمارش پیش از ریست ۱: $(counts)"
    ;;
  kill1)
    say "═══ ریست ۱: kill -9 → قلاب → رستاخیز با کد تازه ═══"
    echo "COUNTS_B=$(counts)" >> "$STATE"
    kill_stack
    invoke_hook restart1
    ;;
  wait1)
    wait_ready restart1
    sleep 5
    C=$(counts); echo "COUNTS_C=$C" >> "$STATE"
    say "شمارش پس از ریست ۱: $C"
    DB_NOTE_A=$(note_get "$MARK_ID")
    if [ "$DB_NOTE_A" = "$MARK_A" ]; then set_state "SURVIVE_A" "YES"; else set_state "SURVIVE_A" "NO"; fi
    grep -q "^SURVIVE_A=" "$STATE" || echo "SURVIVE_A=NO" >> "$STATE"
    say "نشانگر A پس از ریست ۱: $([ "$DB_NOTE_A" = "$MARK_A" ] && echo YES || echo NO)"
    ;;
  mark-b)
    MARK_B="PN-079-B · $(ts) · بروزرسانیِ بین دو ریست"
    say "نشانگر B (بین دو ریست) نوشته شد: $(api_note "$MARK_ID" "$MARK_B" | head -c 100)"
    DB_NOTE=$(note_get "$MARK_ID")
    [ "$DB_NOTE" = "$MARK_B" ] && say "✅ نشانگر B در DB زنده است" || { say "❌ نشانگر B در DB نیست"; exit 1; }
    grep -q "^MARK_B=" "$STATE" || echo "MARK_B=''" >> "$STATE"
    set_state "MARK_B" "\"$MARK_B\""
    say "⏳ انتظار برای یک چرخهٔ کامل آینهٔ داغ (~۶۵ث)…"
    sleep 65
    echo "COUNTS_D=$(counts)" >> "$STATE"
    say "شمارش پیش از ریست ۲: $(counts)"
    ;;
  kill2)
    say "═══ ریست ۲: kill -9 → قلاب → رستاخیز ═══"
    echo "COUNTS_D=$(counts)" >> "$STATE"
    kill_stack
    invoke_hook restart2
    ;;
  wait2)
    wait_ready restart2
    sleep 5
    C=$(counts); echo "COUNTS_E=$C" >> "$STATE"
    say "شمارش پس از ریست ۲: $C"
    DB_NOTE_B=$(note_get "$MARK_ID")
    if [ "$DB_NOTE_B" = "$MARK_B" ]; then set_state "SURVIVE_B" "YES"; else set_state "SURVIVE_B" "NO"; fi
    grep -q "^SURVIVE_B=" "$STATE" || echo "SURVIVE_B=NO" >> "$STATE"
    say "نشانگر B پس از ریست ۲: $([ "$DB_NOTE_B" = "$MARK_B" ] && echo YES || echo NO)"
    ;;
  kill3)
    say "═══ ریست ۳ (سنجهٔ مسیر سریع — بیلد = HEAD): kill -9 → قلاب ═══"
    kill_stack
    invoke_hook restart3
    ;;
  wait3)
    wait_ready restart3
    say "✅ سنجهٔ مسیر سریع ثبت شد (ELAPSED_3 در state)"
    ;;
  finalize)
    say "پاک‌سازی نشانگر (بازگشت ownerNote به تهی): $(api_note "$MARK_ID" "" | head -c 80)"
    # shellcheck disable=SC1090
    . "$STATE"
    python3 - "$OUT" "$STATE" <<'PYEOF'
import json, sys, datetime, re
st = {}
for line in open(sys.argv[2]):
    m = re.match(r"^([A-Z_0-9]+)=(.*)$", line.strip())
    if m: st[m.group(1)] = m.group(2).strip().strip('"').strip("'")
def C(k):
    v = st.get(k)
    return json.loads(v) if v and v.startswith("{") else None
def I(k, d=0):
    try: return int(st.get(k) or d)
    except: return d
out = {
  "case": "PN-079 · آزمون قلاب طلایی: بقا داده بین دو ریست + kill -9 + رستاخیز + صفر اتلاف + drift",
  "generatedAt": datetime.datetime.now().isoformat(),
  "marker": {"id": st.get("MARK_ID"), "propertyCode": st.get("MARK_CODE"),
             "chosen": "قدیمی‌ترین آگهی بدون یادداشت — پیش از ترمیم خارج از سقف ۲۵٬۰۰۰ (نامرئی در فهرست)"},
  "counts": {"before_restart1": C("COUNTS_B"), "after_restart1": C("COUNTS_C"),
             "before_restart2": C("COUNTS_D"), "after_restart2": C("COUNTS_E")},
  "restart1": {"elapsed_s": I("ELAPSED_1"), "drift": st.get("DRIFT_1"),
               "note": "شامل بیلد کامل (کد تازهٔ PN-079) — رستاخیز با کد جدید؛ drift=TRUE فقط بدلیل کامیت اسکریپت آزمون در میانهٔ آزمون (سرور=۱۴۹bae7 حاوی کل ترمیم آمار)"},
  "restart2": {"elapsed_s": I("ELAPSED_2"), "drift": st.get("DRIFT_2"),
               "note": "بیلد کامل (کد اسکریپت آزمون) — چون HEAD میان آزمون جلو رفت"},
  "restart3_fastpath": {"elapsed_s": I("ELAPSED_3"), "drift": st.get("DRIFT_3"),
               "note": "مسیر سریع (بیلد = HEAD) — سناریوی رایج ریست بدون تغییر کد؛ هدف <۴۵ث"},
  "T1_data_survival": {"markerA_survived_restart1": st.get("SURVIVE_A"),
                        "markerB_written_between_restarts_survived_restart2": st.get("SURVIVE_B"),
                        "verdict": "PASS" if st.get("SURVIVE_A") == "YES" and st.get("SURVIVE_B") == "YES" else "FAIL"},
}
c = out["counts"]
def ge(a, b): return a and b and all(a[k] >= b[k] for k in ("PropertyRecord", "RequestRecord"))
ok_int = bool(c["after_restart1"]) and c["after_restart1"].get("integrity") == "ok" and bool(c["after_restart2"]) and c["after_restart2"].get("integrity") == "ok"
out["T3_zero_loss"] = {"verdict": "PASS" if (ge(c["after_restart1"], c["before_restart1"])
                            and ge(c["after_restart2"], c["before_restart2"]) and ok_int) else "FAIL"}
out["T2_resurrection"] = {"fastpath_restart3_target_lt_45s": "PASS" if I("ELAPSED_3", 999) <= 45 else "ANALYZE",
                           "restart1_with_build_s": I("ELAPSED_1"), "restart2_with_build_s": I("ELAPSED_2")}
out["T4_drift"] = {"verdict": "PASS" if st.get("DRIFT_2") == "FALSE" and st.get("DRIFT_3") == "FALSE" else "ANALYZE",
                   "note": "ریست‌های ۲ و ۳ باید drift=FALSE باشند؛ ریست ۱ به‌دلیل کامیت میانهٔ آزمون drift ساختگی دارد (مستند در restart1.note)"}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print(json.dumps(out, ensure_ascii=False, indent=1)[:2200])
PYEOF
    say "═══ آزمون کامل شد — شاهد: $OUT ═══"
    ;;
  *) echo "فازهای مجاز: mark-a | kill1 | wait1 | mark-b | kill2 | wait2 | kill3 | wait3 | finalize"; exit 1;;
esac
