#!/bin/bash
# ============================================================================
# optimize-and-resume.sh — PN-053 (DIR-PN053-OPTIMIZE · الزام بقا بخش ۴)
# ----------------------------------------------------------------------------
# اجرای جدا شده از ترمینال (setsid) برای بقا در برابر ریست سرور.
# فازها idempotent اند — با فلگ‌های phase*.done در download/PN-053/checkpoints/.
# فازهای ویرایش کد (۲ و ۳) توسط GLM در جلسه انجام شده/می‌شود؛ این اسکریپت
# پس از هر ریست، از آخرین نقطه ادامه می‌دهد: فازهای مکانیکی (بیلد/تست/کامیت/
# پوش) خودکار، فازهای کد فقط اگر فلگ‌شان نبود با هشدار روشن متوقف می‌شوند
# (کدنویسی نیاز به قضاوت دارد — قانون «مجری کور» فقط برای رستاخیز است).
# ============================================================================
set -uo pipefail
cd /home/z/my-project
CKPT_DIR="download/PN-053/checkpoints"
LOG="download/PN-053/optimize-and-resume.log"
mkdir -p "$CKPT_DIR" logs
exec >> "$LOG" 2>&1
echo "═══ [$(date -u +%FT%TZ)] resume-run شروع ═══"

# ── فاز ۱: حذف منطق Publish — در PN-078 (کامیت c796f48) کامل شد ──
[ -f "$CKPT_DIR/phase1.done" ] || { touch "$CKPT_DIR/phase1.done"; echo "[resume] phase1 (publish removal): از قبل کامل شده در PN-078 — فلگ ثبت شد"; }

# ── فاز ۲: پاکسازی کد مرده — توسط GLM (نیازمند قضاوت ارجاعی) ──
if [ ! -f "$CKPT_DIR/phase2.done" ]; then
  DEAD_COUNT=$(python3 -c "
import json,os
p='download/PN-053/audit-deadcode.json'
d=json.load(open(p)) if os.path.exists(p) else {'deadScripts':{'count':0}}
print(d['deadScripts']['count'])" 2>/dev/null || echo 0)
  echo "[resume] phase2 (dead-code): فلگ نیست — dead candidates=$DEAD_COUNT"
  echo "[resume] ⚠️ حذف کد نیاز به اجرای GLM دارد (بستار ارجاعی) — این فاز خودکار نیست"
fi

# ── فاز ۳: بهینه‌سازی RAM/CPU — توسط GLM (ویرایش کانفیگ‌ها) ──
[ -f "$CKPT_DIR/phase3.done" ] || echo "[resume] phase3 (ram/cpu): فلگ نیست — نیازمند GLM"

# ── فاز ۴: بیلد + تست (مکانیکی — خودکار) ──
if [ ! -f "$CKPT_DIR/phase4.done" ] && [ -f "$CKPT_DIR/phase3.done" ]; then
  echo "[resume] phase4: build + test..."
  if bun run build; then
    if NODE_ENV=test DATABASE_URL=file:/home/z/my-project/db/test.db MELK_TOKEN_KEY=test-only-key-not-a-real-secret \
       MELK_API_TIMEOUT_MS=300 GLM_PROBE_TIMEOUT_MS=300 bun test tests/ 2>&1 | tail -5; then
      touch "$CKPT_DIR/phase4.done"
      echo "[resume] phase4: سبز ✓"
    else
      echo "[resume] phase4: تست قرمز — توقف (GLM بررسی کند)"
    fi
  else
    echo "[resume] phase4: بیلد ناکام — توقف (GLM بررسی کند)"
  fi
fi

# ── فاز ۵: کامیت + پوش آینه + ثبت نهایی (مکانیکی — خودکار) ──
if [ -f "$CKPT_DIR/phase4.done" ] && [ ! -f "$CKPT_DIR/phase5.done" ]; then
  if [ -n "$(git status --short | grep -v sync-tar.md5 | grep -v '^??.*checkpoint')" ]; then
    git add -A
    git commit -m "perf(PN-053): clean dead code and optimize RAM/CPU" || true
  fi
  git push melka-backup refs/heads/main:refs/heads/main && touch "$CKPT_DIR/phase5.done" \
    && echo "[resume] phase5: پوش آینه سبز ✓" \
    || echo "[resume] phase5: پوش ناکام — دور بعد دوباره"
fi

echo "═══ [$(date -u +%FT%TZ)] resume-run پایان (وضعیت فازها: $(ls "$CKPT_DIR" | tr '\n' ' ')) ═══"
