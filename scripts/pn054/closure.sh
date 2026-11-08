#!/usr/bin/env bash
# ============================================================================
# closure.sh (v2) — تحلیل‌گر بستار ارجاعی (PN-054 · دستور ۲)
# ----------------------------------------------------------------------------
# درس نسخهٔ ۱: src/ هم اسکریپت صدا می‌زند (jobs.ts → mirror-cycle.sh و
# log-rotate.sh)! ریشه‌ها شامل «کل src و tests» است، نه فقط instrumentation.
#
# خروجی:
#   upload/.runtime/pn054-closure.txt     — فایل‌های زندهٔ scripts/
#   upload/.runtime/pn054-unreferenced.txt — بقیه
# ============================================================================
set -uo pipefail
cd /home/z/my-project

OUT_DIR="upload/.runtime"
mkdir -p "$OUT_DIR"
CLOSURE="$OUT_DIR/pn054-closure.txt"
UNREF="$OUT_DIR/pn054-unreferenced.txt"

SEEDS=(
  start.sh
  package.json
  Caddyfile
  src/instrumentation.ts
  scripts/prod-watchdog.sh
  scripts/start-prod-daemon.py
  scripts/start-prod.sh
  resurrect-ultimate.sh
  scripts/pn005-rebuild-graphs.ts
  scripts/runtime/worker.ts
  scripts/CLI-REGISTRY.md
  .github/workflows/db-backup.yml
  .github/workflows/forbid-rollback.yml
  .github/workflows/github-shield-alert.yml
)
# کل کد اپ و تست‌ها هم ریشه‌اند (src ممکن است هر اسکریپتی را صدا بزند)
while IFS= read -r f; do SEEDS+=("$f"); done < <(find src tests -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" \) 2>/dev/null)

declare -A LIVE=()
QUEUE=()
for s in "${SEEDS[@]}"; do
  [ -f "$s" ] && QUEUE+=("$s")
done

extract_refs() {
  grep -oE 'scripts/[A-Za-z0-9._/-]+\.(sh|ts|py|js|cjs|mjs)' "$1" 2>/dev/null | sort -u
  local dir base f
  dir="$(dirname "$1")"
  if [[ "$dir" == scripts/* ]]; then
    for f in "$dir"/*; do
      [ -f "$f" ] || continue
      base="$(basename "$f")"
      case "$base" in *.sh|*.ts|*.py|*.js|*.cjs|*.mjs) ;; *) continue ;; esac
      if grep -qE "(^|[^A-Za-z0-9._/-])${base}([^A-Za-z0-9._-]|$)" "$1" 2>/dev/null; then
        echo "$f"
      fi
    done
  fi
}

while [ ${#QUEUE[@]} -gt 0 ]; do
  f="${QUEUE[0]}"
  QUEUE=("${QUEUE[@]:1}")
  [ -n "${LIVE[$f]:-}" ] && continue
  [ -f "$f" ] || continue
  LIVE[$f]=1
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    if [ -f "$ref" ] && [ -z "${LIVE[$ref]:-}" ]; then
      QUEUE+=("$ref")
    fi
  done < <(extract_refs "$f")
done

for k in "${!LIVE[@]}"; do echo "$k"; done | grep "^scripts/" | sort > "$CLOSURE"
find scripts -type f \( -name "*.sh" -o -name "*.ts" -o -name "*.py" -o -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) | sort > /tmp/pn054-all.txt
comm -23 /tmp/pn054-all.txt "$CLOSURE" > "$UNREF"

SC=$(wc -l < "$CLOSURE"); UC=$(wc -l < "$UNREF"); AC=$(wc -l < /tmp/pn054-all.txt)
echo "─── زنده (ارجاع از src/tests/بوت/CI/رجیستری): $SC فایل"
echo "─── بدون ارجاع: $UC از مجموع $AC فایل کد در scripts/"
echo "⚠️  پیش از حذف هر مورد، CLI-REGISTRY.md را ببین — ابزار دستی ثبت‌شده هرگز حذف نمی‌شود."
