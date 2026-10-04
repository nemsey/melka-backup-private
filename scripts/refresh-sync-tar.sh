#!/usr/bin/env bash
# ============================================================
# refresh-sync-tar.sh — درمان ریشه‌ای حادثات ۲/۳/۴ (P6549)
# ------------------------------------------------------------
# ریشه: پلتفرم در بوت بعدی از /home/sync/repo.tar بازیابی می‌کند؛
#       آرشیو pre-stop فقط در خاموشیِ تمیز اجرا می‌شود ⇒ مرگ ناگهانی
#       کانتینر = بازیابی از اسنپ‌شات کهنه = حادثه.
# درمان: این اسکریپت tar را «خودش» تازه می‌کند (اتمیک با rename).
# فراخوانی: بعد از هر گام بزرگ + توسط دیمن بازیابی هر چرخه.
# ساختار عین آرشیو رسمی پلتفرم: کل درخت پروژه منهای
#   node_modules (بوت dev.sh خودش bun install می‌زند) ·
#   .next (بازسازی خودکار) · upload (مونت پایدار جدا — ossfs) ·
#   backups (بکاپ‌های runtime — کپی امنشان در upload/.survival) ·
#   dev.log
# db/custom.db شامل می‌ماند تا حتی بازیابیِ tar یک‌تنها، داده را هم برگرداند.
# ============================================================
set -uo pipefail
PROJECT="/home/z/my-project"
SYNC_TAR="/home/sync/repo.tar"
TMP="/home/sync/repo.tar.new"
cd "$PROJECT"

if [ ! -w /home/sync ]; then echo "FAIL: /home/sync قابل نوشتن نیست"; exit 1; fi

# اسنپ‌شات سازگار DB (سرور در حال نوشتن است — VACUUM INTO بدون قفل)
STAGE="$PROJECT/.zscripts/tarstage"
rm -rf "$STAGE"; mkdir -p "$STAGE/db"
if bun "$PROJECT/scripts/snapshot-db.ts" "$STAGE/db/custom.db" 2>"$PROJECT/.zscripts/sync-tar-warnings.log"; then
  echo "OK: اسنپ‌شات سازگار DB ($(stat -c%s "$STAGE/db/custom.db") بایت)"
else
  echo "FAIL: اسنپ‌شات DB ناموفق"; exit 1
fi

mapfile -t ITEMS < <(ls -A | grep -vE '^(node_modules|\.next|upload|backups|dev\.log)$')
[ "${#ITEMS[@]}" -gt 5 ] || { echo "FATAL: فهرست اقلام غیرمنطقی (${#ITEMS[@]})"; exit 1; }
echo "اقلام: ${#ITEMS[@]}"

T0=$(date +%s)
# db/custom.db از فهرست اصلی حذف و نسخهٔ سازگار از stage الحاق می‌شود
mapfile -t ITEMS < <(printf '%s\n' "${ITEMS[@]}" | grep -v '^db/custom.db$' || true)
tar -cf "$TMP" "${ITEMS[@]}" 2>>"$PROJECT/.zscripts/sync-tar-warnings.log" || { echo "FAIL: tar خطا خورد"; exit 1; }
( cd "$STAGE" && tar -rf "$TMP" db/custom.db ) 2>>"$PROJECT/.zscripts/sync-tar-warnings.log" || { echo "FAIL: الحاق DB ناموفق"; exit 1; }
TSIZE=$(stat -c%s "$TMP")
# سالم بودن آرشیو پیش از جابه‌جایی (تست سر-آرشیو)
tar -tf "$TMP" >/dev/null 2>&1 || { echo "FAIL: آرشیو خراب است — جایگزینی انجام نشد"; rm -f "$TMP"; exit 1; }
[ -f "$SYNC_TAR" ] && mv -f "$SYNC_TAR" "$SYNC_TAR.old" || true
mv -f "$TMP" "$SYNC_TAR"
T1=$(date +%s)
md5sum "$SYNC_TAR" | tee "$PROJECT/.zscripts/sync-tar.md5"
rm -rf "$STAGE"
echo "OK: repo.tar تازه شد — $((TSIZE/1024/1024))MB در $((T1-T0))s (نسخهٔ قبلی: repo.tar.old)"
