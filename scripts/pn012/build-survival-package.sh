#!/usr/bin/env bash
# ============================================================
# PN-012 — بستهٔ بقای قابل بازتولید (ساختار استاندارد ن۰۰۸) · chainIndex=13
# ملکا-شورا-ن۰۱۲-۱۴۰۵ · تشخیص+رفع قطعی بحران ششم + فاز ۳ معماری
# ============================================================
set -euo pipefail
cd /home/z/my-project

PKG_DATE="20261007"
PKG="upload/.survival/PN-012-${PKG_DATE}"
PREV_PKG="upload/.survival/PN-011-20261007"
PREV_CHAIN_INDEX="12"
CHAIN_INDEX="13"

echo "[pkg] ═══ ساخت بستهٔ بقا chainIndex=${CHAIN_INDEX} — $(date -u +%FT%TZ) ═══"
rm -rf "$PKG"
mkdir -p "$PKG"/{git,db,env,build,docs,screens}

# ── HEAD ──
HEAD_FULL=$(git rev-parse HEAD)
cat > "$PKG/HEAD" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "commit": "${HEAD_FULL}",
  "package": "PN-012-${PKG_DATE}",
  "council": "ملکا-شورا-ن۰۱۲-۱۴۰۵"
}
EOF

# ── git/repo.bundle — همهٔ شاخه‌ها ──
echo "[pkg] git bundle (همهٔ شاخه‌ها)…"
git bundle create "$PKG/git/repo.bundle" --all > /dev/null 2>&1

# ── db/custom.db — اسنپ‌شات سازگار (VACUUM INTO) ──
echo "[pkg] اسنپ‌شات DB (VACUUM INTO)…"
python3 - <<PYEOF
import sqlite3
con = sqlite3.connect("/home/z/my-project/db/custom.db")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.execute("VACUUM INTO '/home/z/my-project/${PKG}/db/custom.db.tmp'")
con.close()
print("VACUUM ok")
PYEOF
mv "$PKG/db/custom.db.tmp" "$PKG/db/custom.db"
DB_MD5=$(md5sum "$PKG/db/custom.db" | cut -d' ' -f1)
echo "${DB_MD5}  custom.db" > "$PKG/db/custom.db.md5"

# ── env/.env.example + KEYS.md (فقط نام‌ها — صفر راز) ──
cp .env.example "$PKG/env/.env.example" 2>/dev/null || cp env.platform.json.example "$PKG/env/env.platform.json.example"
python3 - "$PKG/env/KEYS.md" <<'PYEOF'
import sys, re, json
keys = set()
for fn in [".env", ".env.example", ".env.local"]:
    try:
        for line in open(fn, encoding="utf-8"):
            m = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=', line)
            if m: keys.add(m.group(1))
    except FileNotFoundError:
        pass
try:
    plat = json.load(open("env.platform.json"))
    for k in plat:
        if k.startswith("_"): continue
        keys.add(k)
except FileNotFoundError:
    pass
with open(sys.argv[1], "w", encoding="utf-8") as f:
    f.write("# فهرست کلیدهای محیطی ملکا — فقط نام، هرگز مقدار\n")
    f.write("# (بستهٔ بقای استاندارد ن۰۰۸ — PN-012)\n")
    f.write("# نکتهٔ PN-012 (سه‌مکانی): پس از احیا از این بسته، سازوکار راز بوت\n")
    f.write("# از زنجیرهٔ db/.runtime → upload/.runtime → env.escrow.enc (رمزنگاری‌شده\n")
    f.write("# با کد مستر) بازیابی می‌کند؛ در فقدان کامل، کلید تازه می‌سازد — هرگز 500 نمی‌ماند.\n\n")
    for k in sorted(keys):
        f.write(f"- {k}\n")
print(f"KEYS.md: {len(keys)} کلید (فقط نام)")
PYEOF

# ── FINGERPRINT.json ──
bun run scripts/fingerprint.ts --out "$PKG/FINGERPRINT.json" > /dev/null

