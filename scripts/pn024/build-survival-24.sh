#!/usr/bin/env bash
# PN-024 — بستهٔ بقا chainIndex=24 (ساختار مسطح عین PN-023-A · لنگر به MANIFEST.md5 بستهٔ ۲۳)
set -euo pipefail
cd /home/z/my-project

PKG="PN-024-20261009"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-023-20261009"

echo "[بستهٔ بقا ۲۴] ساخت $DIR …"
rm -rf "$DIR"
mkdir -p "$DIR"/{docs,evidence-pn024}

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

# ── schema: دوقلو (صفر تغییر جدول در این فاز — قانون ۸ حداکثری) ──
cp prisma/schema.prisma prisma/schema.postgres.prisma "$DIR/"
cp package.json bun.lock "$DIR/"

# ── docs: اسناد جلسه ──
cp docs/PHASE13-B-COUNTERFACTUAL-SIMULATION-DESIGN.md docs/PHASE13-A-ATTENTION-CAUSAL-DESIGN.md docs/BUILD-DISCIPLINE.md docs/PHASE12-NATIONAL-SCALE-DESIGN.md docs/DES10-SELF-DIAGNOSIS-DESIGN.md docs/ESCROW-GITHUB-RECOVERY.md docs/DEBT-DECISIONS.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── evidence: شواهد زندهٔ PN-024 ──
cp download/pn024/lock-in.json download/pn024/design-doc.json download/pn024/negin-palette.json download/pn024/negin-applied.json download/pn024/negin-tests.json download/pn024/park-atomic.json download/pn024/j-fixes.json download/pn024/counterfactual-engine.json download/pn024/simulation-engine.json download/pn024/meta-mind-service.json download/pn024/guards.json download/pn024/guards-negin.json download/pn024/guards-counterfactual.json download/pn024/guards-mirror-sync.json download/pn024/guards-pg-cluster.json download/pn024/tests-run1.log download/pn024/tests-run2.log download/pn024/end-gate.json download/pn024/deliver-links.json "$DIR/evidence-pn024/" 2>/dev/null || true
cp worklog.md "$DIR/worklog.md"

# ── MANIFEST.md5 ──
(cd "$DIR" && find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.txt" -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5)
echo "  MANIFEST.md5: $(grep -c . "$DIR/MANIFEST.md5") فایل"

# ── CHAIN.txt (لنگر به MANIFEST.md5 بستهٔ ۲۳=PN-023-A) ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$DIR/CHAIN.txt" <<EOF
chainIndex=24
previousChainMd5=$PREV_MD5
previousPackage=PN-023-20261009
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
workOrder=PN-024 (هویت نگین + J1-J5 + فاز ۱۳-ب: موتور ۱۴ پادواقع + موتور ۱۵ شبیه‌سازی + اتصال فرا-ذهن به UI)
commit=$(git rev-parse HEAD)
EOF
echo "  لنگر زنجیره: $PREV_MD5 (→ MANIFEST.md5 بستهٔ ۲۳)"

echo "[بستهٔ بقا ۲۴] کامل — $(du -sm "$DIR" | cut -f1)MB"
