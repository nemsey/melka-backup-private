#!/usr/bin/env bash
# ============================================================
# build-kit-44.sh — PN-041 · فاز ۶ (بستهٔ بقای ۴۴ · شورا-ن۰۶۷)
# ------------------------------------------------------------
# همان ساختار استاندارد کیت PN-043 (۲۱ قلم) + شاهدهای pn041.
# زنجیره: PN-044-20261018 · chainIndex=43 · لنگر به مانیفست ۴۲.
# اجرا: bash scripts/pn041/build-kit-44.sh
# ============================================================
set -euo pipefail
cd /home/z/my-project

PKG_DIR="upload/.survival/PN-044-20261018"
PREV="PN-043-20261017"
PREV_HASH=$(md5sum "upload/.survival/$PREV/MANIFEST.md5" | awk '{print $1}')
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HEAD_SHA=$(git rev-parse --short HEAD)
BUILD_ID_FILE=$(ls -t .next/BUILD_ID .next/fingerprint.json 2>/dev/null | head -1)

echo "[kit-44] ساخت بستهٔ بقای ۴۴ (لنگر: $PREV · hash $PREV_HASH)"

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/db" "$PKG_DIR/docs" "$PKG_DIR/recovery-scripts" "$PKG_DIR/evidence-pn041"

# ۱) دیتابیس مقدس — VACUUM تازه از قلعهٔ زنده
bash -c 'bun scripts/pn041/vacuum-copy.ts upload/.data/custom.db "'"$PKG_DIR"'/db/custom.db" --json "'"$PKG_DIR"'/db/custom.db.witness.json"' > /tmp/kit44-db.log 2>&1 || { cat /tmp/kit44-db.log; exit 1; }
md5sum "$PKG_DIR/db/custom.db" > "$PKG_DIR/db/custom.db.md5"
grep -o '"integrity": "[^"]*"' /tmp/kit44-db.log | head -1

# ۲) کد — git bundle کامل + HEAD + BUILD_ID
git bundle create "$PKG_DIR/repo-scripts.bundle.tmp" main 2>/dev/null || true
git bundle create "$PKG_DIR/repo.bundle" main
rm -f "$PKG_DIR/repo-scripts.bundle.tmp"
git rev-parse HEAD > "$PKG_DIR/HEAD"
[ -f .next/BUILD_ID ] && cp .next/BUILD_ID "$PKG_DIR/BUILD_ID.txt" || echo "$HEAD_SHA-$(date -u +%Y%m%d)" > "$PKG_DIR/BUILD_ID.txt"

# ۳) اسناد هسته
cp AGENTS.md "$PKG_DIR/AGENTS.md" 2>/dev/null || true
cp worklog.md "$PKG_DIR/worklog.md"
cp env.platform.json "$PKG_DIR/env.platform.json"
cp package.json "$PKG_DIR/package.json"
cp bun.lock "$PKG_DIR/bun.lock"
cp prisma/schema.prisma "$PKG_DIR/prisma/schema.prisma" 2>/dev/null || { mkdir -p "$PKG_DIR/prisma"; cp prisma/schema.prisma "$PKG_DIR/prisma/schema.prisma"; }
cp docs/DATA-FORTRESS.md "$PKG_DIR/docs/"
cp .env.example "$PKG_DIR/env.txt" 2>/dev/null || true

# ۴) اسکریپت‌های بازیابی (زرادخانهٔ قلعه)
for f in scripts/recovery/db-fortress-guard.sh scripts/recovery/recover-all.sh scripts/recovery/github-supreme-guard.sh scripts/recovery/sacred-data-guard.ts scripts/recovery/live-db-path.sh scripts/recovery/reset-guard.sh scripts/pn041/vacuum-copy.ts scripts/pn041/db-probe.ts scripts/pn008/ensure-wal.ts scripts/prod-watchdog.sh scripts/pn006/dev-entry.sh; do
  mkdir -p "$PKG_DIR/recovery-scripts/$(dirname "${f#scripts/}")"
  cp "$f" "$PKG_DIR/recovery-scripts/${f#scripts/}"
done

# ۵) شاهدهای pn041
for f in download/pn041/*.json; do
  [ -f "$f" ] && cp "$f" "$PKG_DIR/evidence-pn041/"
done

# ۶) EVENTS.md
cat > "$PKG_DIR/EVENTS.md" <<EOF
# رویدادهای ملکا — بستهٔ ۴۴

- ۱۴۰۵/۰۷/۲۸ (۲۰۲۶-۱۰-۱۸): PN-041 «قلعهٔ داده» (شورا-ن۰۶۷) — دیتابیس زنده به منطقهٔ پایدار upload/.data · بکاپ چرخشی ۵دقیقه‌ای + مقدس ۱۵دقیقه‌ای در منطقهٔ پایدار · پشتیبان روزانهٔ GitHub Release · گارد قلعه + recover-all · درس ژورنال FUSE (WAL→DELETE) · بازیابی واقعی ۰۹:۰۳ با صفر گم‌شدن
- ۱۴۰۵/۰۷/۲۸: PN-040 (شورا-ن۰۶۶) — احیای چهارگامی + سپر گیت‌هاب (کیت ۴۲/۴۳)
- شمارش شاهد: PropertyRecord=27864 · RequestRecord=25580 · GraphNode=149359
EOF

# ۷) FINGERPRINT.json
python3 - "$PKG_DIR" > "$PKG_DIR/FINGERPRINT.json" <<'PYEOF'
import json, sys, hashlib, os, datetime
pkg = sys.argv[1]
d = {"at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "package": "PN-044-20261018", "phase": "PN-041 (قلعهٔ داده · شورا-ن۰۶۷)"}
for name in ["db/custom.db"]:
    p = os.path.join(pkg, name)
    h = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else ""
    d[name] = {"md5": h, "bytes": os.path.getsize(p) if os.path.exists(p) else 0}
print(json.dumps(d, ensure_ascii=False, indent=2))
PYEOF

# ۸) CHAIN.json — لنگر به مانیفست ۴۲
cat > "$PKG_DIR/CHAIN.json" <<EOF
{
  "chainIndex": 43,
  "packageName": "PN-044-20261018",
  "prevPackage": "PN-043-20261017",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۴۴ (قلعهٔ داده) به مانیفست کامل بستهٔ ۴۲/۴۳ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز زنجیره: PN-006 · chainIndex=7)"
}
EOF

# ۹) MANIFEST.md5 — همهٔ اقلام
(cd "$PKG_DIR" && find . -type f ! -name "MANIFEST.md5" -print0 | sort -z | xargs -0 md5sum) > "$PKG_DIR/MANIFEST.md5"

ITEMS=$(wc -l < "$PKG_DIR/MANIFEST.md5")
SIZE=$(du -sh "$PKG_DIR" | cut -f1)
echo "[kit-44] ✅ بستهٔ ۴۴ ساخته شد: $PKG_DIR · $ITEMS قلم · $SIZE"
echo "[kit-44] شمارش شاهد DB: $(grep -o '"PropertyRecord": [0-9]*' "$PKG_DIR/db/custom.db.witness.json" | head -1)"
