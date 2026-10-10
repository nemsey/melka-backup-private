#!/usr/bin/env bash
# PN-006 BLOCK 2 — اجرای Build با سنجهٔ کامل (پیک‌سنج درختی + زمان)
# نکتهٔ صادقانه: /usr/bin/time در کانتینر موجود نیست (exit 127) →
#   جایگزین: پیک‌سنج درختی (مجموع RSS کل درخت فرایند — دقیق‌تر از time -v
#   برای بیلد چندفرایندی) + زمان‌سنج SECONDS برای wall clock.
# استفاده: measure-build.sh <label> [extra-env]
set -uo pipefail
cd /home/z/my-project
LABEL="${1:?label}"
ENV_EXTRA="${2:-}"
mkdir -p scripts/pn006/results

echo "[measure-build] شروع Build — $LABEL  $(date -u +%T)  ${ENV_EXTRA:+env: $ENV_EXTRA}"

SECONDS=0
if [[ -n "$ENV_EXTRA" ]]; then
  export $ENV_EXTRA
  bun run build > "scripts/pn006/results/build-${LABEL}.buildlog" 2>&1 &
else
  bun run build > "scripts/pn006/results/build-${LABEL}.buildlog" 2>&1 &
fi
BUILD_PID=$!
python3 scripts/pn006/tree-peak.py "$BUILD_PID" "scripts/pn006/results/build-${LABEL}.tree.json" --label "$LABEL" &
PEAK_PID=$!

wait $BUILD_PID
BUILD_CODE=$?
WALL=$SECONDS
kill $PEAK_PID 2>/dev/null || true
wait $PEAK_PID 2>/dev/null || true
sleep 1.5   # اجازهٔ نوشتن خروجی نهایی پیک‌سنج

# سرور production در حین بیلد؟ (برای تفکیک مصرف)
PROD_RSS=$(ps aux | grep 'standalone/server.js' | grep -v grep | awk '{s+=$6} END {print int(s/1024)}')
OK_LINE=$(grep -E "Compiled successfully|✓ Compiled|Compiled\(" "scripts/pn006/results/build-${LABEL}.buildlog" | head -1)

python3 - "$LABEL" "$BUILD_CODE" "$WALL" "${PROD_RSS:-0}" <<'PYEOF'
import json, sys, os
label, code, wall, prod_rss = sys.argv[1:5]
tree_path = f"scripts/pn006/results/build-{label}.tree.json"
tree = {}
try:
    tree = json.load(open(tree_path))
except Exception:
    pass
logtail = ""
try:
    logtail = " | ".join(open(f"scripts/pn006/results/build-{label}.buildlog").read().strip().split("\n")[-3:])
except Exception:
    pass
out = {
    "label": label,
    "exitCode": int(code),
    "wallSec": int(wall),
    "treePeakMB": tree.get("peakMB"),
    "treePeakProcesses": tree.get("peakProcesses"),
    "treePeakTop": tree.get("peakTop"),
    "prodServerRSSDuringBuildMB": int(prod_rss) if prod_rss else 0,
    "buildLogTail": logtail[:400],
    "method": "tree-sampler (sum RSS of full process tree, 1s interval) — /usr/bin/time unavailable in container",
    "finishedAt": tree.get("finishedAt"),
}
json.dump(out, open(f"scripts/pn006/results/build-{label}.json", "w"), ensure_ascii=False, indent=2)
print(json.dumps(out, ensure_ascii=False))
PYEOF
