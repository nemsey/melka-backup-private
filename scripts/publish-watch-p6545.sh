#!/bin/bash
# P6545/BLOCK 0.4 — پایش ۸ساعتهٔ دامنهٔ publish (تصمیم شورا: معلّق + صفر تغییر کد)
# هر ۵ دقیقه یک پروب؛ خروجی: /tmp/publish-watch-p6545.log
LOG=/tmp/publish-watch-p6545.log
echo "[watch-p6545] start $(date -u +%Y-%m-%dT%H:%M:%SZ) — تصمیم جلسه ۰۳۳: پایش ۸ساعته، صفر تغییر کد" >> "$LOG"
for i in $(seq 1 96); do
  CODE=$(curl -s -o /tmp/pw-p6545.json -w "%{http_code}" --max-time 15 "https://r1a5k87hzbg0-d.space-z.ai/api/version" 2>/dev/null || echo 000)
  if [[ "$CODE" == "200" ]]; then
    BID=$(python3 -c "import json; print(json.load(open('/tmp/pw-p6545.json')).get('buildId','?'))" 2>/dev/null)
    echo "[watch-p6545] GREEN at $(date -u +%Y-%m-%dT%H:%M:%SZ) http=200 buildId=$BID — رفع مصنوع استقرار توسط پلتفرم" >> "$LOG"
    exit 0
  fi
  echo "probe[$i] $(date -u +%Y-%m-%dT%H:%M:%SZ) http=$CODE" >> "$LOG"
  sleep 300
done
echo "[watch-p6545] timeout 8h — طبق تصمیم شورا: escalate به مالک برای اقدام با پشتیبانی پلتفرم" >> "$LOG"
