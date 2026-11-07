#!/usr/bin/env bash
# ============================================================================
# recover-pn070.sh — جراحی بازیابی PN-070 (حادثهٔ خرابی DB پس از ریست ۲۰۲۶-۱۱-۰۷ ~۰۸:۱۵)
# ============================================================================
# ریشه: ریست سندباکس → SIGKILL وسط نوشتن → دم db/custom.db بریده
#       («database disk image is malformed» از ~۰۸:۱۶ — ۷۸۰+ خطای سرور ·
#        قلعه/چرخشی توسط Worker به فایل ۰بایتی تبدیل شدند)
# تنها لایهٔ سالمِ داده‌دار: بقا PN-060-20261102 (آگهی ۲۸٬۳۷۷ · درخواست ۲۶٬۰۳۸)
#
# گام‌ها (الگوی PN-069-ب + قانون دادهٔ مقدس — هیچ رکورد خواندنی دور ریخته نشود):
#   ۱) توقف تمیز نویسنده‌ها (درس PN-069-ب: جراحی با نویسندهٔ زنده = خرابی مجدد)
#   ۲) قرنطینهٔ DB خراب (هدر سالم است — جابه‌جایی برای اجبار مسیر بوت‌استرپ
#      رستاخیز) + نسخهٔ شاهد بادوام در لایهٔ پایدار
#   ۳) بوت‌استرپ زنده از بقا (کپی اتمی tmp+mv)
#   ۴) استخراج مدارِ خواندنی از DB قرنطینه‌شده (salvage-extract.py — chunked)
#   ۵) UNION رسمی (merge_union.py — INSERT OR IGNORE · فقط رشد · هرگز کاهش)
#   ۶) بازسازی سه گراف از دادهٔ زنده (مشتقات UNION نمی‌شوند)
#   ۷) شاهد نهایی: شمارش‌ها + quick_check
# قانون ۱۱: در هر شکست میانی، سرو از بیلد موجود ادامه می‌یابد.
# ============================================================================
set -uo pipefail
cd /home/z/my-project

TS=$(date -u +%Y%m%dT%H%M%SZ)
INCIDENT="upload/.data/corruption-incident-pn070"
BROKEN="db/custom.db.broken-pn070-$TS"
EXTRACT="$INCIDENT/salvage-extract-$TS.db"
SURVIVAL="upload/.survival/PN-060-20261102/db/custom.db"

restore_service() {
  echo "⚠️ [$(date -u +%FT%TZ)] ناکامی میانی — سرو از بیلد موجود (قانون ۱۱)…"
  rm -f .prod-stop
  bash scripts/start-prod.sh >/dev/null 2>&1 || true
}

echo "🥚 [$(date -u +%FT%TZ)] شروع جراحی بازیابی PN-070…"

# ─── ۱) توقف تمیز نویسنده‌ها ───
touch .prod-stop 2>/dev/null || true
pkill -f "standalone/server.js"    2>/dev/null || true
pkill -f "prod-watchdog.sh"        2>/dev/null || true
pkill -f "scripts/runtime/worker.ts" 2>/dev/null || true
sleep 2
mkdir -p "$INCIDENT"

# ─── ۲) قرنطینه ───
if [ ! -f db/custom.db ]; then
  echo "❌ db/custom.db یافت نشد — شاید از قبل قرنطینه شده؟ (قانون ۱۱)"
  restore_service
  exit 1
fi
mv db/custom.db "$BROKEN"
[ -f db/custom.db-wal ] && mv db/custom.db-wal "$BROKEN-wal"
[ -f db/custom.db-shm ] && mv db/custom.db-shm "$BROKEN-shm"
echo "  ✓ قرنطینه: $BROKEN (+wal/shm)"
cp -f "$BROKEN" "$INCIDENT/custom.db.incident" && echo "  ✓ شاهد بادوام: $INCIDENT/custom.db.incident"
[ -f "$BROKEN-wal" ] && cp -f "$BROKEN-wal" "$INCIDENT/custom.db.incident-wal"

# ─── ۳) بوت‌استرپ از بقا ───
if ! cp -f "$SURVIVAL" db/custom.db.bootstrap-tmp; then
  echo "❌ کپی بقا ناکام — سرو از بیلد موجود (قانون ۱۱)"
  restore_service
  exit 1
fi
mv -f db/custom.db.bootstrap-tmp db/custom.db
rm -f db/custom.db-wal db/custom.db-shm
echo "  ✓ بوت‌استرپ از بقا: $(python3 -c "import sqlite3;print(sqlite3.connect('db/custom.db').execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0])" 2>/dev/null) آگهی"

# ─── ۴) استخراج مدار از DB قرنطینه‌شده ───
if python3 scripts/pn070/salvage-extract.py --corrupt "$BROKEN" --out "$EXTRACT"; then
  echo "  ✓ استخراج مدار کامل شد → $EXTRACT"
else
  echo "  ⚠️ استخراج مدار ناتمام (rc=$?) — ادامه با هرچه درآمد (قانون ۱۱)"
fi

# ─── ۵) UNION رسمی (فقط رشد) ───
python3 scripts/pn050/merge_union.py --live db/custom.db --source "$EXTRACT"

# ─── ۶) بازسازی گراف‌ها ───
echo "— بازسازی سه گراف از دادهٔ زنده…"
if timeout 300 bun scripts/pn005-rebuild-graphs.ts >/tmp/pn070-graph.log 2>&1; then
  tail -3 /tmp/pn070-graph.log | sed 's/^/    /'
else
  echo "  ⚠️ بازسازی گراف ناتمام — رستاخیز گراس را در بوت جبران می‌کند"
fi

# ─── ۷) شاهد نهایی ───
python3 - "$TS" <<'PY'
import json, sqlite3, sys
ts = sys.argv[1]
con = sqlite3.connect('db/custom.db')
w = {}
for t in ['PropertyRecord','RequestRecord','TransactionRecord','ExpertRecord','RelayDevice','GraphNode','Session','ArmConnection']:
    try: w[t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    except Exception: w[t] = 'ERR'
qc = con.execute('PRAGMA quick_check').fetchone()[0]
con.close()
print(json.dumps({"status":"RECOVER_OK" if qc=="ok" else "RECOVER_DIRTY","ts":ts,"witness_counts":w,"quick_check":qc}, ensure_ascii=False))
PY

echo "🥚 [$(date -u +%FT%TZ)] جراحی PN-070 تمام — سرور با رستاخیز رسمی برمی‌گردد (گام بعدی)"
