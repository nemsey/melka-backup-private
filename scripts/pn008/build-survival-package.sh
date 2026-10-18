#!/usr/bin/env bash
# ============================================================
# PN-008 BLOCK 8 — بستهٔ بقای قابل بازتولید (ساختار استاندارد ن۰۰۷) · chainIndex=9
# ملکا-شورا-ن۰۰۷-۱۴۰۵ · فاز ۰.۵
# ------------------------------------------------------------
# ساختار استاندارد (مصوبهٔ شورا):
#   PN-XXX-[date]/
#   ├── MANIFEST.json  FINGERPRINT.json  CHAIN.json  HEAD  README.md
#   ├── git/repo.bundle            (همهٔ شاخه‌ها)
#   ├── db/custom.db + custom.db.md5
#   ├── env/.env.example + KEYS.md (فقط نام کلیدها — هرگز مقدار)
#   ├── build/next-standalone.tar.gz (اگر ≤ ۲۰MB — وگرنه سند دلیل)
#   ├── docs/PHASE-NOTES.md + RECOVERY-POLICY.md
#   └── screens/*.png
# استفاده:
#   bash scripts/pn007/build-survival-package.sh              (بستهٔ کامل + MANIFEST)
#   bash scripts/pn007/build-survival-package.sh --manifest-only (بازسازی MANIFEST پس از افزودن screens)
# ============================================================
set -euo pipefail
cd /home/z/my-project

MODE="${1:-full}"
PKG_DATE="20261006"
PKG="upload/.survival/PN-008-${PKG_DATE}"
PREV_PKG="upload/.survival/PN-007-20261006"
PREV_CHAIN_INDEX="8"
CHAIN_INDEX="9"

if [[ "$MODE" != "--manifest-only" ]]; then
  echo "[pkg] ═══ ساخت بستهٔ بقا chainIndex=${CHAIN_INDEX} — $(date -u +%FT%TZ) ═══"
  rm -rf "$PKG"
  mkdir -p "$PKG"/{git,db,env,build,docs,screens}

  # ── HEAD ──
  HEAD_FULL=$(git rev-parse HEAD)
  cat > "$PKG/HEAD" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "commit": "${HEAD_FULL}",
  "package": "PN-008-${PKG_DATE}",
  "council": "ملکا-شورا-ن۰۰۸-۱۴۰۵"
}
EOF

  # ── git/repo.bundle — همهٔ شاخه‌ها (بازتولید کامل کد) ──
  echo "[pkg] git bundle (همهٔ شاخه‌ها)…"
  git bundle create "$PKG/git/repo.bundle" --all > /dev/null 2>&1

  # ── db/custom.db — اسنپ‌شات سازگار (VACUUM INTO، نه کپی فایل داغ) ──
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
import sys, re
keys = set()
# از .env (کلیدهای فعال)
for line in open('.env', encoding='utf-8'):
    m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
    if m: keys.add(m.group(1))
