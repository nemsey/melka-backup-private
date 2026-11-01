#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Guard: audit-info-files — PN-045 · فاز ۴ (شورا-ن۰۸۹)
# ─────────────────────────────────────────────────────────────────────────────
# ستون «اطلاعات» = پنجره‌ای به دادهٔ خام. مسیر آن باید امن بماند:
#   ۱. generator و API route و InfoButton وجود دارند
#   ۲. صفر راز در generator/route (password|token|secret — قانون ۱۸)
#   ۳. ضد پیمایش مسیر: اعتبارسنجی کد (regex [A-Za-z0-9_-]، سقف ۶۴)
#   ۴. tenant/type از whitelist — هرگز ورودی آزاد به مسیر فایل
#   ۵. deliver-store gitignored است (فایل‌های اطلاعات هرگز در گیت نمی‌روند)
#   ۶. API فقط با احراز نشست کار می‌کند (requireSessionAsync در روت)
#   ۷. ستون اطلاعات در هر دو فهرست (آگهی + درخواست) و wired به هر tenant
# خروجی: PASS یا FAIL با شرح. --strict پذیرفته می‌شود (سازگاری رابط گاردها).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

GEN="src/lib/info-files/generator.ts"
ROUTE="src/app/api/info/[tenant]/[type]/[code]/route.ts"
V1="src/app/api/v1/info/[tenant]/[type]/[code]/route.ts"
BTN="src/components/info/InfoButton.tsx"
LISTING="src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx"
REQUEST="src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx"

# ── ۱. وجود فایل‌ها ─────────────────────────────────────────────────────────
for f in "$GEN" "$ROUTE" "$V1" "$BTN"; do
  if [ ! -f "$f" ]; then
    echo "❌ FAIL: missing $f"
    fail=1
  fi
done
if [ $fail -eq 0 ]; then
  echo "✅ files: generator + route (main/v1) + InfoButton present"
fi

# ── ۲. صفر راز در generator/route ───────────────────────────────────────────
for f in "$GEN" "$ROUTE"; do
  if grep -qiE "password|token|secret" "$f" 2>/dev/null; then
    # استثنای صادقانه: کامنت‌هایی که می‌گویند «بدون token» مجازند — فقط رشته‌های واقعی خطرناک‌اند
    if grep -qiE "(password|secret|token)\s*[:=]\s*['\"][^'\"]{4,}" "$f" 2>/dev/null; then
      echo "❌ FAIL: possible secret literal in $f"
      fail=1
    fi
  fi
done
if [ $fail -eq 0 ]; then
  echo "✅ secrets: zero secret literals in generator/route (law 18)"
fi

# ── ۳. ضد پیمایش مسیر ──────────────────────────────────────────────────────
if ! grep -q 'is\/^[a-zA-Z0-9_-]+\$\|isValidInfoCode' "$GEN" 2>/dev/null && ! grep -q 'a-zA-Z0-9_-' "$GEN"; then
  echo "❌ FAIL: code regex validation missing in generator"
  fail=1
else
  echo "✅ path-safety: code regex [A-Za-z0-9_-] enforced"
fi
if ! grep -q "isValidInfoCode" "$ROUTE"; then
  echo "❌ FAIL: route does not call isValidInfoCode"
  fail=1
else
  echo "✅ path-safety: route validates code before generation"
fi

# ── ۴. whitelist در generator ───────────────────────────────────────────────
if ! grep -q "isInfoTenant" "$GEN" || ! grep -q "isInfoType" "$GEN"; then
  echo "❌ FAIL: tenant/type whitelist helpers missing in generator"
  fail=1
else
  echo "✅ whitelist: isInfoTenant + isInfoType present"
fi

# ── ۵. deliver-store در gitignore ───────────────────────────────────────────
if grep -q "^/deliver-store/" .gitignore; then
  echo "✅ gitignore: deliver-store excluded from git"
else
  echo "❌ FAIL: deliver-store not in .gitignore — info files could leak to git"
  fail=1
fi

# ── ۶. احراز در روت ─────────────────────────────────────────────────────────
if grep -q "requireSessionAsync" "$ROUTE" && grep -q "requireTileAccessFor" "$ROUTE"; then
  echo "✅ auth: session + tile-access guard in route"
else
  echo "❌ FAIL: route missing session/tile-access guard"
  fail=1
fi

# ── ۷. سیم‌کشی ستون در فهرست‌ها (PN-047: ستون اطلاعات غیرچسبنده — فقط یادداشت ثابت) ──
for f in "$LISTING" "$REQUEST"; do
  if ! grep -q "InfoButton" "$f"; then
    echo "❌ FAIL: InfoButton not wired in $f"
    fail=1
  fi
  # دستور مالک PN-047/گام دوم-۱: ستون اطلاعات از حالت ثابت خارج شود
  if grep -q "pn045-sticky-info" "$f"; then
    echo "❌ FAIL: info column still sticky in $f (PN-047 forbids sticky info)"
    fail=1
  fi
done
if [ $fail -eq 0 ]; then
  echo "✅ wiring: InfoButton in all lists · info column non-sticky (owner order PN-047)"
fi

# ── ۸. CSS: فقط یادداشت چسبنده (دستور مالک PN-047: «فقط ستون یادداشت ثابت بماند و لاغیر») ──
if grep -q "pn045-sticky-note" src/app/globals.css; then
  if grep -q "pn045-sticky-info" src/app/globals.css; then
    echo "❌ FAIL: sticky-info CSS still present in globals.css (PN-047 forbids)"
    fail=1
  else
    echo "✅ css: only sticky-note remains in globals.css (owner order PN-047)"
  fi
else
  echo "❌ FAIL: sticky-note CSS missing in globals.css"
  fail=1
fi

# ── جمع‌بندی ────────────────────────────────────────────────────────────────
if [ $fail -ne 0 ]; then
  echo "❌ audit-info-files: FAIL"
  exit 1
fi
echo "✅ audit-info-files: PASS — info column path is safe, authenticated, wired and gitignored"
