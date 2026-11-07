#!/usr/bin/env bash
# ============================================================================
# build-with-parking.sh — PN-070-د: بیلد رسمی با پارکِ فهرست‌های سنگین
# ============================================================================
# ریشه (ENOSPC چهاربارهٔ ۲۰۲۶-۱۱-۰۷): تراسر standalone هر فهرستِ ارجاع‌شده از
# کد TS را داخل .next/standalone کپی می‌کند و سپس build-script آن را rm می‌کند
# (سازوکار واقعی لاغرسازی = rm پس از کپی). outputFileTracingExcludes در این
# مود بیلد عملاً اعمال نمی‌شود. کپی گذرا = هم‌اندازهٔ فهرست‌های سنگین:
# backups + db + upload/.data (قلعه/چرخشی) + upload/.survival + قرنطینه‌ها
# ⇒ روی جعبهٔ ۱۰GB هر رشد داده = مرگ بیلد در ENOSPC.
#
# درمان: «پارک» — پیش از بیلد، فهرست‌های غیرلازمِ بیلد با mv (اتمیک) به
# .build-parking می‌روند (هیچ کدی به این نام ارجاع ندارد ⇒ تراسر کپی نمی‌کند)
# و پس از بیلد (حتی در شکست — trap) به جای خود برمی‌گردند.
# خوددرمانی: اگر بیلدی وسط راه کشته شد (ریست سندباکس)، نخستین بیلد بعدی
# پارکِ جامانده را از manifest بازمی‌گرداند.
# ============================================================================
set -uo pipefail
cd /home/z/my-project

PARK=".build-parking"
mkdir -p "$PARK"

# ─── بازگرداندن پارکِ جامانده (بیلد قبلی وسط راه مرده) ───
restore_park() {
  [ -f "$PARK/manifest" ] || return 0
  while IFS=$'\t' read -r key orig; do
    [ -n "$key" ] && [ -e "$PARK/$key" ] && mv -f "$PARK/$key" "$orig" 2>/dev/null || true
  done < "$PARK/manifest"
  rm -f "$PARK/manifest"
}

park_one() { # $1 = مسیر (فایل یا پوشه)
  [ -e "$1" ] || return 0
  local key
  key="$(printf '%s' "$1" | sed 's|/|__|g')"
  # اگر هم‌اکنون در پارک است (بیلد قبل ناتمام)، رد شود
  [ -e "$PARK/$key" ] && return 0
  mv -f "$1" "$PARK/$key" && printf '%s\t%s\n' "$key" "$1" >> "$PARK/manifest"
}

restore_park   # خوددرمانی پیش از هر چیز

# ─── فهرست پارک‌شونده‌ها (سنگین + ارجاع‌شده از تراسر + بی‌نیاز حین بیلد) ───
# دقت: db/custom.db (زنده) و download/ (سرو /deliver) هرگز پارک نمی‌شوند.
PARK_PATHS=(
  "upload/.data/rolling"
  "upload/.data/custom.db"
  "upload/.data/custom.db-wal"
  "upload/.data/custom.db-shm"
  "upload/.survival"
  "upload/.mirror"
  "upload/dataset-backups"
  "backups"
  "upload/.data/corruption-incident-pn070"
  "upload/.data/corruption-incident-pn069"
)
for p in "${PARK_PATHS[@]}"; do park_one "$p"; done
# قرنطینه‌های DB (الگوی glob)
for f in db/custom.db.broken-* ; do [ -f "$f" ] && park_one "$f"; done

trap 'rc=$?; restore_park; exit $rc' EXIT

# ═══ عین اسکریپت build قبلی package.json (بدون تغییر معنایی) ═══
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
  NODE_OPTIONS=--max-old-space-size=3000 RAYON_NUM_THREADS=1 next build --experimental-build-mode compile &&
  NODE_OPTIONS=--max-old-space-size=3000 RAYON_NUM_THREADS=1 next build --experimental-build-mode generate &&
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
