#!/usr/bin/env bash
# PN-030 — اجرای گاردهای ممیزی (دروازه: ≥۲۹ سبز — همان قرارداد PN-029)
set -uo pipefail
cd /home/z/my-project
OUT=download/pn030/guards-raw.txt
: > "$OUT"

run_guard() {
  local script="$1"; shift
  local args="$*"
  if timeout 75 bash "scripts/$script" $args > /tmp/pn030-guard.log 2>&1; then
    echo "PASS|$script" >> "$OUT"
  else
    local rc=$?
    if [ $rc -eq 124 ]; then echo "TIMEOUT|$script" >> "$OUT"
    else echo "FAIL|$script" >> "$OUT"; fi
  fi
}

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

run_guard audit-repository-boundary.sh --strict
run_guard audit-intelligence-boundary.sh --strict
run_guard audit-feature-visibility.sh --strict

PASS_C=$(grep -c "^PASS|" "$OUT" || true)
FAIL_C=$(grep -c "^FAIL|" "$OUT" || true)
TIMEOUT_C=$(grep -c "^TIMEOUT|" "$OUT" || true)
echo "=== نتیجه: PASS=$PASS_C FAIL=$FAIL_C TIMEOUT=$TIMEOUT_C ==="
echo "{\"guardsPass\": $PASS_C, \"guardsFail\": $FAIL_C, \"guardsTimeout\": $TIMEOUT_C}" > download/pn030/guards-summary.json
