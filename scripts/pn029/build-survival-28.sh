#!/usr/bin/env bash
# build-survival-28.sh — بستهٔ بقا chainIndex=28 (PN-029 — سند شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۳)
# ساختار عین بستهٔ PN-028 (chainIndex=27): ۱۶ قلم + لنگر زنجیرهٔ هش به بستهٔ ۲۷
set -euo pipefail
REPO=/home/z/my-project
PKGNAME="PN-029-$(date -u +%Y%m%d)"
PKG="$REPO/upload/.survival/$PKGNAME"
PREV="$REPO/upload/.survival/PN-028-20261011"
mkdir -p "$PKG/evidence-pn029"

# ── محتویات اجباری (عین قرارداد بستهٔ ۲۷) ──
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
cp -a "$REPO"/download/pn029/*.json "$PKG/evidence-pn029/" 2>/dev/null || true
cp -a "$REPO"/download/pn029/*.md "$PKG/evidence-pn029/" 2>/dev/null || true
cp -a "$REPO"/download/pn029/*.log "$PKG/evidence-pn029/" 2>/dev/null || true
cp -a "$REPO"/upload/.survival/recovery-log.jsonl "$PKG/evidence-pn029/" 2>/dev/null || true

# ── نقشهٔ وقایع ──
cat > "$PKG/EVENTS.md" <<'EOF'
# بستهٔ بقا ۲۸ — PN-029 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۳)

## چه گذشت؟
- اولاً: بخش «رابط سامانهٔ عمومی ملک تبریز» از تنظیمات عمومی حذف شد
  (سرویس استخراج apu پابرجاست — از مسیر پایدارساز کاتالوگ، بدون حضور در تنظیمات)
- ثانیاً سند شورا-ن۰۳۳ کامل اجرا شد:
  * مرحلهٔ ۲: توقف فوری همهٔ تلاش‌های خودکار — پرچم MELK_ARM_OFFLINE=1 +
    Worker بدون catalog-cycle + گاردهای client/probeGet/indicators
  * مرحلهٔ ۳: تشخیص شش‌گانه — DNS سالم · TCP/TLS/HTTP همهٔ ۷ نقطهٔ ملک تبریز
    timeout · کنترلهای دیوار/GitHub پاسخ دادند · Vault: ۴/۴ توکن ناخوانا
  * مرحلهٔ ۴: ریشه = «الف» بلاک IP/فایروال ملک تبریز (+ «ب» هم‌زمان)
    — IP خروجی کانتینر متغیر است (سه مقدار در سه اندازه‌گیری)
  * مرحلهٔ ۵: صفر تلاش + صبر + متن تماس مالک (owner-call-script.md)
  * مرحلهٔ ۶: فیوز قطع‌کنندهٔ Retry هوشمند (۱بار/۶س · ۶/۱۲/۲۴س · ۳ شکست=قفل ۲۴س)
  * مرحلهٔ ۷: گارد IP کانتینر (کار ۶ساعتهٔ Worker + ContainerIpLog + AuditLog)
  * مرحلهٔ ۸: مکانیزم OTP تک‌وراث (قفل ۶س + OtpRateLimit + API مخصوص مالک)
- M1-M5 از دیتابیس محلی — صفر قطع خدمت
- دو-سبز ۲۵۶۴/۰ ×۲ (رکورد جدید) · tsc صفر · lint صفر خطا

## بازیابی
`bash scripts/recovery-034/restore.sh` یا راهنمای docs/RECOVERY-POLICY.md —
زنجیرهٔ هش: لنگر این بسته به بستهٔ ۲۷ (PN-028).
EOF

# ── لنگر زنجیرهٔ هش به بستهٔ ۲۷ (عین قرارداد) ──
python3 - "$PKG" "$PREV" <<'PYEOF'
import json, hashlib, os, sys
pkg, prev = sys.argv[1], sys.argv[2]
def dirhash(d):
    items = []
    for root, dirs, files in os.walk(d):
        dirs.sort()
        for f in sorted(files):
            if f in ("CHAIN.json", "MANIFEST.md5"):
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, d)
            items.append((rel, hashlib.sha256(open(p, "rb").read()).hexdigest()))
    return items
prev_hash = hashlib.sha256(json.dumps(dirhash(prev), ensure_ascii=False).encode()).hexdigest()
json.dump({
    "chainIndex": 28,
    "packageName": os.path.basename(pkg),
    "prevPackage": os.path.basename(prev),
    "prevContentHash": prev_hash,
    "createdAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "law": "بستهٔ ۲۸ به محتوای کامل بستهٔ ۲۷ لنگر شده است — زنجیرهٔ بازتولیدپذیری",
}, open(os.path.join(pkg, "CHAIN.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("CHAIN.json — chainIndex=28 anchored to 27")
PYEOF

# ── مهر MANIFEST (بدون مدخل خود-ارجاع MANIFEST.md5) ──
cd "$PKG"
find . -type f ! -name "MANIFEST.md5" | sort | xargs md5sum > MANIFEST.md5
echo "=== بستهٔ ۲۸ ساخته شد: $PKG ==="
du -sh "$PKG" | awk '{print "حجم:", $1}'
