#!/usr/bin/env bash
# ============================================================
# prune-survival-complete.sh — تکمیل K5 پس از mv موفق (اتمیک-ادامه)
# وارسی زنجیرهٔ هش کل (فعال + بایگانی) + نوشتن شاهد pruning.json
# ============================================================
set -euo pipefail
SURV="/home/z/my-project/upload/.survival"
ARCHIVE="/home/z/my-project/upload/.survival-archive"
OUT="/home/z/my-project/download/pn015/pruning.json"

CHAIN_OK=0; CHAIN_BROKEN=0
BROKEN_DETAIL=""
verify_link() {
  local expected actual
  expected=$(python3 -c "import json;print(json.load(open('$1/MANIFEST.json')).get('anchorPreviousManifest',''))" 2>/dev/null || echo '')
  actual=$(md5sum "$2/MANIFEST.json" 2>/dev/null | awk '{print $1}')
  if [ -n "$expected" ] && [ "$expected" = "$actual" ]; then
    CHAIN_OK=$((CHAIN_OK+1))
  else
    CHAIN_BROKEN=$((CHAIN_BROKEN+1))
    BROKEN_DETAIL="${BROKEN_DETAIL}${1} → ${2}; "
  fi
}
find_prev() {
  for d in "$SURV"/*/ "$ARCHIVE"/*/; do
    [ -d "$d" ] || continue
    idx=$(python3 -c "import json;print(json.load(open('$d/CHAIN.json')).get('chainIndex',0))" 2>/dev/null || echo 0)
    if [ "$idx" = "$1" ]; then echo "${d%/}"; return 0; fi
  done
  echo ""
}

for d in "$SURV"/*/ "$ARCHIVE"/*/; do
  [ -d "$d" ] || continue
  idx=$(python3 -c "import json;print(json.load(open('${d}CHAIN.json')).get('chainIndex',0))" 2>/dev/null || echo 0)
  [ "$idx" -le 1 ] && continue
  prev=$(find_prev $((idx-1)))
  if [ -n "$prev" ]; then verify_link "${d%/}" "$prev"; else
    CHAIN_BROKEN=$((CHAIN_BROKEN+1)); BROKEN_DETAIL="${BROKEN_DETAIL}${d}: قبلی (index $((idx-1))) یافت نشد; "
  fi
done

AFTER_MB=$(du -sm "$SURV" | cut -f1)
ARCHIVE_MB=$(du -sm "$ARCHIVE" | cut -f1)
ARCHIVE_COUNT=$(ls -d "$ARCHIVE"/*/ | wc -l)
AFTER_COUNT=$(ls -d "$SURV"/*/ | wc -l)
KEPT=$(ls -d "$SURV"/*/ | xargs -n1 basename | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")
ARCHIVED=$(ls -d "$ARCHIVE"/*/ | xargs -n1 basename | python3 -c "import json,sys; print(json.dumps([l.strip() for l in sys.stdin]))")

python3 - "$OUT" "$AFTER_COUNT" "$AFTER_MB" "$ARCHIVE_COUNT" "$ARCHIVE_MB" "$CHAIN_OK" "$CHAIN_BROKEN" "$KEPT" "$ARCHIVED" "$BROKEN_DETAIL" <<'PYEOF'
import json, sys, datetime
out, after_n, after_mb, arch_n, arch_mb, ok, broken, kept, archived, broken_detail = sys.argv[1:11]
json.dump({
  "at": datetime.datetime.utcnow().isoformat() + "Z",
  "workOrder": "PN-015 · K5 — هرس بسته‌های بقا (مصوبهٔ نگه‌داری ۵ بستهٔ آخر)",
  "before": { "packages": 15, "sizeMB": 3629 },
  "after": { "packages": int(after_n), "sizeMB": int(after_mb) },
  "archived": { "packages": int(arch_n), "sizeMB": int(arch_mb), "location": "upload/.survival-archive (ossfs ابری — ریست‌پذیر، خارج از دیسک ظرف)" },
  "method": "mv اتمیک روی همان فایل‌سیستم ossfs — صفر کپی، صفر حذف، صفر دست‌زدن به داده",
  "pathContract": "deliver-store/archive → symlink → upload/.survival-archive (مسیر قراردادی سفارش برقرار)",
  "chain": { "verifiedLinks": int(ok), "brokenLinks": int(broken), "brokenDetail": broken_detail or "هیچ", "verdict": "INTACT" if int(broken) == 0 else "BROKEN" },
  "kept": json.loads(kept),
  "archivedList": json.loads(archived),
}, open(out, "w"), ensure_ascii=False, indent=2)
print(f"زنجیره: {ok} پیوند سبز · {broken} شکسته")
PYEOF
cat "$OUT"
