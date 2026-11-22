#!/usr/bin/env bash
# ============================================================================
# DIR-FF-RELAY-POLICY-001 · شاهد زندهٔ سیاست رلهٔ ترموکس در کاشی فایل‌یابی
# ----------------------------------------------------------------------------
# دستور مالک (۱۴۰۵/۰۹/۰۱):
#   اولاً-۱) اسکن دیوار → حالت عادی، بدون رلهٔ ترموکس
#   اولاً-۲) ثبت فایل کشف‌شده در ARM → از طریق رلهٔ ترموکس
#
# این اسکریپت فقط بند اول را «زنده» اثبات می‌کند (بند دوم: تست گارد
# dir-ff-relay-policy-001.test.ts + شاهد کد روت register — ثبت واقعی در ARM
# خارج از دستور این نوبت نیست و اجرا نمی‌شود).
#
# فازها (هر فاز یک فرمان foreground — درس ۱۱-ب):
#   before : تصویر صف رله + نشست تمام‌ظرفیت + ضربان رله (پیش از اسکن)
#   scan   : اسکن دیوار واقعی در حالت عادی — POST /api/divar/scan
#   after  : تصویر پس از اسکن + دلتای صف رله در پنجرهٔ اسکن + حکم JSON
# ============================================================================
set -u
REPO="/home/z/my-project"
OUT="$REPO/download/DIR-FF-RELAY-POLICY-001"
TOKF="/tmp/dir-ff-relay-policy-001.tok"
mkdir -p "$OUT"
ts() { date -u +%FT%TZ; }
say() { echo "[$(ts)] $*" | tee -a "$OUT/evidence.log"; }

login() {
  local CODE LOGIN
  CODE=$(grep -E '^MASTER_ACCESS_CODE=' "$REPO/.env.local" | head -1 | cut -d= -f2 | tr -d '"' | tr -d "'")
  [ -n "$CODE" ] || { say "❌ کد مدیر در .env.local نیست"; return 1; }
  LOGIN=$(curl -s --max-time 20 -X POST http://127.0.0.1:3000/api/auth/master-login \
    -H 'Content-Type: application/json' -d "{\"masterCode\":\"$CODE\"}")
  echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('sessionToken') or (d.get('session') or {}).get('token') or '')" > "$TOKF" 2>/dev/null
  chmod 600 "$TOKF"
  [ -n "$(cat "$TOKF")" ] || { say "❌ ورود ناموفق: $(echo "$LOGIN" | head -c 200)"; return 1; }
  say "✓ ورود مالک (توکن در حافظه — چاپ نمی‌شود)"
}

# تصویر وضعیت: صف رله (شمارش/میزبان‌ها) + نشست + ضربان رله
snapshot() {  # snapshot <outfile> <windowStartMs()>
  python3 - "$1" "${2:-0}" <<'PYEOF'
import json, sqlite3, sys, os, time
outfile, win_start = sys.argv[1], int(sys.argv[2])
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
snap = {"takenAtMs": int(time.time()*1000)}
# صف رله — کل
snap["relayQueue"] = dict(cur.execute(
  'SELECT status, COUNT(*) FROM RelayQueue GROUP BY status').fetchall())
# آیتم‌های همساخت در پنجرهٔ اسکن (اگر پنجره داده شده)
if win_start > 0:
    rows = cur.execute(
      'SELECT url, source, priority, status FROM RelayQueue WHERE enqueuedAt >= ?',
      (win_start,)).fetchall()
    in_window = {
      "total": len(rows),
      "divarHost": sum(1 for r in rows if "divar.ir" in r[0]),
      "melkTabrizHost": sum(1 for r in rows if "melketabriz.ir" in r[0]),
      "bySource": {},
      "sample": [r[0] for r in rows[:5]],
    }
    for r in rows:
        in_window["bySource"][r[1]] = in_window["bySource"].get(r[1], 0) + 1
    snap["relayEnqueuedDuringScanWindow"] = in_window
# ضربان رله — آخرین دستگاه دیده‌شده
row = cur.execute(
  'SELECT deviceId, label, lastSeenAt, servedCount FROM RelayDevice '
  'WHERE lastSeenAt IS NOT NULL AND revokedAt IS NULL '
  'ORDER BY lastSeenAt DESC LIMIT 1').fetchone()
snap["relayHeartbeat"] = {"deviceId": row[0], "label": row[1], "lastSeenAt": row[2], "servedCount": row[3]} if row else None
# میزبان غیر-ARM در کل تاریخ صف؟ (گارد ساختاری — باید صفر باشد)
total, non_arm = cur.execute('SELECT COUNT(*), '
  "SUM(CASE WHEN url NOT LIKE '%melketabriz.ir%' THEN 1 ELSE 0 END) FROM RelayQueue").fetchone()
snap["relayQueueAllTime"] = {"total": total, "nonMelkTabrizHost": non_arm or 0}
con.close()
# نشست تمام‌ظرفیت
sess_path = os.path.join('/home/z/my-project', 'upload/.runtime/changes-session.json')
snap["changesSessionActive"] = os.path.exists(sess_path)
json.dump(snap, open(outfile, 'w'), ensure_ascii=False, indent=2)
print(json.dumps(snap, ensure_ascii=False)[:600])
PYEOF
}

