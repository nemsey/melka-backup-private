#!/usr/bin/env bash
# PN-014 مرحلهٔ ۱۱ — بستهٔ بقا chainIndex=15 (استاندارد ن۰۰۷ · لنگردار به بستهٔ ۱۴)
set -euo pipefail
cd /home/z/my-project

PKG="PN-014-20261007"
DIR="upload/.survival/$PKG"
PREV="upload/.survival/PN-013-20261007"

echo "[بستهٔ بقا ۱۵] ساخت $DIR …"
mkdir -p "$DIR"/{db,git,build,docs,screens,env}

# ── db: VACUUM تازه + md5 (python — الگوی n012) ──
python3 - <<PYEOF
import sqlite3
con = sqlite3.connect("/home/z/my-project/db/custom.db")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.execute("VACUUM INTO '/home/z/my-project/$DIR/db/custom.db'")
con.close()
print("  VACUUM ok")
PYEOF
md5sum "$DIR/db/custom.db" | awk '{print $1}' > "$DIR/db/custom.db.md5"
echo "  custom.db: $(du -m "$DIR/db/custom.db" | cut -f1)MB · md5=$(cat "$DIR/db/custom.db.md5" | head -c 8)…"

# ── git: bundle + HEAD ──
git bundle create "$DIR/git/repo.bundle" --all 2>/dev/null
git rev-parse HEAD > "$DIR/git/HEAD"

# ── build: شواهد بیلد تازه ──
cp .next/BUILD_ID "$DIR/build/BUILD_ID.txt" 2>/dev/null || git rev-parse --short HEAD > "$DIR/build/BUILD_ID.txt"
cp .next/fingerprint.json "$DIR/build/fingerprint.json"
cp .next/standalone/BUILD-INFO.txt "$DIR/build/" 2>/dev/null || true

# ── env: الگو + کلیدها فقط‌نام ──
cp "$PREV/env/env.local.template" "$DIR/env/" 2>/dev/null || cp upload/.survival/env.local.template "$DIR/env/" 2>/dev/null || true
grep -oE '^[A-Z_]+' .env.local | sort -u | awk '{print "- `" $1 "`"}' > "$DIR/env/KEYS.md"

# ── docs: شواهد این جلسه + انتقالی ──
mkdir -p "$DIR/docs/pn014"
cp -r download/pn014/. "$DIR/docs/pn014/" 2>/dev/null || true
rm -f "$DIR/docs/pn014/tests-run"*.log 2>/dev/null || true
for d in pn001 pn003 pn004 pn005 pn006 pn007 pn008 pn009 pn010 pn011 pn012 pn013; do
  if [ -d "download/$d" ]; then mkdir -p "$DIR/docs/$d"; find "download/$d" -maxdepth 1 \( -name "*.json" -o -name "*.md" \) -exec cp {} "$DIR/docs/$d/" \; 2>/dev/null || true; fi
done
cp docs/ESCROW-GITHUB-RECOVERY.md docs/PUBLISH-TROUBLESHOOTING.md docs/DEBT-DECISIONS.md "$DIR/docs/" 2>/dev/null || true
cp upload/.survival/expected-counts.json "$DIR/" 2>/dev/null || true

# ── screens: شواهد بصری این جلسه ──
cp -r download/pn014/screens "$DIR/screens/pn014" 2>/dev/null || true

# ── HEAD (ریشهٔ بسته) ──
cat > "$DIR/HEAD" <<EOF
{
  "chainIndex": 15,
  "commit": "$(git rev-parse HEAD)",
  "package": "$PKG",
  "council": "ملکا-شورا-ن۰۱۸-۱۴۰۵"
}
EOF

# ── FINGERPRINT ──
cp .next/fingerprint.json "$DIR/FINGERPRINT.json"

# ── MANIFEST (با لنگر بستهٔ ۱۴) ──
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
  "package": "$PKG", "chainIndex": 15,
  "anchorPreviousManifest": hashlib.md5(open("$PREV/MANIFEST.json","rb").read()).hexdigest(),
  "files": files, "fileCount": len(files),
}
json.dump(manifest, open(os.path.join(d, "MANIFEST.json"), "w"), ensure_ascii=False, indent=2)
print("  MANIFEST:", len(files), "فایل · لنگر ۱۴:", manifest["anchorPreviousManifest"][:12], "…")
PYEOF

# ── CHAIN.json (زنجیره ۱۵) ──
python3 - <<PYEOF
import json
chain = {"chainIndex": 15, "package": "PN-014-20261007", "date": "2026-10-07",
  "council": "ملکا-شورا-ن۰۱۸-۱۴۰۵ (تصمیم‌های بدهی + کاشی تطبیق + فاز ۵)",
  "commit": "$(git rev-parse HEAD)",
  "note": "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود."}
json.dump(chain, open("upload/.survival/PN-014-20261007/CHAIN.json", "w"), ensure_ascii=False, indent=2)
print("  CHAIN.json: chainIndex=15")
PYEOF

# ── README پنج‌گام ──
cat > "$DIR/README.md" <<'EOF'
# بستهٔ بقای ملکا — شمارهٔ ۱۵ (PN-014)

chainIndex=15 · لنگر: MANIFEST بستهٔ ۱۴ · تاریخ: ۲۰۲۶-۱۰-۰۷

## بازیابی در ۵ گام
1. `git clone repo.bundle` (یا باز کردن در پوشهٔ خالی) → `bun install`
2. `cp db/custom.db <ریشه>/db/custom.db` (شمارش‌ها را با `db/custom.db.md5` وارسی کنید)
3. `cp env/env.local.template .env.local` و مقادیر را از خزانهٔ راز (KEYS.md نام‌ها را می‌گوید) پر کنید
4. `bunx prisma generate && bun run build`
5. `bash start.sh` — گارد بازیابی خودکار محیط را می‌سنجد؛ سپس ورود مالک
EOF

echo "[بستهٔ بقا ۱۵] کامل — فایل‌ها: $(find "$DIR" -type f | wc -l) · حجم: $(du -sh "$DIR" | cut -f1)"
