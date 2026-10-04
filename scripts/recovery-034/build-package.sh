#!/usr/bin/env bash
# build-package.sh — بستهٔ بقای P6548-recovery (بندهای ج + ح + ک قانون تثبیت ۰۳۱)
# ساختار عین بستهٔ P6547cont + زنجیرهٔ هش chainIndex=7
set -euo pipefail
REPO=/home/z/my-project
PKGNAME="P6548-recovery-$(date -u +%Y%m%d)"
PKG="$REPO/upload/.survival/$PKGNAME"
PREV="$REPO/upload/.survival/P6547cont-20261003"
mkdir -p "$PKG/evidence-p6548-recovery"

# ── بند ج: محتویات اجباری ──
git -C "$REPO" bundle create "$PKG/repo.bundle" --all
# DB با backup API واقعی SQLite (سازگار با WAL زیر بار سرور — نه cp خام)
bun -e 'import {Database} from "bun:sqlite"; import {writeFileSync} from "node:fs"; const db=new Database("/home/z/my-project/db/custom.db",{readonly:true}); const data=db.serialize(); writeFileSync(process.argv[1], data); console.log("custom.db serialized:", data.length, "bytes"); db.close()' "$PKG/custom.db"
cp -a "$REPO/db/test.db" "$PKG/test.db"
cp -a "$REPO/worklog.md" "$PKG/worklog.md"
cp -a "$REPO/.env" "$PKG/env.txt"
cp -a "$REPO/env.platform.json" "$PKG/env.platform.json"
cp -a "$REPO/package.json" "$PKG/package.json"
cp -a "$REPO/bun.lock" "$PKG/bun.lock"
cp -a "$REPO/prisma/schema.prisma" "$PKG/schema.prisma"
cp -a "$REPO/AGENTS.md" "$PKG/AGENTS.md"

# ── بند ج-۶ + شواهد این پرونده ──
cp -a "$REPO"/download/p6548-recovery/*.png "$PKG/evidence-p6548-recovery/" 2>/dev/null || true
cp -a "$REPO/scripts/recovery-034/sim-test-log.txt" "$PKG/evidence-p6548-recovery/" 2>/dev/null || true
cp -a "$REPO/scripts/recovery-034/restore-log.txt" "$PKG/evidence-p6548-recovery/" 2>/dev/null || true
cp -a "$REPO/upload/.mirror/push-log.jsonl" "$PKG/evidence-p6548-recovery/" 2>/dev/null || true
cp -a "$REPO/upload/.survival/recovery-log.jsonl" "$PKG/evidence-p6548-recovery/" 2>/dev/null || true

# ── بند ح: نقشهٔ وقایع ──
cp -a "$REPO/scripts/recovery-034/package-EVENTS.md" "$PKG/EVENTS.md"

# ── بند ک: زنجیرهٔ هش (قرارداد: previousChainMd5 = md5 فایل MANIFEST.md5 بستهٔ قبلی) ──
PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | awk '{print $1}')
cat > "$PKG/CHAIN.txt" <<EOF
chainIndex=7
previousChainMd5=$PREV_MD5
previousPackage=P6547cont-20261003 (MANIFEST.md5)
createdAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

# ── مانیفست md5 ──
( cd "$PKG" && for f in ./* ./evidence-p6548-recovery/*; do [ -f "$f" ] && md5sum "$f"; done > MANIFEST.md5 )

echo "بستهٔ بقا ساخته شد: $PKGNAME"
du -sh "$PKG"
echo "--- CHAIN.txt ---"
cat "$PKG/CHAIN.txt"
echo "--- مانیفست ($(wc -l < "$PKG/MANIFEST.md5") فایل) ---"
cat "$PKG/MANIFEST.md5"
