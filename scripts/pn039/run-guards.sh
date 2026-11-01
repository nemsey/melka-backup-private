#!/usr/bin/env bash
# PN-039 — اجرای گاردها با فایل خروجی اختصاصی (بدون تداخل با Worker پس‌زمینه)
# همان منطق pn038/run-guards.sh ولی OUT خصوصی pn039 + گاردهای تازهٔ ن۰۶۳
set -uo pipefail
cd /home/z/my-project
mkdir -p download/pn038
OUT=download/pn039/guards-raw.txt
: > "$OUT"

run_guard() {
  local script="$1"; shift
  local args="$*"
  local log="/tmp/pn039-guard.log"
  if timeout 75 bash "$script" $args > "$log" 2>&1; then
    echo "PASS|${script}|${args}" >> "$OUT"
  else
    local rc=$?
    if [ $rc -eq 124 ]; then echo "TIMEOUT|${script}|${args}" >> "$OUT"
    else echo "FAIL|${script}|${args}" >> "$OUT"; fi
  fi
}

for script in scripts/audit-*.sh; do
  case "$script" in
    *repository-boundary*|*intelligence-boundary*|*feature-visibility*) run_guard "$script" --strict ;;
    *) run_guard "$script" ;;
  esac
done

run_guard scripts/recovery/audit-head-guard.sh check

PASS_C=$(grep -c "^PASS|" "$OUT" || true)
FAIL_C=$(grep -c "^FAIL|" "$OUT" || true)
TIMEOUT_C=$(grep -c "^TIMEOUT|" "$OUT" || true)
TOTAL=$((PASS_C + FAIL_C + TIMEOUT_C))
echo "=== نتیجه: PASS=$PASS_C FAIL=$FAIL_C TIMEOUT=$TIMEOUT_C (مجموع $TOTAL) ==="
grep -E "FAIL\||TIMEOUT\|" "$OUT" || true
python3 - "$PASS_C" "$FAIL_C" "$TIMEOUT_C" "$TOTAL" <<'PYEOF'
import json, sys, datetime
json.dump(
    {
        "guardsPass": int(sys.argv[1]),
        "guardsFail": int(sys.argv[2]),
        "guardsTimeout": int(sys.argv[3]),
        "guardsTotal": int(sys.argv[4]),
        "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "phase": "PN-039 (هشت گام فهرستها · ن۰۶۴)",
    },
    open("download/pn039/guards-summary.json", "w", encoding="utf8"),
    ensure_ascii=False,
    indent=2,
)
PYEOF
