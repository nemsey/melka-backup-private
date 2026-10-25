#!/usr/bin/env bash
# ============================================================
# restore.sh — بازیابی اضطراری ملکا-شورا-۱۴۰۵-۰۳۴ · BLOCK 2
# مسیر: الف+ب — باندل بقا (ff به c61048e) + آینهٔ GitHub
#        (بازسازی محتوای d79704a از survival/code@373914f)
#        + جایگزینی کامل DB از بستهٔ بقا P6547cont
# هر گام ثبت می‌شود (بند ۲.۲ دستور) → restore-log.txt
# ============================================================
set -uo pipefail
REPO=/home/z/my-project
PKG="$REPO/upload/.survival/P6547cont-20261003"
BUNDLE="$PKG/repo.bundle"
CREDS="$REPO/upload/.mirror/credentials.env"
SCR="$REPO/scripts/recovery-034"
LOG="$SCR/restore-log.txt"
BK=$(ls -d "$REPO"/backups/pre-recovery-034-* 2>/dev/null | sort | tail -1)
STAMP() { date -u +%H:%M:%SZ; }
step() { echo "[$(STAMP)] $*" | tee -a "$LOG"; }
die() { step "FAIL: $*"; exit 1; }

cd "$REPO" || die "repo not found"
step "════ BLOCK 2 شروع · HEAD=$(git rev-parse --short HEAD) · BACKUP=$BK"

# ── گام ۰: توقف سرور dev کهنه (کد P6530 سرو می‌کند + قفل SQLite) ──
step "گام ۰: توقف سرور dev قدیمی"
pkill -f 'next dev -p 3000' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 3
if pgrep -f 'next-server' >/dev/null 2>&1; then pkill -9 -f 'next-server' 2>/dev/null; sleep 2; fi
step "پروسه‌های next باقی‌مانده: $(pgrep -c -f 'next-server' 2>/dev/null || echo 0)"

# ── حفاظت تکمیلی پیش از هر تغییری ──
cp -a "$REPO/intelligence-data/loop-latest.json" "$BK/loop-latest.pre-restore.json" 2>/dev/null
cp -a "$REPO/dev.log" "$BK/dev.pre-restore.log" 2>/dev/null
git reflog --date=iso > "$BK/reflog-before-restore.txt" 2>/dev/null
step "حفاظت تکمیلی: loop-latest + dev.log + reflog در بکاپ"

