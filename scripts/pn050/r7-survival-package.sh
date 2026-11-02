#!/bin/bash
# r7-survival-package.sh — بستهٔ بقای جلسهٔ R7 (قانون تثبیت + بقا + دادهٔ مقدس)
# زنجیره: PN-048 (chainIndex=46) → R7 (chainIndex=47)
set -euo pipefail
cd /home/z/my-project

STAMP="R7-20261101"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST/db"

echo "[1/7] بستهٔ git (bundle — کل تاریخ)"
git bundle create "$DEST/repo.bundle" --all 2>/dev/null && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/7] پایگاه دادهٔ مقدس (کپی + شاهد)"
cp db/custom.db "$DEST/db/custom.db"
md5sum "$DEST/db/custom.db" | awk '{print $1}' > "$DEST/db/custom.db.md5"
python3 - "$DEST/db/custom.db" > "$DEST/db/custom.db.witness.json" << 'PYEOF'
import sqlite3, sys, json, datetime
p = sys.argv[1]
c = sqlite3.connect("file:" + p + "?mode=ro", uri=True)
counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in
          ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "TransactionRecord", "DivarAd", "RelayQueue")}
print(json.dumps({
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "journalMode": c.execute("PRAGMA journal_mode").fetchone()[0],
    "quickCheck": c.execute("PRAGMA quick_check").fetchone()[0],
    "counts": counts,
    "law": "دادهٔ مقدس — فقط رشد، هرگز حذف/کاهش",
}, ensure_ascii=False, indent=2))
c.close()
PYEOF
cat "$DEST/db/custom.db.witness.json"

echo "[3/7] اسناد"
cp worklog.md "$DEST/worklog.md"
cp .env "$DEST/env.txt" 2>/dev/null || true
cp env.platform.json "$DEST/env.platform.json"
cp AGENTS.md "$DEST/AGENTS.md" 2>/dev/null || true

echo "[4/7] شواهد جلسه (R7 + رستاخیز)"
mkdir -p "$DEST/evidence"
cp -r download/pn050-resurrection "$DEST/evidence/pn050-resurrection"
cp -r download/RESET-AUDIT "$DEST/evidence/RESET-AUDIT" 2>/dev/null || true

echo "[5/7] وابستگی‌های کلیدی"
cp bun.lock "$DEST/bun.lock" 2>/dev/null || true
cp package.json "$DEST/package.json"
cp prisma/schema.prisma "$DEST/schema.prisma"

echo "[6/7] شناسه‌های بیلد"
git rev-parse HEAD > "$DEST/HEAD"
cat .next/fingerprint.json > "$DEST/FINGERPRINT.json" 2>/dev/null || true
git log --oneline -8 > "$DEST/BUILD_ID.txt"

echo "[7/7] مانیفست + زنجیره"
cd "$DEST"
find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.json" -exec md5sum {} \; | sort -k2 > MANIFEST.md5
echo "  files: $(wc -l < MANIFEST.md5)"
PREV="/home/z/my-project/upload/.survival/PN-048-20261021"
if [ -f "$PREV/MANIFEST.md5" ]; then
  PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | cut -d' ' -f1)
  cat > CHAIN.json << EOF
{
  "chainIndex": 47,
  "packageName": "$STAMP",
  "prevPackage": "PN-048-20261021",
  "prevContentHash": "$PREV_MD5",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "law": "بستهٔ ۴۷ به مانیفست کامل بستهٔ ۴۶ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز: PN-006 · chainIndex=7). R7: سه اصلاح فرمان مالک (پنجرهٔ رله ۲۴۰ث + مقاوم‌سازی سوئیچ مسیر + خلع ALT مرده · فایل‌یابی: dedup عددی + عمق ۸ + همه تبریز)"
}
EOF
  echo "  chain: 47 → prev=$PREV_MD5"
fi
cd /home/z/my-project
echo "✓ بستهٔ بقای $STAMP: $(du -sh "$DEST" | cut -f1)"
