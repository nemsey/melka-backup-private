#!/usr/bin/env bash
# PN-022-A — بستهٔ بقا chainIndex=22 (ساختار مسطح عین PN-020 · لنگر به MANIFEST بستهٔ ۲۱)
set -euo pipefail
cd /home/z/my-project

PKG="PN-022-20261008"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-020-20261008"

echo "[بستهٔ بقا ۲۲] ساخت $DIR …"
rm -rf "$DIR"
mkdir -p "$DIR"/{docs,evidence-pn022/pg,evidence-pn022/step1}

# ── db: VACUUM تازه + md5 ──
python3 - <<PYEOF
import sqlite3
con = sqlite3.connect("/home/z/my-project/db/custom.db")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.execute("VACUUM INTO '/home/z/my-project/$DIR/custom.db'")
con.close()
print("  VACUUM ok")
PYEOF
md5sum "$DIR/custom.db" | awk '{print $1}' > "$DIR/custom.db.md5"
echo "  custom.db: $(du -m "$DIR/custom.db" | cut -f1)MB · md5=$(head -c 8 "$DIR/custom.db.md5")…"

# ── git: bundle + HEAD ──
git bundle create "$DIR/repo.bundle" --all 2>/dev/null
git rev-parse HEAD > "$DIR/HEAD"

# ── build: مهر چهارراهی ──
cp .next/BUILD_ID "$DIR/BUILD_ID.txt"
cp .next/fingerprint.json "$DIR/FINGERPRINT.json"

# ── schema: دوقلو (SQLite تولید + PostgreSQL تست — PN-022-A/مرحلهٔ۳) ──
cp prisma/schema.prisma prisma/schema.postgres.prisma "$DIR/"
cp package.json bun.lock "$DIR/"

# ── docs: اسناد جلسه + انتقالی ──
cp docs/BUILD-DISCIPLINE.md docs/PHASE12-NATIONAL-SCALE-DESIGN.md docs/DES10-SELF-DIAGNOSIS-DESIGN.md docs/P11-SOUL.md docs/ESCROW-GITHUB-RECOVERY.md docs/DEBT-DECISIONS.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── evidence: شواهد زندهٔ PN-022-A ──
cp download/pn022/lock-form.json download/pn022/feature-factory.json download/pn022/guards-*.json "$DIR/evidence-pn022/"
cp download/pn022/step1/diagnosis-resolved.json "$DIR/evidence-pn022/step1/"
cp download/pn022/pg/postgres-migration.json download/pn022/pg/postgres-benchmark.json "$DIR/evidence-pn022/pg/"
cp worklog.md "$DIR/worklog.md"

# ── MANIFEST.md5 (عین ساختار PN-020 — فهرست md5 همهٔ فایل‌ها) ──
(cd "$DIR" && find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.txt" -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
echo "  MANIFEST.md5: $(grep -c . "$DIR/MANIFEST.md5") فایل"

# ── CHAIN.txt (لنگر به MANIFEST بستهٔ ۲۱=PN-020) ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$DIR/CHAIN.txt" <<EOF
chainIndex=22
previousChainMd5=$PREV_MD5
previousPackage=PN-020-20261008
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
workOrder=PN-022-A (فاز ۱۲-الف زیرساخت مقیاس ملی — رفع ۹ هشدار + سنک صفحه‌ای + PostgreSQL تست + Feature Factory)
commit=$(git rev-parse HEAD)
EOF
echo "  لنگر زنجیره: $PREV_MD5 (→ MANIFEST.md5 بستهٔ ۲۱)"

echo "[بستهٔ بقا ۲۲] کامل — $(du -sm "$DIR" | cut -f1)MB"
