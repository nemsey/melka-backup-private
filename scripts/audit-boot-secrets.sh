#!/usr/bin/env bash
# =============================================================================
# audit-boot-secrets.sh — گارد سلامت سازوکار راز بوت (PN-012 · BLOCK 5)
# =============================================================================
# بحران‌های ۴، ۵ و ۶ هر سه از یک ریشه آمدند: پاک‌شدن راز از .env.local پس از
# بازنشانی محیط پلتفرم، بدون هیچ مسیر بازیابی خودکار. این گارد جلوی رگرسیونِ
# «سازوکار بازیابی حذف/خراب شود» را می‌گیرد.
#
# بررسی‌ها:
#   ۱) ماژول boot-secrets (سه‌لایه: env → escrow سه‌مکانی → تولید)
#   ۲) ترتیب درست در instrumentation: ensureBootSecrets «پیش از» fail-fast
#   ۳) لایهٔ پوسته: prod-watchdog دارای خوددرمانی + MELKA_REPO_DIR
#   ۴) لایهٔ دروازهٔ بوت: dev-entry و start.sh قلاب escrow دارند
#   ۵) قانون راز-در-گیت-ممنوع: db/.runtime و .env* ignore؛ env.escrow.enc track
#   ۶) ترِت‌چِت مسیرها: هر روت api نسخهٔ v1 دارد (BLOCK 4)
#
# حالت‌ها:
#   بدون آرگومان → بررسی ساختاری (CI-امن — بدون نیاز به escrow واقعی)
#   --live       → بررسی زندهٔ تولید: هر سه مکان escrow + سازگاری اثر انگشت
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
FAIL=0
ck() { # ck <説明> <شرط-۰/۱>
  if [[ "$2" == "1" ]]; then
    printf "  ✓ %s\n" "$1"
  else
    printf "  ✗ %s\n" "$1"
    FAIL=1
  fi
}

echo "================ BOOT SECRETS AUDIT (PN-012 BLOCK 5) ================"

# ─── ۱) ماژول سه‌لایه ───
BS="src/lib/auth/boot-secrets.ts"
[[ -f "$BS" ]] && grep -q "export async function ensureBootSecrets" "$BS" && ck "ماژول boot-secrets با ensureBootSecrets" 1 || ck "ماژول boot-secrets با ensureBootSecrets" 0
grep -q "generateInstanceId\|randomBytes(32)" "$BS" 2>/dev/null && ck "تولید کلید تازه در فقدان کامل (PN-011 حفظ شد)" 1 || ck "تولید کلید تازه در فقدان کامل (PN-011 حفظ شد)" 0
grep -q "db\", \".runtime\", \"boot-secrets.json" "$BS" 2>/dev/null && ck "escrow سه‌مکانی: db/.runtime (محل پایدار)" 1 || ck "escrow سه‌مکانی: db/.runtime (محل پایدار)" 0
grep -q "env.escrow.enc" "$BS" 2>/dev/null && ck "escrow رمزنگاری‌شدهٔ گیت (env.escrow.enc)" 1 || ck "escrow رمزنگاری‌شدهٔ گیت (env.escrow.enc)" 0
grep -q "scryptSync" "$BS" 2>/dev/null && ck "کلید مشتق از کد مستر با scrypt سختِ حافظه" 1 || ck "کلید مشتق از کد مستر با scrypt سختِ حافظه" 0

# ─── ۲) ترتیب در instrumentation ───
INS="src/instrumentation.ts"
HEAL_LINE=$(grep -n "ensureBootSecrets()" "$INS" 2>/dev/null | head -1 | cut -d: -f1)
FAILFAST_LINE=$(grep -n "assertProductionSecrets()" "$INS" 2>/dev/null | head -1 | cut -d: -f1)
if [[ -n "$HEAL_LINE" && -n "$FAILFAST_LINE" && "$HEAL_LINE" -lt "$FAILFAST_LINE" ]]; then
  ck "instrumentation: خوددرمانی (خط $HEAL_LINE) پیش از fail-fast (خط $FAILFAST_LINE)" 1
else
  ck "instrumentation: خوددرمانی (خط $HEAL_LINE) پیش از fail-fast (خط $FAILFAST_LINE)" 0
fi

