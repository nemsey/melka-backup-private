#!/usr/bin/env bash
# PN-029 · مرحلهٔ ۱ — قفل ورود + بکاپ VACUUM (قانون دادهٔ مقدس ۰۳۱)
set -euo pipefail
REPO=/home/z/my-project
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$REPO/download/pn029/lock-in.json"
BACKUP="$REPO/backups/pre-pn029-$TS.db"

HEAD=$(git -C "$REPO" rev-parse HEAD)
BUILD_ID=$(cat "$REPO/.next/BUILD_ID" 2>/dev/null || echo "none")
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/api/health || echo "000")

# بکاپ VACUUM (قانون ۰۳۱ — پیش از هر تغییر)
sqlite3 "$REPO/db/custom.db" "VACUUM INTO '$BACKUP'" 2>/dev/null || \
  python3 -c "
import sqlite3, sys
db = sqlite3.connect('$REPO/db/custom.db')
db.execute(\"VACUUM INTO '$BACKUP'\")
db.close()
print('backup ok')
"
MD5=$(md5sum "$BACKUP" | awk '{print $1}')
INTEG=$(python3 -c "
import sqlite3
db = sqlite3.connect('$BACKUP')
print(db.execute('PRAGMA integrity_check').fetchone()[0])
")

cat > "$OUT" <<EOF
{
  "phase": "PN-029 · قفل ورود (بخش ۰ سند شورا-ن۰۳۳)",
  "lockedAt": "$(date -u +%FT%TZ)",
  "version": {
    "gitHead": "$HEAD",
    "buildId": "$BUILD_ID",
    "mirrorSync": "$(git -C "$REPO" remote get-url origin 2>/dev/null || echo 'n/a')",
    "note": "HEAD شامل کامیت خودکار پلتفرم ef799b7 پس از مهر d5b37d4 است — زنجیرهٔ PN-028 سالم"
  },
  "preconditions": {
    "healthHttp": "$HEALTH",
    "dbIntegrity": "$INTEG",
    "escrowThreeSeat": "env.platform.json + upload/.runtime/boot-secrets.json + env.escrow.enc — بررسی وجود: $(ls "$REPO/upload/.runtime/boot-secrets.json" >/dev/null 2>&1 && echo yes || echo no)",
    "diskFreePercent": "$(df --output=pcent "$REPO" | tail -1 | tr -dc '0-9' | python3 -c 'import sys; print(100-int(sys.stdin.read()))')",
    "backup": { "file": "backups/pre-pn029-$TS.db", "md5": "$MD5", "integrity": "$INTEG" }
  },
  "ownerStatement": "سفارش PN-029 — بازیابی اتصال به سامانه‌های ملک تبریز. اول تشخیص، بعد اقدام. صفر تلاش خودکار.",
  "riskPreAnalysis": [
    { "risk": "IP بلاک درازمدت", "prob": "بالا", "impact": "critical", "mitigation": "توقف فوری تلاش‌ها (مرحلهٔ ۲)" },
    { "risk": "منقضی‌شدن دائمی توکن‌ها", "prob": "متوسط", "impact": "high", "mitigation": "OTP تکی پس از پاک‌شدن rate limit (مرحلهٔ ۸)" },
    { "risk": "تداخل با دیمن‌ها", "prob": "بالا", "impact": "critical", "mitigation": "پرچم MELK_ARM_OFFLINE + kill Worker (مرحلهٔ ۲)" },
    { "risk": "اشتباه در تشخیص", "prob": "متوسط", "impact": "high", "mitigation": "شش آزمون مستقل (مرحلهٔ ۳)" },
    { "risk": "فشار به تیم ملک تبریز", "prob": "متوسط", "impact": "high", "mitigation": "صبر ۲۴-۴۸ ساعت + متن تماس آماده (مرحلهٔ ۵)" }
  ]
}
EOF
echo "=== lock-in.json ==="
cat "$OUT"
