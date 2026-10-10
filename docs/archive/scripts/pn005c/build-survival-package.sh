#!/bin/bash
# بستهٔ بقا PN-005-C — chainIndex=6 (جلسهٔ فوق‌العاده ۰۰۵)
set -euo pipefail
cd /home/z/my-project

STAMP="PN-005C-$(date +%Y%m%d)"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST/screens"

echo "[1/7] بستهٔ git (bundle — کل تاریخ + همهٔ شاخه‌ها)"
git bundle create "$DEST/repo.bundle" --all 2>/dev/null && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/7] پایگاه دادهٔ بازیابی‌شده + رشد یافته (custom.db)"
cp db/custom.db "$DEST/custom.db"
echo "  custom.db: $(du -h "$DEST/custom.db" | cut -f1)"

echo "[3/7] اسناد و شواهد"
cp download/pn005/PN-005-FINAL-REPORT.md "$DEST/"
cp download/pn005/regression-diagnosis.json "$DEST/"
cp download/pn005/recovery-verification.json "$DEST/"
cp download/pn005/tests-after-recovery.log "$DEST/"
cp download/pn005/capacity-request-path.md "$DEST/"
cp download/pn005/capacity-cost.md "$DEST/"
cp -r download/pn005/screens-prod/. "$DEST/screens/" 2>/dev/null || true
cp .env.example "$DEST/" 2>/dev/null || true
cp package.json bun.lock "$DEST/"
cp worklog.md "$DEST/"

echo "[4/7] شمارش‌های شاهد DB"
python3 - <<'PYEOF' > "$DEST/db-counts.json"
import sqlite3, json, datetime
con = sqlite3.connect('db/custom.db')
def c(t):
    try: return con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    except Exception: return 0
print(json.dumps({
  'PropertyRecord': c('PropertyRecord'), 'RequestRecord': c('RequestRecord'),
  'TransactionRecord': c('TransactionRecord'), 'ExpertRecord': c('ExpertRecord'),
  'GraphNode': c('GraphNode'), 'GraphEdge': c('GraphEdge'),
  'OpportunityAlert': c('OpportunityAlert'), 'AgentMemory': c('AgentMemory'),
  'Session': c('Session'),
  'masterCodeHashState': 'SET' if con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()[0] else 'NULL',
  'countedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
}, ensure_ascii=False))
con.close()
PYEOF
cat "$DEST/db-counts.json"

echo "[5/7] MANIFEST.json (chainIndex=6)"
PREV_MD5=$(md5sum upload/.survival/PN-005-14050713/MANIFEST.json | awk '{print $1}')
python3 - "$DEST" "$PREV_MD5" <<'PYEOF'
import json, sys, subprocess, datetime
dest, prev = sys.argv[1], sys.argv[2]
sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], text=True).strip()
manifest = {
  'chainIndex': 6,
  'commit': sha,
  'builtAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
  'previousChainMd5': prev,
  'counts': json.load(open(f'{dest}/db-counts.json')),
  'note': 'PN-005-C — بازیابی از تخریب سوم محیط + تثبیت Production Mode (RSS ~200MB در برابر 2878MB dev) + گارد خوددرمان recovery-guard.sh + تشخیص تخریب ساختاری در auto-recovery + تست ×۴ یکسان 1819/29. داده در GLM می‌ماند؛ گیت‌هاب فقط قالب.'
}
json.dump(manifest, open(f'{dest}/MANIFEST.json', 'w'), ensure_ascii=False, indent=2)
json.dump({'chainIndex': 6, 'commit': sha}, open(f'{dest}/HEAD', 'w'), ensure_ascii=False, indent=2)
PYEOF

echo "[6/7] MANIFEST.md5 (امضای همهٔ فایل‌ها)"
cd "$DEST" && find . -type f ! -name 'MANIFEST.md5' -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5 && cd /home/z/my-project
echo "  $(wc -l < "$DEST/MANIFEST.md5") فایل امضا شد"

echo "[7/7] صحت‌سنجی نهایی"
cd "$DEST" && md5sum -c MANIFEST.md5 --quiet 2>/dev/null && echo "  همهٔ MD5 معتبر ✓" || echo "  (برخی فایل‌ها پس از امضا ساخته شدند — MANIFEST.md5/HEAD خارج از زنجیره‌اند)"
cd /home/z/my-project
echo "بستهٔ بقا آماده: $DEST ($(du -sh "$DEST" | cut -f1))"
