#!/usr/bin/env bash
# PN-015 بخش ۰.۲ ردیف ۵ — وارسی دستی یکپارچگی chunk پیش از ساخت K1
# مقایسه: ارجاعات /_next/static در مانیفست‌های بیلد جاری در برابر فایل‌های روی دیسک
set -euo pipefail
cd /home/z/my-project
NEXT_DIR=".next/standalone/.next"
OUT="download/pn015"
mkdir -p "$OUT"

total=0; missing=0
declare -a MISS_LIST
while IFS= read -r ref; do
  total=$((total+1))
  f="${NEXT_DIR}/static/${ref#/_next/static/}"
  if [ ! -f "$f" ]; then missing=$((missing+1)); MISS_LIST+=("$ref"); fi
done < <(grep -rhoE '/_next/static/[^"\\ ]+' "$NEXT_DIR"/*.json 2>/dev/null | sort -u || true)

# چانک‌های ارجاع‌شده در HTML از پیش‌رندر (در صورت وجود)
if [ -d "$NEXT_DIR/server/app" ]; then
  while IFS= read -r ref; do
    total=$((total+1))
    f="${NEXT_DIR}/static/${ref#/_next/static/}"
    if [ ! -f "$f" ]; then missing=$((missing+1)); MISS_LIST+=("$ref"); fi
  done < <(grep -rhoE '/_next/static/[^"\\ ]+\.js' "$NEXT_DIR/server/app" --include='*.html' 2>/dev/null | sort -u || true)
fi

VERDICT="PASS"; [ "$missing" -gt 0 ] && VERDICT="FAIL"
cat > "$OUT/chunk-precheck.json" <<EOF
{
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "purpose": "بخش ۰.۲ ردیف ۵ — وارسی دستی یکپارچگی chunk بیلد جاری (پیش از ساخت گارد K1)",
  "build": { "dir": "$NEXT_DIR", "buildId": "$(grep -o '"buildId":"[^"]*"' .next/standalone/.next/fingerprint.json 2>/dev/null | head -1 | cut -d'"' -f4 || echo 'n/a')" },
  "checked": $total,
  "missing": $missing,
  "missingList": $(printf '%s\n' "${MISS_LIST[@]:-}" | grep -c . | xargs -I{} echo '[]' 2>/dev/null || echo '[]'),
  "verdict": "$VERDICT"
}
EOF
echo "checked=$total missing=$missing verdict=$VERDICT"
[ "$missing" -eq 0 ]
