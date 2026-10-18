#!/usr/bin/env bash
# ============================================================
# build-kit-45.sh — PN-041-R (بستهٔ بقای ۴۵ · شورا-ن۰۶۸)
# ------------------------------------------------------------
# همان ساختار استاندارد کیت ۴۴ + شاهدهای pn041-r.
# زنجیره: PN-045-20261018 · chainIndex=44 · لنگر به مانیفست ۴۴.
# اجرا: bash scripts/pn041-r/build-kit-45.sh
# ============================================================
set -euo pipefail
cd /home/z/my-project

PKG_DIR="upload/.survival/PN-045-20261018"
PREV="PN-044-20261018"
PREV_HASH=$(md5sum "upload/.survival/$PREV/MANIFEST.md5" | awk '{print $1}')
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HEAD_SHA=$(git rev-parse --short HEAD)

echo "[kit-45] ساخت بستهٔ بقای ۴۵ (لنگر: $PREV · hash $PREV_HASH)"

rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/db" "$PKG_DIR/docs" "$PKG_DIR/recovery-scripts" "$PKG_DIR/evidence-pn041r"

# ۱) دیتابیس مقدس — VACUUM تازه از زندهٔ محلی (WAL — زیرپروسه بی‌بلاک)
bash -c 'bun scripts/pn041/vacuum-copy.ts db/custom.db "'"$PKG_DIR"'/db/custom.db" --json "'"$PKG_DIR"'/db/custom.db.witness.json"' > /tmp/kit45-db.log 2>&1 || { cat /tmp/kit45-db.log; exit 1; }
md5sum "$PKG_DIR/db/custom.db" > "$PKG_DIR/db/custom.db.md5"
grep -o '"integrity": "[^"]*"' /tmp/kit45-db.log | head -1

# ۲) کد — git bundle کامل + HEAD + BUILD_ID
git bundle create "$PKG_DIR/repo.bundle" main
git rev-parse HEAD > "$PKG_DIR/HEAD"
curl -s -m 10 http://localhost:3000/api/version | python3 -c "import json,sys; print(json.load(sys.stdin)['buildId'])" > "$PKG_DIR/BUILD_ID.txt" 2>/dev/null || echo "$HEAD_SHA-$(date -u +%Y%m%d)" > "$PKG_DIR/BUILD_ID.txt"

# ۳) اسناد هسته
cp AGENTS.md "$PKG_DIR/AGENTS.md" 2>/dev/null || true
cp worklog.md "$PKG_DIR/worklog.md"
cp env.platform.json "$PKG_DIR/env.platform.json"
cp package.json "$PKG_DIR/package.json"
cp bun.lock "$PKG_DIR/bun.lock"
mkdir -p "$PKG_DIR/prisma"
cp prisma/schema.prisma "$PKG_DIR/prisma/schema.prisma"
cp docs/DATA-FORTRESS.md "$PKG_DIR/docs/" 2>/dev/null || true
cp .env.example "$PKG_DIR/env.txt" 2>/dev/null || true

# ۴) اسکریپت‌های بازیابی (زرادخانهٔ قلعه — نسخهٔ ن۰۶۸)
for f in scripts/recovery/db-fortress-guard.sh scripts/recovery/recover-all.sh scripts/recovery/github-supreme-guard.sh scripts/recovery/sacred-data-guard.ts scripts/recovery/live-db-path.sh scripts/recovery/reset-guard.sh scripts/pn041/vacuum-copy.ts scripts/pn041/db-probe.ts scripts/pn008/ensure-wal.ts scripts/prod-watchdog.sh scripts/pn006/dev-entry.sh scripts/pn041-r/switch-to-local.sh scripts/pn041-r/fix-auth.ts; do
  mkdir -p "$PKG_DIR/recovery-scripts/$(dirname "${f#scripts/}")"
  cp "$f" "$PKG_DIR/recovery-scripts/${f#scripts/}"
done

# ۵) شاهدهای pn041-r
for f in download/pn041-r/*.json download/pn041-r/*.png download/pn041-r/*.log; do
  [ -f "$f" ] && cp "$f" "$PKG_DIR/evidence-pn041r/"
done

# ۶) EVENTS.md
cat > "$PKG_DIR/EVENTS.md" <<EOF
# رویدادهای ملکا — بستهٔ ۴۵ (PN-041-R)

- ۱۴۰۵/۰۷/۲۸ (۲۰۲۶-۱۰-۱۸): PN-041-R «بازنگری قلعه» (شورا-ن۰۶۸) — بحران واقعی ۵۱۲×P1008 + دو ژورنال داغ ossfs کشف و بسته؛ انتقال زنده به دیسک محلی WAL (معماری موردعلاقهٔ شورا) + رفع ۳ باگ ورود (مستر ۲۶ms · پرسنلی ۲۰ث · کد نصب ۱۷ms) + ۵ دلیل قطعی رله (Long-Poll ۱۰۰ث · فیوز سه-حالته · ALT_URL) + پراگماهای SQLite + بکاپ زیرپروسه‌ای + خوددرمانی db-health-probe · دو-سبز ۲۹۳۴×۲ · گارد ۵۰/۵۰
- ۱۴۰۵/۰۷/۲۸: PN-041 «قلعهٔ داده» (شورا-ن۰۶۷) — انتقال به upload/.data + ۴ لایه + درس WAL-FUSE
- شمارش شاهد: PropertyRecord=27868 · RequestRecord=25580
EOF

# ۷) FINGERPRINT.json
python3 - "$PKG_DIR" > "$PKG_DIR/FINGERPRINT.json" <<'PYEOF'
import json, sys, hashlib, os, datetime
pkg = sys.argv[1]
d = {"at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "package": "PN-045-20261018", "phase": "PN-041-R (بازنگری قلعه · شورا-ن۰۶۸)"}
for name in ["db/custom.db", "repo.bundle"]:
    p = os.path.join(pkg, name)
    h = hashlib.md5(open(p, "rb").read()).hexdigest() if os.path.exists(p) else ""
    d[name] = {"md5": h, "bytes": os.path.getsize(p) if os.path.exists(p) else 0}
print(json.dumps(d, ensure_ascii=False, indent=2))
PYEOF

# ۸) CHAIN.json — لنگر به مانیفست ۴۴
cat > "$PKG_DIR/CHAIN.json" <<EOF
{
  "chainIndex": 44,
  "packageName": "PN-045-20261018",
  "prevPackage": "PN-044-20261018",
  "prevContentHash": "$PREV_HASH",
  "createdAt": "$TS",
  "law": "بستهٔ ۴۵ (بازنگری قلعه) به مانیفست کامل بستهٔ ۴۴ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز زنجیره: PN-006 · chainIndex=7)"
}
EOF

# ۹) MANIFEST.md5 — همهٔ اقلام
(cd "$PKG_DIR" && find . -type f ! -name "MANIFEST.md5" -print0 | sort -z | xargs -0 md5sum) > "$PKG_DIR/MANIFEST.md5"

ITEMS=$(wc -l < "$PKG_DIR/MANIFEST.md5")
SIZE=$(du -sh "$PKG_DIR" | cut -f1)
echo "[kit-45] ✅ بستهٔ ۴۵ ساخته شد: $PKG_DIR · $ITEMS قلم · $SIZE"
echo "[kit-45] شمارش شاهد DB: $(grep -o '"PropertyRecord": [0-9]*' "$PKG_DIR/db/custom.db.witness.json" | head -1)"
