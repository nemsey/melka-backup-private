#!/usr/bin/env bash
# ============================================================================
# build-head-gate.sh — G3 دروازهٔ بیلد=HEAD (DIR-PN048-007 · موج صفر · D-0a)
# ============================================================================
# کار: تطبیق ردیابیِ بیلد (fingerprint.json) با HEAD گیت.
#   حالت پیش‌فرض/--strict : ناهمخوانی → پیام بلند + exit 1 (توقف)
#   حالت --watchdog       : فقط سنجه (exit 0 سبز / 1 قرمز) — نگهبان تصمیم می‌گیرد
#   GATE_ROOT (env)       : ریشهٔ جایگزین برای تست شبیه‌سازی (سند D-0a اقدام ۳)
#
# فلسفه: بعد از هر ریست، درخت ممکن است به کد کهنه برگردد. بدون این دروازه،
# بیلد کهنه بی‌صدا سرو می‌شد (رویداد ۲۰۲۶-۱۰-۲۱ ساعت ۱۰:۲۱ — سرور 6bb3c8e
# سرو می‌کرد). اکنون: بیلد ≠ HEAD = صدای بلند + توقف Worker.
# ============================================================================
set -euo pipefail

ROOT="${GATE_ROOT:-/home/z/my-project}"
MODE="${1:-strict}"
cd "$ROOT"

# HEAD_SHA باید SHA کامل ۴۰-کاراکتری هگز باشد — «HEAD» لفظی (مخزن بی‌کامیت) هرگز قبول نمی‌شود
HEAD_SHA=$(git rev-parse --verify HEAD 2>/dev/null || echo "")
if ! printf '%s' "$HEAD_SHA" | grep -qE '^[0-9a-f]{40}$'; then HEAD_SHA=""; fi
BUILD_SHA=$(jq -r '.gitSha // empty' "$ROOT/.next/fingerprint.json" 2>/dev/null || echo "")
STANDALONE_SHA=$(jq -r '.gitSha // empty' "$ROOT/.next/standalone/.next/fingerprint.json" 2>/dev/null || echo "")

if [ -n "$HEAD_SHA" ] && [ -n "$BUILD_SHA" ] && [ "$HEAD_SHA" = "$BUILD_SHA" ] && [ "$HEAD_SHA" = "$STANDALONE_SHA" ]; then
  echo "[G3] ✓ بیلد = HEAD ($(git rev-parse --short HEAD 2>/dev/null || echo '?')) — main و standalone هم‌راستا"
  exit 0
fi

echo "[G3] ✗ بیلد ≠ HEAD — stale-build توقف: HEAD=${HEAD_SHA:-?} · main-build=${BUILD_SHA:-?} · standalone=${STANDALONE_SHA:-?}"
exit 1
