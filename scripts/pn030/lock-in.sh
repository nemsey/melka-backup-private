#!/usr/bin/env bash
# PN-030 · گام اول + مرحلهٔ ۰ — راستی‌آزمایی نسخهٔ زندهٔ پس از PN-029 + قفل ورود (بکاپ VACUUM)
# سند: ملکا-شورا-ن۰۳۵-۱۴۰۵ (جلسهٔ فوق‌العاده ۰۳۵) · تأیید صریح مالک (گام چهارم)
set -euo pipefail
REPO=/home/z/my-project
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$REPO/download/pn030"
mkdir -p "$OUT" "$REPO/backups"

HEAD=$(git -C "$REPO" rev-parse HEAD)
HEAD_SHORT=$(git -C "$REPO" rev-parse --short HEAD)
BUILD_ID=$(cat "$REPO/.next/BUILD_ID" 2>/dev/null || echo "none")
LIVE_JSON=$(curl -s -m 10 http://localhost:3000/api/version || echo '{}')
LIVE_BUILD=$(echo "$LIVE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildId","n/a"))' 2>/dev/null || echo "n/a")
LIVE_SHA=$(echo "$LIVE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("gitSha","n/a"))' 2>/dev/null || echo "n/a")
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/api/health || echo "000")

# ── بکاپ VACUUM (قانون دادهٔ مقدس ۰۳۱ — پیش از هر تغییر) ──
BACKUP="$REPO/backups/pre-pn030-$TS.db"
python3 - <<PYEOF
import sqlite3
db = sqlite3.connect("$REPO/db/custom.db")
db.execute("VACUUM INTO '$BACKUP'")
db.close()
print("backup ok")
PYEOF
MD5=$(md5sum "$BACKUP" | awk '{print $1}')
INTEG=$(python3 -c "
import sqlite3
db = sqlite3.connect('$BACKUP')
print(db.execute('PRAGMA integrity_check').fetchone()[0])
")
DISK_FREE=$(df --output=pcent "$REPO" | tail -1 | tr -dc '0-9' | python3 -c 'import sys; print(100-int(sys.stdin.read()))')

# ── گام اول: آیا نسخهٔ زنده همان HEAD پس از PN-029 است؟ ──
STEP1_VERDICT="MISMATCH"
if [ "$LIVE_SHA" = "$HEAD_SHORT" ]; then STEP1_VERDICT="OK"; fi

cat > "$OUT/version-check.json" <<EOF
{
  "phase": "گام اول دستور مالک — اطمینان از نسخهٔ زندهٔ پس از PN-029",
  "checkedAt": "$(date -u +%FT%TZ)",
  "expected": {
    "gitHead": "$HEAD",
    "pn029GateCommit": "ec353a4 (دروازهٔ PN-029 — دو-سبز ۲۵۶۴/۰ ×۲ · ۳۶ گارد · chainIndex=28)",
    "note": "پس از مهر ec353a4 فقط کامیت خودکار پلتفرم (server.log) مجاز بود"
  },
  "live": {
    "apiVersion": { "buildId": "$LIVE_BUILD", "gitSha": "$LIVE_SHA" },
    "buildIdFile": "$BUILD_ID",
    "healthHttp": "$HEALTH"
  },
  "verdict": "$STEP1_VERDICT",
  "verdictFa": "$([ "$STEP1_VERDICT" = "OK" ] && echo 'نسخهٔ زنده همان HEAD پس از PN-029 است — اپ به‌روز است' || echo 'ناهمخوانی نسخهٔ زنده و HEAD — نیازمند بیلد تازه')"
}
EOF

cat > "$OUT/lock-in.json" <<EOF
{
  "phase": "PN-030 · قفل ورود (بخش ۰ سفارش کار — شورای عالی ملکا جلسهٔ فوق‌العاده ۰۳۵)",
  "lockedAt": "$(date -u +%FT%TZ)",
  "document": {
    "council": "صورت‌جلسهٔ شورای عالی ملکا — جلسهٔ فوق‌العاده ۰۳۵",
    "number": "ملکا-شورا-ن۰۳۵-۱۴۰۵",
    "date": "۱۴۰۵/۰۷/۲۱",
    "workOrder": "PN-030 — رفع کامل قطع اتصال بدون اقدام مالک (لایهٔ ۱: پروکسی رایگان ابری Cloudflare Workers)"
  },
  "ownerApproval": {
    "approved": true,
    "statement": "مالک دستور شورا به شمارهٔ PN-030 را تأیید می‌کند — فوراً اجرا شود (گام چهارم دستور ۱۴۰۵/۰۷/۲۱)",
    "quote": "«من، سیدنعمت‌اله سیدی، سفارش PN-030 را صادر می‌کنم: راه‌اندازی پروکسی رایگان ابری برای رفع کامل قطع اتصال، بدون هیچ اقدام اضافی از ناحیهٔ من.» (۰.۴ سند)",
    "laws": ["قانون تثبیت ۱۴۰۵-۰۳۱ (۱۱بُعدی)", "قانون بقا (بستهٔ زنجیره‌ای)"]
  },
  "preconditions": {
    "healthHttp": "$HEALTH",
    "dbIntegrity": "$INTEG",
    "diskFreePercent": "$DISK_FREE",
    "backup": { "file": "backups/pre-pn030-$TS.db", "md5": "$MD5", "integrity": "$INTEG" }
  },
  "dataLock": {
    "schemaChanges": "صفر تغییر در schema — فقط افزودنی (قانون ۰۳۱)",
    "principle": "بکاپ پیش از تغییر + صفر تخریب داده"
  },
  "version": { "gitHead": "$HEAD", "buildId": "$BUILD_ID", "step1Verdict": "$STEP1_VERDICT" },
  "riskPreAnalysis": [
    { "risk": "Cloudflare (AS13335) هم بلاک باشد (۳۰٪)", "impact": "high", "mitigation": "پلن B آماده: پروکسی معکوس از دستگاه مالک (تونل محلی — ۱۵ دقیقه)" },
    { "risk": "نقض حریم داده در پروکسی", "impact": "critical", "mitigation": "HMAC auth + صفر لاگ محتوا + فقط میزبانهای whitelist (۳ دامنهٔ API)" },
    { "risk": "افشای توکن در گذرگاه پروکسی", "impact": "critical", "mitigation": "فقط HTTPS + پاک‌سازی هدرهای X-Melka-* در Worker + عدم ثبت هدرها" },
    { "risk": "شکست OTP مالک", "impact": "medium", "mitigation": "صفر تلاش خودکار + قفل ۶ ساعتهٔ PN-029 پابرجا + سوزاندن آگاهانه از otp-burn" },
    { "risk": "نقض قانون صفر هزینه", "impact": "high", "mitigation": "Cloudflare Workers پلن رایگان: ۱۰۰٬۰۰۰ درخواست/روز — صفر ریال" },
    { "risk": "دیپلوی نیازمند حساب مالک", "impact": "medium", "mitigation": "تنها اقدام مالک: تأیید OAuth کلودفلر (۱۵ ثانیه) — اسکریپت آماده" }
  ]
}
EOF

echo "═══ گام اول: $STEP1_VERDICT (زنده=$LIVE_BUILD / HEAD=$HEAD_SHORT) ═══"
echo "══️ بکاپ: pre-pn030-$TS.db (md5=$MD5 · integrity=$INTEG) ═══"
echo "═══ شاهدها: version-check.json + lock-in.json ═══"
