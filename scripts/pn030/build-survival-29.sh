#!/usr/bin/env bash
# build-survival-29.sh — بستهٔ بقا chainIndex=29 (PN-030 — شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۵)
# ساختار عین بستهٔ PN-029 (chainIndex=28): ۱۶ قلم + لنگر زنجیرهٔ هش به بستهٔ ۲۸
set -euo pipefail
REPO=/home/z/my-project
PKGNAME="PN-030-$(date -u +%Y%m%d)"
PKG="$REPO/upload/.survival/$PKGNAME"
PREV="$REPO/upload/.survival/PN-029-20261011"
mkdir -p "$PKG/evidence-pn030"

# ── محتویات اجباری (عین قرارداد بستهٔ ۲۸) ──
git -C "$REPO" bundle create "$PKG/repo.bundle" --all
bun -e 'import {Database} from "bun:sqlite"; import {writeFileSync} from "node:fs"; const db=new Database("/home/z/my-project/db/custom.db",{readonly:true}); const data=db.serialize(); writeFileSync(process.argv[1], data); console.log("custom.db serialized:", data.length, "bytes"); db.close()' "$PKG/custom.db"
md5sum "$PKG/custom.db" | awk '{print $1}' > "$PKG/custom.db.md5"
cp -a "$REPO/db/test.db" "$PKG/test.db"
cp -a "$REPO/worklog.md" "$PKG/worklog.md"
cp -a "$REPO/.env" "$PKG/env.txt" 2>/dev/null || cp -a "$REPO/.env.local" "$PKG/env.txt"
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
cp -a "$REPO"/download/pn030/*.json "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/download/pn030/*.md "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/download/pn030/*.log "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/download/pn030/*.txt "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/download/pn030/*.png "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/download/pn030/SHA256SUMS "$PKG/evidence-pn030/" 2>/dev/null || true
cp -a "$REPO"/upload/.survival/recovery-log.jsonl "$PKG/evidence-pn030/" 2>/dev/null || true
# سورس Worker (مرحلهٔ ۱ سند) — ماندگاری کامل حتی اگر مخزن در دسترس نباشد
cp -a "$REPO/melka-proxy" "$PKG/melka-proxy"

# ── نقشهٔ وقایع ──
cat > "$PKG/EVENTS.md" <<'EOF'
# بستهٔ بقا ۲۹ — PN-030 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۵)

## چه گذشت؟
- گام اول: نسخهٔ زندهٔ پس از PN-029 راستی‌آزمایی شد (buildId=gitSha=ec353a4=مهر دروازهٔ PN-029)
- گام دوم: ترتیب کاشی‌های داشبورد مدیریتی به دستور مالک:
  آگهی، درخواست، معاملات، کارشناسان، تطبیق، شاخص (۶)، پوشش (۷)، مغز ملکا
- گام سوم/چهارم: سفارش PN-030 با تأیید صریح مالک اجرا شد (لایهٔ ۱ — پروکسی ابری):
  * مرحلهٔ ۱: Worker «melka-proxy» (HMAC زمان-ثابت + whitelist سه دامنه + ضد replay ±۵د
    + صفر لاگ محتوا) — سورس کامل در همین بسته (melka-proxy/)
  * مرحلهٔ ۳: proxyFetch نقطهٔ یگانه در client.ts (صفر fetch مستقیم) + راز HMAC مشترک
  * مرحلهٔ ۴: تست زنده — بلاک مستقیم پابرجا (000×۳) · کنترل‌ها زنده (github 200 · divar 403)
  * مرحلهٔ ۵: پرچم MELK_ARM_OFFLINE پابرجا (قفل ترتیب سند — برداشتن پس از تست عبوری)
  * مرحلهٔ ۶: بخش «ورود مجدد به ملک تبریز» در تنظیمات عمومی (otp-burn + verify + Vault)
- در انتظار: ۱۵ ثانیه OAuth مالک (bash melka-proxy/deploy.sh) ← تست عبوری ←
  برداشتن پرچم ← e2e با OTP (رویهٔ چهارگامه در evidence-pn030/online-mode.json)
- دو-سبز ۲۵۹۳/۰ ×۲ (رکورد جدید) · tsc صفر · lint صفر خطا · ۳۶/۳۶ گارد سبز

## بازیابی
`bash scripts/recovery-034/restore.sh` یا راهنمای docs/RECOVERY-POLICY.md —
زنجیرهٔ هش: لنگر این بسته به بستهٔ ۲۸ (PN-029).
سورس پروکسی ابری: melka-proxy/ (+ bash melka-proxy/deploy.sh برای دیپلوی تازه).
EOF

# ── لنگر زنجیرهٔ هش به بستهٔ ۲۸ (عین قرارداد) ──
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
    "chainIndex": 29,
    "packageName": os.path.basename(pkg),
    "prevPackage": os.path.basename(prev),
    "prevContentHash": prev_hash,
    "createdAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "law": "بستهٔ ۲۹ به محتوای کامل بستهٔ ۲۸ لنگر شده است — زنجیرهٔ بازتولیدپذیری",
}, open(os.path.join(pkg, "CHAIN.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("CHAIN.json — chainIndex=29 anchored to 28")
PYEOF

# ── مهر MANIFEST (بدون مدخل خود-ارجاع MANIFEST.md5) ──
cd "$PKG"
find . -type f ! -name "MANIFEST.md5" | sort | xargs md5sum > MANIFEST.md5
echo "=== بستهٔ ۲۹ ساخته شد: $PKG ==="
du -sh "$PKG" | awk '{print "حجم:", $1}'