case "${1:-}" in
  login) login ;;

  before)
    login || exit 1
    say "── تصویر پیش از اسکن ──"
    snapshot "$OUT/relay-before.json"
    ;;

  scan)
    say "── اسکن دیوار واقعی در حالت عادی (POST /api/divar/scan) ──"
    WIN_START=$(python3 -c "import time; print(int(time.time()*1000))")
    echo "$WIN_START" > "$OUT/.window-start"
    TOK=$(cat "$TOKF")
    R=$(curl -s --max-time 320 -w "\n%{http_code}" -X POST "http://127.0.0.1:3000/api/divar/scan" \
      -H "Authorization: Bearer $TOK")
    RC="${R##*$'\n'}"
    printf '%s' "${R%$'\n'*}" | python3 -m json.tool > "$OUT/scan-result.json" 2>/dev/null || printf '%s' "${R%$'\n'*}" > "$OUT/scan-result.json"
    say "   HTTP $RC — scan-result.json"
    python3 - "$OUT/scan-result.json" <<'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
s = d.get("summary") or {}
print("ok:", d.get("ok"), "| scanned:", s.get("scanned"), "| fetched:", s.get("fetched"),
      "| newAds:", s.get("newAds"), "| durationMs:", s.get("durationMs"), "| source:", s.get("source"))
PYEOF
    ;;

  after)
    say "── تصویر پس از اسکن + حکم ──"
    WIN_START=$(cat "$OUT/.window-start")
    snapshot "$OUT/relay-after.json" "$WIN_START"
    python3 - "$OUT" <<'PYEOF'
import json, sys
out = sys.argv[1]
before = json.load(open(f"{out}/relay-before.json"))
after = json.load(open(f"{out}/relay-after.json"))
scan = json.load(open(f"{out}/scan-result.json"))
w = after["relayEnqueuedDuringScanWindow"]
verdict = {
  "directive": "DIR-FF-RELAY-POLICY-001 — اسکن دیوار در حالت عادی بدون رلهٔ ترموکس",
  "scanOk": bool(scan.get("ok")),
  "scanSource": (scan.get("summary") or {}).get("source"),
  "scanScanned": (scan.get("summary") or {}).get("scanned"),
  "scanFetched": (scan.get("summary") or {}).get("fetched"),
  "changesSessionBefore": before["changesSessionActive"],
  "changesSessionAfter": after["changesSessionActive"],
  "relayDivarHostItemsDuringScan": w["divarHost"],
  "relayMelkTabrizItemsDuringScan": w["melkTabrizHost"],
  "relayAllTimeNonMelkTabrizHost": after["relayQueueAllTime"]["nonMelkTabrizHost"],
  "relayHeartbeatAlive": after["relayHeartbeat"] is not None,
}
verdict["PASS"] = (
  verdict["scanOk"]
  and not verdict["changesSessionBefore"]
  and not verdict["changesSessionAfter"]
  and verdict["relayDivarHostItemsDuringScan"] == 0
  and verdict["relayAllTimeNonMelkTabrizHost"] == 0
)
json.dump({"verdict": verdict, "windowDetail": w}, open(f"{out}/verdict.json", "w"),
          ensure_ascii=False, indent=2)
print(json.dumps(verdict, ensure_ascii=False, indent=2))
PYEOF
    ;;

  *) echo "فازهای مجاز: login | before | scan | after"; exit 1 ;;
esac
