#!/bin/bash
# pn059-survival-package.sh — بستهٔ بقای جلسهٔ PN-059 (قانون تثبیت + بقا + دادهٔ مقدس)
# زنجیره: R7-20261101 (chainIndex=47) → PN-059 (chainIndex=48)
set -euo pipefail
cd /home/z/my-project

STAMP="PN-059-20261101"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST/db"

echo "[1/8] بستهٔ git (bundle — کل تاریخ)"
git bundle create "$DEST/repo.bundle" --all 2>/dev/null && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/8] پایگاه دادهٔ مقدس (کپی + شاهد)"
cp db/custom.db "$DEST/db/custom.db"
md5sum "$DEST/db/custom.db" | awk '{print $1}' > "$DEST/db/custom.db.md5"
python3 - "$DEST/db/custom.db" > "$DEST/db/custom.db.witness.json" << 'PYEOF'
import sqlite3, sys, json, datetime
p = sys.argv[1]
c = sqlite3.connect("file:" + p + "?mode=ro", uri=True)
counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in
          ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "TransactionRecord", "DivarAd", "RelayQueue")}
melketun = {t: c.execute(f"SELECT COUNT(*) FROM {t} WHERE tenantId='melketun'").fetchone()[0] for t in
            ("PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile")}
print(json.dumps({
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "journalMode": c.execute("PRAGMA journal_mode").fetchone()[0],
    "quickCheck": c.execute("PRAGMA quick_check").fetchone()[0],
    "counts": counts,
    "melketunRemaining": melketun,
    "melketunLaw": "حذف کامل دادهٔ ملکتون به حکم صریح مالک (۹٬۳۷۷ ردیف · آرشیو SHA256دار) — شمارش باید صفر باشد",
    "law": "دادهٔ مقدس — فقط رشد، هرگز حذف/کاهش (تنها استثنا: حکم صریح مالک با شاهد AuditLog)",
}, ensure_ascii=False, indent=2))
c.close()
PYEOF
cat "$DEST/db/custom.db.witness.json"

echo "[3/8] اسناد"
cp worklog.md "$DEST/worklog.md"
cp env.platform.json "$DEST/env.platform.json"
cp AGENTS.md "$DEST/AGENTS.md" 2>/dev/null || true

echo "[4/8] شواهد جلسه (آرشیو حذف ملکتون + تست زندهٔ اتصال)"
mkdir -p "$DEST/evidence"
cp -r backups/melketun-purge-20261101T205740Z "$DEST/evidence/melketun-purge-archive"
cp scripts/pn059-test-relay-connection.ts "$DEST/evidence/" 2>/dev/null || true
cp download/pn059/pn059-four-orders-evidence.json "$DEST/evidence/" 2>/dev/null || true

echo "[5/8] وابستگی‌های کلیدی"
cp bun.lock "$DEST/bun.lock" 2>/dev/null || true
cp package.json "$DEST/package.json"
cp prisma/schema.prisma "$DEST/schema.prisma"

echo "[6/8] شناسه‌های بیلد"
git rev-parse HEAD > "$DEST/HEAD"
cat .next/fingerprint.json > "$DEST/FINGERPRINT.json" 2>/dev/null || true
git log --oneline -8 > "$DEST/BUILD_ID.txt"

echo "[7/8] مانیفست + زنجیره"
cd "$DEST"
find . -type f ! -name "MANIFEST.md5" ! -name "CHAIN.json" -exec md5sum {} \; | sort -k2 > MANIFEST.md5
echo "  files: $(wc -l < MANIFEST.md5)"
PREV="/home/z/my-project/upload/.survival/R7-20261101"
if [ -f "$PREV/MANIFEST.md5" ]; then
  PREV_MD5=$(md5sum "$PREV/MANIFEST.md5" | cut -d' ' -f1)
  cat > CHAIN.json << EOF
{
  "chainIndex": 48,
  "packageName": "$STAMP",
  "prevPackage": "R7-20261101",
  "prevContentHash": "$PREV_MD5",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "law": "بستهٔ ۴۸ به مانیفست کامل بستهٔ ۴۷ لنگر شده است — زنجیرهٔ بازتولیدپذیری (آغاز: PN-006 · chainIndex=7). PN-059: حذف کامل کاشی ملکتون + داده‌ها (۹٬۳۷۷ ردیف · آرشیو) · رفع کامل اتصال ملک‌تبریز (مهلت رله‌آگاه ۱۱۰ث + اولویت ۲ سینک اصلی · آزمون زنده ۲×۲۰۰) · TTL سه‌روزهٔ فایل‌یابی (۳۶ حذف در نخستین اجرا)"
}
EOF
  echo "  chain: 48 → prev=$PREV_MD5"
fi

echo "[8/8] لینک‌ها (قانون لینک — نقشهٔ بازتولید)"
cd /home/z/my-project
cat > "$DEST/LINKS.json" << EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "head": "$(git rev-parse HEAD)",
  "remoteMain": "$(git ls-remote origin refs/heads/main 2>/dev/null | awk '{print $1}')",
  "survivalBranch": "$(git ls-remote origin refs/heads/survival/code 2>/dev/null | awk '{print $1}')",
  "preview": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
  "links": {
    "code": "git:origin/main = HEAD = بیلد زنده (G3 PASS)",
    "mirror": "git:survival/code = اسنپ‌شات کامل درخت منهای >99MB",
    "db": "بستهٔ بقا: db/custom.db + md5 + witness",
    "archive": "backups/melketun-purge-20261101T205740Z (آرشیو حذف ملکتون · SHA256SUMS)"
  }
}
EOF
cat "$DEST/LINKS.json"
cd /home/z/my-project
echo "✓ بستهٔ بقای $STAMP: $(du -sh "$DEST" | cut -f1)"
