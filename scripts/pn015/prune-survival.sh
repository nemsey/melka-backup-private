#!/usr/bin/env bash
# ============================================================
# prune-survival.sh — هرس بسته‌های بقا (PN-015 · K5)
# ------------------------------------------------------------
# مصوبهٔ شورا (ملکا-شورا-ن۰۱۹): نگه‌داری ۵ بستهٔ آخر + بایگانی بقیه.
# قید حیاتی سفارش: «صفر دست دادن داده» — بایگانی روی همان فایل‌سیستم
# ابری ossfs با mv اتمیک (rename) انجام می‌شود: هیچ کپی، هیچ دانلود،
# هیچ حذف. مسیر قراردادی deliver-store/archive با symlink به بایگانی
# ابری برقرار می‌شود (ریست‌پذیر — بایگانی هرگز وارد دیسک ظرف نمی‌شود).
# ============================================================
set -euo pipefail
SURV="/home/z/my-project/upload/.survival"
ARCHIVE="/home/z/my-project/upload/.survival-archive"
KEEP=5

BEFORE_COUNT=$(ls -d "$SURV"/PN-* "$SURV"/P6550* 2>/dev/null | wc -l)
BEFORE_MB=$(du -sm "$SURV" 2>/dev/null | cut -f1)

# ۱) پنج بستهٔ آخر (مرتب بر زمان نام — الگوی نام‌گذاری تاریخ‌دار است)
mapfile -t ALL < <(ls -d "$SURV"/PN-* "$SURV"/P6550* 2>/dev/null | sort -V)
TOTAL=${#ALL[@]}
echo "بسته‌های فعلی: $TOTAL ($BEFORE_MB MB)"

if [ "$TOTAL" -le "$KEEP" ]; then
  echo "هیچ هرسی لازم نیست — $TOTAL ≤ $KEEP"
  exit 0
fi

mkdir -p "$ARCHIVE"
MOVED=0
for ((i=0; i<TOTAL-KEEP; i++)); do
  name=$(basename "${ALL[$i]}")
  mv "$SURV/$name" "$ARCHIVE/$name"
  echo "  بایگانی شد: $name"
  MOVED=$((MOVED+1))
done

AFTER_COUNT=$(ls -d "$SURV"/PN-* "$SURV"/P6550* 2>/dev/null | wc -l)
AFTER_MB=$(du -sm "$SURV" 2>/dev/null | cut -f1)
ARCHIVE_COUNT=$(ls -d "$ARCHIVE"/*/ 2>/dev/null | wc -l)
echo "پس از هرس: $AFTER_COUNT بسته فعال ($AFTER_MB MB) · $ARCHIVE_COUNT بستهٔ بایگانی‌شده"

# ۲) مسیر قراردادی deliver-store/archive (symlink به بایگانی ابری)
mkdir -p /home/z/my-project/deliver-store
ln -sfn ../upload/.survival-archive /home/z/my-project/deliver-store/archive

# ۳) وارسی زنجیرهٔ هش کل (فعال + بایگانی) — صفر شکسته نباید باشد
CHAIN_OK=0; CHAIN_BROKEN=0
verify_link() { # $1=مسیر بستهٔ جدیدتر $2=sha بستهٔ قدیمی‌تر
  local expected actual
  expected=$(python3 -c "import json;print(json.load(open('$1/MANIFEST.json')).get('anchorPreviousManifest',''))" 2>/dev/null || echo '')
  actual=$(md5sum "$2/MANIFEST.json" 2>/dev/null | awk '{print $1}')
  if [ -n "$expected" ] && [ "$expected" = "$actual" ]; then CHAIN_OK=$((CHAIN_OK+1)); else CHAIN_BROKEN=$((CHAIN_BROKEN+1)); echo "  ⚠ زنجیرهٔ شکسته: $1 → $2"; fi
}
# جست‌وجوی بستهٔ قبلی: اول فعال، بعد بایگانی
find_prev() { # $1=chainIndex-1
  for d in "$SURV"/*/ "$ARCHIVE"/*/; do
    idx=$(python3 -c "import json;print(json.load(open('$d/CHAIN.json')).get('chainIndex',0))" 2>/dev/null || echo 0)
    [ "$idx" = "$1" ] && { echo "${d%/}"; return 0; }
  done
  echo ""
}
for d in "$SURV"/*/; do
  idx=$(python3 -c "import json;print(json.load(open('${d}CHAIN.json')).get('chainIndex',0))" 2>/dev/null || echo 0)
  [ "$idx" -le 1 ] && continue
  prev=$(find_prev $((idx-1)))
  [ -n "$prev" ] && verify_link "${d%/}" "$prev"
done

cat > /home/z/my-project/download/pn015/pruning.json <<EOF
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workOrder": "PN-015 · K5 — هرس بسته‌های بقا",
  "before": { "packages": $BEFORE_COUNT, "sizeMB": $BEFORE_MB },
  "after": { "packages": $AFTER_COUNT, "sizeMB": $AFTER_MB },
  "archived": { "packages": $ARCHIVE_COUNT, "location": "upload/.survival-archive (ossfs ابری — ریست‌پذیر)" },
  "policy": "نگه‌داری $KEEP بستهٔ آخر (مصوبهٔ شورا ۰۱۹) · انتقال با mv اتمیک روی همان فایل‌سیستم — صفر دست‌زدن به داده",
  "pathContract": "deliver-store/archive → symlink → upload/.survival-archive",
  "chain": { "verifiedLinks": $CHAIN_OK, "brokenLinks": $CHAIN_BROKEN, "verdict": "$([ $CHAIN_BROKEN -eq 0 ] && echo SALLEM || echo BROKEN)" },
  "kept": $(ls -d "$SURV"/*/ | xargs -n1 basename | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")
}
EOF
echo ""
echo "زنجیره: $CHAIN_OK پیوند سبز · $CHAIN_BROKEN شکسته"
cat /home/z/my-project/download/pn015/pruning.json
