#!/usr/bin/env bash
# ============================================================
# P6549 — بازگردانی فایل‌های حذف‌شدهٔ upload/ توسط reset --hard
# علت: کامیت بوت پلتفرم (e4f9fe4) upload/* را track کرده بود؛
#       reset به 2498719 (فاقد آن‌ها) فایل‌ها را از مونت ossfs پاک کرد.
# منبع بازگردانی: آبجکت‌های همان کامیت (تا قبل از gc موجودند).
# محافظ آینده: .gitignore /upload/ (کامیت بهداشت 4875388) — دیگر هرگز.
# ============================================================
set -uo pipefail
cd /home/z/my-project

echo "== وضعیت فعلی upload =="
ls upload/.survival/ 2>/dev/null | head -5 || echo "(خالی/حذف)"
ls upload/.mirror/ 2>/dev/null | head -5 || echo "(خالی/حذف)"

echo ""
echo "== فایل‌های upload در کامیت بوت e4f9fe4 =="
mapfile -t FILES < <(git ls-tree -r e4f9fe4 --name-only 2>/dev/null | grep "^upload/" || true)
echo "تعداد: ${#FILES[@]}"

RESTORED=0; KEPT=0
for p in "${FILES[@]:-}"; do
  [ -z "$p" ] && continue
  if [ -e "$p" ]; then
    KEPT=$((KEPT+1))   # روی دیسک هست — دست نمی‌زنیم
  else
    mkdir -p "$(dirname "$p")"
    if git show "e4f9fe4:$p" > "$p" 2>/dev/null; then
      RESTORED=$((RESTORED+1))
    else
      echo "FAIL: $p"
    fi
  fi
done
echo ""
echo "نتیجه: بازگردانی=$RESTORED · موجود_بود=$KEPT"

echo ""
echo "== راستی‌آزمایی md5 بستهٔ P6548 پس از بازگردانی =="
cd upload/.survival/P6548-recovery-20261004 2>/dev/null && md5sum -c MANIFEST.md5 2>&1 | grep -v ": OK" | head -5; md5sum -c MANIFEST.md5 2>&1 | grep -c ": OK" | sed 's/^/OK count: /'
cd /home/z/my-project

echo ""
echo "== جایگزینی نهایی DB از بستهٔ بقا (۰۴:۴۶Z — تازه‌ترین) =="
stat -c "current: %s bytes (mtime %y)" db/custom.db
cp upload/.survival/P6548-recovery-20261004/custom.db db/custom.db && echo "OK: DB از بسته جایگزین شد"
stat -c "swapped:  %s bytes (mtime %y)" db/custom.db
md5sum db/custom.db
