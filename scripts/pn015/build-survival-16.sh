#!/usr/bin/env bash
# PN-015 مرحلهٔ ۸.۳ — بستهٔ بقا chainIndex=16 (استاندارد ن۰۰۷ · لنگردار به بستهٔ ۱۵)
set -euo pipefail
cd /home/z/my-project

PKG="PN-015-20261007"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-014-20261007"

echo "[بستهٔ بقا ۱۶] ساخت $DIR …"
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
mkdir -p "$DIR/docs/pn015"
cp -r download/pn015/. "$DIR/docs/pn015/" 2>/dev/null || true
rm -f "$DIR/docs/pn015/tests-run"*.log 2>/dev/null || true
for d in pn012 pn013 pn014; do
  if [ -d "download/$d" ]; then mkdir -p "$DIR/docs/$d"; find "download/$d" -maxdepth 1 \( -name "*.json" -o -name "*.md" \) -exec cp {} "$DIR/docs/$d/" \; 2>/dev/null || true; fi
done
cp docs/BUILD-DISCIPLINE.md docs/ESCROW-GITHUB-RECOVERY.md docs/PUBLISH-TROUBLESHOOTING.md docs/RECOVERY-POLICY.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── screens: شواهد بصری این جلسه ──
cp -r download/pn015/screens "$DIR/screens/pn015" 2>/dev/null || true

# ── HEAD (ریشهٔ بسته) ──
cat > "$DIR/HEAD" <<EOF
{
  "chainIndex": 16,
  "commit": "$(git rev-parse HEAD)",
  "package": "$PKG",
  "council": "ملکا-شورا-ن۰۱۹-۱۴۰۵ (سه گارد تازه + هرس بقا پس از بازنشانی هفتم)"
}
EOF

# ── FINGERPRINT ──
cp .next/fingerprint.json "$DIR/FINGERPRINT.json"

# ── MANIFEST (با لنگر بستهٔ ۱۵) ──
python3 - <<PYEOF
import hashlib, json, os
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
  "package": "$PKG", "chainIndex": 16,
  "anchorPreviousManifest": hashlib.md5(open("$PREV/MANIFEST.json","rb").read()).hexdigest(),
  "files": files, "fileCount": len(files),
  "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
}
json.dump(manifest, open(os.path.join(d, "MANIFEST.json"), "w"), ensure_ascii=False, indent=2)
print(f"  MANIFEST: {len(files)} فایل · لنگر: {manifest['anchorPreviousManifest'][:12]}…")
PYEOF

# ── CHAIN ──
cat > "$DIR/CHAIN.json" <<EOF
{
  "chainIndex": 16,
  "package": "$PKG",
  "date": "2026-10-07",
  "council": "ملکا-شورا-ن۰۱۹-۱۴۰۵ (سه گارد تازه + هرس بقا پس از بازنشانی هفتم)",
  "commit": "$(git rev-parse HEAD)",
  "note": "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود."
}
EOF

# ── README ──
cat > "$DIR/README.md" <<EOF
# بستهٔ بقا ۱۶ — $PKG
chainIndex=16 · HEAD=$(git rev-parse --short HEAD) · buildId=$(cat .next/BUILD_ID 2>/dev/null || echo n/a)
جلسهٔ PN-015 (ملکا-شورا-ن۰۱۹-۱۴۰۵): احیای مبنای سفارش از آینه پس از بازنشانی هفتم + K1-K5 + دو گارد تازه.
ساختار استاندارد ن۰۰۷: db/ (VACUUM) · git/ (bundle+HEAD) · build/ · docs/ · screens/ · env/ (فقط‌نام).
EOF

echo "  اندازهٔ بسته: $(du -sm "$DIR" | cut -f1)MB"
echo "[بستهٔ بقا ۱۶] کامل — لنگر زنجیره: $(python3 -c "import json;print(json.load(open('$DIR/MANIFEST.json'))['anchorPreviousManifest'][:16])")"
