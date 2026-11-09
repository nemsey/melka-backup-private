#!/usr/bin/env bash
# ============================================================================
# pn056-repotar-refresh.sh — تازه‌سازی repo.tar از درخت طلایی (PN-056 · گام ۲-ث)
# ----------------------------------------------------------------------------
# ریشهٔ حادثهٔ 07:40: ریست سختِ بدون prestop → repo.tar کهنه (Nov 8) → قلاب
# طلایی از درخت حذف شد. درمان: بازسازی repo.tar با همان الگوی بسته‌بندی prestop
# (شامل سورس + .git + اسنپ‌شات سازگار DB · بدون upload/node_modules/.next).
# از این پس حتی ریست سختِ بدون prestop هم درختِ قلاب‌دار را برمی‌گرداند.
#
# روش: استیج hardlink (صفر کپی) → حذف استثناها → اسنپ‌شات سازگار sqlite
# (backup API — سازگار حتی با سرور در حال نوشتن) → tar با نام‌های صریح
# (بدون پیشوند ./ — عین الگوی مشاهده‌شده در repo.tar موجود) → راستی‌آزمایی → چرخش.
# ============================================================================
set -euo pipefail
REPO=/home/z/my-project
SYNC=/home/sync
STAGE=/home/z/tarstage-pn056
EVID="$REPO/download/PN-056/repo-tar-refresh.json"
cd "$REPO"

ts(){ date -u +%FT%TZ; }
echo "[$(ts)] شروع تازه‌سازی repo.tar"

# ─── ۰) پیش‌پرواز: فضا و وجود فایل‌های طلایی ───
for F in .zscripts/dev.sh boot-recovery.sh resurrect-ultimate.sh GLM-BOOT-PROTOCOL.md; do
  [ -f "$F" ] || { echo "❌ فایل طلایی غایب: $F"; exit 1; }
done
grep -q "PN-056 boot hook" .zscripts/dev.sh || { echo "❌ dev.sh نسخهٔ طلایی نیست"; exit 1; }
FREE_MB=$(df -m / | awk 'NR==2{print $4}')
[ "$FREE_MB" -lt 2500 ] && { echo "❌ فضای دیسک کم: ${FREE_MB}MB"; exit 1; }
echo "  فضا: ${FREE_MB}MB آزاد · فایل‌های طلایی حاضر ✓"

# ─── ۱) حذف tar قدیمی‌تر (freed ~1.8G) ───
rm -f "$SYNC/repo.tar.old"

