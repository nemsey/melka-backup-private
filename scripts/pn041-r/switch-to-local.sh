#!/usr/bin/env bash
# ============================================================
# switch-to-local.sh — PN-041-R (شورا-ن۰۶۸ · فاز ۴/بحران)
# ------------------------------------------------------------
# انتقال دیتابیس زنده از ossfs (FUSE) به دیسک محلی (WAL)
# طبق معماری موردعلاقهٔ شورا-ن۰۶۸: «WAL روی دیسک محلی + سنک ۵دقیقه‌ای به upload/»
#
# شواهد ابطال گزینهٔ «DELETE روی FUSE» (۱۱:۴۳ امروز):
#   · ۵۱۲ خطای P1008 (socket timeout) در ۳ ساعت
#   · دو ژورنال داغ گیرکرده (۱۰:۴۵ و ۱۱:۴۶) → کل سرور + Worker قفل
#   · بنچمارک: ossfs avg=91ms با ریسک hang بی‌نهایت · local WAL avg=0ms
#
# مراحل: توقف تمیز → حفظ قدیمی → VACUUM fortress→local → WAL →
#        هم‌ترازی env → دیمن‌سازی نگهبان → وارسی زنده
# ============================================================
set -uo pipefail
REPO="${REPO_DIR:-/home/z/my-project}"
FORTRESS="$REPO/upload/.data/custom.db"
LOCAL="$REPO/db/custom.db"
TS=$(date -u +%Y%m%dT%H%M%SZ)
WITNESS_DIR="$REPO/download/pn041-r"
mkdir -p "$WITNESS_DIR"

log() { echo "[$(date -u '+%F %T')] $*"; }

# ── ۱) توقف تمیز نگهبان + سرور (الگوی .prod-stop) ──
log "گام ۱: توقف نگهبان و سرور"
touch "$REPO/.prod-stop"
SERVER_PID=$(pgrep -f "standalone/server.js" | head -1 || true)
if [ -n "$SERVER_PID" ]; then
  kill "$SERVER_PID" 2>/dev/null || true
  log "سرور $SERVER_PID سیگنال قتل گرفت"
fi
sleep 8
# نگهبان باید فلگ را دیده و خارج شده باشد؛ اگر زنده بود، قتل مستقیم
WATCHDOG_PID=$(pgrep -f "prod-watchdog.sh" | head -1 || true)
if [ -n "$WATCHDOG_PID" ]; then
  kill "$WATCHDOG_PID" 2>/dev/null || true
  sleep 2
  log "نگهبان $WATCHDOG_PID متوقف شد"
fi
rm -f "$REPO/.prod-stop"

# ── ۲) حفظ نسخهٔ محلی قدیمی (قانون صفر حذف) ──
if [ -s "$LOCAL" ]; then
  mv "$LOCAL" "$LOCAL.pre-pn041r-$TS"
  log "گام ۲: نسخهٔ محلی قدیمی نگه داشته شد: $LOCAL.pre-pn041r-$TS"
fi

# ── ۳) VACUUM fortress → local (اتمی + شاهد) ──
log "گام ۳: VACUUM INTO از قلعه به دیسک محلی (~۹۰ثانیه)"
bun "$REPO/scripts/pn041/vacuum-copy.ts" "$FORTRESS" "$LOCAL" --json "$WITNESS_DIR/db-switch-vacuum.json" || {
  echo "VACUUM ناکام — کپی خام"; cp "$FORTRESS" "$LOCAL"; }

# ── ۴) حالت WAL روی دیسک محلی (چند-فرایندی مطمئن) ──
log "گام ۴: تنظیم WAL + پراگماهای بهینه"
bun -e '
const {Database} = require("bun:sqlite");
const db = new Database("/home/z/my-project/db/custom.db");
db.run("PRAGMA busy_timeout=10000");
db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA synchronous=NORMAL");
db.exec("PRAGMA wal_autocheckpoint=1000");
db.exec("PRAGMA cache_size=-20000");
db.exec("PRAGMA mmap_size=268435456");
const mode = db.query("PRAGMA journal_mode").get();
const integrity = db.query("PRAGMA integrity_check(20)").get();
console.log("journal_mode=", JSON.stringify(mode), "integrity=", JSON.stringify(integrity));
db.close();
' 2>&1