# ── گام ۱: fast-forward main از باندل بقا (c61048e) ──
step "گام ۱: fetch باندل بقا → ff main"
git fetch "$BUNDLE" refs/heads/main >>"$LOG" 2>&1 || die "fetch bundle"
TARGET=$(git rev-parse FETCH_HEAD)
step "TARGET از باندل: $TARGET"
git merge-base --is-ancestor HEAD "$TARGET" || die "HEAD اجداد TARGET نیست — ff ناممکن"
git checkout -- db/custom.db intelligence-data/loop-latest.json 2>>"$LOG" || true
# رفع untracked های هم‌مسیر با درخت هدف (یکسان → حذف امن / متفاوت → بکاپ)
while IFS= read -r -d '' entry; do
  st="${entry:0:2}"; f="${entry:3}"
  [ "$st" = "??" ] || continue
  case "$f" in */|.git/*) continue ;; esac
  if git cat-file -e "FETCH_HEAD:$f" 2>/dev/null; then
    if git show "FETCH_HEAD:$f" | cmp -s - "$f"; then
      rm -f -- "$f"; step "untracked یکسان → حذف امن: $f"
    else
      mkdir -p "$BK/untracked-moved/$(dirname "$f")"
      mv -- "$f" "$BK/untracked-moved/$f"; step "untracked متفاوت → بکاپ: $f"
    fi
  fi
done < <(git status --porcelain -z)
git merge --ff-only FETCH_HEAD >>"$LOG" 2>&1 || die "ff-merge به $TARGET"
step "HEAD پس از ff: $(git rev-parse --short HEAD) (انتظار c61048e)"

# ── گام ۲: ریموت mirror + fetch survival/code (373914f) ──
step "گام ۲: re-arm ریموت + fetch survival/code"
set -a; . "$CREDS"; set +a
git remote remove mirror >/dev/null 2>&1 || true
git remote add mirror "$MIRROR_URL_AUTHED"
git fetch mirror refs/heads/survival/code:refs/heads/survival/code >>"$LOG" 2>&1 || die "fetch mirror"
SNAP=$(git rev-parse --short refs/heads/survival/code)
step "survival/code = $SNAP (انتظار 373914f)"
[ "$SNAP" = "373914f" ] || die "اسنپ‌شات غیرمنتظره: $SNAP"
unset MIRROR_URL MIRROR_USER MIRROR_TOKEN MIRROR_URL_AUTHED

# ── گام ۳: بازسازی محتوای d79704a ──
if git log -1 --format=%s | rg -q 'P6548-recovery\(a\)'; then
  step "گام ۳: بازسازی از قبل اعمال شده — رد شد"
else
  step "گام ۳: وصلهٔ d79704a (diff اسنپ‌شات‌های 5005f2d→373914f)"
  git diff --stat "refs/heads/survival/code~1" "refs/heads/survival/code" | tail -15 | tee -a "$LOG"
  git diff --binary "refs/heads/survival/code~1" "refs/heads/survival/code" > "$SCR/scratch/d79704a.patch"
  PLINES=$(wc -l < "$SCR/scratch/d79704a.patch")
  step "وصله: $PLINES خط"
  if [ "$PLINES" -gt 0 ]; then
    git apply --index "$SCR/scratch/d79704a.patch" >>"$LOG" 2>&1 || die "git apply --index"
    AN=$(git log -1 --format='%an' "$TARGET"); AE=$(git log -1 --format='%ae' "$TARGET")
    git config user.name "$AN"; git config user.email "$AE"
    git commit -q -m "P6548-recovery(a): بازسازی کامل محتوای کامیت d79704a (پایان P6547-cont)

کامیت اصلی در حادثهٔ سوم (ریست اسنپ‌شات کهنهٔ پلتفرم — بوت ۲۰۲۶-۱۰-۰۴ ۰۳:۱۶Z؛ repo.tar مال ۲۰۲۶-۰۹-۲۹ ۲۲:۲۸) از .git لوکال حذف شد و شاخهٔ main آینه به‌دلیل GH001 (db>100MB) بدون آن است.
محتوا عیناً از اسنپ‌شات آینهٔ survival/code@373914f (پوش موفق ۲۰۲۶-۱۰-۰۳ ~۲۱:۳۳Z) بازسازی شد: diff دو اسنپ‌شات متوالی 5005f2d→373914f = تغییرات غیر-DB کامیت d79704a.
دیتابیس کاری از بستهٔ بقا P6547cont-20261003 (md5 b597ef10042ebdb4e5d4162565c6b69e) جایگزین کامل شد." >>"$LOG" 2>&1 || die "commit recovery(a)"
    step "کامیت بازیابی(a): $(git rev-parse --short HEAD)"
  else
    step "وصله خالی — d79704a فقط DB تغییر داده بود؛ بازسازی کد لازم نشد"
  fi
fi

# ── گام ۴: جایگزینی کامل دیتابیس از بستهٔ بقا (قانون دادهٔ مقدس) ──
step "گام ۴: جایگزینی کامل DB از بستهٔ بقا"
DBMD5=$(md5sum "$PKG/custom.db" | awk '{print $1}')
step "md5 بستهٔ DB: $DBMD5"
[ "$DBMD5" = "b597ef10042ebdb4e5d4162565c6b69e" ] || die "md5 بستهٔ DB ناسازگار"
cp -a "$PKG/custom.db" "$REPO/db/custom.db" && step "db/custom.db ← بسته ($(stat -c %s "$REPO/db/custom.db") bytes)"
cp -a "$PKG/test.db" "$REPO/db/test.db" && step "db/test.db ← بسته"
rm -f "$REPO/db/custom.db-wal" "$REPO/db/custom.db-shm" 2>/dev/null

# ── گام ۵: راستی‌آزمایی env ──
E1=$(md5sum "$REPO/.env" | awk '{print $1}'); E2=$(md5sum "$PKG/env.txt" | awk '{print $1}')
if [ "$E1" = "$E2" ]; then step ".env == env.txt بسته ✓"; else step "WARN: .env متفاوت از env.txt بسته — بررسی دستی"; fi

# ── گام ۶: prisma generate (اسکیمای P6547) ──
step "گام ۶: prisma generate"
(bunx prisma generate) >>"$LOG" 2>&1 || die "prisma generate"

# ── گام ۷: راه‌اندازی تمیز سرور dev ──
step "گام ۷: پاکسازی .next + راه‌اندازی سرور (الگوی double-fork)"
if ss -tln 2>/dev/null | rg -q ':3000 '; then
  step "پورت ۳۰۰۰ اشغال بود — توقف دوباره"; pkill -f 'next dev -p 3000' 2>/dev/null; pkill -f 'next-server' 2>/dev/null; sleep 3
fi
rm -rf "$REPO/.next"
( setsid nohup bash -c 'cd /home/z/my-project && node_modules/.bin/next dev -p 3000 2>&1 | tee dev.log' </dev/null >/dev/null 2>&1 & )
step "سرور راه‌اندازی شد — انتظار برای /api/version (تا ۱۸۰ ثانیه)"
V=""
for i in $(seq 1 90); do
  sleep 2
  V=$(curl -s --max-time 5 http://localhost:3000/api/version 2>/dev/null) && [ -n "$V" ] && break
done
step "خروجی /api/version: ${V:-ناموفق}"
step "HEAD نهایی: $(git rev-parse --short HEAD)"
step "════ BLOCK 2 پایان ════"
git log --oneline -6 | tee -a "$LOG"
git status --short 2>/dev/null | head -8 | tee -a "$LOG"
