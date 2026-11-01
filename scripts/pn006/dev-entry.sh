#!/usr/bin/env bash
# ============================================================
# dev-entry.sh — دروازهٔ بوت ملکا (ملکا-شورا-ن۰۰۶-۱۴۰۵ · BLOCK 1 · راه‌حل ج)
# ------------------------------------------------------------
# «bun run dev» از این پس یک دروازهٔ حالت‌دار است:
#   MELK_DEV_MODE=1  → توسعهٔ واقعی (next dev — همان رفتار قدیمی)
#   پیش‌فرض / صفر     → production (گارد بازیابی + بیلد در صورت نبود + نگهبان)
#
# متغیر MELK_DEV_MODE از محیط پوسته یا .env.local خوانده می‌شود.
# هدف: مسیر بوت پلتفرم (bun run dev) هرگز دیگر مستقیم به dev نرود —
#       ری‌استارت کانتینر = production (RAM ~۲۰۰MB به‌جای ~۲.۹GB).
# ============================================================
set -uo pipefail
cd /home/z/my-project

# --- خواندن MELK_DEV_MODE: اول محیط پوسته، بعد .env.local ---
MODE="${MELK_DEV_MODE:-}"
if [[ -z "$MODE" && -f .env.local ]]; then
  MODE="$(grep -E '^MELK_DEV_MODE=' .env.local 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"' | tr -d "'")"
fi

if [[ "$MODE" == "1" ]]; then
  # ---------- حالت توسعهٔ واقعی (فقط محیط محلی توسعه‌دهنده) ----------
  echo "[dev-entry] MELK_DEV_MODE=1 → توسعهٔ واقعی (next dev)"
  exec bun x next dev -p "${MELK_DEV_PORT:-3000}" 2>&1 | tee dev.log
else
  # ---------- حالت پیش‌فرض: production (کلید فاز ۰-B) ----------
  echo "[dev-entry] پیش‌فرض production — $(date -u +%FT%TZ)"
  mkdir -p upload/.survival

  # ═══ PN-008 اولاً: ارتقای منابع در حد امکان کانتینر ═══
  ulimit -n 100000 2>/dev/null || true
  export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-4}"
  bun scripts/pn008/ensure-wal.ts 2>/dev/null || true

  # ۱) گارد بازیابی محیط — اگر تخریب ساختاری دیده شد، از بستهٔ بقا برمی‌گرداند
  if [[ -f scripts/pn005c/recovery-guard.sh ]]; then
    bash scripts/pn005c/recovery-guard.sh || true
  fi

  # ═══ PN-012-B (بحران ششم): بازیابی راز بوت از escrow سه‌مکانی ═══
  # ریست پلتفرم MELK_TOKEN_KEY را از .env.local پاک می‌کرد → fail-fast → 500.
  # زنجیرهٔ بازیابی: .env.local → db/.runtime → upload/.runtime → env.escrow.enc (رمزنگاری‌شدهٔ گیت)
  if [[ -f scripts/pn012/escrow-manager.ts ]]; then
    bun scripts/pn012/escrow-manager.ts restore 2>&1 | tee -a dev-recovery.log || true
  fi

  # ۱-ب) PN-031-E — بازیابی مسیر سرو تحویل‌ها (public/deliver) اگر بازنشانی پلتفرم آن را زد
  #      منبع حقیقت: download/ + upload/.survival (طبق .gitignore بند ۹۵)؛ اینجا فقط کپی سرو.
  if [[ ! -f public/deliver/pn031d/melka-relay.apk && -f download/pn031d/melka-relay.apk ]]; then
    mkdir -p public/deliver/pn031d
    cp -f download/pn031d/melka-relay.apk download/pn031d/qr-apk.png download/pn031d/qr-apk.svg download/pn031d/OWNER-GUIDE.html public/deliver/pn031d/ 2>/dev/null || true
    echo "[dev-entry] public/deliver/pn031d از منبع حقیقت download/pn031d بازگردانده شد (APK + QR)"
  fi

  # ۱-ج/۱-د) ═══ PN-042 (جلسهٔ ۰۷۰): دکترین رستاخیز — صفر بازیابی خودکار در بوت ═══
  #      سازوکارهای بازیابی موازی محلی (سپر عالی + گارد قلعه + دستور یک‌خطی قدیمی)
  #      حذف شدند. منبع حقیقت کد: GitHub main. بازیابی فقط با فرمان مالک
  #      (قانون «مجری کور») انجام می‌شود — بوت با هر درختی که دارد بالا
  #      می‌آید (قانون ۱۱) و دیتابیس را watchdog محلی-اول تأمین می‌کند.
  echo "[dev-entry] راهنمای رستاخیز پس از ریست (مخزن خصوصی — raw توکن می‌خواهد · کشف PN-042-A):"
  echo "  set -a; . upload/.mirror/credentials.env; set +a; TOKEN=\$(printf '%s' \"\$MIRROR_URL_AUTHED\" | sed -n 's#https://[^:]*:\([^@]*\)@.*#\1#p'); curl -fsSL -H \"Authorization: token \$TOKEN\" \"https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh?t=\$(date +%s)\" | bash"

  # ۲) بیلد در صورت نبود
  if [[ ! -f .next/standalone/server.js ]]; then
    echo "[dev-entry] بیلد production…"
    if ! bun run build; then
      echo "[dev-entry] بیلد شکست خورد — fallback به dev"
      exec bun x next dev -p "${MELK_DEV_PORT:-3000}" 2>&1 | tee dev.log
    fi
  fi

  # ۳) نگهبان سرور production — در پیش‌زمینه (فرایند ریشه برای پلتفرم)
  #    کرش سرور → ری‌استارت خودکار ۵ ثانیه‌ای؛ توقف رسمی: فایل .prod-stop
  echo "[dev-entry] آغاز نگهبان production (پیش‌زمینه)…"
  exec bash scripts/prod-watchdog.sh
fi