# ─── ۳) لایهٔ پوسته ───
WD="scripts/prod-watchdog.sh"
grep -q "MELKA_REPO_DIR" "$WD" 2>/dev/null && ck "نگهبان: لنگر تعیینی MELKA_REPO_DIR" 1 || ck "نگهبان: لنگر تعیینی MELKA_REPO_DIR" 0
grep -q "escrow" "$WD" 2>/dev/null && ck "نگهبان: خوددرمانی راز از escrow" 1 || ck "نگهبان: خوددرمانی راز از escrow" 0
grep -q "openssl rand -hex 32" "$WD" 2>/dev/null && ck "نگهبان: تولید تازهٔ کلید رمزنگاری در فقدان کامل" 1 || ck "نگهبان: تولید تازهٔ کلید رمزنگاری در فقدان کامل" 0

# ─── ۴) لایهٔ دروازه‌های بوت ───
grep -q "escrow-manager" scripts/pn006/dev-entry.sh 2>/dev/null && ck "dev-entry (مسیر بوت پلتفرم): قلاب escrow-manager" 1 || ck "dev-entry (مسیر بوت پلتفرم): قلاب escrow-manager" 0
grep -q "escrow-manager" start.sh 2>/dev/null && ck "start.sh (بوت رسمی): قلاب escrow-manager" 1 || ck "start.sh (بوت رسمی): قلاب escrow-manager" 0
[[ -f scripts/pn012/escrow-manager.ts ]] && grep -q "readEncryptedEscrow" scripts/pn012/escrow-manager.ts && ck "CLI escrow-manager: زنجیرهٔ بازیابی + رمزنگاری‌شده" 1 || ck "CLI escrow-manager: زنجیرهٔ بازیابی + رمزنگاری‌شده" 0

# ─── ۵) قانون راز-در-گیت-ممنوع ───
git check-ignore -q db/.runtime/boot-secrets.json 2>/dev/null && ck "db/.runtime در .gitignore (راز متنی هرگز در گیت)" 1 || ck "db/.runtime در .gitignore (راز متنی هرگز در گیت)" 0
git check-ignore -q .env.local 2>/dev/null && ck ".env* در .gitignore" 1 || ck ".env* در .gitignore" 0
git check-ignore -q env.escrow.enc 2>/dev/null && ck "env.escrow.enc «ردنبال‌شده» در گیت (رمزنگاری‌شدهٔ مجاز)" 0 || ck "env.escrow.enc «ردنبال‌شده» در گیت (رمزنگاری‌شدهٔ مجاز)" 1
# راز متنی در فایل‌های ردنبال‌شده ممنوع:
if git ls-files --cached 2>/dev/null | grep -qE "^(db/\.runtime|upload/\.runtime)/boot-secrets\.json$"; then
  ck "هیچ escrow متنی در index گیت نیست" 0
else
  ck "هیچ escrow متنی در index گیت نیست" 1
fi

# ─── ۶) v1 alias (BLOCK 4) ───
ORIG_COUNT=$(find src/app/api -name route.ts -not -path "*/v1/*" 2>/dev/null | wc -l | tr -d ' ')
V1_COUNT=$(find src/app/api/v1 -name route.ts 2>/dev/null | wc -l | tr -d ' ')
[[ "$ORIG_COUNT" -gt 0 && "$ORIG_COUNT" == "$V1_COUNT" ]] && ck "همهٔ $ORIG_COUNT روت نسخهٔ v1 دارند (BLOCK 4)" 1 || ck "همهٔ $ORIG_COUNT روت نسخهٔ v1 دارند (یافت: $V1_COUNT)" 0

# ─── حالت زندهٔ تولید ───
if [[ "$MODE" == "--live" ]]; then
  echo "  ─── بررسی زندهٔ سه مکان escrow ───"
  for LOC in db/.runtime/boot-secrets.json upload/.runtime/boot-secrets.json env.escrow.enc; do
    [[ -f "$LOC" ]] && ck "مکان زنده: $LOC" 1 || ck "مکان زنده: $LOC" 0
  done
  if command -v bun >/dev/null 2>&1 && [[ -f scripts/pn012/escrow-manager.ts ]]; then
    if bun scripts/pn012/escrow-manager.ts status 2>/dev/null | grep -q '"consistent": true'; then
      ck "سازگاری سه‌لایه (اثر انگشت یکسان)" 1
    else
      ck "سازگاری سه‌لایه (اثر انگشت یکسان)" 0
    fi
  fi
fi

echo "======================================================================="
if [[ "$FAIL" == "1" ]]; then
  echo "FAIL: سازوکار راز بوت رگرسیون دارد — جزئیات بالا."
  exit 1
fi
echo "PASS: سازوکار راز بوت سالم و کامل است."
exit 0
