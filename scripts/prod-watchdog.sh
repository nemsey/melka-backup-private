#!/usr/bin/env bash
# نگهبان سرور production — داشبورد هوشمند ملک تبریز
# سرور standalone را روی پورت ۳۰۰۰ اجرا می‌کند و در صورت کرش، بلافاصله دوباره بالا می‌آورد.
# فاصله حداقل بین ری‌استارت‌ها: ۵ ثانیه؛ توقف فقط با کشتن این پروسه یا فایل فلگ.
#
# رازهای اجرایی (MASTER_ACCESS_CODE / MELK_TOKEN_KEY) از .env.local خوانده می‌شوند
# (gitignored) — هرگز در سورس یا این اسکریپت قرار نمی‌گیرند (SEC-1/SEC-2).
#
# ═══ PN-011 اولاً + PN-012-B: خوددرمانی رازها در لایهٔ پوسته (سه‌مکانی) ═══
# مصوبهٔ مالک پس از پنجمین بازنشانی محیط (رفع 500 برای همیشه) + ارتقای PN-012
# پس از ششمین بازنشانی (escrow یتیم — کد PN-011 از درخت گیت پاک شده بود):
#   ۱) escrow بادوام «سه‌مکانی»: db/.runtime (پایدارترین — زنده در هر ۶ بحران)
#      → upload/.runtime (زنده در همهٔ بحران‌ها) → env.escrow.enc (رمزنگاری‌شده در
#      گیت/آینه — رمزگشایی با escrow-manager برای بوت‌های دارای bun)
#   ۲) MELK_TOKEN_KEY در فقدان کامل → تولید تازه (openssl) + ثبت در هر دو escrow
#      (هزینهٔ صادقانه: نشست‌های ARM قبلی نامعتبر — یک ورود مجدد مالک)
#   ۳) MASTER_ACCESS_CODE / OWNER_PERSONNEL_CODES فقط بازیابی (تولید تصادفی ممنوع)
#   ۴) .env.local در «هر» دور حلقه» دوباره source می‌شود (پوشش بازیابی‌های میانی)
# این لایه حتی روی بیلدهای قدیمیِ فاقد گارد درونی (instrumentation) کار می‌کند.

cd /home/z/my-project
STOP_FLAG="/home/z/my-project/.prod-stop"
LOG="/home/z/my-project/server.log"

ESCROW_DB="/home/z/my-project/db/.runtime/boot-secrets.json"
ESCROW_UPLOAD="/home/z/my-project/upload/.runtime/boot-secrets.json"

# بارگذاری رازها از .env.local (در صورت نبود، خالی می‌ماند — خوددرمانی پایین جانشین می‌شود)
set -a
[ -f .env.local ] && . ./.env.local
set +a

escrow_path_for() {
  if [ -f "$ESCROW_DB" ]; then echo "$ESCROW_DB"; else echo "$ESCROW_UPLOAD"; fi
}

escrow_get() {
  python3 - "$(escrow_path_for)" "$1" <<'PYEOF' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    v = d.get(sys.argv[2], "")
    print(v if isinstance(v, str) else "")
except Exception:
    pass
PYEOF
}

# خواندن از یک مسیر مشخص (برای پیمایش زنجیره)
escrow_get_from() {
  python3 - "$1" "$2" <<'PYEOF' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    v = d.get(sys.argv[2], "")
    print(v if isinstance(v, str) else "")
except Exception:
    pass
PYEOF
}

