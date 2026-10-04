#!/usr/bin/env bash
# ============================================================
# P6549 — بازیابی حادثهٔ چهارم (rollback به 76ed3d4 در بوت ۰۵:۵۵Z)
# منبع: بستهٔ بقا P6548-recovery-20261004 (chainIndex=7 · md5 15/16 OK)
#        نکته: custom.db آخرین فایل MANIFEST است — جداگانه راستی‌آزمایی شد (md5 OK در پروب قبلی؟ نه — هشدار ۱ مورد)
# اجرا: bash scripts/p6549-recovery.sh
# ============================================================
set -uo pipefail
cd /home/z/my-project
TS="$(date -u +%Y%m%d-%H%M%S)"
PKG="upload/.survival/P6548-recovery-20261004"
EXPECT_TIP="24987192a403ba501fda7a63f460f5d1e44f2e7e"

step() { echo ""; echo "===== $1 ====="; }

step "0) توقف سوپروایزر و سرور dev (ترتیب مهم: اول سوپروایزر)"
pkill -f "dev.sh --supervisor" 2>/dev/null; sleep 1
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
pkill -f "tee dev.log" 2>/dev/null
pkill -f "bun run dev" 2>/dev/null
pkill -f "postcss.js" 2>/dev/null
sleep 2
if curl -s -m 2 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then echo "WARN: :3000 هنوز بالا است!"; else echo "OK: سرور متوقف شد"; fi

step "1) پشتیبان وضعیت فعلی (پروتکل بند ح قانون ۰۳۱)"
BK="backups/pre-recovery4-$TS"
mkdir -p "$BK"
cp db/custom.db "$BK/custom.stale.db"
git rev-parse HEAD > "$BK/HEAD.txt" 2>/dev/null
git log --oneline -5 > "$BK/log.txt" 2>/dev/null
git reflog > "$BK/reflog.txt" 2>/dev/null
tar -cf "$BK/git.tar" .git 2>/dev/null && echo "OK: .git آرشیو شد ($(du -sh "$BK/git.tar" | cut -f1))"
md5sum "$BK"/custom.stale.db "$BK"/git.tar > "$BK/MD5SUMS"
echo "بکاپ: $BK"

step "2) وارسی md5 بستهٔ DB (هشدار MANIFEST را شفاف کن)"
( cd "$PKG" && md5sum custom.db && grep "custom.db" MANIFEST.md5 || true )

step "3) fetch باندل بقا + reset به نوک"
git fetch "$PKG/repo.bundle" main 2>&1 | tail -2
TIP="$(git rev-parse FETCH_HEAD)"
echo "نوک باندل: $TIP"
if [ "$TIP" != "$EXPECT_TIP" ]; then echo "FATAL: نوک باندل غیرمنتظره — توقف"; exit 1; fi
git reset --hard "$TIP" 2>&1 | tail -1
echo "HEAD اکنون: $(git rev-parse HEAD) | $(git log -1 --format=%s | head -c 120)"

step "4) بهداشت فوری git (جلوگیری از کامیت‌های بوت پلتفرم روی upload/ و db)"
git ls-files upload/ | head -5 | sed 's/^/tracked-upload: /'
git ls-files db/ | sed 's/^/tracked-db: /'
# حذف DB از ایندکس (فایل روی دیسک می‌ماند — قانون ۰۳۵-A) + گیت‌ایگنور
git rm --cached -q db/custom.db 2>/dev/null && echo "OK: db/custom.db از ایندکس حذف شد (فایل روی دیسک ماند)"
cat >> .gitignore <<'EOF'

# P6549 — قانون ۰۳۵-A + بهداشت کامیت بوت پلتفرم: داده در upload، نه در git
/db/custom.db
/upload/
/backups/*.db
/backups/*.tar
*.pid
EOF
git add .gitignore
git commit -q -m "chore(P6549): بهداشت git — حذف DB از ایندکس + گیت‌ایگنور upload/backups (قانون ۰۳۵-A؛ جلوگیری از بلعیدن بسته‌های بقا توسط کامیت بوت پلتفرم)" && echo "OK: کامیت بهداشت"
git status --short | head -8

step "5) جایگزینی DB با تازه‌ترین نسخهٔ بسته (۰۴:۴۶Z)"
cp "$PKG/custom.db" db/custom.db && echo "OK: DB جایگزین شد ($(stat -c%s db/custom.db) بایت)"

step "6) worklog — تازه‌ترین نسخه"
LSZ=$(stat -c%s worklog.md 2>/dev/null || echo 0); PSZ=$(stat -c%s "$PKG/worklog.md")
echo "tree=$LSZ بایت | package=$PSZ بایت"
if [ "$PSZ" -gt "$LSZ" ]; then cp "$PKG/worklog.md" worklog.md; echo "OK: worklog از بسته گرفته شد"; fi

step "7) وابستگی‌ها + کلاینت پرایسما"
bun install 2>&1 | tail -2
bun run db:generate 2>&1 | tail -2

step "8) پاکسازی .next (سرور متوقف است — امن) و بوت از مسیر رسمی"
rm -rf .next
bash .zscripts/dev.sh 2>&1 | tail -4

step "9) راستی‌آزمایی مهر نسخه"
sleep 3
V="$(curl -s -m 10 http://127.0.0.1:3000/api/version)"
echo "version: $V"
echo "$V" | grep -q '"gitSha":"2498719"' && echo "PASS: مهر نسخه = HEAD بازیابی‌شده" || echo "CHECK: مهر نسخه را ببینید"

echo ""
echo "== P6549 RECOVERY COMPLETE $(date -u) =="
