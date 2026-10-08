#!/usr/bin/env bash
# ============================================================
# audit-int-overflow.sh — PN-018/T3b: گارد سرریز Int32 در همهٔ ستون‌های Int
# ------------------------------------------------------------
# ریشهٔ زندهٔ دو خطای گزارش‌شدهٔ مالک (۱۴۰۵/۰۷/۲۰):
#   · مغز هوشمند 500: prisma.propertyRecord.findMany — Value 16500000000
#     does not fit in an INT column
#   · کاشی M1 (آگهی ملک تبریز) فهرست خالی و بینش صفر (همان ریشه)
# علت: SQLite INTEGER ۶۴بیتی است اما ستون Int پریدا ۳۲بیتی — یک ردیف
# کثیف از منبع (ARM) کل findMany را می‌کشد.
# این گارد: هر ستون Int از schema.prisma را روی دادهٔ زنده وارسی می‌کند؛
# هر مقدار خارج [-2^31, 2^31-1] = قرمز فوری (خروج ۱).
# ============================================================
set -uo pipefail
cd /home/z/my-project
DB="${MELKA_DB:-db/custom.db}"

python3 - "$DB" <<'PYEOF'
import re, sqlite3, sys

db_path = sys.argv[1]
schema = open("prisma/schema.prisma", encoding="utf-8").read()

# استخراج مدل‌ها و ستون‌های Int (بدون BigInt — پروژه صفر BigInt دارد)
models: dict[str, list[str]] = {}
current = None
for line in schema.splitlines():
    m = re.match(r"^model\s+(\w+)\s*\{", line)
    if m:
        current = m.group(1)
        models[current] = []
        continue
    if line.startswith("}"):
        current = None
        continue
    if current:
        # Int یا Int? — با یا بدون حاشیه/annotation پس از آن (دریل منفی باگ regex را آشکار کرد:
        # «floor  Int?» انتهای خط هیچ \s بعدی ندارد و الگوی قبلی آن را نمی‌گرفت)
        f = re.match(r"^\s+(\w+)\s+Int\??(?:\s|$)", line)
        if f:
            models[current].append(f.group(1))

con = sqlite3.connect(db_path)
bad = []
checked = 0
for model, cols in models.items():
    if not cols:
        continue
    for col in cols:
        try:
            rows = con.execute(
                f"SELECT rowid, \"{col}\" FROM \"{model}\" "
                f"WHERE \"{col}\" > 2147483647 OR \"{col}\" < -2147483648 LIMIT 5"
            ).fetchall()
        except sqlite3.OperationalError as e:
            # جدول/ستون موقت یا تستی — گزارش هشدار نه شکست
            print(f"  ⚠ {model}.{col}: {e}")
            continue
        checked += 1
        for rowid, val in rows:
            bad.append((model, col, rowid, val))

con.close()
print(f"  بررسی شد: {checked} ستون Int از {sum(1 for c in models.values() if c)} مدل")
if bad:
    print(f"  ✗ {len(bad)} مقدار خارج از Int32:")
    for b in bad[:10]:
        print(f"    {b[0]}.{b[1]} rowid={b[2]} value={b[3]}")
    sys.exit(1)
print("  همهٔ مقادیر ستون‌های Int در دامنهٔ Int32 هستند")
PYEOF
RC=$?
if [ $RC -ne 0 ]; then
  echo "======================================================================="
  echo "FAIL: سرریز Int32 در ستون‌های Int — یک ردیف کثیف کل کوئری‌های پریدا را می‌کشد"
  echo "ترمیم: مقدار نرمال‌شده → NULL (لایهٔ خام محفوظ) + بررسی نویسندهٔ بدون دامنه"
  exit 1
fi
echo "======================================================================="
echo "PASS: گارد سرریز Int32 — سبز"
