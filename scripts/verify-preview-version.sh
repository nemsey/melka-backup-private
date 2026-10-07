#!/usr/bin/env bash
# ============================================================
# verify-preview-version.sh — راستی‌آزمایی تازگی نسخهٔ دامنهٔ preview (PN-015 · K2)
# ------------------------------------------------------------
# «Preview Stale» یکی از سه مشکل بحرانی این سفارش است: دامنهٔ preview
# ممکن است سالم 200 بدهد اما نسخهٔ کهنه سرو کند — چیزی که فقط با مقایسهٔ
# هویت نسخه دیده می‌شود، نه با کد وضعیت.
#
# منطق: /api/version دامنه ← gitShortSha/buildId  ⇔  HEAD محلی
#   MATCH  = همان کامیت (تازه)
#   STALE  = دامنه کامیت قدیمی‌تر سرو می‌کند → هشدار
#   DOWN   = پاسخ‌ناپذیر/غیر-JSON
# کاربرد: bash scripts/verify-preview-version.sh [--url U] [--witness P] [--quiet]
# خروج: ۰ = MATCH · ۱ = STALE/DOWN (مناسب CI و کار Worker)
# ============================================================
set -uo pipefail

ROOT="${MELKA_REPO_DIR:-/home/z/my-project}"
URL="${MELKA_PREVIEW_URL:-https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai}"
WITNESS=""
QUIET=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --url) URL="${2%/}"; shift 2 ;;
    --witness) WITNESS="$2"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    *) echo "آرگومان ناشناخته: $1" >&2; exit 2 ;;
  esac
done

LOCAL_HEAD="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'نامشخص')"
LOCAL_BUILDID="$(python3 -c "import json;print(json.load(open('$ROOT/.next/standalone/.next/fingerprint.json')).get('buildId',''))" 2>/dev/null || echo '')"

HTTP="$(curl -s -o /tmp/pn015-preview-version.json -w '%{http_code}' --max-time 20 "$URL/api/version" 2>/dev/null || echo 000)"

VERDICT="DOWN"
REMOTE_SHA=""; REMOTE_BUILDID=""; REMOTE_BUILTAT=""; LATENCY=""
if [ "$HTTP" = "200" ] && python3 -c "import json;json.load(open('/tmp/pn015-preview-version.json'))" 2>/dev/null; then
  read -r REMOTE_SHA REMOTE_BUILDID REMOTE_BUILTAT <<< "$(python3 -c "
import json
d = json.load(open('/tmp/pn015-preview-version.json'))
fp = d.get('fingerprint', {})
print(fp.get('gitShortSha', d.get('gitSha', '')), d.get('buildId', ''), d.get('builtAt', ''))" 2>/dev/null || echo "'' '' ''")"
  LATENCY="$(curl -s -o /dev/null -w '%{time_total}' --max-time 20 "$URL/api/health" 2>/dev/null || echo '')"
  if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" = "$LOCAL_HEAD" ]; then
    VERDICT="MATCH"
  elif [ -n "$REMOTE_SHA" ]; then
    VERDICT="STALE"
  fi
fi

if [ -n "$WITNESS" ]; then
  mkdir -p "$(dirname "$WITNESS")"
  python3 - "$WITNESS" "$URL" "$LOCAL_HEAD" "$LOCAL_BUILDID" "$REMOTE_SHA" "$REMOTE_BUILDID" "$REMOTE_BUILTAT" "$HTTP" "$VERDICT" "$LATENCY" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
w, url, lh, lb, rs, rb, rba, http, verdict, lat = sys.argv[1:11]
json.dump({
  "at": datetime.datetime.utcnow().isoformat() + "Z",
  "guard": "verify-preview-version (PN-015/K2)",
  "previewUrl": url,
  "localHead": lh,
  "localBuildId": lb,
  "remoteGitSha": rs, "remoteBuildId": rb, "remoteBuiltAt": rba,
  "http": http, "healthLatencyS": lat,
  "verdict": verdict,
}, open(w, "w"), ensure_ascii=False, indent=2)
PYEOF
fi

if [ "$QUIET" -eq 0 ]; then
  case "$VERDICT" in
    MATCH) echo "✓ preview تازه است: دامنه = HEAD محلی ($LOCAL_HEAD) · buildId=$REMOTE_BUILDID · تأخیر health=${LATENCY}s" ;;
    STALE) echo "✗ preview کهنه است: دامنه $REMOTE_SHA سرو می‌کند اما HEAD محلی $LOCAL_HEAD است — بازانتشار لازم" ;;
    *)    echo "✗ preview پاسخ‌گو نیست (HTTP=$HTTP) — بررسی دامنه" ;;
  esac
fi
[ "$VERDICT" = "MATCH" ]