# از .env.example (هم فعال هم کامنت — همهٔ کلیدهای شناخته‌شده)
for line in open('.env.example', encoding='utf-8'):
    m = re.match(r'^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
    if m: keys.add(m.group(1))
# از env.platform.json (کلیدهای پلتفرم)
import json
try:
    plat = json.load(open('env.platform.json'))
    for k in plat:
        if k.startswith('_'): continue
        keys.add(k)
except FileNotFoundError:
    pass
out = sys.argv[1]
with open(out, 'w', encoding='utf-8') as f:
    f.write("# فهرست کلیدهای محیطی ملکا — فقط نام، هرگز مقدار\n")
    f.write("# (بستهٔ بقای استاندارد ن۰۰۷ — PN-007 BLOCK 2)\n\n")
    for k in sorted(keys):
        f.write(f"- {k}\n")
print(f"KEYS.md: {len(keys)} کلید (فقط نام)")
PYEOF

  # ── FINGERPRINT.json — از BLOCK 1 ──
  bun run scripts/fingerprint.ts --out "$PKG/FINGERPRINT.json" > /dev/null

  # ── CHAIN.json — زنجیرهٔ هش (لنگر = MANIFEST بستهٔ قبلی) ──
  PREV_MANIFEST_MD5=$(md5sum "$PREV_PKG/MANIFEST.json" 2>/dev/null | cut -d' ' -f1 || echo "missing")
  BUNDLE_SHA=$(sha256sum "$PKG/git/repo.bundle" | cut -d' ' -f1)
  cat > "$PKG/CHAIN.json" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "package": "PN-008-${PKG_DATE}",
  "date": "2026-10-06",
  "council": "ملکا-شورا-ن۰۰۸-۱۴۰۵ (فاز ۱ — امنیت)",
  "commit": "${HEAD_FULL}",
  "previous": {
    "package": "PN-007-20261006",
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

  # ── README.md — راهنمای یک‌صفحه‌ای ──
  cat > "$PKG/README.md" <<EOF
# بستهٔ بقای ملکا — PN-008 (chainIndex=${CHAIN_INDEX})

ساختار استاندارد ن۰۰۷ · فاز ۰.۵ (بازتولیدپذیری) · تاریخ: ۱۴۰۵/۰۷/۱۶
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
#   سپس در .env مقدار این سه کلید را از محیط فعلی بگذارید:
#   DATABASE_URL / MASTER_ACCESS_CODE / MELK_SYNC_MODE (+ MELK_TOKEN_KEY از env.platform.json)

# ۴) وابستگی‌ها + بیلد
bun install && bun run build

# ۵) اجرا و راستی‌آزمایی
bun run start   # سپس: curl localhost:3000/api/health  →  {"ok":true}
#   ورود مالک: POST /api/auth/master-login {"masterCode":"<۸ رقم>"} → نقش OWNER
\`\`\`

## وارسی بازتولیدپذیری پس از بازگشت
\`\`\`bash
bun run scripts/fingerprint.ts --verify   # اثر انگشت کد = اثر انگشت بیلد
curl -s localhost:3000/api/version | jq .fingerprint.gitSha   # باید همین SHA باشد
\`\`\`

جزئیات بیشتر: docs/RECOVERY-POLICY.md و docs/PHASE-NOTES.md
EOF

  # ── build/ — سند دلیل نبود tar استندالون ──
  STANDALONE_MB=$(du -sm .next/standalone 2>/dev/null | cut -f1 || echo 0)
  {
    echo "# چرا بستهٔ استندالون (next-standalone.tar.gz) در این بسته نیست؟"
    echo ""
    echo "سقف مصوبهٔ شورا: ≤ ۲۰MB — اندازهٔ واقعی: **${STANDALONE_MB}MB** (تاریخ پایش: $(date -u +%F))"
    echo ""
    echo "تفکیک حجم: node_modules ردیابی‌شده ~۱۴۹MB + upload/ ردیابی‌شده ~۳۸۷MB + بقیهٔ ردیابی."
    echo ""
    echo "تصمیم (الگوی Blocker → Alternative → Decision):"
    echo "- Blocker: بستهٔ استندالون از سقف ۲۰MB بسیار فراتر است."
    echo "- Alternative: بازتولید از طریق git/repo.bundle + bun.lock — همان کد، همان وابستگی‌ها."
    echo "- Decision: حذف tar و اتکای کامل به بازتولید (خودِ موضوع فاز ۰.۵):"
    echo "  \`git clone git/repo.bundle && bun install && bun run build\` ≈ ۴۰ ثانیه."
    echo "- شاهد: آزمون بازتولیدپذیری BLOCK 1 — ۱۰۰٪ فیلدهای قابل‌مقایسه بین دو بیلد یکسان."
  } > "$PKG/build/STANDALONE-NOTE.md"

  # ── docs/PHASE-NOTES.md ──
  {
    echo "# یادداشت فاز ۰.۵ — بازتولیدپذیری (PN-007)"
    echo ""
    echo "- نظام Fingerprint: src/lib/version-fingerprint.ts + scripts/fingerprint.ts + postbuild خودکار"
    echo "- شاهد سرو: GET /api/version → کلید fingerprint (source: baked)"
    echo "- آزمون بازتولیدپذیری: دو بیلد متوالی از صفر — ۱۰۰٪ فیلدهای قابل‌مقایسه یکسان (download/pn007/fingerprint-proof.json)"
    echo "- ساختار این بسته: استاندارد ن۰۰۷ (git/ db/ env/ build/ docs/ screens/)"
    echo "- گاردهای سازگار: recovery-guard.sh و auto-recovery.sh هر دو چیدمان تخت قدیمی و db/ جدید را می‌شناسند"
  } > "$PKG/docs/PHASE-NOTES.md"

  # ── docs/RECOVERY-POLICY.md ──
  {
    echo "# سیاست بازیابی ملکا"
    echo ""
    echo "## ۱) خوددرمان (پیش‌فرض — بدون دخالت انسان)"
    echo "- قلاب بوت: scripts/recovery/auto-recovery.sh (تشخیص تخریب ساختاری)"
    echo "- گارد: scripts/pn005c/recovery-guard.sh (هش NULL / گراف صفر → بکاپ → بازیابی از تازه‌ترین بستهٔ بقا)"
    echo "- ضدحلقه: پنجرهٔ ۱۰ دقیقه — هر تخریب فقط یک بازیابی"
    echo ""
    echo "## ۲) مسیر دستی (مالک/GLM)"
    echo "همان ۵ گام README.md — بدون ابزار خاص، فقط git + bun."
    echo ""
    echo "## ۳) مرزها"
    echo "- این بقهه DB مالک را در خود دارد (custom.db) — محرمانه است؛ در مخزن عمومی قرار نگیرد."
    echo "- env/KEYS.md فقط نام کلید است — مقادیر هرگز وارد بسته نمی‌شوند."
    echo "- زنجیرهٔ اعتماد: CHAIN.json لنگر به MANIFEST بستهٔ قبلی — دست‌کاری آشکار می‌شود."
  } > "$PKG/docs/RECOVERY-POLICY.md"

  echo "[pkg] بدنهٔ بسته کامل شد — مسیر بازسازی MANIFEST…"
fi

# ═══ MANIFEST.json — فهرست کامل فایل‌ها + MD5 (همیشه بازسازی می‌شود) ═══
python3 - "$PKG" <<'PYEOF'
import hashlib, json, os, sys, datetime
pkg = sys.argv[1]
entries = []
for root, dirs, files in os.walk(pkg):
    dirs.sort()
    for fn in sorted(files):
        full = os.path.join(root, fn)
        rel = os.path.relpath(full, pkg)
        if rel == "MANIFEST.json":
            continue
        h = hashlib.md5()
        with open(full, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        entries.append({
            "file": rel,
            "bytes": os.path.getsize(full),
            "md5": h.hexdigest(),
        })
manifest = {
    "package": os.path.basename(pkg),
    "chainIndex": 9,
    "council": "ملکا-شورا-ن۰۰۸-۱۴۰۵",
    "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    "fileCount": len(entries),
    "totalBytes": sum(e["bytes"] for e in entries),
    "files": entries,
}
with open(os.path.join(pkg, "MANIFEST.json"), 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(f"MANIFEST.json: {len(entries)} فایل، {manifest['totalBytes']//1048576}MB")
PYEOF

echo "[pkg] ✅ بستهٔ بقا آماده: $PKG (chainIndex=${CHAIN_INDEX})"
