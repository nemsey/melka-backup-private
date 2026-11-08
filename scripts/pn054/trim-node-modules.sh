#!/usr/bin/env bash
# ============================================================================
# trim-node-modules.sh — هرس وابستگی‌های بی‌استفادهٔ پلتفرمی (PN-054 · دستور ۴)
# ----------------------------------------------------------------------------
# چه چیزی حذف می‌شود و چرا:
#   • sharp + @img/* (~35MB) — بهینه‌ساز تصویر next/image. ممیزی PN-054:
#     هیچ import از next/image در src/ نیست (فقط آیکون‌های lucide با نام Image)
#     → مسیر /_next/image هرگز صدا نمی‌خورد → sharp فقط جای دیسک می‌گیرد.
#   • @next/swc-linux-x64-musl (~110MB) — کامپایلر SWC واریانت musl/Alpine؛
#     سرور glibc (debian) است → فقط واریانت gnu لازم است.
#   • lightningcss-linux-x64-musl (~10MB) — همین‌طور.
#
# ماندگاری: postinstall در package.json این فایل را بعد از هر نصب اجرا
# می‌کند (با || true تا نبودِ فایل در درخت‌های قدیمی بیلد را نشکند) و
# optionalDependencies خود next/lightningcss هم پچ می‌شود تا bun install
# آنها را برنگرداند.
#
# ایدمپوتنت و بی‌خطر: هرچه نباشد، رد می‌شود. سرور در حال اجرا هم بی‌اثر
# است (ماژول‌های بارگذاری‌شده در حافظه‌اند؛ فقط دیسک آزاد می‌شود).
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."   # ریشهٔ مخزن

removed=0
rm_quiet() {
  if [ -e "$1" ]; then
    rm -rf "$1"
    echo "[trim] حذف شد: $1"
    removed=$((removed+1))
  fi
}

# ─── ۱) بسته‌های پلتفرمی بی‌استفاده ───
rm_quiet node_modules/sharp
rm_quiet node_modules/@img
rm_quiet node_modules/@next/swc-linux-x64-musl
rm_quiet node_modules/@next/swc-darwin-arm64
rm_quiet node_modules/@next/swc-darwin-x64
rm_quiet node_modules/@next/swc-linux-arm64-gnu
rm_quiet node_modules/@next/swc-linux-arm64-musl
rm_quiet node_modules/@next/swc-win32-arm64-msvc
rm_quiet node_modules/@next/swc-win32-x64-msvc
rm_quiet node_modules/lightningcss-linux-x64-musl
rm_quiet node_modules/lightningcss-linux-arm64-gnu
rm_quiet node_modules/lightningcss-darwin-x64
rm_quiet node_modules/lightningcss-win32-x64-msvc

# ─── ۲) پچ optionalDependencies در مانیفست‌ها (تا نصب بعدی برنگردند) ───
patch_manifest() { # $1=مسیر package.json · $2..=کلیدهای حذفی
  local f="$1"; shift
  [ -f "$f" ] || return 0
  python3 - "$f" "$@" <<'PYEOF'
import json, sys
path, *drop = sys.argv[1:]
try:
    with open(path) as fh:
        d = json.load(fh)
except Exception:
    sys.exit(0)
opt = d.get("optionalDependencies") or {}
changed = False
for k in drop:
    if k in opt:
        del opt[k]
        changed = True
if changed:
    d["optionalDependencies"] = opt
    with open(path, "w") as fh:
        json.dump(d, fh, indent=2)
    print(f"[trim] پچ شد: {path} (optionalDependencies: {len(opt)} مورد باقی)")
PYEOF
}

patch_manifest node_modules/next/package.json \
  sharp @next/swc-darwin-arm64 @next/swc-darwin-x64 \
  @next/swc-linux-arm64-gnu @next/swc-linux-arm64-musl \
  @next/swc-linux-x64-musl @next/swc-win32-arm64-msvc @next/swc-win32-x64-msvc

patch_manifest node_modules/lightningcss/package.json \
  lightningcss-linux-x64-musl lightningcss-linux-arm64-gnu \
  lightningcss-darwin-x64 lightningcss-win32-x64-msvc

# ─── ۳) کپی استندالون هم اگر sharp داشته باشد (صرفه‌جویی بیشتر) ───
rm_quiet .next/standalone/node_modules/sharp
rm_quiet .next/standalone/node_modules/@img

# ─── گزارش ───
TOTAL=$(du -sm node_modules 2>/dev/null | cut -f1)
echo "[trim] مجموع حذف: $removed مسیر · حجم فعلی node_modules: ${TOTAL}MB"
if [ "${TOTAL:-9999}" -lt 900 ]; then
  echo "[trim] ✅ زیر سقف ۹۰۰MB (معیار پذیرش دستور ۴)"
else
  echo "[trim] ⚠️ هنوز بالای ۹۰۰MB"
fi
