#!/usr/bin/env bash
# ============================================================================
# pn063-fortress-refresh.sh — تازه‌سازی قلعه + پاک‌سازی چرخشی‌های آلوده (PN-063)
# ----------------------------------------------------------------------------
# قلعه (upload/.data/custom.db) از ۲۴ اکتبر کهنه است و ردیف‌های ملکتونِ
# حذف‌شدهٔ PN-059 را دارد — منبع آلودگی UNION. این اسکریپت:
#   ۱) قلعه را با VACUUM INTO تمیز از دیتابیس زندهٔ پاک‌شده جایگزین می‌کند
#   ۲) سه چرخشیِ آلوده (پیش از پاک‌سازی مجدد) را حذف می‌کند — محتوای
#      ملکتونشان در آرشیو PN-063 موجود است؛ Worker در ≤۵ دقیقه چرخشی تمیز می‌سازد
# صفر دست‌کاری دادهٔ زنده — فقط لایه‌های پایدار هم‌تراز با حکم مالک (PN-059).
# ============================================================================
set -euo pipefail
REPO=/home/z/my-project
LIVE="$REPO/db/custom.db"
FORT="$REPO/upload/.data/custom.db"
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
TMP="$REPO/upload/.data/fortress-fresh-$TS.db"

echo "=== PN-063 تازه‌سازی قلعه — $TS ==="

echo "۱) شمارش پیش از کار (زنده):"
python3 - "$LIVE" <<'PY'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
for t in ["PropertyRecord", "RequestRecord", "ExpertRecord"]:
    m = c.execute(f"SELECT COUNT(*) FROM {t} WHERE tenantId='melketun'").fetchone()[0]
    n = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"   {t}: {n} (ملکتون: {m})")
c.close()
PY

echo "۲) VACUUM INTO قلعهٔ تازه (ossfs — چند دقیقه)…"
python3 - "$LIVE" "$TMP" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute(f"VACUUM INTO '{sys.argv[2]}'")
c.close()
print("   ✓ VACUUM INTO کامل شد")
PY

echo "۳) جایگزینی اتمی قلعه…"
rm -f "$FORT-wal" "$FORT-shm" 2>/dev/null || true
mv -f "$TMP" "$FORT"
echo "   ✓ قلعه تازه‌سازی شد: $FORT ($(stat -c%s "$FORT" 2>/dev/null || echo '?') bytes)"

echo "۴) حذف چرخشی‌های آلوده (محتوا در آرشیو PN-063):"
for f in upload/.data/rolling/live-*.db; do
  [ -f "$f" ] || continue
  echo "   rm $f"
  rm -f "$f"
done

echo "۵) راستی‌آزمایی قلعهٔ تازه:"
python3 - "$FORT" <<'PY'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
ok = True
for t, expect in [("PropertyRecord", 28377), ("RequestRecord", 26038), ("ExpertRecord", 307)]:
    m = c.execute(f"SELECT COUNT(*) FROM {t} WHERE tenantId='melketun'").fetchone()[0]
    n = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    s = "✓" if (m == 0 and n == expect) else "✗"
    if s == "✗": ok = False
    print(f"   {s} {t}: {n} (ملکتون: {m})")
c.close()
import sys as s2
s2.exit(0 if ok else 2)
PY
echo "✅ قلعه تمیز — UNIONهای آینده منبع پاک می‌خوانند"
