#!/usr/bin/env bash
# P6551 BLOCK 3 — کپی سه‌گانه به کانال دانلود پلتفرم + اسکن مستقل صفر-راز
set -euo pipefail
cd /home/z/my-project
DEST="download/p6551"
mkdir -p "$DEST"

# ═══ ۱) کپی چهار فایل ═══
cp upload/skeleton/MELKA-SKELETON-COMPLETE-v1.0.md "$DEST/"
cp upload/skeleton/melka-source-v1.0-20261004.tar.gz "$DEST/"
cp upload/skeleton/REBUILD-LETTER.md "$DEST/"
cp upload/skeleton/MANIFEST.md "$DEST/"
echo "── فایل‌های کپی‌شده ──"
ls -la "$DEST" | grep -v "^d" | grep -v "^total"

# ═══ ۲) اسکن مستقل صفر-راز (دفاع در عمق — علاوه بر اسکن سه‌مرحله‌ای P6550) ═══
echo ""
echo "── اسکن صفر-راز ──"
FAIL=0
scan() {
  local f="$1" label="$2"
  # الگوها: توکن گیت‌هاب · کدهای مدیر زنده/مرده · مقدار MELK_TOKEN_KEY · رشتهٔ اعتبارنامهٔ ریموت
  local HITS
  HITS=$(python3 - "$f" <<'PYEOF'
import json, re, sys
path = sys.argv[1]
env = json.load(open('env.platform.json'))
token_key = str(env.get('MELK_TOKEN_KEY', ''))
patterns = {
  'github-token': rb'(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})',
  'remote-cred': rb"https://[^\s\"']+:[^\s\"']+@github\.com",
  'live-master-code': rb'80211186',
  'dead-master-code': rb'41372895',
}
hits = []
data = open(path, 'rb').read()
for name, pat in patterns.items():
    if re.search(pat, data):
        hits.append(name)
if token_key and len(token_key) >= 8:
    if token_key.encode() in data:
        hits.append('melk-token-key')
print(','.join(hits) if hits else 'CLEAN')
PYEOF
)
  if [ "$HITS" = "CLEAN" ]; then
    echo "  CLEAN  $label"
  else
    echo "  HIT($HITS)  $label"
    FAIL=1
  fi
}
scan "$DEST/MELKA-SKELETON-COMPLETE-v1.0.md" "سند اسکلت"
scan "$DEST/REBUILD-LETTER.md" "نامهٔ بازسازی"
scan "$DEST/MANIFEST.md" "مانیفست"
# بستهٔ سورس: tar.gz فشرده است — از قبل پالایش سازگار P6550؛ اسکن بایت‌خام برای الگوهای متنی
scan "$DEST/melka-source-v1.0-20261004.tar.gz" "بستهٔ سورس (بایت‌خام)"

# ═══ ۳) راستی‌آزمایی md5 کپی‌ها ═══
echo ""
echo "── md5 کپی‌ها (باید عین کانونیک باشد) ──"
cd "$DEST" && md5sum MELKA-SKELETON-COMPLETE-v1.0.md melka-source-v1.0-20261004.tar.gz REBUILD-LETTER.md MANIFEST.md
cd /home/z/my-project
echo ""
[ "$FAIL" = "0" ] && echo "SCAN-RESULT: ALL-CLEAN" || { echo "SCAN-RESULT: LEAK-DETECTED"; exit 1; }
