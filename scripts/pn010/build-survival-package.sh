#!/usr/bin/env bash
# ============================================================
# PN-010 BLOCK 7 — بستهٔ بقای قابل بازتولید (ساختار استاندارد ن۰۰۸) · chainIndex=11
# ملکا-شورا-ن۰۱۰-۱۴۰۵ · فاز ۲: معماری Runtime پایدار
# ============================================================
set -euo pipefail
cd /home/z/my-project

PKG_DATE="20261006"
PKG="upload/.survival/PN-010-${PKG_DATE}"
PREV_PKG="upload/.survival/PN-009-20261006"
PREV_CHAIN_INDEX="10"
CHAIN_INDEX="11"

echo "[pkg] ═══ ساخت بستهٔ بقا chainIndex=${CHAIN_INDEX} — $(date -u +%FT%TZ) ═══"
rm -rf "$PKG"
mkdir -p "$PKG"/{git,db,env,build,docs,screens}

# ── HEAD ──
HEAD_FULL=$(git rev-parse HEAD)
cat > "$PKG/HEAD" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "commit": "${HEAD_FULL}",
  "package": "PN-010-${PKG_DATE}",
  "council": "ملکا-شورا-ن۰۱۰-۱۴۰۵"
}
EOF

# ── git/repo.bundle — همهٔ شاخه‌ها ──
echo "[pkg] git bundle (همهٔ شاخه‌ها)…"
git bundle create "$PKG/git/repo.bundle" --all > /dev/null 2>&1

