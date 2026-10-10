#!/usr/bin/env bash
# ============================================================
# PN-011 — بستهٔ بقای قابل بازتولید (ساختار استاندارد ن۰۰۸) · chainIndex=12
# ملکا-شورا-ن۰۱۱-۱۴۰۵ · رفع دائمی 500 + بازطراحی فیلتر/رنگ + توسعهٔ کاشی تطبیق
# ============================================================
set -euo pipefail
cd /home/z/my-project

PKG_DATE="20261007"
PKG="upload/.survival/PN-011-${PKG_DATE}"
PREV_PKG="upload/.survival/PN-010-20261006"
PREV_CHAIN_INDEX="11"
CHAIN_INDEX="12"

echo "[pkg] ═══ ساخت بستهٔ بقا chainIndex=${CHAIN_INDEX} — $(date -u +%FT%TZ) ═══"
rm -rf "$PKG"
mkdir -p "$PKG"/{git,db,env,build,docs,screens}

# ── HEAD ──
HEAD_FULL=$(git rev-parse HEAD)
cat > "$PKG/HEAD" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "commit": "${HEAD_FULL}",
  "package": "PN-011-${PKG_DATE}",
  "council": "ملکا-شورا-ن۰۱۱-۱۴۰۵"
}
EOF

# ── git/repo.bundle — همهٔ شاخه‌ها ──
echo "[pkg] git bundle (همهٔ شاخه‌ها)…"
git bundle create "$PKG/git/repo.bundle" --all > /dev/null 2>&1

# ── db/custom.db — اسنپ‌شات سازگار (VACUUM INTO) ──
echo "[pkg] اسنپ‌شات DB (VACUUM INTO)…"
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
    f.write("# (بستهٔ بقای استاندارد ن۰۰۸ — PN-011)\n")
    f.write("# نکتهٔ PN-011: پس از احیا از این بسته، گارد خوددرمانی راز بوت (escrow)\n")
    f.write("# در نبود MELK_TOKEN_KEY خودش کلید تازه تولید می‌کند — سرویس هرگز 500 نمی‌ماند.\n\n")
    for k in sorted(keys):
        f.write(f"- {k}\n")
print(f"KEYS.md: {len(keys)} کلید (فقط نام)")
PYEOF

# ── FINGERPRINT.json ──
bun run scripts/fingerprint.ts --out "$PKG/FINGERPRINT.json" > /dev/null

# ── CHAIN.json — زنجیرهٔ هش (لنگر = MANIFEST بستهٔ ۱۱) ──
PREV_MANIFEST_MD5=$(md5sum "$PREV_PKG/MANIFEST.json" 2>/dev/null | cut -d' ' -f1 || echo "missing")
BUNDLE_SHA=$(sha256sum "$PKG/git/repo.bundle" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "package": "PN-011-${PKG_DATE}",
  "date": "2026-10-07",
  "council": "ملکا-شورا-ن۰۱۱-۱۴۰۵ (رفع دائمی 500 + پالایش بصری و هوشمند)",
  "commit": "${HEAD_FULL}",
  "previous": {
    "package": "PN-010-20261006",
    "chainIndex": ${PREV_CHAIN_INDEX},
    "manifestMd5": "${PREV_MANIFEST_MD5}"
  },
  "anchors": {
    "dbMd5": "${DB_MD5}",
    "repoBundleSha256": "${BUNDLE_SHA}"
  },
  "note": "زنجیرهٔ هش بسته‌های بقا — هر بسته به MANIFEST بستهٔ قبلی لنگر می‌شود."
}
EOF

# ── build/ ──
echo "استاندارد ن۰۰۷/ن۰۱۰: standalone tar از بسته حذف شد — بازتولید: bun install && bun run build (~۴۰ ثانیه)" > "$PKG/build/STANDALONE.md"
cp .next/BUILD_ID "$PKG/build/BUILD_ID.txt" 2>/dev/null || true
cp .next/fingerprint.json "$PKG/build/fingerprint.json" 2>/dev/null || true

# ── docs/ — شواهد PN-011 ──
mkdir -p "$PKG/docs/pn011"
cat > "$PKG/docs/PHASE-NOTES.md" <<'EOF'
# PN-011 — رفع دائمی 500 + پالایش بصری چهارگانه + توسعهٔ کاشی تطبیق

## اولاً — گارد خوددرمانی راز بوت (سه لایه)
ریشهٔ پنجمین قطعی: بازنشانی محیط env.platform.json و کلید را می‌زداید؛
fail-fast امنیتی جلوی بوت را می‌گرفت → 500 عمومی تا مداخلهٔ دستی.
ترمیم پایدار (مصوبهٔ مالک — «به هر طریق ممکن برای همیشه»):
- **Escrow بادوام**: upload/.runtime/boot-secrets.json (upload در هر ۵ بازنشانی زنده ماند؛
  gitignored؛ هرگز وارد git/بستهٔ بقا نمی‌شود)
- **لایهٔ نگهبان پوسته**: prod-watchdog.sh پیش از spawn، راز غایب را از escrow می‌خواند؛
  MELK_TOKEN_KEY در فقدان کامل → openssl rand تازه
