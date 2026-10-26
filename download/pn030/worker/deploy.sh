#!/usr/bin/env bash
# melka-proxy/deploy.sh — کل اقدام مالک برای دیپلوی PN-030 (لایهٔ ۱)
# ═══════════════════════════════════════════════════════════════════════
# زمان لازم مالک: ۱۵ ثانیه (تأیید OAuth کلودفلر در مرورگر)
# پیش‌نیاز: Node.js 18+ (npx) و یک حساب رایگان Cloudflare
#
# این اسکریپت چهار کار می‌کند:
#   ۱) wrangler را فرا می‌خواند (در صورت نبود، نصب می‌کند)
#   ۲) راز MELKA_PROXY_SECRET را از env.platform.json می‌خواند و نصب می‌کند
#   ۳) Worker را دیپلوی می‌کند (در اولین اجرا مرورگر OAuth باز می‌کند)
#   ۴) نشانی Worker را چاپ می‌کند + آن را در env.platform.json (MELK_ARM_PROXY_URL) می‌نویسد
#      و تست زندهٔ TCP/TLS (بدون OTP) انجام می‌دهد — انتظار: ۲۰۰ یا ۴۰۱/403 از ARM
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

REPO="$(cd ../.. && pwd)"
ENV_FILE="$REPO/env.platform.json"

echo "═══ melka-proxy · دیپلوی PN-030 (شورا-ن۰۳۵ · لایهٔ ۱) ═══"

# ۱) wrangler
if ! command -v npx >/dev/null 2>&1; then
  echo "خطا: npx پیدا نشد — Node.js 18+ لازم است." >&2
  exit 1
fi

# ۲) راز از env.platform.json (بدون echo روی صفحه — راز هرگز چاپ نمی‌شود)
SECRET=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
s = (d.get("MELK_PROXY_SECRET") or "").strip()
if len(s) != 64:
    sys.exit("خطا: MELK_PROXY_SECRET در env.platform.json باید ۶۴ کاراکتر هگز باشد — ابتدا کانتینر ملکا را با HEAD تازه اجرا کنید.")
print(s)
' "$ENV_FILE")

# اگر راز از قبل نصب شده باشد، wrangler فقط می‌پرسد «overwrite?» — پاسخ y با ورودی stdin
echo "— نصب راز MELKA_PROXY_SECRET (از env.platform.json)…"
printf '%s' "$SECRET" | npx wrangler secret put MELKA_PROXY_SECRET

# ۳) دیپلوی — اولین اجرا: OAuth مرورگر (۱۵ ثانیه از مالک)
echo "— دیپلوی Worker… (اگر مرورگر OAuth باز شد، دکمهٔ Allow را بزنید)"
npx wrangler deploy

# ۴) نشانی تازه + ثبت در env.platform.json + تست زندهٔ بدون OTP
WORKER_URL=$(npx wrangler deployments list 2>/dev/null | grep -o 'https://melka-proxy[^ ]*\.workers\.dev' | head -1 || true)
if [ -z "${WORKER_URL:-}" ]; then
  WORKER_URL="https://melka-proxy.$(npx wrangler whoami 2>/dev/null | grep -oE '[a-z0-9_-]+\.workers\.dev' | head -1 | cut -d. -f1 || echo '').workers.dev"
fi
echo "═══ نشانی Worker: $WORKER_URL ═══"

python3 - "$ENV_FILE" "$WORKER_URL" <<'PYEOF'
import json, sys
p, url = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d["MELK_ARM_PROXY_URL"] = url
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print(f"MELK_ARM_PROXY_URL در env.platform.json ثبت شد → {url}")
PYEOF

echo "— تست زندهٔ بدون OTP (انتظار: کد 2xx/401/403/404 — یعنی مسیر باز است)…"
curl -s -o /dev/null -w "ARM از طریق پروکسی: HTTP %{http_code} در %{time_total}s\n" \
  --max-time 15 "$WORKER_URL" || echo "تست دستی بعداً تکرار شود"

echo ""
echo "═══ پایان اقدام مالک (جمع < ۱۵ ثانیه + OAuth) ═══"
echo "گام بعدی با GLM: ری‌استارت ملکا → برداشتن پرچم MELK_ARM_OFFLINE → تست e2e با OTP"
