#!/usr/bin/env bash
# ============================================================================
# build-with-parking.sh — PN-070-د/هـ : بیلد رسمی با پارکِ فهرست‌های سنگین (v2)
# ============================================================================
# ریشه‌ها (تجربهٔ ۲۰۲۶-۱۱-۰۷ صبح):
#   ۱) ENOSPC ×۴: تراسر standalone فهرست‌های ارجاع‌شده (backups · db ·
#      upload/.data قلعه/چرخشی · upload/.survival …) را داخل .next/standalone
#      کپی و سپس build-script rm می‌کند — کپی گذرا = هم‌اندازهٔ داده.
#      درمان: پارک (mv اتمیک به .build-parking — بدون ارجاع ⇒ تراسر کپی نمی‌کند).
#   ۲) باگ v1: mv -f روی مقصدِ موجود = کپیِ آرام + تودرتو (حذف ناقص node_modules
#      و پرشدن دیسک) — v2: پیش از mv همیشه rm -rf مقصدِ پارک + بازگشت با
#      پاک‌سازی مقصد (نویسنده‌ها حین بیلد متوقف‌اند ⇒ امن).
#   ۳) OOM-kill کرنل وسط فاز generate (کپ ۳GB روی جعبهٔ ۴GB) = کشتن ناگهانی
#      = خرابی‌های زنجیره‌ای (DB صبح + node_modules دو بار) — v2: کپ حافظهٔ
#      ۲۰۴۸MB تا V8 خودش جمع کند، نه کرنل.
#   ۴) «bun install: no changes» بازنصبِ node_modulesِ نصفه‌حذف‌شده را تضمین
#      نمی‌کند — v2: خوددرمانی — اگر next غایب بود، نصب تازه.
# ============================================================================
set -uo pipefail
cd /home/z/my-project

export PATH="$PWD/node_modules/.bin:$PATH"
PARK=".build-parking"

# ─── خوددرمانی وابستگی‌ها: اگر next غایب است (حذف ناقص قبلی)، نصب تازه ───
if [ ! -x node_modules/.bin/next ]; then
  echo "[parking] node_modules ناقص است (next غایب) — bun install تازه…"
  rm -rf node_modules
  bun install
fi

mkdir -p "$PARK"

restore_park() {
  [ -f "$PARK/manifest" ] || return 0
  while IFS=$'\t' read -r key orig; do
    [ -n "$key" ] || continue
    if [ -e "$PARK/$key" ]; then
      mkdir -p "$(dirname "$orig")"
      rm -rf "$orig"            # نویسنده‌ها متوقف‌اند — نسخهٔ جامانده/کپیِ تکراری نیست
      mv -f "$PARK/$key" "$orig"
    fi
  done < "$PARK/manifest"
  rm -f "$PARK/manifest"
}

park_one() { # $1 = مسیر (فایل یا پوشه) — همیشه mv=rename، هرگز کپی
  [ -e "$1" ] || return 0
  local key
  key="$(printf '%s' "$1" | sed 's|/|__|g')"
  rm -rf "$PARK/$key"          # باگ v1: مقصد موجود = کپیِ آرام — پاک و rename
  if mv -f "$1" "$PARK/$key" 2>/dev/null; then
    printf '%s\t%s\n' "$key" "$1" >> "$PARK/manifest"
  fi
}

restore_park   # پارکِ جاماندهٔ بیلدِ کشته‌شدهٔ قبل

# ─── فهرست پارک‌شونده‌ها (سنگین + ارجاع‌شده از تراسر + بی‌نیاز حین بیلد) ───
# هرگز پارک نمی‌شوند: db/custom.db (زنده) · download/ (سرو /deliver)
PARK_PATHS=(
  "upload/.data/rolling"
  "upload/.data/custom.db"
  "upload/.data/custom.db-wal"
  "upload/.data/custom.db-shm"
  "upload/.survival"
  "upload/.mirror"
  "upload/dataset-backups"
  "backups"
  "download"
  "upload/.data/corruption-incident-pn070"
  "upload/.data/corruption-incident-pn069"
)
for p in "${PARK_PATHS[@]}"; do park_one "$p"; done
for f in db/custom.db.broken-* ; do [ -f "$f" ] && park_one "$f"; done
echo "[parking] $( [ -f "$PARK/manifest" ] && wc -l < "$PARK/manifest" || echo 0 ) مورد پارک شد"

trap 'rc=$?; restore_park; exit $rc' EXIT

# ═══ عین توالی بیلد قبلی (کپ حافظه: ۳۰۰۰ → ۲۰۴۸ = پایان OOM-kill کرنل) ═══
mkdir -p upload/.runtime
if [ -f upload/.runtime/BUILD_RUNNING ]; then
  BT=$(cat upload/.runtime/BUILD_RUNNING 2>/dev/null || echo 0)
  AGE=$(($(date +%s) - BT))
  if [ "$AGE" -lt 1200 ]; then
    echo "[build-lock] build in progress (age=${AGE}s) - waiting"
    W=0
    while [ -f upload/.runtime/BUILD_RUNNING ] && [ "$W" -lt 1200 ]; do sleep 10; W=$((W+10)); done
  else
    echo "[build-lock] stale lock (age=${AGE}s) - broken"
  fi
fi
date +%s > upload/.runtime/BUILD_RUNNING
{
  NODE_OPTIONS=--max-old-space-size=2048 RAYON_NUM_THREADS=1 next build --experimental-build-mode compile &&
  NODE_OPTIONS=--max-old-space-size=2048 RAYON_NUM_THREADS=1 next build --experimental-build-mode generate &&
  cp -r .next/static .next/standalone/.next/ &&
  cp -r public .next/standalone/ &&
  (cp env.platform.json .next/standalone/ 2>/dev/null || true) &&
  rm -rf .next/standalone/backups .next/standalone/db .next/standalone/prisma/db \
        .next/standalone/download .next/standalone/skills .next/standalone/scripts \
        .next/standalone/tool-results .next/standalone/docs .next/standalone/examples \
        .next/standalone/tests .next/standalone/bun.lock .next/standalone/dev.log \
        .next/standalone/server.log .next/standalone/worklog.md \
        .next/standalone/upload/dataset-backups .next/standalone/upload/*.tar.gz \
        .next/standalone/upload/*.md .next/standalone/upload/.data \
        .next/standalone/upload/.survival .next/standalone/upload/.mirror \
        .next/standalone/intelligence-data .next/standalone/deliver-store
}
__rc=$?
rm -f upload/.runtime/BUILD_RUNNING
exit $__rc
