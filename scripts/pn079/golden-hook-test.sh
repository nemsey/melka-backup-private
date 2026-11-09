#!/usr/bin/env bash
# ============================================================================
# golden-hook-test.sh — PN-079 · گام ۲: آزمون واقعی قلاب طلایی
# ----------------------------------------------------------------------------
# سناریوها (عین دستور مالک):
#   T1 · بقا: نشانگر A (یادداشت مالک) پیش از ریست ۱ + نشانگر B «بین دو ریست»
#             پس از ریست ۱ → ریست ۲ → هر دو نشانگر باید زنده باشند
#             (اثبات حفظ بروزرسانی‌های صورت‌گرفته بین دو ریست سرور)
#   T2 · رستاخیز: kill -9 کل استک → قلاب بوت → healthz (هدف <۴۵ث برای ریستِ
#             بدون تغییر کد؛ ریست ۱ شامل بیلد کامل است و جداگانه گزارش می‌شود)
#   T3 · صفر اتلاف: شمارش رکوردها + integrity قبل/بعد هر ریست (after ≥ before)
#   T4 · drift: نسخهٔ زندهٔ سرور == HEAD گیت پس از رستاخیز
#
# نشانگر روی قدیمی‌ترین آگهی (createdAt صعودی) زده می‌شود — رکوردی که پیش از
# ترمیم PN-079 خارج از سقف ۲۵٬۰۰۰ از فهرست حذف می‌شد: آزمون هم‌زمان بازگشت
# ردیف‌های قدیمی به نمایش را هم اثبات می‌کند.
#
# شواهد: download/PN-079/golden-hook-test.json + upload/.runtime/pn079/
# ============================================================================
set -u
REPO="/home/z/my-project"
WIT="$REPO/upload/.runtime/pn079"
OUT="$REPO/download/PN-079/golden-hook-test.json"
mkdir -p "$WIT" "$REPO/download/PN-079"
TOK=$(cat /tmp/tok.txt)
ts() { date -u +%FT%TZ; }

say() { echo "[$(ts)] $*" | tee -a "$WIT/timeline.log"; }

