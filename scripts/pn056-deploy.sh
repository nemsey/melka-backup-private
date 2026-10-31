#!/usr/bin/env bash
# PN-056 — استقرار استقرار خلوص ستون مالک (نکتهٔ ۲) (الگوی رسمی resurrect بدون لایهٔ DB)
set -euo pipefail
cd /home/z/my-project

echo "🚀 [$(date -u +%FT%TZ)] شروع استقرار PN-056 (HEAD=$(git rev-parse --short HEAD))…"

# ۱) توقف تمیز (درس OOM: بیلد هم‌زمان با سرور = مرگ)
touch .prod-stop 2>/dev/null || true
pkill -f "standalone/server.js"     2>/dev/null || true
pkill -f "prod-watchdog.sh"         2>/dev/null || true
pkill -f "scripts/runtime/worker.ts" 2>/dev/null || true
sleep 2

# ۲) بیلد (بدون تغییر وابستگی/اسکیما — نصب و prisma لازم نیست)
bun run build

# ۳) G3 — بیلد = HEAD
HEAD_SHA=$(git rev-parse --verify HEAD)
BUILD_SHA=$(jq -r '.gitSha // empty' .next/fingerprint.json 2>/dev/null || echo "")
STANDALONE_BUILD_SHA=$(jq -r '.gitSha // empty' .next/standalone/.next/fingerprint.json 2>/dev/null || echo "")
if [ "$HEAD_SHA" != "$BUILD_SHA" ] || [ "$HEAD_SHA" != "$STANDALONE_BUILD_SHA" ]; then
  echo "❌ G3 GATE: بیلد ≠ HEAD (HEAD=$HEAD_SHA · main=$BUILD_SHA · standalone=$STANDALONE_BUILD_SHA)"
  exit 1
fi
echo "  ✓ G3: بیلد = HEAD ($(git rev-parse --short HEAD))"

# ۴) G1
SYNC_GUARD="src/lib/integrations/melketun/protected-nulls.ts"
if ! grep -q "G1_STRIP_PROTECTED_NULLS = true" "$SYNC_GUARD"; then
  echo "❌ G1 GATE: محافظ stripProtectedNulls غایب"
  exit 1
fi
echo "  ✓ G1: محافظ stripProtectedNulls حاضر"

# ۵) راه‌اندازی
bash scripts/start-prod.sh

# ۶) تأیید نسخه
EXPECT=$(git rev-parse --short HEAD)
VERSION=""
for i in $(seq 1 24); do
  if curl -fsS -m 5 http://localhost:3000/api/version >/tmp/pn054-version.json 2>/dev/null; then
    VERSION=$(jq -r '.gitSha // empty' /tmp/pn054-version.json 2>/dev/null || true)
    [ -n "$VERSION" ] && break
  fi
  sleep 5
done
if [ "${VERSION:0:${#EXPECT}}" != "$EXPECT" ]; then
  echo "❌ DEPLOY FAILED — سرور $VERSION سرو می‌کند ولی HEAD=$EXPECT"
  exit 1
fi
echo "✅ DEPLOY COMPLETE — Version: $VERSION — $(date -u +%FT%TZ)"
