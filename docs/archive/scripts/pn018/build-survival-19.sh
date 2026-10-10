#!/usr/bin/env bash
# PN-018 — بستهٔ بقا chainIndex=19 (استاندارد ن۰۰۷ · لنگردار به بستهٔ ۱۸)
set -euo pipefail
cd /home/z/my-project

PKG="PN-018-20261008"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-017-20261008"

echo "[بستهٔ بقا ۱۹] ساخت $DIR …"
mkdir -p "$DIR"/{db,git,build,docs,screens,env}

# ── db: VACUUM تازه + md5 ──
python3 - <<PYEOF
import sqlite3
con = sqlite3.connect("/home/z/my-project/db/custom.db")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.execute("VACUUM INTO '/home/z/my-project/$DIR/db/custom.db'")
con.close()
print("  VACUUM ok")
PYEOF
md5sum "$DIR/db/custom.db" | awk '{print $1}' > "$DIR/db/custom.db.md5"
echo "  custom.db: $(du -m "$DIR/db/custom.db" | cut -f1)MB · md5=$(head -c 8 "$DIR/db/custom.db.md5")…"

# ── git: bundle + HEAD ──
git bundle create "$DIR/git/repo.bundle" --all 2>/dev/null
git rev-parse HEAD > "$DIR/git/HEAD"

# ── build: شواهد بیلد تازه ──
cp .next/BUILD_ID "$DIR/build/BUILD_ID.txt" 2>/dev/null || git rev-parse --short HEAD > "$DIR/build/BUILD_ID.txt"
cp .next/fingerprint.json "$DIR/build/fingerprint.json"

# ── env: الگو + کلیدها فقط‌نام ──
cp upload/.survival/env.local.template "$DIR/env/" 2>/dev/null || true
grep -oE '^[A-Z_]+' .env.local | sort -u | awk '{print "- `" $1 "`"}' > "$DIR/env/KEYS.md"

# ── docs: شواهد این جلسه + انتقالی سبک ──
mkdir -p "$DIR/docs/pn018"
cp -r download/pn018/. "$DIR/docs/pn018/" 2>/dev/null || true
rm -f "$DIR/docs/pn018/tests-run"*.log 2>/dev/null || true
for d in pn016 pn017; do
  if [ -d "download/$d" ]; then mkdir -p "$DIR/docs/$d"; find "download/$d" -maxdepth 1 \( -name "*.json" -o -name "*.md" \) -exec cp {} "$DIR/docs/$d/" \; 2>/dev/null || true; fi
done
cp docs/PHASE7-OUTCOME-LEARNING-DESIGN.md docs/BUILD-DISCIPLINE.md docs/ESCROW-GITHUB-RECOVERY.md docs/DEBT-DECISIONS.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── screens: شواهد بصری این جلسه ──
cp -r download/pn018/screens "$DIR/screens/pn018" 2>/dev/null || true

# ── HEAD (ریشهٔ بسته) ──
cat > "$DIR/HEAD" <<EOF
{
  "chainIndex": 19,
  "commit": "$(git rev-parse HEAD)",
  "package": "$PKG",
  "council": "ملکا-شورا-ن۰۲۲-۱۴۰۵ (فاز ۷ Outcome Learning — Champion/Challenger + Drift + حلقهٔ کامل + دو رفع زنده)"
}
EOF

# ── FINGERPRINT ──
cp .next/fingerprint.json "$DIR/FINGERPRINT.json"

# ── MANIFEST (با لنگر بستهٔ ۱۸) ──
python3 - <<PYEOF
import hashlib, json, os, datetime
d = "$DIR"
files = []
for root, _, names in os.walk(d):
    for n in names:
        p = os.path.join(root, n)
        rel = os.path.relpath(p, d)
        if rel.startswith(("MANIFEST", "CHAIN")): continue
        with open(p, "rb") as fh:
            files.append({"path": rel, "md5": hashlib.md5(fh.read()).hexdigest(), "bytes": os.path.getsize(p)})
files.sort(key=lambda x: x["path"])
manifest = {
  "package": "$PKG", "chainIndex": 19,
  "anchorPreviousManifest": hashlib.md5(open("$PREV/MANIFEST.json","rb").read()).hexdigest(),
  "files": files, "fileCount": len(files),
  "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
json.dump(manifest, open(os.path.join(d, "MANIFEST.json"), "w"), ensure_ascii=False, indent=2)
print(f"  MANIFEST: {len(files)} فایل · لنگر: {manifest['anchorPreviousManifest'][:12]}…")
PYEOF

# ── CHAIN ──
cat > "$DIR/CHAIN.json" <<EOF
{
  "chainIndex": 19,
  "package": "$PKG",
  "date": "2026-10-08",
  "council": "ملکا-شورا-ن۰۲۲-۱۴۰۵ (فاز ۷ Outcome Learning — Champion/Challenger + Drift + حلقهٔ کامل + دو رفع زنده)",
  "commit": "$(git rev-parse HEAD)",
  "note": "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود."
}
EOF

# ── README ──
cat > "$DIR/README.md" <<EOF
# بستهٔ بقا ۱۹ — $PKG
chainIndex=19 · HEAD=$(git rev-parse --short HEAD) · buildId=$(cat .next/BUILD_ID 2>/dev/null || echo n/a)
جلسهٔ PN-018 (ملکا-شورا-ن۰۲۲-۱۴۰۵): فاز ۷ Outcome Learning — جدول ModelVersion + دروازهٔ شورا + رانش سه‌گانه در Worker + حلقهٔ کامل روی ۷۷۲ جفت واقعی + رفع دو خطای زندهٔ مالک (سرریز Int32: مغز + M1).
ساختار استاندارد ن۰۰۷: db/ (VACUUM) · git/ (bundle+HEAD) · build/ · docs/ · screens/ · env/ (فقط‌نام).
EOF

echo "  اندازهٔ بسته: $(du -sm "$DIR" | cut -f1)MB"
echo "[بستهٔ بقا ۱۹] کامل — لنگر زنجیره: $(python3 -c "import json;print(json.load(open('$DIR/MANIFEST.json'))['anchorPreviousManifest'][:16])")"
