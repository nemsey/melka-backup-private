#!/usr/bin/env bash
# نگهبان سرور production — داشبورد هوشمند ملک تبریز
# سرور standalone را روی پورت ۳۰۰۰ اجرا می‌کند و در صورت کرش، بلافاصله دوباره بالا می‌آورد.
# فاصله حداقل بین ری‌استارت‌ها: ۵ ثانیه؛ توقف فقط با کشتن این پروسه یا فایل فلگ.
#
# رازهای اجرایی (MASTER_ACCESS_CODE / MELK_TOKEN_KEY) از .env.local خوانده می‌شوند
# (gitignored) — هرگز در سورس یا این اسکریپت قرار نمی‌گیرند (SEC-1/SEC-2).

cd /home/z/my-project
STOP_FLAG="/home/z/my-project/.prod-stop"
LOG="/home/z/my-project/server.log"

# بارگذاری رازها از .env.local (در صورت نبود، خالی می‌ماند و سرور fail-fast می‌شود)
set -a
[ -f .env.local ] && . ./.env.local
set +a

# ═══ PN-011 اولاً: خوددرمانی رازها در لایهٔ پوسته ═══
# مصوبهٔ مالک پس از پنجمین بازنشانی محیط (رفع 500 برای همیشه):
# اگر پس از بارگذاری .env.local هنوز رازی غایب است:
#   ۱) از escrow بادوام (upload/.runtime/boot-secrets.json — زنده در هر ۵ بازنشانی،
#      gitignored از طریق /upload/ و هرگز وارد بستهٔ بقا/GitHub نمی‌شود) بازیابی کن
#   ۲) MELK_TOKEN_KEY در فقدان کامل → تولید تازه (openssl) + ثبت در escrow
#      (هزینهٔ صادقانه: نشست‌های ARM قبلی نامعتبر — ورود مجدد یک‌بار مالک)
#   ۳) MASTER_ACCESS_CODE / OWNER_PERSONNEL_CODES فقط بازیابی (تولید تصادفی ممنوع)
# این لایه حتی روی بیلدهای قدیمیِ فاقد گارد درونی (instrumentation) کار می‌کند.
ESCROW="/home/z/my-project/upload/.runtime/boot-secrets.json"
escrow_get() {
  python3 - "$ESCROW" "$1" <<'PYEOF' 2>/dev/null || true
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    v = d.get(sys.argv[2], "")
    print(v if isinstance(v, str) else "")
except Exception:
    pass
PYEOF
}
escrow_set() {
  python3 - "$ESCROW" "$1" "$2" <<'PYEOF' 2>/dev/null || true
import json, os, sys
p, k, v = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    d = json.load(open(p))
except Exception:
    d = {}
d[k] = v
d["_note"] = "PN-011 escrow (watchdog) — فقط دیسک محلی؛ gitignored؛ هرگز وارد git/بستهٔ بقا نمی‌شود."
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
mkdir -p /home/z/my-project/upload/.runtime
if [ -z "${MELK_TOKEN_KEY:-}" ]; then
  K="$(escrow_get MELK_TOKEN_KEY)"
  if [ -z "$K" ]; then
    K="$(openssl rand -hex 32)"
    escrow_set MELK_TOKEN_KEY "$K"
    echo "[watchdog] $(date '+%F %T') خوددرمانی: MELK_TOKEN_KEY غایب بود — کلید تازه تولید و در escrow ثبت شد (نشست‌های ARM قبلی نامعتبر)" >> "$LOG"
  else
    echo "[watchdog] $(date '+%F %T') خوددرمانی: MELK_TOKEN_KEY از escrow بادوام بازیابی شد" >> "$LOG"
  fi
  export MELK_TOKEN_KEY="$K"
fi
if [ -z "${MASTER_ACCESS_CODE:-}" ]; then
  K="$(escrow_get MASTER_ACCESS_CODE)"
  if [ -n "$K" ]; then
    export MASTER_ACCESS_CODE="$K"
    echo "[watchdog] $(date '+%F %T') خوددرمانی: MASTER_ACCESS_CODE از escrow بادوام بازیابی شد" >> "$LOG"
  fi
fi
if [ -z "${OWNER_PERSONNEL_CODES:-}" ]; then
  K="$(escrow_get OWNER_PERSONNEL_CODES)"
  if [ -n "$K" ]; then
    export OWNER_PERSONNEL_CODES="$K"
    echo "[watchdog] $(date '+%F %T') خوددرمانی: OWNER_PERSONNEL_CODES از escrow بادوام بازیابی شد" >> "$LOG"
  fi
fi
# env سالم ← escrow را همیشه همگام نگه دار (نسخهٔ بادوام جلو بماند)
[ -n "${MELK_TOKEN_KEY:-}" ] && escrow_set MELK_TOKEN_KEY "$MELK_TOKEN_KEY"
[ -n "${MASTER_ACCESS_CODE:-}" ] && escrow_set MASTER_ACCESS_CODE "$MASTER_ACCESS_CODE"
[ -n "${OWNER_PERSONNEL_CODES:-}" ] && escrow_set OWNER_PERSONNEL_CODES "$OWNER_PERSONNEL_CODES"

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

  PORT=3000 HOSTNAME=0.0.0.0 NODE_ENV=production \
    DATABASE_URL="file:/home/z/my-project/db/custom.db" \
    MELKA_REPO_DIR="/home/z/my-project" \
    bun /home/z/my-project/.next/standalone/server.js >> "$LOG" 2>&1
  CODE=$?
  echo "[watchdog] $(date '+%F %T') سرور با کد $CODE متوقف شد — ری‌استارت پس از ۵ ثانیه" >> "$LOG"
  sleep 5
done