# نوشتن همزمان در هر دو مکان (triple سوم = env.escrow.enc رمزنگاری‌شده توسط escrow-manager/بوت درونی)
escrow_set() {
  python3 - "$ESCROW_DB" "$ESCROW_UPLOAD" "$1" "$2" <<'PYEOF' 2>/dev/null || true
import json, os, sys
db_path, up_path, k, v = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
for p in (db_path, up_path):
    try:
        d = json.load(open(p))
    except Exception:
        d = {}
    d[k] = v
    d["_note"] = "PN-011/012 escrow (watchdog سه‌مکانی) — فقط دیسک محلی؛ gitignored؛ هرگز وارد git/بستهٔ بقا نمی‌شود."
    d["updatedAt"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        t = p + ".tmp"
        with open(t, "w") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
        os.chmod(t, 0o600)
        os.replace(t, p)
    except Exception:
        pass
PYEOF
}

heal_secret() {
  # $1 = نام کلید · $2 = مجاز به تولید تصادفی؟ (yes/no)
  local key="$1" can_generate="$2"
  if [ -n "${!key:-}" ]; then
    escrow_set "$key" "${!key}"  # env سالم ← escrow همیشه همگام
    return 0
  fi
  # زنجیرهٔ بازیابی: db → upload
  local K
  K="$(escrow_get_from "$ESCROW_DB" "$key")"
  [ -z "$K" ] && K="$(escrow_get_from "$ESCROW_UPLOAD" "$key")"
  if [ -n "$K" ]; then
    export "$key=$K"
    echo "[watchdog] $(date '+%F %T') خوددرمانی: $key از escrow سه‌مکانی بازیابی شد" >> "$LOG"
    escrow_set "$key" "$K"  # هر دو مکان تازه شود
    return 0
  fi
  if [ "$can_generate" = "yes" ]; then
    K="$(openssl rand -hex 32)"
    escrow_set "$key" "$K"
    export "$key=$K"
    echo "[watchdog] $(date '+%F %T') خوددرمانی: $key غایب بود — کلید تازه تولید و در escrow ثبت شد (نشست‌های ARM قبلی نامعتبر)" >> "$LOG"
    return 0
  fi
  return 1
}

mkdir -p /home/z/my-project/db/.runtime /home/z/my-project/upload/.runtime
heal_secret MELK_TOKEN_KEY yes      # کلید رمزنگاری — تولید مجدد مجاز (هزینهٔ صادقانه)
heal_secret MASTER_ACCESS_CODE no   # کد مستر — هرگز تصادفی نمی‌شود
heal_secret OWNER_PERSONNEL_CODES no

echo "[watchdog] $(date '+%F %T') نگهبان سرور آغاز به کار کرد (PID $$)" >> "$LOG"

# ═══ PN-011 اولاً — لنگر تعیینی ریشهٔ مخزن ═══
# درس زندهٔ دو-مرحله‌ای: خروجی file-tracing خودِ Next کل مخزن (package.json،
# src/، .git، start.sh و…) را داخل .next/standalone کپی می‌کند؛ تشخیص ریشه از
# روی نشانه‌های فایلی فریب‌پذیر است. نگهبان، ریشهٔ قطعی را صریح صادر می‌کند.
export MELKA_REPO_DIR="/home/z/my-project"

while true; do
  if [ -f "$STOP_FLAG" ]; then
    echo "[watchdog] $(date '+%F %T') فلگ توقف دیده شد — خروج" >> "$LOG"
    rm -f "$STOP_FLAG"
    exit 0
  fi

  # ─── PN-012-B: بازیابی راز پیش از هر اسپاون + بارگذاری دوبارهٔ .env.local ───
  # (پوشش ریست‌های میانی: کلید ممکن است در وقفهٔ بین اسپاون‌ها پاک/بازیابی شده باشد)
  heal_secret MELK_TOKEN_KEY yes
  heal_secret MASTER_ACCESS_CODE no
  heal_secret OWNER_PERSONNEL_CODES no

  # لایهٔ سوم (رمزنگاری‌شدهٔ گیت) — در صورت نبود هر دو escrow متنی
  if [ -z "${MELK_TOKEN_KEY:-}" ] && [ -f /home/z/my-project/scripts/pn012/escrow-manager.ts ]; then
    ESCROW_OUT="$(bun /home/z/my-project/scripts/pn012/escrow-manager.ts restore 2>&1)" || true
    echo "[escrow] $(date '+%F %T') $ESCROW_OUT" >> "$LOG"
    set -a
    [ -f .env.local ] && . ./.env.local
    set +a
  fi

  PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    MELKA_REPO_DIR="/home/z/my-project" \
    bun /home/z/my-project/.next/standalone/server.js >> "$LOG" 2>&1
  CODE=$?
  echo "[watchdog] $(date '+%F %T') سرور با کد $CODE متوقف شد — ری‌استارت پس از ۵ ثانیه" >> "$LOG"
  sleep 5
done
