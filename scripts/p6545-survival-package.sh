#!/bin/bash
# P6545 — ساخت بستهٔ بقا (بند ج قانون تثبیت ۰۳۱) + زنجیرهٔ هش (بند ک — chainIndex=3)
set -euo pipefail
cd /home/z/my-project
PKG="upload/.survival/P6545-20261003"
mkdir -p "$PKG/evidence-p6545"

echo "── ۱) git bundle کامل (تاریخچه + کد) ──"
git bundle create "$PKG/repo.bundle" --all 2>/dev/null && echo "repo.bundle ✓"

echo "── ۲) دیتابیس‌ها + worklog + env ──"
cp db/custom.db "$PKG/custom.db"
cp db/test.db "$PKG/test.db"
cp worklog.md "$PKG/worklog.md"
cp .env "$PKG/env.backup" 2>/dev/null || echo "(env نیست)"
cp env.platform.json "$PKG/env.platform.json"
cp package.json "$PKG/package.json"
cp bun.lock "$PKG/bun.lock"

echo "── ۳) شواهد P6545 ──"
cp download/p6545/*.json "$PKG/evidence-p6545/"
cp -r download/p6545/screens "$PKG/evidence-p6545/screens"
cp intelligence-data/calibration-map.json "$PKG/evidence-p6545/" 2>/dev/null || true
cp intelligence-data/retrain-state.json "$PKG/evidence-p6545/" 2>/dev/null || true
cp intelligence-data/cross-tile-outcomes.jsonl "$PKG/evidence-p6545/" 2>/dev/null || true
cp docs/P6537-CLOSURE.md "$PKG/evidence-p6545/"

echo "── ۴) مانیفست md5 ──"
cd "$PKG"
find . -type f ! -name 'manifest-md5.txt' ! -name 'CHAIN.json' -exec md5sum {} \; | sort -k2 > manifest-md5.txt
cd /home/z/my-project

echo "── ۵) زنجیرهٔ هش پیدایش (chainIndex=3 ← md5 زنجیرهٔ P6537) ──"
PREV_MD5=$(md5sum upload/.survival/P6537-20261003/CHAIN.json | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<EOF
{
  "package": "P6545-20261003",
  "chainIndex": 3,
  "previousChainMd5": "$PREV_MD5",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "بستهٔ سوم زنجیرهٔ بقای ملکا — پروندهٔ P6545 (جلسهٔ راهبردی ۰۳۳: پذیرش P6537 + زیرساخت + کاشی‌های M5-M8 + تجهیز مغز). previousChainMd5 = md5 فایل CHAIN.json بستهٔ P6537-20261003. اگر بسته‌ای از زنجیره گم شود، از همین پیوند آشکار می‌شود."
}
EOF
CHAIN_MD5=$(md5sum "$PKG/CHAIN.json" | cut -d' ' -f1)

echo "── ۶) نقشهٔ وقایع (بند ح) ──"
cat > "$PKG/audit-trail.md" <<'EOF'
# نقشهٔ وقایع P6545 — پروندهٔ جلسهٔ راهبردی ۰۳۳

۱. BLOCK 0 — پذیرش P6537 با تقدیر (سند docs/P6537-CLOSURE.md) + چهار تصمیم فوری:
   · تصمیم ۱ recalibrate: قید نظارتی با holdout طبقه‌ای برآورده شد (۶۱ پیامد تازه در ناحیهٔ ۰٫۴-۰٫۶ ≥ ۱۵)؛ Brier holdout ۰٫۲۲۷۵→۰٫۱۳۴۳؛ اجرا از مسیر رسمی RepairExecutor با councilApproved (سند ۰۳۳)
   · تصمیم ۲ retrain: Tier 3 ≥ 3 ✓؛ Lift ۹٫۸٪→۴۶٫۳٪ ≥ قبل → نتیجه نگه داشته (بدون rollback)
   · تصمیم ۳ هدف Tier-aware: ۰٫۲۲ برای Tier 3 تزریق در snapshot موتور P10 (صفر تغییر موتور)
   · تصمیم ۴ همگام‌سازی: نخست تلاش با توکن منقضی (UNAUTHORIZED ثبت‌شده)؛ سپس با گرم‌شدن ARM: درخواست‌ها +۱۱۰ (۷٬۳۹۹→۷٬۵۰۹) و چرخهٔ آگهی‌ها ۱۴/۱۴ کامل — همه از چک‌پوینت (صفر شروع از صفر)
   · ۰٫۳ دو تست fa-sort اصلاح انتظار غلط ریاضی (۱۰۰۲۰<۵۹۱۱۵؛ ح<م) — کل مجموعه کامل سبز شد
   · ۰٫۴ publish 412: معلّق طبق شورا؛ واچر ۸ساعته فعال (/tmp/publish-watch-p6545.log)؛ صفر تغییر کد
۲. گام ۱ — زیرساخت: JobStateService (پایدار در برابر ری‌استارت) · سه گراف (۵۶٬۶۶۳ گره/۴۵٬۷۸۸ یال؛ صفر آویزان — پس از رفع یال‌های آویزان گراف افراد) · پاک‌سازی (۱۵۶ آرشیو؛ صفر حذف) · هشدار فرصت (۱۷۹ هشدار ≥۰٫۷؛ صفر اجرا) · بروزرسانی هوشمند · ۳ اسکنر PASS
   · رخداد صادقانه: کندی سردِ سامانهٔ ARM (~۴۰ثانیه/صفحه) — برش‌ها با مهلت واقع‌بینانه اجرا شدند
   · رخداد صادقانه: امتیازهای یکسان ۰٫۷۵ هشدارها — به‌دلیل خنثی‌بودن عوامل بدون داده (قیمت/منطقهٔ درخواست‌ها و کد کارشناس آگهی‌ها تهی)؛ با پوشش سیگنال شفاف افشا شد؛ با غنی‌سازی داده تنوع می‌گیرد
۳. گام ۲ — کاشی‌ها: M5-M8 ساخته و ثبت شدند (رنگ‌های اختصاصی جلسه ۰۲۶ + OWNER-gate)
   · رخداد صادقانه: کرش client-side کاشی M8 (فیلدهای calibration/brierTarget/checks در route نبود) → رفع با گسترش افزودنی route؛ شاهد زندهٔ پس از رفع
   · رخداد صادقانه: rm -rf .next هنگام build باعث مرگ سرور dev شد (الگوی مستند P6527) → بازراه‌اندازی خودکار سوپروایزر
۴. گام ۳ — مغز: ۴ مدل (SHARED-11؛ صفر تغییر موتور) + ۴ ایجنت + Feature Store مشترک + Cross-Tile (۱۰ معامله ← ۳۷ پیامد؛ ۳ پیوند کارشناس حل‌نشده — افشاشده)
   · رخداد صادقانه: گارد AST فیلتر دامنه — سابقهٔ کارشناس از گراف معاملات محاسبه شد (معماری درست‌تر)
۵. کیفیت: ۱۷۵۶/۱۷۵۶ ×۲ پیاپی (+۲۶۰ تازه) · tsc صفر · ESLint صفر · AUDIT-SCOPE-USAGE PASS · بیلد production سبز
۶. انتشار: preview = 5e9c257-20261003-1035 = HEAD ✓ · publish همچنان 412 (پایش فعال)
EOF

echo "── ۷) جمع‌بندی ──"
SIZE=$(du -sh "$PKG" | cut -f1)
echo "بستهٔ بقا: $PKG ($SIZE)"
echo "chainIndex=3 · previousChainMd5=$PREV_MD5 · CHAIN.md5=$CHAIN_MD5"
