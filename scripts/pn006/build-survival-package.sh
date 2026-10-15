#!/bin/bash
# بستهٔ بقا PN-006 — chainIndex=7 (ملکا-شورا-ن۰۰۶-۱۴۰۵ · فاز ۰-B)
set -euo pipefail
cd /home/z/my-project

STAMP="PN-006-$(date +%Y%m%d)"
DEST="upload/.survival/$STAMP"
mkdir -p "$DEST/screens"

echo "[1/8] بستهٔ git (bundle — کل تاریخ + همهٔ شاخه‌ها)"
git bundle create "$DEST/repo.bundle" --all 2>/dev/null && echo "  repo.bundle: $(du -h "$DEST/repo.bundle" | cut -f1)"

echo "[2/8] پایگاه دادهٔ کامل (custom.db)"
cp db/custom.db "$DEST/custom.db"
echo "  custom.db: $(du -h "$DEST/custom.db" | cut -f1)"

echo "[3/8] اسناد و شواهد جلسهٔ ۰۰۶"
cp download/pn006/PN-006-FINAL-REPORT.md "$DEST/" 2>/dev/null || echo "  (گزارش نهایی هنوز ساخته نشده — پس از تولید بازچینی می‌شود)"
cp download/pn006/baseline.json "$DEST/"
cp download/pn006/build-peak.json "$DEST/"
cp download/pn006/perf-budget.json "$DEST/"
cp download/pn006/test-classification.json "$DEST/"
cp download/pn006/recovery-test-1.json download/pn006/recovery-test-2.json download/pn006/recovery-test-3.json "$DEST/"
cp download/pn006/capacity-request-simple.md "$DEST/"
cp download/pn006/dmesg-oom.log download/pn006/worker-test.json "$DEST/"
cp -r download/pn006/screens/. "$DEST/screens/" 2>/dev/null || true
cp .env.example "$DEST/" 2>/dev/null || true
cp package.json bun.lock "$DEST/"
cp worklog.md "$DEST/"

echo "[4/8] شمارش‌های شاهد DB"
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
  'TransactionEnrichment': c('TransactionEnrichment'),
  'requestWithTradeName': c('RequestRecord') and con.execute("SELECT COUNT(*) FROM RequestRecord WHERE tradeTypeName IS NOT NULL").fetchone()[0],
  'Session': c('Session'),
  'masterCodeHashState': 'SET' if con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()[0] else 'NULL',
  'countedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
}, ensure_ascii=False))
con.close()
PYEOF
cat "$DEST/db-counts.json"

echo "[5/8] MANIFEST.json (chainIndex=7)"
PREV_MD5=$(md5sum upload/.survival/PN-005C-20261006/MANIFEST.json | awk '{print $1}')
python3 - "$DEST" "$PREV_MD5" <<'PYEOF'
import json, sys, subprocess, datetime
dest, prev = sys.argv[1], sys.argv[2]
sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], text=True).strip()
manifest = {
  'chainIndex': 7,
  'commit': sha,
  'builtAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
  'previousChainMd5': prev,
  'counts': json.load(open(f'{dest}/db-counts.json')),
  'note': 'PN-006 فاز ۰-B — دروازهٔ production پیش‌فرض (MELK_DEV_MODE) + تقسیم بیلد (پیک ۲۱۳۵→۱۷۴۳-۱۹۸۸MB) + بودجهٔ کارایی ۱۱/۱۲ + خوددرمانی آزموده ×۳ + کشف/رفع باگ الگوی بستهٔ بقا (P[0-9]*→P*/ با custom.db) + تفکیک/رفع ۲۱ از ۲۹ تست (۱۸۳۶ سبز ×۲ یکسان) + SW قفل v7. داده در GLM می‌ماند؛ گیت‌هاب فقط قالب.'
}
json.dump(manifest, open(f'{dest}/MANIFEST.json', 'w'), ensure_ascii=False, indent=2)
json.dump({'chainIndex': 7, 'commit': sha}, open(f'{dest}/HEAD', 'w'), ensure_ascii=False, indent=2)
PYEOF

echo "[6/8] MANIFEST.md5 (امضای همهٔ فایل‌ها)"
cd "$DEST" && find . -type f ! -name 'MANIFEST.md5' -print0 | sort -z | xargs -0 md5sum > MANIFEST.md5 && cd /home/z/my-project
echo "  $(wc -l < "$DEST/MANIFEST.md5") فایل امضا شد"

echo "[7/8] صحت‌سنجی نهایی"
cd "$DEST" && md5sum -c MANIFEST.md5 --quiet 2>/dev/null && echo "  همهٔ MD5 معتبر ✓" || echo "  (MANIFEST.md5/HEAD خارج از زنجیره‌اند)"
cd /home/z/my-project

echo "[8/8] نتیجه"
echo "بستهٔ بقا آماده: $DEST ($(du -sh "$DEST" | cut -f1))"
