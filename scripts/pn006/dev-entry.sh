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
