#!/usr/bin/env bash
# ============================================================================
# PN-027 — اجرای همهٔ گاردهای ممیزی (بخش ۰ پیش‌شرط ۵ + بخش ۳.۲ دروازه)
# خروجی: download/pn027/guards.json + stdout خلاصه
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn027/guards-raw.txt
: > "$OUT"

STRICT_SCRIPTS="audit-repository-boundary.sh audit-intelligence-boundary.sh audit-feature-visibility.sh"

run_guard() {
  local script="$1"; shift
  local args="$*"
  local name="${script%.sh}"
  local log="/tmp/pn027-guard-${name}.log"
  if timeout 90 bash "scripts/$script" $args > "$log" 2>&1; then
    echo "PASS|$script" >> "$OUT"
    echo "  ✓ $script"
  else
    local rc=$?
    if [ $rc -eq 124 ]; then
      echo "TIMEOUT|$script" >> "$OUT"
      echo "  ⏱ $script (timeout 90s)"
    else
      echo "FAIL|$script" >> "$OUT"
      echo "  ✗ $script (rc=$rc)"
    fi
  fi
}

echo "=== PN-027 — اجرای گاردها $(date -u +%FT%TZ) ==="

for script in audit-activity-log.sh audit-boot-secrets.sh audit-causal-validity.sh \
  audit-champion-challenger.sh audit-chunk-integrity.sh audit-counterfactual-purity.sh \
  audit-decision-lock.sh audit-decision-safety.sh audit-disk-space.sh \
  audit-drift-detection.sh audit-feature-factory.sh audit-graph-integrity.sh \
  audit-int-overflow.sh audit-job-state.sh audit-learning-loop.sh \
  audit-log-safety.sh audit-memory-lifecycle.sh audit-meta-mind.sh \
  audit-mirror-sync.sh audit-negin-consistency.sh audit-opportunity-alerts.sh \
  audit-permission-boundary.sh audit-phase0-revision.sh audit-policy-evaluation.sh \
  audit-repair-gate.sh audit-reproducibility.sh audit-roles.sh \
  audit-self-diagnosis.sh audit-smart-update.sh audit-stealth-users.sh \
  audit-tile-contract.sh audit-unified-graph.sh audit-user-roles.sh; do
  run_guard "$script"
done

# گاردهای سخت‌گیر (طبق ci.sh)
run_guard audit-repository-boundary.sh --strict
run_guard audit-intelligence-boundary.sh --strict
run_guard audit-feature-visibility.sh --strict

# شمارش
PASS_C=$(grep -c "^PASS|" "$OUT" || true)
FAIL_C=$(grep -c "^FAIL|" "$OUT" || true)
TIMEOUT_C=$(grep -c "^TIMEOUT|" "$OUT" || true)
echo ""
echo "=== نتیجه: PASS=$PASS_C FAIL=$FAIL_C TIMEOUT=$TIMEOUT_C ==="