- **لایهٔ instrumentation**: ensureBootSecrets() پیش از fail-fast؛ env.platform.json بازسازی
- **درس زندهٔ دوتایی**: خروجی file-tracing خودِ Next کل مخزن (حتا .git و src) را داخل
  standalone کپی می‌کند → لنگر تعیینی: MELKA_REPO_DIR + نشانگر db/custom.db | .env.local
- **دریل سخت‌گیرانه**: بوت سرد با محیط تخریب‌شده → 200 در ۱ ثانیه (docs/pn011/reset-drill.json)

## ثانیاً — قانون عدم تکرار تک‌رنگ در ستون‌ها
پالت رجیستری به ۲۴ خانه (۱۲ خاندان × دو تُن) توسعه یافت؛ نقشهٔ رنگ از
۲۳ مقدار واقعی DB (کشف زنده) — هر مقدار در ستون خود یکتا؛ نرمال‌سازی فاصله.

## ثالثاً — فیلترهای چندگانه به شکل چیپ دسته‌بندی
شعبه M1/M2 (چندانتخابی + API چندمقداری) · فایل قرارداد M3 ·
شعبه/سمت/همکاری/وضعیت/مدیر/شهر M4 (شش گروه چیپی + profile-store چندمقداری).

## رابعاً — توضیحات زیر عناوین جدول پوشش اطلاعات حذف شد (زیبایی بصری).

## خامساً — توسعهٔ کاشی تطبیق (M5)
- کارشناس + شعبهٔ سطر مقابل در هر گزینه (دوطرفه) + شناسنامهٔ سطر ورودی
- حلقهٔ یادگیری وزن‌ها از بازخورد پذیرش/رد (weights-learning.ts) + ثبت عوامل با بازخورد
- ترمیم باگ‌های نهفته: روت بازخورد 404 (ایجنت ثبت نشده بود) · جستجو فقط با id
- پیوند عمیق بین‌کاشی M5 → M1/M2 (tileParams یک‌بارمصرف) · تنظیم showReasons فعال
- متراژ درخواست از فرم پویای ARM (inputsJson) — دقیق‌تر از حدس عنوان

## بازگرداندن (۵ گام) — عین README
git clone git/repo.bundle melka && cd melka
mkdir -p db && cp <بسته>/db/custom.db db/
cp <بسته>/env/.env.example .env   # MELK_TOKEN_KEY اختیاری شد — گارد خوددرمانی می‌سازد
bun install && bun run build
bash start.sh
EOF
cp -r download/pn011/* "$PKG/docs/pn011/" 2>/dev/null || true

# ── screens/ ──
cp download/pn011/screens/*.png "$PKG/screens/" 2>/dev/null || true

# ── README.md ──
cat > "$PKG/README.md" <<EOF
# بستهٔ بقای ملکا — PN-011 (chainIndex=${CHAIN_INDEX})

ساختار استاندارد ن۰۰۸ · رفع دائمی 500 + پالایش بصری/هوشمند · تاریخ: ۱۴۰۵/۰۷/۱۵
کد: \`${HEAD_FULL:0:7}\` · شاخه: main

## این بسته چیست؟
DNA کامل نسخه در یک لحظه: کد (git bundle)، داده (SQLite)، هویت (Fingerprint)،
زنجیرهٔ اعتماد (CHAIN) و محیط (فقط نام کلیدها — بدون هیچ رازی).

## بازگرداندن کامل در ۵ گام (≤ ۵ دقیقه)

\`\`\`bash
git clone git/repo.bundle melka && cd melka
mkdir -p db && cp <مسیر-این-بسته>/db/custom.db db/custom.db
cp <مسیر-این-بسته>/env/.env.example .env
#   نکتهٔ PN-011: MELK_TOKEN_KEY اگر نباشد، گارد خوددرمانی بوت خودش می‌سازد —
#   سرویس هرگز به‌خاطر راز گمشده 500 نمی‌ماند (هزینه: ورود مجدد ARM).
bun install && bun run build
bash start.sh
#   راستی‌آزمایی: curl localhost:3000/api/health → {"ok":true}
\`\`\`

## شواهد فاز (docs/pn011/)
دریل بازنشانی PASS + تست‌ها ۱۸۸۵/۰ ×۲ + اسکرین‌شات‌های کاشی‌ها.
EOF

# ── MANIFEST.json (گام آخر) ──
python3 - "$PKG" <<'PYEOF'
import hashlib, json, os, sys
pkg = sys.argv[1]
manifest = {"package": os.path.basename(pkg), "chainIndex": 12, "files": []}
for root, _, files in os.walk(pkg):
    for f in sorted(files):
        p = os.path.join(root, f)
        if f == "MANIFEST.json":
            continue
        h = hashlib.md5(open(p, "rb").read()).hexdigest()
        manifest["files"].append({"path": os.path.relpath(p, pkg), "md5": h, "bytes": os.path.getsize(p)})
manifest["files"].sort(key=lambda x: x["path"])
json.dump(manifest, open(os.path.join(pkg, "MANIFEST.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
total = sum(f["bytes"] for f in manifest["files"])
print(f"MANIFEST: {len(manifest['files'])} فایل · {total/1024/1024:.1f}MB")
PYEOF

echo "[pkg] ✓ بستهٔ بقا chainIndex=${CHAIN_INDEX} آماده است: $PKG"
du -sh "$PKG" | cut -f1
