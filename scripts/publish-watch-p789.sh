#!/bin/bash
# پایش انتشار فاز ۷/۸/۹ — هر ۲ دقیقه تا سبزشدن دامنهٔ publish
# خروجی: /tmp/publish-watch-p789.log (شاهد زنده برای الحاقیهٔ worklog)
LOG=/tmp/publish-watch-p789.log
echo "[watch] start $(date -u +%H:%M:%S) — expect sha 6d58f0c (or platform commit)" >> "$LOG"
for i in $(seq 1 240); do
  R=$(curl -s --max-time 15 "https://r1a5k87hzbg0-d.space-z.ai/api/version" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('buildId','fail'))" 2>/dev/null || echo fail)
  if [[ "$R" != 82cec69* && "$R" != "fail" && -n "$R" ]]; then
    echo "[watch] NEW BUILD LIVE at $(date -u +%H:%M:%S): $R" >> "$LOG"
    curl -s --max-time 15 "https://r1a5k87hzbg0-d.space-z.ai/api/version" >> "$LOG" 2>&1
    echo "" >> "$LOG"
    cd /home/z/my-project && bash scripts/verify-deploy-freshness.sh https://r1a5k87hzbg0-d.space-z.ai >> "$LOG" 2>&1
    echo "[watch] done" >> "$LOG"
    exit 0
  fi
  sleep 120
done
echo "[watch] timeout after 8h" >> "$LOG"