# ── CHAIN.json — زنجیرهٔ هش (لنگر = MANIFEST بستهٔ ۱۲) ──
PREV_MANIFEST_MD5=$(md5sum "$PREV_PKG/MANIFEST.json" 2>/dev/null | cut -d' ' -f1 || echo "missing")
BUNDLE_SHA=$(sha256sum "$PKG/git/repo.bundle" | cut -d' ' -f1)
cat > "$PKG/CHAIN.json" <<EOF
{
  "chainIndex": ${CHAIN_INDEX},
  "package": "PN-012-${PKG_DATE}",
  "date": "2026-10-07",
  "council": "ملکا-شورا-ن۰۱۲-۱۴۰۵ (تشخیص و رفع قطعی بحران ششم + فاز ۳ معماری)",
  "commit": "${HEAD_FULL}",
  "previous": {
    "package": "PN-011-20261007",
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

# ── docs/ — شواهد PN-012 ──
mkdir -p "$PKG/docs/pn012"
cp download/pn012/*.json "$PKG/docs/pn012/" 2>/dev/null || true
cat > "$PKG/docs/PHASE-NOTES.md" <<'EOF'
# PN-012 — تشخیص و رفع قطعی بحران ششم + فاز ۳ معماری

## بحران ششم و ریشهٔ آن (diagnosis.json)
پلتفرم (ششمین بازنشانی، ~۰۸:۰۰) MELK_TOKEN_KEY را از .env.local زدود و env.platform.json
و backups/ را پاک کرد؛ سه‌لایهٔ PN-011 «کد» خود را از دست داده بود — پلتفرم حتی درخت گیت را
به fb77eb7 (شب ۰۴:۰۹) برگرداند و کامیت‌های a7ab572 جلسهٔ PN-011 را از پروژه محو کرد!
→ escrow (فایل) زنده بود اما «کد خوانندهٔ» آن در هیچ نسخهٔ کامیت‌شده‌ای نبود → escrow یتیم → 500.

## بازیابی معجزه‌آسا (کامیت 37f6d02)
دو snapshot از آینهٔ GitHub (worker mirror-cycle در ۰۷:۲۵/۰۷:۲۹) کل درخت PN-011 را
نگه داشته بودند → بازیابی کامل: boot-secrets + فیلتر چیپی + پالت ۲۴خانه + توسعهٔ M5
+ ۱۸۸۵ تست همان جلسه + ۱۳ شاهد بصری + ۱٬۲۵۳ رکورد سیاههٔ هوشمندی.

## رفع قطعی — escrow سه‌مکانی (fix-permanent.json)
- v1-a: db/.runtime/boot-secrets.json — db/ در هر ۶ بحران زنده ماند
- v1-b: upload/.runtime/boot-secrets.json — طرح PN-011
- v2: env.escrow.enc — رمزنگاری‌شده در گیت/آینه (AES-256-GCM · scrypt(کد مستر)) — مجاز صریح شورا
- قلاب در سه مسیر بوت: dev-entry + نگهبان (درون حلقه) + start.sh
- لایهٔ درونی: ensureBootSecrets پیش از fail-fast (بازیابی/تولید/بازسازی env.platform.json)
- دو دریل زنده PASS: ریست شبیه‌سازی‌شده → بازیابی از db → 200 · فاجعهٔ کامل → رمزگشایی از
  env.escrow.enc با کد مستر → 200

## فاز ۳ — بستن بدهی‌ها
- BLOCK 1: ۴۶→۰ نقض مرز Repository (لایهٔ سرویس + ۶ روت لاغر)
- BLOCK 2: JobLock Lease Renewal (متد renew + LeaseGuard + صفر Duplicate در شبیه‌سازی ۵ دقیقه)
- BLOCK 3: افزونگی escrow + سند GitHub Secret (مالک تصمیم می‌گیرد)
- BLOCK 4: API Versioning — ۶۸ آینهٔ v1 (re-export سبک) + alias زنده
- BLOCK 5: گارد audit-boot-secrets + CI strict کامل
- BLOCK 6: ۵۰ تست تازه + دو-سبز ۱۹۳۵/۰ ×۲ (سه ریشهٔ نوسان تست قطعی شد)

## بازگرداندن (۵ گام) — عین README
git clone git/repo.bundle melka && cd melka
mkdir -p db && cp <بسته>/db/custom.db db/
cp <بسته>/env/.env.example .env
bun install && bun run build
bash start.sh
EOF
cp download/pn011/PN-011-FINAL-REPORT.md "$PKG/docs/" 2>/dev/null || true

# ── screens/ ──
cp download/pn012/screens/*.png "$PKG/screens/" 2>/dev/null || true
cp download/pn011/screens/*.png "$PKG/docs/pn011-screens/" 2>/dev/null || mkdir -p "$PKG/docs/pn011-screens" && cp download/pn011/screens/*.png "$PKG/docs/pn011-screens/" 2>/dev/null || true

# ── README.md ──
cat > "$PKG/README.md" <<EOF
# بستهٔ بقای ملکا — PN-012 (chainIndex=${CHAIN_INDEX})

ساختار استاندارد ن۰۰۸ · تشخیص/رفع بحران ششم + فاز ۳ معماری · تاریخ: ۱۴۰۵/۰۷/۱۷
کد: \`${HEAD_FULL:0:7}\` · شاخه: main

## این بسته چیست؟
DNA کامل نسخه در یک لحظه: کد (git bundle — شامل بازیابی کامل PN-011)، داده (SQLite)،
هویت (Fingerprint)، زنجیرهٔ اعتماد (CHAIN) و محیط (فقط نام کلیدها — بدون هیچ رازی).

## بازگرداندن کامل در ۵ گام (≤ ۵ دقیقه)

\`\`\`bash
git clone git/repo.bundle melka && cd melka
mkdir -p db && cp <مسیر-این-بسته>/db/custom.db db/custom.db
cp <مسیر-این-بسته>/env/.env.example .env
#   نکتهٔ PN-012: راز بوت از سه مکان بازیابی می‌شود (db/.runtime → upload/.runtime
#   → env.escrow.enc رمزنگاری‌شده با کد مستر). حتی اگر همه غایب باشند، کلید تازه
#   تولید می‌شود — سرویس هرگز به‌خاطر راز گمشده 500 نمی‌ماند.
bun install && bun run build
bash start.sh
#   راستی‌آزمایی: curl localhost:3000/api/health → {"ok":true}
\`\`\`

## شواهد فاز (docs/pn012/)
تشخیص بحران + رفع قطعی + فاز ۳ بلوک‌ها + دو-سبز ۱۹۳۵/۰ + شواهد بصری.
EOF

# ── MANIFEST.json (گام آخر) ──
python3 - "$PKG" <<'PYEOF'
import hashlib, json, os, sys
pkg = sys.argv[1]
manifest = {"package": os.path.basename(pkg), "chainIndex": 13, "files": []}
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