# ── ۵) هم‌ترازی env (URL محلی + پارامترهای اتصال) ──
log "گام ۵: هم‌ترازی env.platform.json و .env"
REPO_DIR="$REPO" python3 - "$REPO" <<'PYEOF'
import json, os, sys
repo = sys.argv[1]
url = "file:" + os.path.join(repo, "db/custom.db?connection_limit=1&socket_timeout=30")
# env.platform.json
p = os.path.join(repo, "env.platform.json")
d = json.load(open(p))
d["DATABASE_URL"] = url
d["_pn041r"] = ("شورا-ن۰۶۸ (PN-041-R): دیتابیس زنده روی دیسک محلی WAL + سنک ۵دقیقه‌ای به upload/.data "
                 "(باقی‌ماندهٔ قلعه) — شاهد ابطال FUSE-DELETE: ۵۱۲×P1008 + دو ژورنال داغ ۱۰:۴۵/۱۱:۴۶")
d["MELK_RELAY_ALT_URL"] = "https://c1vdh8442240-d.space-z.ai"
json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
# .env
open(os.path.join(repo, ".env"), "w").write(
    f"DATABASE_URL={url}\nMELK_RELAY_ALT_URL=https://c1vdh8442240-d.space-z.ai\n")
print("env aligned:", url)
PYEOF

# ── ۶) دیمن‌سازی نگهبان (دو-فورک — درس بوت PN-040) ──
log "گام ۶: دیمن‌سازی نگهبان"
if [ -f "$REPO/scripts/pn040/daemonize-watchdog.py" ]; then
  python3 "$REPO/scripts/pn040/daemonize-watchdog.py" && log "نگهبان دیمن شد" || log "⚠ دیمن‌سازی مستقیم — بوت دستی"
else
  nohup bash "$REPO/scripts/prod-watchdog.sh" >> /dev/null 2>&1 &
  disown
  log "نگهبان nohup شد (اسکریپت دیمن یافت نشد)"
fi

# ── ۷) وارسی زنده ──
sleep 12
log "گام ۷: وارسی سرور"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" -m 10 http://localhost:3000/api/health || echo "000")
log "health=$HEALTH"
if [ "$HEALTH" = "200" ]; then
  log "✓ سوئیچ کامل — سرور روی دیسک محلی WAL زنده است"
else
  log "⚠ health=$HEALTH — لاگ سرور را ببینید"
fi

# شاهد نهایی
python3 - "$WITNESS_DIR/db-switch.json" <<'PYEOF'
import json, sys, os, datetime, subprocess
repo = "/home/z/my-project"
w = {
  "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "operation": "PN-041-R live-db switch: ossfs(FUSE/DELETE) → local-disk(WAL)",
  "justification": "شورا-ن۰۶۸ معماری موردعلاقه: WAL local + sync 5min — گزینهٔ FUSE-DELETE با ۵۱۲×P1008 و دو ژورنال داغ ابطال شد",
  "oldLocalPreserved": sorted(f for f in os.listdir(os.path.join(repo, "db")) if "pre-pn041r" in f),
  "localDb": {"size": os.path.getsize(os.path.join(repo, "db/custom.db"))},
  "vacuumWitness": "db-switch-vacuum.json",
  "envUrl": json.load(open(os.path.join(repo, "env.platform.json")))["DATABASE_URL"],
  "relayAltUrl": "https://c1vdh8442240-d.space-z.ai",
}
try:
  v = json.load(open(os.path.join(repo, "download/pn041-r/db-switch-vacuum.json")))
  w["records"] = v.get("counts", {})
  w["integrity"] = v.get("integrity")
except Exception as e:
  w["vacuumParseError"] = str(e)
json.dump(w, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("شاهد:", sys.argv[1])
PYEOF