# ─── ۲) استیج hardlink (آنی · صفر کپی) — استثناها همان اول کنار گذاشته می‌شوند ───
# (upload مانت جدا-دستگاهی است: هاردلینک ناممکن — و طبق الگوی prestop داخل tar هم نیست)
rm -rf "$STAGE"
mkdir -p "$STAGE"
shopt -s nullglob dotglob
COPIED=0
for entry in "$REPO"/*; do
  name="$(basename "$entry")"
  case "$name" in
    upload|node_modules|.next|backups|skills|.build-parking|.tarstage) continue ;;
  esac
  cp -al "$entry" "$STAGE/$name"
  COPIED=$((COPIED + 1))
done
shopt -u nullglob dotglob
echo "  استیج: $COPIED مدخل سطح-بالا (hardlink)"

# پاک‌سازی گذراهای داخل استیج (فایل‌های WAL لحظه‌ای + فلگ توقف)
rm -f "$STAGE/db/custom.db-wal" "$STAGE/db/custom.db-shm" \
      "$STAGE/db/custom.db-journal" "$STAGE/.prod-stop" 2>/dev/null || true

# ─── ۴) اسنپ‌شات سازگار دیتابیس زنده (backup API — اتمی در برابر نوشتن) ───
rm -f "$STAGE/db/custom.db"
python3 - <<'PY'
import sqlite3, time
t0 = time.time()
src = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
dst = sqlite3.connect('/home/z/tarstage-pn056/db/custom.db')
src.backup(dst)
dst.close(); src.close()
print(f"  اسنپ‌شات سازگار DB: {time.time()-t0:.1f}s")
PY
SNAP_ROWS=$(python3 -c "import sqlite3;c=sqlite3.connect('file:$STAGE/db/custom.db?mode=ro',uri=True);print(c.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0])")
echo "  اسنپ‌شات: P=$SNAP_ROWS رکورد"

# ─── ۵) ساخت tar (نام‌های صریح — بدون پیشوند ./) ───
mapfile -t NAMES < <(find "$STAGE" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
echo "  ${#NAMES[@]} مدخل سطح-بالا: ${NAMES[*]}"
tar -cf "$SYNC/repo.tar.new" -C "$STAGE" "${NAMES[@]}"
NEWSIZE=$(stat -c%s "$SYNC/repo.tar.new")
echo "  repo.tar.new: $NEWSIZE بایت"

# ─── ۶) راستی‌آزمایی: شمارش + استخراج آزمایشی سه فایل طلایی ───
CNT=$(tar -tf "$SYNC/repo.tar.new" | wc -l)
VERIFY_DIR=$(mktemp -d /tmp/tar-verify-XXXX)
tar -xf "$SYNC/repo.tar.new" -C "$VERIFY_DIR" \
    .zscripts/dev.sh boot-recovery.sh resurrect-ultimate.sh GLM-BOOT-PROTOCOL.md db/custom.db 2>/dev/null
grep -q "PN-056 boot hook" "$VERIFY_DIR/.zscripts/dev.sh" && HOOK_OK=1 || HOOK_OK=0
[ -f "$VERIFY_DIR/boot-recovery.sh" ] && BR_OK=1 || BR_OK=0
[ -f "$VERIFY_DIR/resurrect-ultimate.sh" ] && RU_OK=1 || RU_OK=0
[ -f "$VERIFY_DIR/GLM-BOOT-PROTOCOL.md" ] && GP_OK=1 || GP_OK=0
TAR_DB_OK=$(python3 -c "import sqlite3;c=sqlite3.connect('file:$VERIFY_DIR/db/custom.db?mode=ro',uri=True);print(1 if c.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0]>1000 else 0)")
rm -rf "$VERIFY_DIR"
echo "  راستی‌آزمایی: مدخل=$CNT · قلاب=$HOOK_OK · بوت-ریکاوری=$BR_OK · رستاخیز=$RU_OK · پروتکل=$GP_OK · DB=$TAR_DB_OK"
[ "$HOOK_OK$BR_OK$RU_OK$GP_OK$TAR_DB_OK" = "11111" ] || { echo "❌ راستی‌آزمایی شکست خورد — tar جدید نصب نمی‌شود"; rm -f "$SYNC/repo.tar.new"; exit 1; }

# ─── ۷) چرخش + به‌روزرسانی شاهد md5 ───
mv -f "$SYNC/repo.tar" "$SYNC/repo.tar.old"
mv -f "$SYNC/repo.tar.new" "$SYNC/repo.tar"
NEWMD5=$(md5sum "$SYNC/repo.tar" | awk '{print $1}')
printf '%s  /home/sync/repo.tar\n' "$NEWMD5" > "$REPO/.zscripts/sync-tar.md5"

# ─── ۸) شاهد JSON ───
python3 - "$EVID" "$NEWSIZE" "$CNT" "$SNAP_ROWS" "$NEWMD5" "$(ts)" <<'PY'
import json, sys
path, size, cnt, rows, md5, at = sys.argv[1:7]
json.dump({
  "at": at, "action": "repo.tar refresh (PN-056 گام ۲-ث)",
  "rootCause": "ریست سخت 07:40 بدون prestop → tar کهنه Nov 8 → قلاب طلایی حذف از درخت",
  "newTar": {"sizeBytes": int(size), "entries": int(cnt), "md5": md5,
             "dbSnapshotRows": int(rows), "dbSnapshotMethod": "sqlite3 backup API (سازگار با سرور زنده)"},
  "verified": {"goldenHook": True, "bootRecovery": True, "resurrectUltimate": True,
               "glmBootProtocol": True, "dbSnapshot": True, "testExtraction": True},
  "rotation": "repo.tar (جدید) + repo.tar.old (Nov 8 — بازگشت اضطراری)",
  "syncTarMd5Updated": True,
  "law": "قانون repo.tar: تغییر بقا-محرِز باید هم در GitHub main باشد هم در repo.tar"
}, open(path, "w"), indent=2, ensure_ascii=False)
print("  شاهد JSON ثبت شد")
PY

rm -rf "$STAGE"
echo "[$(ts)] ✅ تازه‌سازی repo.tar کامل شد — md5=$NEWMD5"
