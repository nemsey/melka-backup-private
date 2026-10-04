#!/usr/bin/env bash
# P6551 — ساخت MANIFEST.md سه‌گانهٔ انتقال ملکا (BLOCK 1.3)
# خروجی: upload/skeleton/MANIFEST.md (کانونیک) — اندازه/md5 به‌صورت ماشینی محاسبه می‌شود
set -euo pipefail
cd /home/z/my-project
S=upload/skeleton

MD5_SKELETON=$(md5sum "$S/MELKA-SKELETON-COMPLETE-v1.0.md" | cut -d' ' -f1)
MD5_SOURCE=$(md5sum "$S/melka-source-v1.0-20261004.tar.gz" | cut -d' ' -f1)
MD5_LETTER=$(md5sum "$S/REBUILD-LETTER.md" | cut -d' ' -f1)
SZ_SKELETON=$(stat -c%s "$S/MELKA-SKELETON-COMPLETE-v1.0.md")
SZ_SOURCE=$(stat -c%s "$S/melka-source-v1.0-20261004.tar.gz")
SZ_LETTER=$(stat -c%s "$S/REBUILD-LETTER.md")
STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$S/MANIFEST.md" <<EOF
# مانیفست بستهٔ انتقال ملکا — P6550/P6551

تاریخ ساخت: ۱۴۰۵/۰۷/۱۳ · انتشار: $STAMP  
مرجع: جلسهٔ فوق‌العادهٔ ۰۳۷ (ساخت) + جلسهٔ فوق‌العادهٔ ۰۳۹ (تحویل)  
قید: صفر داده · صفر توکن · صفر رمز (اسکن سه‌مرحله‌ای P6550 سبز)

| # | فایل | حجم (بایت) | md5 | توضیح |
|---|------|-----------|-----|-------|
| ۱ | MELKA-SKELETON-COMPLETE-v1.0.md | $SZ_SKELETON | \`$MD5_SKELETON\` | سند اسکلت کامل ۲۵ فصلی — نقشهٔ معماری کل ملکا (۸٬۷۳۰ خط) |
| ۲ | melka-source-v1.0-20261004.tar.gz | $SZ_SOURCE | \`$MD5_SOURCE\` | سورس کامل بدون داده — ۸۲۷ فایل + MANIFEST.md5، راستی‌آزمایی قرنطینه (بیلد سبز) |
| ۳ | REBUILD-LETTER.md | $SZ_LETTER | \`$MD5_LETTER\` | نامهٔ بازسازی — دستورالعمل ۵ گام + ۷ قید مطلق برای تسک تازه |

## راهنمای راستی‌آزمایی پس از دریافت

\`\`\`bash
md5sum -c MANIFEST.md5   # داخل بستهٔ سورس — باید ۸۲۷/۸۲۷ OK بدهد
md5sum MELKA-SKELETON-COMPLETE-v1.0.md melka-source-v1.0-20261004.tar.gz REBUILD-LETTER.md
\`\`\`

سه مقدار بالا باید عیناً با خروجی md5sum مطابقت کند. در صورت مغایرت، فایل را کنار بگذارید و از مسیر دیگر دریافت کنید.
EOF

echo "MANIFEST-OK $S/MANIFEST.md"
md5sum "$S/MANIFEST.md"
cat "$S/MANIFEST.md" | head -12
