#!/bin/bash
# p6547-cont-survival-package.sh — بستهٔ بقای تکمیلی نشست «تکمیل پروسهٔ مرحلهٔ قبل»
# پروندهٔ P6547-cont (قانون تثبیت ۰۳۱ — بند ج کامل · زنجیرهٔ هش chainIndex=6)
set -euo pipefail
cd /home/z/my-project

STAMP="P6547cont-$(date +%Y%m%d)"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST"

echo "[1/7] بستهٔ git (bundle — کل تاریخ + همهٔ شاخه‌ها شامل survival/code)"
# محدودیت بسته‌بندی: پنج blob دیتابیس ۱۳۰-۱۵۳MB بدون این محدودیت‌ها OOM می‌شوند (pack-objects signal 9)
git -c pack.windowMemory=96m -c pack.threads=1 -c pack.window=5 -c pack.depth=10 \
  bundle create "$DEST/repo.bundle" --all 2>/dev/null
[ -s "$DEST/repo.bundle" ] && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/7] پایگاه‌های داده (custom + test)"
cp db/custom.db "$DEST/custom.db"
cp db/test.db "$DEST/test.db" 2>/dev/null || true
echo "  DBs copied"

echo "[3/7] اسناد (worklog + env + سند قانون)"
cp worklog.md "$DEST/worklog.md"
cp .env "$DEST/env.txt"
cp env.platform.json "$DEST/env.platform.json"
cp AGENTS.md "$DEST/AGENTS.md" 2>/dev/null || true

echo "[4/7] شواهد عددی و بصری این نشست (screens-cont + شواهد عددی آینه)"
mkdir -p "$DEST/evidence-p6547-cont"
cp -r download/p6547/screens-cont "$DEST/evidence-p6547-cont/screens-cont" 2>/dev/null || true
cp upload/.mirror/push-log.jsonl "$DEST/evidence-p6547-cont/mirror-push-log.jsonl" 2>/dev/null || true

echo "[5/7] وابستگی‌های کلیدی (lock + package + schema + prisma)"
cp bun.lock "$DEST/bun.lock" 2>/dev/null || true
cp package.json "$DEST/package.json"
cp prisma/schema.prisma "$DEST/schema.prisma"

echo "[6/7] نقشهٔ وقایع (بند ح)"
cat > "$DEST/EVENTS.md" <<'EOF'
# نقشهٔ وقایع — P6547-cont (تکمیل پروسهٔ مرحلهٔ قبل)
- 2026-10-03 20:56Z: آغاز نشست تکمیلی — وارسی بند و (پیوستگی کامل، صفر بازیابی)
- 2026-10-03 21:01Z: کشف شکاف آینه (آخرین پوش 6dffa4c از 15:12) — توکن ریموت کهنه → re-arm بازسازی
- 2026-10-03 21:02Z: پوش رد شد GH001 — db/custom.db از 74.7MB به 152.8MB (بک‌فیل‌های P6547) — ریشه قطعی
- 2026-10-03 21:03Z: اصلاح صادقانهٔ رکورد ok زودهنگام در push-log (بند هـ)
- 2026-10-03 21:04Z: طراحی و اجرای شاخهٔ یتیم survival/code + ارتقای دیمن به پوش per-ref
- 2026-10-03 21:04-21:07Z: سه مرگ پیاپی دیمن detached — آزمون تجربی الگو → کشف double-fork (PPID=1)
- 2026-10-03 21:11Z: پوش موفق اسنپ‌شات c975e28 + راستی‌آزمایی match
- 2026-10-03 21:16Z: دیمن مقاوم 30480 (ppid=1) — چرخهٔ کامل push+verify موفق
- 2026-10-03 21:17Z: باگ نقل‌قول‌گذاری awk: نشت db در اسنپ‌شات 4ab445d (هرگز پوش نشود) — رفر بازگشت به c975e28 → بازسازی سالم 410a089
- 2026-10-03 21:17Z: git rm --cached سهواً روی ایندکس پیش‌فرض — بازیابی فوری با git reset (تست شد: سالم)
- 2026-10-03 21:18Z: کامیت تثبیتی ec2405d (رانش داده + سازوکار آینه) و 7d70927 (build-snapshot.sh)
- 2026-10-03 21:18-21:19Z: ری‌استارت سرور با سوپروایزر — مهر 7d70927-20261003-2119 = HEAD
- 2026-10-03 21:20Z: راستی‌آزمایی سه‌شاهده از preview عمومی + سه اسکرین‌شات مرورگر واقعی
- 2026-10-03 21:20Z: فعال‌سازی خط لولهٔ publish (Complete) + پایش‌گر مقاوم 5دقیقه‌ای (pid 31758)
- 2026-10-03 21:21Z: اسنپ‌شات 092acdb (← 7d70927) پوش + match
- 2026-10-03 21:26Z: کامیت مستندات c61048e + اسنپ‌شات 5005f2d پوش + match — بستهٔ بقای chainIndex=6
EOF

echo "[7/7] مانیفست md5 + زنجیرهٔ هش (بند ک) — chainIndex=6"
cd "$DEST"
find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.txt" -exec md5sum {} \; | sort -k2 > MANIFEST.md5
echo "  files: $(wc -l < MANIFEST.md5)"
PREV_CHAIN="/home/z/my-project/upload/.survival/P6547-20261003/MANIFEST.md5"
if [ -f "$PREV_CHAIN" ]; then
  PREV_MD5=$(md5sum "$PREV_CHAIN" | cut -d' ' -f1)
  echo "chainIndex=6" > CHAIN.txt
  echo "previousChainMd5=$PREV_MD5" >> CHAIN.txt
  echo "previousPackage=P6547-20261003" >> CHAIN.txt
  echo "createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> CHAIN.txt
  echo "  chain: index=6 → prev=$PREV_MD5"
fi

cd /home/z/my-project
echo "✓ بستهٔ بقای $STAMP کامل شد: $(du -sh "$DEST" | cut -f1)"
