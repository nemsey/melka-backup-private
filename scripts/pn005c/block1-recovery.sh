#!/bin/bash
# ============================================================
# PN-005-C · BLOCK 1 — بازیابی از بستهٔ بقا (chainIndex=5)
# جلسهٔ فوق‌العاده ۰۰۵ · ملکا-شورا-ن۰۰۵-۱۴۰۵
# اولویت: داده → پیکربندی → (کد از قبل در HEAD سالم است)
# ============================================================
set -uo pipefail
cd /home/z/my-project
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
PKG="upload/.survival/PN-005-14050713"
DB="db/custom.db"
LOG="scripts/pn005c/block1-recovery.log"

step() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "$LOG"; }

echo "=== PN-005-C BLOCK 1 RECOVERY — start $(date -u +%FT%TZ) ===" | tee "$LOG"

# ── گام ۰: شمارش پیش از بازیابی (شاهد تخریب) ──
step "گام ۰: شمارش پیش از بازیابی"
python3 - <<'PYEOF' | tee -a "$LOG"
import sqlite3, json
con = sqlite3.connect('db/custom.db'); cur = con.cursor()
def c(t):
    try: return cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    except Exception: return -1
d = {t: c(t) for t in ['PropertyRecord','RequestRecord','TransactionRecord','ExpertRecord',
    'GraphNode','GraphEdge','OpportunityAlert','PmPersonnelRecord','CustomerRecord','AgentMemory','Session']}
row = cur.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
d['masterCodeHash'] = ('NULL' if not row or not row[0] else 'SET')
print('PRE_RECOVERY_COUNTS=' + json.dumps(d, ensure_ascii=False))
con.close()
PYEOF

# ── گام ۱: بکاپ DB تخریب‌شدهٔ فعلی (هرگز بدون بکاپ) ──
step "گام ۱: بکاپ پیش از بازیابی"
BK="upload/dataset-backups/pn005c-pre-recovery-${TS}.db"
cp "$DB" "$BK" && step "بکاپ: $BK ($(stat -c%s "$BK") bytes)"

# ── گام ۲: توقف سرور dev (قفل SQLite + سوئیچ به prod در ادامه) ──
step "گام ۲: توقف سرور dev"
pkill -f 'next dev -p 3000' 2>/dev/null || true
pkill -f 'bun run dev' 2>/dev/null || true
sleep 3
if pgrep -f 'next-server' >/dev/null 2>&1; then pkill -9 -f 'next-server' 2>/dev/null || true; sleep 2; fi
step "فرایندهای next باقی‌مانده: $(pgrep -c -f 'next' 2>/dev/null || echo 0)"

# ── گام ۳: بازسازی .env (الگوی سه‌خطی کامیت‌شده) ──
step "گام ۳: بازیابی .env از HEAD"
git checkout -- .env
step ".env بازیابی شد: $(wc -l < .env) خط"

# ── گام ۴: بازسازی .env.local (لایهٔ ۱ زنجیرهٔ کدمستر) ──
step "گام ۴: بازسازی .env.local"
cat > .env.local <<'ENVEOF'
MASTER_ACCESS_CODE=80211186
MELK_SYNC_MODE=incremental
ENVEOF
chmod 600 .env.local
step ".env.local ساخته شد (MASTER_ACCESS_CODE=۸۰۲۱۱۱۸۶ + MELK_SYNC_MODE=incremental · MELK_TOKEN_KEY طبق تصمیم PN-002 در env.platform.json می‌ماند)"

# ── گام ۵: راستی‌آزمایی MD5 بستهٔ بقا → بازگرداندن DB ──
step "گام ۵: راستی‌آزمایی MD5 بستهٔ بقا"
EXPECT_MD5="9ee7ef6729e1a697442b24d44156271c"
ACTUAL_MD5=$(md5sum "${PKG}/custom.db" | awk '{print $1}')
if [ "$ACTUAL_MD5" != "$EXPECT_MD5" ]; then
  step "FAIL: MD5 بستهٔ بقا ناهمخوان! انتظار=$EXPECT_MD5 واقعی=$ACTUAL_MD5 — توقف"
  exit 1
fi
step "MD5 بستهٔ بقا ✓ ($ACTUAL_MD5)"
cp "${PKG}/custom.db" "$DB"
step "DB از بستهٔ بقا (chainIndex=5 · b13391b) بازگردانی شد: $(stat -c%s "$DB") bytes"

# ── گام ۶: بازسازی زیرساخت بقای محیط (credentials + template + expected) ──
step "گام ۶: بازسازی زیرساخت بقا"
mkdir -p upload/.mirror
git remote get-url melka-backup > upload/.mirror/credentials.env.mirror-url 2>/dev/null || true
printf 'MIRROR_URL_AUTHED=%s\n' "$(git remote get-url melka-backup)" > upload/.mirror/credentials.env
chmod 600 upload/.mirror/credentials.env
step "upload/.mirror/credentials.env بازسازی شد (از remote ملکا)"
cp .env.local upload/.survival/env.local.template
step "upload/.survival/env.local.template ذخیره شد (الگوی بقای env)"

# ── گام ۷: راستی‌آزمایی پس از بازیابی ──
step "گام ۷: راستی‌آزمایی پس از بازیابی"
python3 - <<'PYEOF' | tee -a "$LOG"
import sqlite3, json, hashlib
con = sqlite3.connect('db/custom.db'); cur = con.cursor()
def c(t):
    try: return cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    except Exception: return -1
d = {t: c(t) for t in ['PropertyRecord','RequestRecord','TransactionRecord','ExpertRecord',
    'GraphNode','GraphEdge','OpportunityAlert','PmPersonnelRecord','CustomerRecord','AgentMemory',
    'AgentPolicyVersion','Prediction' ]}
# مدل‌های واقعی Prediction/ListingRecord:
for t in ['ListingRecord','InteractionRecord','VisitRecord']:
    d[t] = c(t)
row = cur.execute('SELECT masterCodeHash, buildId FROM AppMeta').fetchone()
d['masterCodeHash'] = (row[0][:12] + '…') if row and row[0] else 'NULL'
d['appMetaBuildId'] = row[1] if row else None
h = hashlib.sha256(b'80211186').hexdigest()
d['sha256_of_80211186'] = h[:12] + '…'
d['masterHashMatchesCode'] = bool(row and row[0] and row[0] == h)
print('POST_RECOVERY_COUNTS=' + json.dumps(d, ensure_ascii=False))
con.close()
PYEOF

step "BLOCK 1 بازیابی داده/پیکربندی کامل شد — گام بعدی: build + prod"
echo "=== BLOCK 1 DONE $(date -u +%FT%TZ) ===" | tee -a "$LOG"
