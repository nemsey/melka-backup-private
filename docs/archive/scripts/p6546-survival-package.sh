#!/bin/bash
# P6546 — بستهٔ بقای پروندهٔ P6546 (اجرای دستور شش‌گانه) + زنجیرهٔ هش chainIndex=4
set -e
cd /home/z/my-project
PKG="upload/.survival/P6546-20261003"
mkdir -p "$PKG/evidence-p6546"

echo "== ۱) repo.bundle کامل =="
git bundle create "$PKG/repo.bundle" --all 2>/dev/null && echo "bundle OK"

echo "== ۲) پایگاه داده =="
cp db/custom.db "$PKG/custom.db"
cp db/test.db "$PKG/test.db"

echo "== ۳) worklog + env + وابستگی‌ها =="
cp worklog.md "$PKG/worklog.md"
cp .env "$PKG/env.backup"
cp .env.platform.json "$PKG/env.platform.json" 2>/dev/null || true
cp package.json "$PKG/package.json"
cp bun.lock "$PKG/bun.lock"

echo "== ۴) شواهد P6546 =="
cp -r download/p6546/. "$PKG/evidence-p6546/"

echo "== ۵) مانیفست md5 =="
cd "$PKG"
find . -type f ! -name manifest-md5.txt ! -name CHAIN.json -exec md5sum {} \; | sort -k2 > manifest-md5.txt
wc -l manifest-md5.txt

echo "== ۶) نقشهٔ وقایع =="
cat > audit-trail.md <<'EOF'
# نقشهٔ وقایع P6546 (بند هـ — صداقت کامل)
- BLOCK 0: بکاپ گرم (md5 0db78c9b) · HEAD آغاز f4cca6a · کشف زندهٔ دو سامانه (gap-api + apu عمومی — ۶ فایل شاهد در evidence-p6546/systems-discovery-*.json) · تست پایه ۱۷۵۶×۲
- گام صفر: پیکرهٔ یکپارچه + GAP + ۱۰ نشانگر + نوار پایدار کاشی‌ها · اجرای واقعی استخراج سامانهٔ عمومی: ۳٬۶۷۷ رکورد خوانده، ۲٬۹۱۹ کد غایب افزوده، ۷۵۸ تکمیل، ۴۰ غنی‌سازی جزئیات، صفر خطا (۵ دقیقه)
- رخداد صادقانه: سرور dev پس از push اسکیما نیازمند ری‌استارت بود (PrismaClient کش قدیمی) — kill + بازراه‌اندازی سوپروایزر؛ تست‌DB نیازمند db:push جداگانه
- گام ۱-۴: شش ستون M1 + دو ستون M2 + رفع M3 (بروزرسانی پس‌زمینه‌ای) + مرتب‌سازی سه‌اولویته M4 · کشف ساختار واقعی PM (employeementInfo.date) — اجرای واقعی: ۴۶+ تاریخ استخدام + ۷۱+ نقش پر شد
- flaky موازی شناخته‌شده: تست‌های p6512/bulk-import در اجرای موازی گاهی روی test.db تصادم می‌کنند (در انزوا سبز — الگوی مستند پیشین)
- گام ۵-۶: تجهیز ۶ کاشی به مغز (۱۰ مدل/۱۰ ایجنت همه SHARED-11) + apiSync تاب‌آور + دیمون پایدارساز + ۴۷ تست تازه
- مهر preview: 6dffa4c-20261003-1509 = HEAD ✓ (راستی‌آزمایی زندهٔ UI: هر ۱۶ ستون M1 با دادهٔ واقعی + مرتب‌سازی M4 ۴۹→۱۵→۱۲→۹ + تاریخ‌های استخدام واقعی)
- آینهٔ GitHub: LOCAL = REMOTE = 6dffa4c ✓
EOF

echo "== ۷) زنجیرهٔ هش (chainIndex=4) =="
PREV_MD5=$(md5sum ../P6545-20261003/CHAIN.json | awk '{print $1}')
cat > CHAIN.json <<EOF
{
  "package": "P6546-20261003",
  "chainIndex": 4,
  "previousChainMd5": "$PREV_MD5",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "بستهٔ چهارم زنجیرهٔ بقای ملکا — پروندهٔ P6546 (اجرای دستور شش‌گانه: پیکرهٔ یکپارچهٔ اتصال + دو سامانهٔ تازه GAP/عمومی + غنی‌سازی چهار کاشی + رفع M3 + مرتب‌سازی M4 + پوشش تمام ستون‌ها + تجهیز شش کاشی به مغز + دیمون پایدارساز). previousChainMd5 = md5 فایل CHAIN.json بستهٔ P6545-20261003. اگر بسته‌ای از زنجیره گم شود، از همین پیوند آشکار می‌شود."
}
EOF
echo "chainIndex=4 · previousChainMd5=$PREV_MD5"

echo "== اندازهٔ بسته =="
du -sh "$PKG" | awk '{print $1}'
echo "== بستهٔ بقای P6546 کامل شد =="