# ── db/custom.db — اسنپ‌شات سازگار (VACUUM INTO) ──
echo "[pkg] اسنپ‌شات DB (VACUUM INTO)…"
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
bun -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } });
p.\$queryRawUnsafe(\`VACUUM INTO '/home/z/my-project/${PKG}/db/custom.db.tmp'\`)
  .then(() => { console.log('VACUUM ok'); return p.\$disconnect(); })
  .catch(e => { console.error('VACUUM FAIL', e); process.exit(1); });
"
mv "$PKG/db/custom.db.tmp" "$PKG/db/custom.db"
DB_MD5=$(md5sum "$PKG/db/custom.db" | cut -d' ' -f1)
echo "${DB_MD5}  custom.db" > "$PKG/db/custom.db.md5"

# ── env/.env.example + KEYS.md (فقط نام‌ها — صفر راز) ──
cp .env.example "$PKG/env/.env.example"
python3 - "$PKG/env/KEYS.md" <<'PYEOF'
import sys, re, json
keys = set()
for line in open('.env', encoding='utf-8'):
    m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
    if m: keys.add(m.group(1))
for line in open('.env.example', encoding='utf-8'):
    m = re.match(r'^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
    if m: keys.add(m.group(1))
try:
    plat = json.load(open('env.platform.json'))
    for k in plat:
        if k.startswith('_'): continue
        keys.add(k)
except FileNotFoundError:
    pass
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write("# فهرست کلیدهای محیطی ملکا — فقط نام، هرگز مقدار\n")
    f.write("# (بستهٔ بقای استاندارد ن۰۰۸ — PN-010)\n\n")
    for k in sorted(keys):
        f.write(f"- {k}\n")
print(f"KEYS.md: {len(keys)} کلید (فقط نام)")
PYEOF

# ── FINGERPRINT.json ──
bun run scripts/fingerprint.ts --out "$PKG/FINGERPRINT.json" > /dev/null

# ── CHAIN.json — زنجیرهٔ هش (لنگر = MANIFEST بستهٔ ۱۰) ──
PREV_MANIFEST_MD5=$(md5sum "$PREV_PKG/MANIFEST.json" 2>/dev/null | cut -d' ' -f1 || echo "missing")
BUNDLE_SHA=$(sha256sum "$PKG/git/repo.bundle" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "package": "PN-010-${PKG_DATE}",
  "date": "2026-10-06",
  "council": "ملکا-شورا-ن۰۱۰-۱۴۰۵ (معماری Runtime پایدار — فاز ۲)",
  "commit": "${HEAD_FULL}",
  "previous": {
    "package": "PN-009-20261006",
    "chainIndex": ${PREV_CHAIN_INDEX},
    "manifestMd5": "${PREV_MANIFEST_MD5}"
  },
  "anchors": {
    "dbMd5": "${DB_MD5}",
    "repoBundleSha256": "${BUNDLE_SHA}"
  },
  "note": "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود. بازتولیدپذیری: git/repo.bundle + FINGERPRINT.json + bun.lock (داخل bundle) همان کد را بازمی‌سازند."
}
EOF

# ── build/ — مستندسازی (standalone حجیم؛ بازتولید از bundle ~۴۰ ثانیه) ──
echo "[build] اثر انگشت بیلد زندهٔ همین HEAD در بسته ثبت شد." > "$PKG/build/STANDALONE.md"
echo "استاندارد ن۰۰۷: standalone tar از بسته حذف شد (>۲۰MB) — بازتولید: bun install && bun run build" >> "$PKG/build/STANDALONE.md"
cp .next/BUILD_ID "$PKG/build/BUILD_ID.txt" 2>/dev/null || true
cp .next/fingerprint.json "$PKG/build/fingerprint.json" 2>/dev/null || true

# ── docs/ — یادداشت فاز + شواهد PN-010 ──
mkdir -p "$PKG/docs/pn010"
cat > "$PKG/docs/PHASE-NOTES.md" <<EOF
# فاز ۲ — معماری Runtime پایدار (PN-010)

## معماری تازه
- **یک Web + یک Worker** (حداکثر دو فرایند — مصوبهٔ کمیسیون متخصص)
- **JobLock با ضربان قلب**: جلوگیری از اجرای تکراری کارها بین نمونه‌ها (جدول JobLock · ضربان ۳۰ ثانیه · TTL ۹۰)
- **RuntimeSupervisor سبک** (src/core/runtime/supervisor.ts): start/stop/health/restart + احیای خودکار Worker هر ۶۰ ثانیه
- **کارهای Worker**: intelligence-cycle (۶۰m) · catalog-cycle (۱m) · mirror-cycle (۶h) · log-rotate (۳۰m) · backup-rotation (۶h · تازه)
- **Auto-Recovery**: Boot Hook ماند (مصوب)

## ترمیم DIAG-DATA-005
دو ریشه: بازنشانی محیط (پوشهٔ backups خالی) + process.chdir استندالون (شمارش در مسیر غلط).
ترمیم: بکاپ چرخشی Worker + نقطهٔ شمارش با MELKA_REPO_DIR. سبز زنده: ۳ فایل بکاپ.

## بازگرداندن (۵ گام)
git clone git/repo.bundle melka && cd melka
mkdir -p db && cp <بسته>/db/custom.db db/
cp <بسته>/env/.env.example .env  # مقادیر از KEYS.md و محیط امن
bun install && bun run build
bash start.sh  # سرور + Supervisor → Worker خودکار
EOF
cp -r download/pn010/* "$PKG/docs/pn010/" 2>/dev/null || true
cp docs/RECOVERY-POLICY.md "$PKG/docs/" 2>/dev/null || true

# ── screens/ ──
cp download/pn010/screens/*.png "$PKG/screens/" 2>/dev/null || true

# ── README.md — راهنمای پنج‌گامی ──
cat > "$PKG/README.md" <<EOF
# بستهٔ بقای ملکا — PN-010 (chainIndex=${CHAIN_INDEX})

ساختار استاندارد ن۰۰۸ · فاز ۲ (معماری Runtime پایدار) · تاریخ: ۱۴۰۵/۰۷/۱۶
کد: \`${HEAD_FULL:0:7}\` · شاخه: main

## این بسته چیست؟
DNA کامل نسخه در یک لحظه: کد (git bundle)، داده (SQLite)، هویت (Fingerprint)،
زنجیرهٔ اعتماد (CHAIN) و محیط (فقط نام کلیدها — بدون هیچ رازی).

## بازگرداندن کامل در ۵ گام (≤ ۵ دقیقه)

\`\`\`bash
# ۱) کد را از bundle بازکن
git clone git/repo.bundle melka && cd melka

# ۲) داده را برگردان
mkdir -p db && cp <مسیر-این-بسته>/db/custom.db db/custom.db

# ۳) محیط را بساز (نام‌ها در env/KEYS.md — مقادیر از محیط امن)
cp <مسیر-این-بسته>/env/.env.example .env
#   سپس در .env مقدار این کلیدها را از محیط فعلی بگذارید:
#   DATABASE_URL / MASTER_ACCESS_CODE / MELK_SYNC_MODE (+ MELK_TOKEN_KEY از env.platform.json)

# ۴) وابستگی‌ها + بیلد
bun install && bun run build

# ۵) اجرا و راستی‌آزمایی
bash start.sh   # سرور production + Supervisor → Worker خودکار زنده می‌شود
#   راستی‌آزمایی: curl localhost:3000/api/health → {"ok":true}
#   ورود مالک: POST /api/auth/master-login {"masterCode":"<۸ رقم>"} → نقش OWNER
#   سلامت رانتایم (OWNER): GET /api/runtime/health → worker.alive = true
\`\`\`

## شواهد فاز (docs/pn010/)
گزارش نهایی + شاهدهای هفت بلوک + تست‌ها + اسکرین‌شات‌ها.
EOF

# ── MANIFEST.json (گام آخر — شامل خودِ MANIFEST نمی‌شود) ──
python3 - "$PKG" <<'PYEOF'
import sys, os, json, hashlib, datetime
pkg = sys.argv[1]
files = []
for root, _, names in os.walk(pkg):
    for n in names:
        if n in ("MANIFEST.json",): continue
        p = os.path.join(root, n)
        rel = os.path.relpath(p, pkg)
        with open(p, "rb") as f:
            md5 = hashlib.md5(f.read()).hexdigest()
        files.append({"file": rel, "bytes": os.path.getsize(p), "md5": md5})
files.sort(key=lambda x: x["file"])
manifest = {
    "package": "PN-010-20261006",
    "chainIndex": 11,
    "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
    "files": files,
    "counts": {"files": len(files)},
}
with open(os.path.join(pkg, "MANIFEST.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(f"MANIFEST: {len(files)} فایل")
PYEOF

echo "[pkg] بسته کامل: $(du -sh "$PKG" | cut -f1) · MD5 بسته برای تحویل:"
TOTAL_MD5=$(cd "$PKG" && find . -type f | sort | xargs md5sum | md5sum | cut -d' ' -f1)
echo "  chain-md5: ${TOTAL_MD5}"

# ── تحویل قانون فایل: tar.gz در download ──
echo "[pkg] ساخت tar.gz قانون فایل (download/PN-010-chainIndex=11.tar.gz)…"
cd upload/.survival && tar -czf "/home/z/my-project/download/PN-010-chainIndex=11.tar.gz" "PN-010-${PKG_DATE}" && cd /home/z/my-project
ls -la "download/PN-010-chainIndex=11.tar.gz"
echo "[pkg] ✓ chainIndex=${CHAIN_INDEX} کامل — لنگر: MANIFEST بستهٔ ۱۰ (${PREV_MANIFEST_MD5:0:10}…)"
