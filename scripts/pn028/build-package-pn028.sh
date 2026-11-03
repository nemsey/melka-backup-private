#!/usr/bin/env bash
# build-package-pn028.sh — بستهٔ بقا chainIndex=27 (PN-028 — جلسهٔ ۰۳۵)
# ساختار عین بستهٔ PN-027 (chainIndex=26): ۱۶ قلم + لنگر زنجیرهٔ هش به بستهٔ ۲۶
set -euo pipefail
REPO=/home/z/my-project
PKGNAME="PN-028-$(date -u +%Y%m%d)"
PKG="$REPO/upload/.survival/$PKGNAME"
PREV="$REPO/upload/.survival/PN-027-20261010"
mkdir -p "$PKG/evidence-pn028"

# ── محتویات اجباری (عین قرارداد بستهٔ ۲۶) ──
git -C "$REPO" bundle create "$PKG/repo.bundle" --all
bun -e 'import {Database} from "bun:sqlite"; import {writeFileSync} from "node:fs"; const db=new Database("/home/z/my-project/db/custom.db",{readonly:true}); const data=db.serialize(); writeFileSync(process.argv[1], data); console.log("custom.db serialized:", data.length, "bytes"); db.close()' "$PKG/custom.db"
md5sum "$PKG/custom.db" | awk '{print $1}' > "$PKG/custom.db.md5"
cp -a "$REPO/db/test.db" "$PKG/test.db"
cp -a "$REPO/worklog.md" "$PKG/worklog.md"
cp -a "$REPO/.env" "$PKG/env.txt"
cp -a "$REPO/env.platform.json" "$PKG/env.platform.json"
cp -a "$REPO/package.json" "$PKG/package.json"
cp -a "$REPO/bun.lock" "$PKG/bun.lock"
cp -a "$REPO/prisma/schema.prisma" "$PKG/schema.prisma"
cp -a "$REPO/prisma/schema.postgres.prisma" "$PKG/schema.postgres.prisma"
cp -a "$REPO/AGENTS.md" "$PKG/AGENTS.md"
cp -a "$REPO/docs" "$PKG/docs"
git -C "$REPO" rev-parse HEAD > "$PKG/HEAD"
cat "$REPO/.next/BUILD_ID" > "$PKG/BUILD_ID.txt"
cp -a "$REPO/.next/fingerprint.json" "$PKG/FINGERPRINT.json"

# ── شواهد این پرونده ──
cp -a "$REPO"/download/pn028/*.json "$PKG/evidence-pn028/" 2>/dev/null || true
cp -a "$REPO"/scripts/pn028/*.json "$PKG/evidence-pn028/" 2>/dev/null || true
cp -a "$REPO/upload/.survival/recovery-log.jsonl" "$PKG/evidence-pn028/" 2>/dev/null || true

# ── نقشهٔ وقایع ──
cat > "$PKG/EVENTS.md" <<'EOF'
# بستهٔ بقا ۲۷ — PN-028 (جلسهٔ ۰۳۵ — ۱۴۰۵/۰۷/۱۹)

## چه گذشت؟
- اولاً: ریشه‌یابی دائمی خطای ۵۰۲ نشانگرهای اتصال پس از بالا آمدن اپ
  (پروب‌های موازی ۵ث + کش stale-while-revalidate + کلاینت بی‌صدا — سقف پاسخ
  /api/indicators از ۴۵+ ثانیهٔ زنجیره‌ای به ۵ ثانیه سقف موازی و ~۱۰ms گرم رسید)
- ثانیاً: تحلیل نامحدود مغز ملکا (فاز طرح و توسعه — قفل‌های شمارشی ۱۰/روز و
  ۳/دسته خاموش؛ TTL/Cooldown ضد-تکرار برقرار)
- رابعاً: کاشی تطبیق — فایل درخواست/فایل آگهی (پروندهٔ حرفه‌ای ۶بخشی) + رد با
  دلایل ساختاریافته و «سایر» (یادگیری سه‌لایه) + فیلتر سخت نوع ملک دوجهته
  «و لاغیر» + تحلیل فراکامل ۹ عامله و ۵ بعد (اتاق/طبقه/ساخت)
- خامساً: گذر سرِ تازه M1/M2 (صفحهٔ ۱ تازه‌ترین‌ها پیش از ادامهٔ چرخه) +
  پنجرهٔ ۲۱روزهٔ M3 + سربرگ فهرست‌ها + ستون‌های M2 + فیلترهای دوتایی +
  ترتیب کاشی‌ها (پوشش ۶ · شاخص ۷ · مغز ۸)
- سوم (کاربر مخفی arm/pm): رد صادقانه — مستند در گزارش تحویل

## شاهدها
- دو-سبز: ۲۵۴۳ pass / ۰ fail ×۲ (رکورد — قبلی ۲۵۱۰/۲)
- probe زنده: تطبیق ۱۴۴۶۹ → ۲۰ کاندیدا همه «آپارتمان/فروش» (صفر تخلف و لاغیر)
- probe زنده: حلقهٔ رد — جفت ردشده از پیشنهاد بعدی حذف شد ✓
- BUILD_ID = HEAD = آینه GitHub (پس از push)
EOF

# ── زنجیرهٔ هش (قرارداد: previousChainMd5 = md5 فایل MANIFEST.md5 بستهٔ ۲۶) ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$PKG/CHAIN.txt" <<EOF
chainIndex=27
previousChainMd5=$PREV_MD5
previousPackage=PN-027-20261010
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
workOrder=PN-028 (جلسهٔ ۰۳۵: ریشه‌یابی ۵۰۲ + تحلیل نامحدود + ارتقای فراکامل کاشی تطبیق + تازگی فهرست‌های چهارگانه)
EOF

# ── مانیفست md5 ──
( cd "$PKG" && for f in ./* ./evidence-pn028/* ./docs/*; do [ -f "$f" ] && md5sum "$f"; done > MANIFEST.md5 )

echo "بستهٔ بقا ساخته شد: $PKGNAME"
du -sh "$PKG"
echo "--- CHAIN.txt ---"
cat "$PKG/CHAIN.txt"
echo "--- مانیفست ($(wc -l < "$PKG/MANIFEST.md5") فایل) ---"
