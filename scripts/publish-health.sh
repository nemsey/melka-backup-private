#!/usr/bin/env bash
# ============================================================
# publish-health.sh — پایش سلامت دامنهٔ publish ملکا
# ملکا-شورا-ن۰۰۷-۱۴۰۵ · BLOCK 5.2-ب
# ------------------------------------------------------------
# هر ۳۰ دقیقه وضعیت دامنهٔ publish را چک می‌کند؛ به محض تبدیل
# ۵۰۰ ← ۲۰۰ فایل اطلاع‌رسانی مالک ساخته می‌شود و پایش پایان می‌یابد.
# استفاده:
#   bash scripts/publish-health.sh status   (بررسی فوری — یک پروب)
#   bash scripts/publish-health.sh watch    (پایش پیوسته — هر ۱۸۰۰s)
# خروجی‌ها:
#   download/pn007/publish-status.json       (وضعیت آخرین پروب — همیشه به‌روز)
#   download/pn007/PUBLISH-RESTORED.md       (فقط هنگام بهبود — اطلاع مالک)
# ============================================================
set -uo pipefail
cd /home/z/my-project

PUBLISH_URL="${PUBLISH_URL:-https://c1vdh8442240-d.space-z.ai/}"
PREVIEW_URL="${PREVIEW_URL:-https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/}"
STATUS_JSON="download/pn007/publish-status.json"
RESTORED_MD="download/pn007/PUBLISH-RESTORED.md"
LOG="download/pn007/publish-health.log"
INTERVAL=1800   # ۳۰ دقیقه — مصوبهٔ شورا
mkdir -p download/pn007

probe() {
  local url="$1"
  curl -s -o /dev/null -w "%{http_code}" -m 15 "$url" 2>/dev/null || echo 000
}

write_status() {
  local pub="$1" prev="$2" note="$3"
  python3 - "$pub" "$prev" "$note" "$STATUS_JSON" <<'PYEOF'
import json, sys, datetime
pub, prev, note, path = sys.argv[1:5]
status = {
    "case": "PN-007-BLOCK5-PUBLISH-HEALTH",
    "probedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "publish": {"url": "https://c1vdh8442240-d.space-z.ai/", "http": int(pub) if pub.isdigit() else 0},
    "preview": {"url": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/", "http": int(prev) if prev.isdigit() else 0},
    "verdict": "PUBLISH_OK" if pub == "200" else ("PUBLISH_BROKEN_PREVIEW_ALIVE" if prev == "200" else "BOTH_DOWN"),
    "note": note,
    "ownerAction": "از پنل Z.AI دوباره Publish کنید — راهنما: docs/PUBLISH-TROUBLESHOOTING.md",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(status, f, ensure_ascii=False, indent=2)
print(f"{status['verdict']} (publish={pub}, preview={prev})")
PYEOF
}

# ── حالت status: یک پروب فوری ──
if [[ "${1:-}" == "status" ]]; then
  PUB=$(probe "$PUBLISH_URL"); PREV=$(probe "$PREVIEW_URL")
  echo "[publish-health] $(date -u +%FT%TZ) — پروب فوری"
  write_status "$PUB" "$PREV" "بررسی فوری (status)"
  [[ "$PUB" == "200" ]] && exit 0 || exit 1
fi

# ── حالت watch: پایش پیوسته هر ۳۰ دقیقه ──
echo "[publish-health] شروع پایش — $(date -u +%FT%TZ) — هر ${INTERVAL}s" >> "$LOG"
LAST="500"
for i in $(seq 1 336); do   # ۳۳۶ پروب × ۳۰ دقیقه = ۷ روز
  PUB=$(probe "$PUBLISH_URL"); PREV=$(probe "$PREVIEW_URL")
  echo "[probe $i] $(date -u +%FT%TZ) publish=$PUB preview=$PREV" >> "$LOG"
  write_status "$PUB" "$PREV" "پایش پیوسته — پروب $i"

  if [[ "$PUB" == "200" ]]; then
    # ═══ بهبود! اطلاع‌رسانی مالک ═══
    cat > "$RESTORED_MD" <<EOF
# ✅ دامنهٔ Publish ملکا بازگشت!

**زمان تشخیص:** $(date -u +%FT%TZ) (پروب $i از پایش خودکار)
**لینک:** $PUBLISH_URL

دامنهٔ انتشار عمومی که خطای ۵۰۰ می‌داد، اکنون **۲۰۰ (سالم)** است.
پیشنهاد بعدی: از GLM بخواهید نسخهٔ سرو‌شده را با مُهر پایین صفحه و GET /api/version
راستی‌آزمایی کند تا مطمئن شوید جدیدترین بیلد در حال سرو است.

*این فایل به‌صورت خودکار توسط scripts/publish-health.sh ساخته شد.*
EOF
    echo "[publish-health] ✅ RESTORED در $(date -u +%FT%TZ) — اطلاع‌رسانی مالک نوشته شد: $RESTORED_MD" >> "$LOG"
    exit 0
  fi
  sleep "$INTERVAL"
done
echo "[publish-health] پایش ۷روزه تمام شد — publish همچنان خراب؛ escalation: تیکت پشتیبانی (docs/PUBLISH-TROUBLESHOOTING.md گام ۴)" >> "$LOG"
exit 1