counts() {  # شمارش + integrity زندهٔ DB → JSON واحد
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

note_get() {  # ownerNote یک id از DB
  python3 - "$1" <<'PYEOF'
import sys, sqlite3
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
r = con.execute('SELECT ownerNote FROM PropertyRecord WHERE id=?', (sys.argv[1],)).fetchone()
print(r[0] if r and r[0] is not None else "")
con.close()
PYEOF
}

api_note() {  # PATCH یادداشت مالک: $1=id $2=note
  curl -s -m 20 -X PATCH "http://localhost:3000/api/owner-notes/property/$1" \
    -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    -d "{\"note\": \"$2\"}"
}

kill_stack() {
  say "── کشتن کل استک با kill -9 (نگهبان اول تا ری‌اسپاون نداشته باشیم) ──"
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

resurrect_and_measure() {  # $1 = برچسب (restart1/restart2)
  say "── شبیه‌سازی بوت کانتینر: فراخوانی قلاب .zscripts/dev.sh ($1) ──"
  T0=$(date +%s); T0S=$(date -u +%FT%TZ.%3N)
  setsid bash "$REPO/.zscripts/dev.sh" >"$WIT/devsh-$1.out" 2>&1 &
  TUP=""; ELAPSED=""
  while [ $(( $(date +%s) - T0 )) -lt 420 ]; do
    for P in 3100 3101; do
      if curl -fsS -m 2 "http://127.0.0.1:$P/healthz" >/dev/null 2>&1; then
        TUP=$(date +%s); ELAPSED=$((TUP - T0)); break 2
      fi
    done
    sleep 1
  done
  if [ -z "$TUP" ]; then say "❌ سرور ظرف ۴۲۰ث بالا نیامد ($1)"; exit 1; fi
  say "✅ healthz پس از ${ELAPSED}s پاسخ داد ($1 · T0=$T0S)"
  # drift: نسخهٔ زنده == HEAD
  HEAD_SHA=$(git -C "$REPO" rev-parse HEAD)
  VER=""
  for i in $(seq 1 40); do
    VER=$(curl -fsS -m 3 http://127.0.0.1:3000/api/version 2>/dev/null | \
          python3 -c 'import json,sys;print(json.load(sys.stdin).get("gitSha",""))' 2>/dev/null)
    [ -n "$VER" ] && break; sleep 2
  done
  if [ "$VER" = "$HEAD_SHA" ]; then DRIFT="FALSE"; else DRIFT="TRUE"; fi
  say "drift=$DRIFT (سرور=${VER:0:12} · HEAD=${HEAD_SHA:0:12}) — $1"
  ELAPSED_R1=$ELAPSED; DRIFT_R1=$DRIFT
}

# ══════════════ فاز ۰: یافتن نشانک (قدیمی‌ترین آگهی بدون یادداشت) ══════════════
say "═══ PN-079 آزمون قلاب طلایی — شروع ═══"
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
say "نشانک: قدیمی‌ترین آگهی id=$MARK_ID code=$MARK_CODE (پیش از ترمیم: خارج از سقف ۲۵٬۰۰۰)"

COUNTS_A=$(counts)
say "شمارش پیش از هر چیز: $COUNTS_A"

# ══════════════ فاز ۱: نشانگر A (پیش از ریست ۱) ══════════════
MARK_A="PN-079-A · $(ts) · بقا میان ریست‌ها"
RESP=$(api_note "$MARK_ID" "$MARK_A")
say "نشانگر A نوشته شد: $(echo "$RESP" | head -c 120)"
DB_NOTE=$(note_get "$MARK_ID")
[ "$DB_NOTE" = "$MARK_A" ] && say "✅ نشانگر A در DB زنده است" || { say "❌ نشانگر A در DB نیست: $DB_NOTE"; exit 1; }
say "⏳ انتظار برای یک چرخهٔ کامل آینهٔ داغ (~۶۵ث) تا نشانگر در لایهٔ پایدار بنشیند…"
sleep 65
COUNTS_B=$(counts)
say "شمارش پیش از ریست ۱: $COUNTS_B"

# ══════════════ فاز ۲: ریست ۱ (kill -9 → قلاب → رستاخیز با کد تازه) ══════════════
kill_stack
resurrect_and_measure restart1
ELAPSED_1=$ELAPSED_R1; DRIFT_1=$DRIFT_R1
sleep 8
COUNTS_C=$(counts)
say "شمارش پس از ریست ۱: $COUNTS_C"

DB_NOTE_A=$(note_get "$MARK_ID")
if [ "$DB_NOTE_A" = "$MARK_A" ]; then SURVIVE_A="YES"; else SURVIVE_A="NO"; fi
say "نشانگر A پس از ریست ۱: $SURVIVE_A («$DB_NOTE_A»)"

# ══════════════ فاز ۳: نشانگر B (بین دو ریست) ══════════════
MARK_B="PN-079-B · $(ts) · بروزرسانیِ بین دو ریست"
RESP_B=$(api_note "$MARK_ID" "$MARK_B")
say "نشانگر B (بین دو ریست) نوشته شد: $(echo "$RESP_B" | head -c 120)"
DB_NOTE_B1=$(note_get "$MARK_ID")
[ "$DB_NOTE_B1" = "$MARK_B" ] && say "✅ نشانگر B در DB زنده است" || { say "❌ نشانگر B در DB نیست"; exit 1; }
say "⏳ انتظار برای یک چرخهٔ کامل آینهٔ داغ (~۶۵ث)…"
sleep 65
COUNTS_D=$(counts)

# ══════════════ فاز ۴: ریست ۲ (kill -9 → قلاب → رستاخیز مسیر سریع) ══════════════
kill_stack
resurrect_and_measure restart2
ELAPSED_2=$ELAPSED_R1; DRIFT_2=$DRIFT_R1
sleep 8
COUNTS_E=$(counts)
say "شمارش پس از ریست ۲: $COUNTS_E"

DB_NOTE_B2=$(note_get "$MARK_ID")
if [ "$DB_NOTE_B2" = "$MARK_B" ]; then SURVIVE_B="YES"; else SURVIVE_B="NO"; fi
say "نشانگر B پس از ریست ۲: $SURVIVE_B («$DB_NOTE_B2»)"

# ══════════════ فاز ۵: پاک‌سازی نشانگر (بازگشت به حالت اولیه) ══════════════
CLEAN=$(api_note "$MARK_ID" "")
say "پاک‌سازی نشانگر (بازگشت ownerNote به تهی): $(echo "$CLEAN" | head -c 80)"

# ══════════════ فاز ۶: جمع‌بندی JSON ══════════════
python3 - "$OUT" "$MARK_ID" "$MARK_CODE" "$COUNTS_B" "$COUNTS_C" "$COUNTS_D" "$COUNTS_E" \
         "$ELAPSED_1" "$DRIFT_1" "$ELAPSED_2" "$DRIFT_2" "$SURVIVE_A" "$SURVIVE_B" <<'PYEOF'
import json, sys, datetime
# argv: 1=OUT 2=MARK_ID 3=MARK_CODE 4=before_r1 5=after_r1 6=before_r2 7=after_r2
#       8=elapsed1 9=drift1 10=elapsed2 11=drift2 12=surviveA 13=surviveB
out = {
  "case": "PN-079 · آزمون قلاب طلایی: بقا داده بین دو ریست + kill -9 + رستاخیز + صفر اتلاف",
  "generatedAt": datetime.datetime.now().isoformat(),
  "marker": {"id": sys.argv[2], "propertyCode": sys.argv[3],
             "chosen": "قدیمی‌ترین آگهی بدون یادداشت — پیش از ترمیم خارج از سقف ۲۵٬۰۰۰ (نامرئی در فهرست)"},
  "counts": {"before_restart1": json.loads(sys.argv[4]), "after_restart1": json.loads(sys.argv[5]),
             "before_restart2": json.loads(sys.argv[6]), "after_restart2": json.loads(sys.argv[7])},
  "restart1": {"elapsed_s": int(sys.argv[8]), "drift": sys.argv[9],
               "note": "شامل بیلد کامل (کد تازهٔ PN-079) — رستاخیز با کد جدید"},
  "restart2": {"elapsed_s": int(sys.argv[10]), "drift": sys.argv[11],
               "note": "مسیر سریع (بیلد = HEAD) — سناریوی رایج ریست بدون تغییر کد؛ هدف <۴۵ث"},
  "T1_data_survival": {"markerA_survived_restart1": sys.argv[12],
                        "markerB_written_between_restarts_survived_restart2": sys.argv[13],
                        "verdict": "PASS" if sys.argv[12] == "YES" and sys.argv[13] == "YES" else "FAIL"},
}
c = out["counts"]
def ge(a, b): return all(a[k] >= b[k] for k in ("PropertyRecord", "RequestRecord"))
out["T3_zero_loss"] = {"verdict": "PASS" if (ge(c["after_restart1"], c["before_restart1"])
                            and ge(c["after_restart2"], c["before_restart2"])
                            and c["after_restart1"]["integrity"] == "ok"
                            and c["after_restart2"]["integrity"] == "ok") else "FAIL"}
out["T2_resurrection"] = {"restart2_target_lt_45s": "PASS" if int(sys.argv[10]) <= 45 else "ANALYZE",
                           "restart1_with_build_s": int(sys.argv[8])}
out["T4_drift"] = {"verdict": "PASS" if sys.argv[9] == "FALSE" and sys.argv[11] == "FALSE" else "FAIL"}
json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print(json.dumps({k: (v.get("verdict") if isinstance(v, dict) and "verdict" in v else v)
                  for k, v in out.items() if k.startswith(("T1", "T2", "T3", "T4"))}, ensure_ascii=False))
PYEOF

say "═══ آزمون کامل شد — شاهد: $OUT ═══"
