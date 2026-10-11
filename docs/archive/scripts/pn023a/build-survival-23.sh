#!/usr/bin/env bash
# PN-023-A — بستهٔ بقا chainIndex=23 (ساختار مسطح عین PN-020/022 · لنگر به MANIFEST.md5 بستهٔ ۲۲)
set -euo pipefail
cd /home/z/my-project

PKG="PN-023-20261009"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-022-20261008"

echo "[بستهٔ بقا ۲۳] ساخت $DIR …"
rm -rf "$DIR"
mkdir -p "$DIR"/{docs,evidence-pn023a}

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

# ── schema: دوقلو (SQLite تولید + PostgreSQL تست — قانون ۸: افزودنی) ──
cp prisma/schema.prisma prisma/schema.postgres.prisma "$DIR/"
cp package.json bun.lock "$DIR/"

# ── docs: اسناد جلسه + انتقالی ──
cp docs/PHASE13-A-ATTENTION-CAUSAL-DESIGN.md docs/BUILD-DISCIPLINE.md docs/PHASE12-NATIONAL-SCALE-DESIGN.md docs/DES10-SELF-DIAGNOSIS-DESIGN.md docs/ESCROW-GITHUB-RECOVERY.md docs/DEBT-DECISIONS.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── evidence: شواهد زندهٔ PN-023-A ──
cp download/pn023a/lock-in.json download/pn023a/design-doc.json download/pn023a/attention-engine.json download/pn023a/causal-engine.json download/pn023a/graph-budget.json download/pn023a/guard-witness.json download/pn023a/guards-meta-mind.json download/pn023a/guards-causal-validity.json download/pn023a/tests-run1.log download/pn023a/tests-run2.log "$DIR/evidence-pn023a/" 2>/dev/null || true
cp worklog.md "$DIR/worklog.md"

# ── MANIFEST.md5 (عین ساختار PN-020/022) ──
(cd "$DIR" && find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.txt" -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
echo "  MANIFEST.md5: $(grep -c . "$DIR/MANIFEST.md5") فایل"

# ── CHAIN.txt (لنگر به MANIFEST.md5 بستهٔ ۲۲=PN-022) ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$DIR/CHAIN.txt" <<EOF
chainIndex=23
previousChainMd5=$PREV_MD5
previousPackage=PN-022-20261008
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
workOrder=PN-023-A (فاز ۱۳-الف فرا-ذهن — موتور ۱۲ توجه + موتور ۱۳ علّیت + گراف پایدار + بودجهٔ توجه)
commit=$(git rev-parse HEAD)
EOF
echo "  لنگر زنجیره: $PREV_MD5 (→ MANIFEST.md5 بستهٔ ۲۲)"

echo "[بستهٔ بقا ۲۳] کامل — $(du -sm "$DIR" | cut -f1)MB"
