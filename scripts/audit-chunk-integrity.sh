#!/usr/bin/env bash
# ============================================================
# audit-chunk-integrity.sh — گارد یکپارچگی chunk بیلد (PN-015 · K1 + مرحلهٔ ۶)
# ------------------------------------------------------------
# مسئلهٔ تاریخی (عین‌نوشتهٔ PN-014): «خروجی بیلد هرگز از طریق head لوله
# نمی‌شود — SIGPIPE می‌تواند بیلد را نیمه‌کاره بکشد و سرور با نمای ناقص
# بالا بیاید — عیب‌یابی زنده: chunk 404 با فایل موجود روی دیسک».
#
# این گارد همان معاینهٔ روتینی است که آن شب فاجعه را زودتر می‌دید:
#   ۱) همهٔ ارجاعات /_next/static/... در مانیفست‌های JSON بیلد
#      (app-build-manifest · build-manifest · …server/*.json)
#   ۲) همهٔ ارجاعات در HTMLهای از پیش‌رندرشده (.next/server/app/**.html)
#   ۳) هر ارجاع = یک فایل که باید روی دیسک باشد — هر مفقود = chunk 404 قطعی
#   ۴) پیوستگی هویت: BUILD_ID در برابر fingerprint.json بیلد
#
# کاربرد:
#   bash scripts/audit-chunk-integrity.sh [--root DIR] [--witness PATH] [--quiet]
# خروج: ۰ = PASS · ۱ = FAIL (مناسب CI و پیش-بوت)
# شاهد: JSON با شمارش بررسی‌شده/مفقود + فهرست مفقودها (نهایتاً ۲۰ مورد)
# ============================================================
set -uo pipefail

ROOT="${MELKA_REPO_DIR:-/home/z/my-project}"
WITNESS=""
QUIET=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --witness) WITNESS="$2"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    *) echo "آرگومان ناشناخته: $1" >&2; exit 2 ;;
  esac
done

NEXT="$ROOT/.next/standalone/.next"
STATIC="$NEXT/static"

# ── ۱) موجودیت بیلد ──
if [ ! -f "$ROOT/.next/standalone/server.js" ]; then
  [ "$QUIET" -eq 1 ] || echo "✗ بیلد standalone موجود نیست (server.js غایب) — ابتدا bun run build"
  [ -n "$WITNESS" ] && python3 - "$WITNESS" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
json.dump({"at": datetime.datetime.utcnow().isoformat()+"Z", "verdict": "FAIL", "reason": "standalone-build-missing", "checked": 0, "missing": 0, "missingList": []}, open(sys.argv[1], "w"), ensure_ascii=False)
PYEOF
  exit 1
fi
if [ ! -d "$STATIC" ]; then
  [ "$QUIET" -eq 1 ] || echo "✗ پوشهٔ static بیلد موجود نیست — بیلد نیمه‌کاره"
  exit 1
fi

# ── ۲) گردآوری ارجاعات از مانیفست‌های JSON و HTMLهای پیش‌رندر ──
# دو گویش مسیر در بیلد Next:
#   HTML:      /_next/static/chunks/xxx.js  (مطلق — آنچه مرورگر می‌خواهد)
#   JSON مانیفست: "static/chunks/xxx.js"    (نسبی — build-manifest و رفقا)
REFS="$(
  {
    find "$NEXT/server/app" -name '*.html' -type f 2>/dev/null \
      | xargs -r grep -rhoE '/_next/static/[A-Za-z0-9._~/-]+' 2>/dev/null
    find "$NEXT" -maxdepth 3 -name '*.json' -type f 2>/dev/null \
      | xargs -r grep -hoE '"static/[A-Za-z0-9._~/-]+"' 2>/dev/null | tr -d '"' | sed 's#^#/_next/#'
  } | sort -u || true )"

TOTAL=0
MISSING=0
MISS_LIST=""
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  TOTAL=$((TOTAL+1))
  f="$NEXT/${ref#/_next/}"
  if [ ! -f "$f" ]; then
    MISSING=$((MISSING+1))
    # نهایتاً ۲۰ مورد در شاهد (خروجی کنسول کامل نیست — شاهد است)
    if [ "$(printf '%s\n' "$MISS_LIST" | grep -c .)" -lt 20 ]; then
      MISS_LIST="${MISS_LIST:+$MISS_LIST"$'\n'"}$ref"
    fi
  fi
done <<< "$REFS"

# ── ۳) پیوستگی هویت نسخه: BUILD_ID در برابر fingerprint ──
BUILD_ID_FILE="$NEXT/BUILD_ID"
FP="$NEXT/fingerprint.json"
ID_OK="n/a"
if [ -f "$BUILD_ID_FILE" ] && [ -f "$FP" ]; then
  BID="$(cat "$BUILD_ID_FILE" 2>/dev/null | tr -d '[:space:]')"
  FID="$(python3 -c "import json;print(json.load(open('$FP')).get('buildId',''))" 2>/dev/null || echo '')"
  if [ -n "$BID" ] && [ -n "$FID" ]; then
    if [ "$BID" = "$FID" ]; then ID_OK="match"; else ID_OK="mismatch"; MISSING=$((MISSING+1)); MISS_LIST="${MISS_LIST:+$MISS_LIST"$'\n'"}BUILD_ID≠fingerprint"; fi
  fi
fi

CHUNKS_ON_DISK=$(find "$STATIC/chunks" -type f 2>/dev/null | wc -l)
VERDICT="PASS"; [ "$MISSING" -gt 0 ] && VERDICT="FAIL"

# ── ۴) شاهد JSON ──
if [ -n "$WITNESS" ]; then
  mkdir -p "$(dirname "$WITNESS")"
  python3 - "$WITNESS" "$TOTAL" "$MISSING" "$MISS_LIST" "$VERDICT" "$CHUNKS_ON_DISK" "$ID_OK" "$ROOT" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
witness, total, missing, miss_list, verdict, chunks, id_ok, root = sys.argv[1:9]
json.dump({
  "at": datetime.datetime.utcnow().isoformat() + "Z",
  "guard": "audit-chunk-integrity (PN-015/K1)",
  "root": root,
  "checked": int(total),
  "missing": int(missing),
  "missingList": [l for l in (miss_list or "").splitlines() if l],
  "chunksOnDisk": int(chunks),
  "buildIdCoherence": id_ok,
  "verdict": verdict,
}, open(witness, "w"), ensure_ascii=False, indent=2)
PYEOF
fi

if [ "$QUIET" -eq 0 ]; then
  if [ "$VERDICT" = "PASS" ]; then
    echo "✓ یکپارچگی chunk: $TOTAL ارجاع بررسی شد · ۰ مفقود · $CHUNKS_ON_DISK چانک روی دیسک · هویت: $ID_OK"
  else
    echo "✗ یکپارچگی chunk: $TOTAL ارجاع · $MISSING مفقود (خطر chunk 404):"
    printf '%s\n' "$MISS_LIST" | head -20
  fi
fi
[ "$VERDICT" = "PASS" ]
