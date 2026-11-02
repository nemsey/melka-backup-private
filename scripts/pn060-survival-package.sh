#!/usr/bin/env bash
# =============================================================================
# pn060-survival-package.sh — بستهٔ بقا PN-060 (زنجیرهٔ ۴۹ · لنگر به مانیفست ۴۸)
# -----------------------------------------------------------------------------
# ساختار عین PN-059-20261101: فایل‌های ریشه + repo.bundle + شاهد DB (VACUUM INTO)
# + FINGERPRINT + BUILD_ID + worklog + evidence + MANIFEST.md5 + CHAIN.json + LINKS.json
# اجرا: bash scripts/pn060-survival-package.sh   (پس از بیلد سبز از HEAD نهایی)
# =============================================================================
set -euo pipefail
cd /home/z/my-project

PKG="upload/.survival/PN-060-20261102"
PREV="upload/.survival/PN-059-20261101"
CHAIN_INDEX=49

HEAD_SHA="$(git rev-parse HEAD)"
HEAD_SHORT="$(git rev-parse --short HEAD)"
BUILD_ID="$(cat .next/BUILD_ID 2>/dev/null || echo 'بدون-بیلد')"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "── بستهٔ بقا PN-060 (زنجیرهٔ $CHAIN_INDEX) ──"
echo "HEAD=$HEAD_SHORT · BUILD_ID=$BUILD_ID"

[ -f .next/standalone/server.js ] || { echo "خطا: بیلد موجود نیست — ابتدا bun run build"; exit 1; }
[ -f "$PREV/MANIFEST.md5" ] || { echo "خطا: بستهٔ ۴۸ (PN-059) پیدا نشد"; exit 1; }

rm -rf "$PKG"
mkdir -p "$PKG/db" "$PKG/evidence"

# ── ۱) فایل‌های ریشه ──
cp AGENTS.md package.json bun.lock schema.prisma worklog.md "$PKG/"
[ -f env.platform.json ] && cp env.platform.json "$PKG/" || true

# ── ۲) شاهدهای بیلد ──
echo "$BUILD_ID" > "$PKG/BUILD_ID.txt"
git log --oneline -8 >> "$PKG/BUILD_ID.txt"
echo "$HEAD_SHA" > "$PKG/HEAD"
cp .next/fingerprint.json "$PKG/FINGERPRINT.json"

# ── ۳) شاهد DB — VACUUM INTO اتمی (فشرده + سالم؛ عین مسیر Worker) ──
echo "── شاهد DB (VACUUM INTO — چند دقیقه) ──"
bun scripts/pn041/vacuum-copy.ts db/custom.db "$PKG/db/custom.db" --json "$PKG/db/vacuum-witness.json"

# ── ۴) repo.bundle — کل تاریخچهٔ همهٔ شاخه‌های محلی ──
echo "── repo.bundle ──"
git bundle create "$PKG/repo.bundle" --all

# ── ۵) evidence ──
cp download/pn060/pn060-two-orders-evidence.json "$PKG/evidence/"
cp tests/pn060-registrar-names.test.ts "$PKG/evidence/"

# ── ۶) MANIFEST.md5 ──
( cd "$PKG" && find . -type f ! -name MANIFEST.md5 | sort | xargs md5sum > MANIFEST.md5 )

# ── ۷) CHAIN.json — لنگر به مانیفست کامل بستهٔ ۴۸ ──
PREV_HASH="$(md5sum "$PREV/MANIFEST.md5" | cut -d' ' -f1)"
cat > "$PKG/CHAIN.json" << CHAINEOF
{
  "chainIndex": $CHAIN_INDEX,
  "packageName": "PN-060-20261102",
  "prevPackage": "PN-059-20261101",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$NOW_ISO",
  "law": "بستهٔ ۴۹ به مانیفست کامل بستهٔ ۴۸ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز: PN-006 · chainIndex=7). PN-060: نام کارشناس ثبت‌کنندهٔ آگهی زیر کدملک و ثبت‌کنندهٔ درخواست زیر کددرخواست در فهرست معاملات (UI + API + اکسل + ۱۴ آزمون)"
}
CHAINEOF

# ── ۸) LINKS.json ──
SURVIVAL_SHA="$(git rev-parse survival/code 2>/dev/null || echo '?')"
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | cut -f1)"
cat > "$PKG/LINKS.json" << LINKEOF
{
  "generatedAt": "$NOW_ISO",
  "head": "$HEAD_SHA",
  "remoteMain": "$REMOTE_MAIN",
  "survivalBranch": "$SURVIVAL_SHA",
  "preview": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  "links": {
    "code": "git:origin/main = HEAD = بیلد زنده ($BUILD_ID)",
    "mirror": "git:survival/code = اسنپ‌شات کامل درخت منهای >99MB",
    "db": "بستهٔ بقا: db/custom.db (VACUUM INTO) + MANIFEST.md5",
    "evidence": "download/pn060/pn060-two-orders-evidence.json + evidence/ داخل بسته"
  }
}
LINKEOF

echo ""
echo "── کامل ──"
echo "بسته: $PKG"
du -sh "$PKG"/* | sort -rh | head -8
md5sum "$PKG/MANIFEST.md5"
echo "زنجیره: ۴۸ → ۴۹ (لنگر: $PREV_HASH)"
