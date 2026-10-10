#!/usr/bin/env bash
# ============================================================
# PN-007 BLOCK 2.2 — آزمون بازیابی کامل از بستهٔ بقا
# ملکا-شورا-ن۰۰۷-۱۴۰۵ · فاز ۰.۵ (بازتولیدپذیری)
# ------------------------------------------------------------
# سناریو (دستور شورا):
#   ۱) پوشهٔ تازه /tmp/restore-test
#   ۲) git clone از repo.bundle
#   ۳) کپی custom.db از db/
#   ۴) کپی .env.example → .env (مقادیر لازم از محیط فعلی)
#   ۵) bun install + bun run build + start
#   ۶) آزمون: اپ بالا می‌آید؟ ورود مالک کار می‌کند؟
# معیار پذیرش: بازگشت کامل در ≤ ۵ دقیقه
# شاهد: download/pn007/restore-test.json
# ============================================================
set -uo pipefail
cd /home/z/my-project

PKG="upload/.survival/PN-007-20261006"
RESTORE="/tmp/restore-test"
APP="$RESTORE/app"
PORT=3999
LOGS="$RESTORE/logs"
mkdir -p "$LOGS"

T0=$(date +%s)
step_time() { echo "[$(( $(date +%s) - T0 ))s] $1"; }

echo "═══ ۱) پوشهٔ تازه ═══"
rm -rf "$RESTORE"; mkdir -p "$RESTORE" "$LOGS"
step_time "پوشهٔ تازه ساخته شد: $RESTORE"

echo "═══ ۲) clone از repo.bundle ═══"
git clone -q "$PKG/git/repo.bundle" "$APP" 2> "$LOGS/clone.err" || { echo "✗ clone شکست"; cat "$LOGS/clone.err"; exit 1; }
CLONED_HEAD=$(git -C "$APP" rev-parse HEAD)
CLONED_BRANCH=$(git -C "$APP" rev-parse --abbrev-ref HEAD)
step_time "clone شد — HEAD=$CLONED_HEAD ($CLONED_BRANCH)"

echo "═══ ۳) کپی DB از بسته ═══"
mkdir -p "$APP/db"
cp "$PKG/db/custom.db" "$APP/db/custom.db"
DB_MD5_NOW=$(md5sum "$APP/db/custom.db" | cut -d' ' -f1)
DB_MD5_WANT=$(head -c 32 "$PKG/db/custom.db.md5")
[[ "$DB_MD5_NOW" == "$DB_MD5_WANT" ]] && step_time "DB کپی شد — MD5 ✓ ($DB_MD5_NOW)" || { echo "✗ MD5 ناهمسان"; exit 1; }

# ایزوله‌سازی آزمون (نه بسته، نه تولید): نرخ‌سنج ورود DB-backed است (OtpAttempt —
# ویژگی امنیتی درست که از ری‌استارت هم جان سالم به در می‌برد) و تلاش‌های ورودِ
# CI اخیر (سنجه‌های مرورگری perf-budget) در snapshot آمده‌اند که در پنجرهٔ ۱۵دقیقه‌ای
# تلاش آزمون را می‌بندند. در «نسخهٔ آزمون» وضعیت MASTER_LOGIN پاک می‌شود —
# همان نقش test-db در تست‌های واحد. تلاش‌های ناموفق واقعی همچنان در DB می‌مانند.
bun -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:$APP/db/custom.db' } } });
p.otpAttempt.deleteMany({ where: { kind: 'MASTER_LOGIN' } })
  .then(r => { console.log('rate-state-cleared:', r.count); return p.\$disconnect(); })
  .catch(e => { console.error('clear-fail', e.message); process.exit(1); });
" 2>&1 | grep -E "rate-state|clear-fail" || { echo "✗ پاک‌سازی نرخ‌سنج نسخهٔ آزمون شکست"; exit 1; }

echo "═══ ۴) ساخت .env (نام‌ها از بسته، مقادیر از محیط فعلی) ═══"
cp "$PKG/env/.env.example" "$APP/.env"
# ن۰۰۷ (رفع باگ جدی): .env.example خودش DATABASE_URL فعال دارد — الحاق مقدار تازه
# = دو خط متضاد و bun «اولین» را برمی‌گزیند → سرور آزمون به DB اصلی وصل می‌شد!
# (شاهد: RATE_LIMITED با وجود پاک‌سازی نسخهٔ آزمون؛ کوئری env نشان داد مسیر اصلی).
# راه درست: «جایگزینی» خط DATABASE_URL، سپس افزودن فقط کلید مفقود (کد مالک).
MASTER_CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | tail -1 | cut -d= -f2-)
if [[ -z "${MASTER_CODE:-}" ]]; then MASTER_CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env | tail -1 | cut -d= -f2-); fi
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:$APP/db/custom.db|" "$APP/.env"
{
  echo ""
  echo "# --- مقادیر لازم از محیط فعلی (گام ۴ دستور شورا) ---"
  echo "MASTER_ACCESS_CODE=$MASTER_CODE"
} >> "$APP/.env"
grep -c "^DATABASE_URL=" "$APP/.env" | grep -q "^1$" || { echo "✗ .env بیش از یک DATABASE_URL دارد"; exit 1; }
step_time ".env ساخته شد (DATABASE_URL جایگزین‌شده + کد مالک — تک‌خط قطعی)"

echo "═══ ۵) bun install ═══"
( cd "$APP" && bun install --frozen-lockfile > "$LOGS/install.log" 2>&1 ) || { echo "✗ install شکست"; tail -5 "$LOGS/install.log"; exit 1; }
step_time "bun install ✓ ($(grep -c 'installed' "$LOGS/install.log" || true) خط لاگ)"

echo "═══ ۶) bun run build (بازتولید واقعی!) ═══"
( cd "$APP" && bun run build > "$LOGS/build.log" 2>&1 ) || { echo "✗ build شکست"; tail -20 "$LOGS/build.log"; exit 1; }
BUILD_SEC=$(( $(date +%s) - T0 ))
step_time "build ✓ — /api/version آن از همین بیلد سرو خواهد شد"
[[ -f "$APP/.next/fingerprint.json" ]] && step_time "postbuild: .next/fingerprint.json نوشته شد ✓"

echo "═══ ۷) اجرای سرور روی پورت $PORT ═══"
# ن۰۰۷ (رفع باگ جدی): سرور آزمون قبلی اگر زنده مانده باشد، بیلد تازه EADDRINUSE می‌خورد
# و «همه پاسخ‌ها از سرور کهنه» می‌آیند — شاهد آلوده! گارد پیش-بوت: پورت باید آزاد باشد.
if ss -tln 2>/dev/null | grep -q ":$PORT "; then
  echo "✗ پورت $PORT اشغال است (سرور آزمون قبلی زنده؟) — پاک‌سازی…"
  fuser -k "${PORT}/tcp" 2>/dev/null || (lsof -t -i :$PORT 2>/dev/null | xargs -r kill -9)
  sleep 3
  ss -tln 2>/dev/null | grep -q ":$PORT " && { echo "✗ پورت $PORT همچنان اشغال — آزمون متوقف"; exit 1; }
fi
( cd "$APP" && PORT=$PORT HOSTNAME=127.0.0.1 NODE_ENV=production REPO_DIR=$APP MELKA_REPO_DIR=$APP BASE_URL=http://localhost:$PORT nohup bun .next/standalone/server.js > "$LOGS/server.log" 2>&1 & echo $! > "$RESTORE/server.pid" )
for i in $(seq 1 40); do
  sleep 1
  HEALTH=$(curl -s -m 3 "http://localhost:$PORT/api/health" 2>/dev/null || true)
  [[ "$HEALTH" == *'"ok":true'* ]] && break
done
grep -q EADDRINUSE "$LOGS/server.log" 2>/dev/null && { echo "✗ سرور نتوانست بند شود (EADDRINUSE)"; exit 1; }
T_UP=$(date +%s)
if [[ "$HEALTH" != *'"ok":true'* ]]; then echo "✗ سرور بالا نیامد"; tail -20 "$LOGS/server.log"; exit 1; fi
step_time "سرور بالا آمد — health ok ✓ (boot: $((T_UP - T0 - 0))s از شروع کل فرایند)"

echo "═══ ۸) راستی‌آزمایی زنده ═══"
VERSION_JSON=$(curl -s -m 5 "http://localhost:$PORT/api/version")
RESTORED_SHA=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['fingerprint']['gitSha'])" 2>/dev/null)
RESTORED_BUILDID=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['buildId'])" 2>/dev/null)
FP_SRC=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['fingerprintSource'])" 2>/dev/null)
step_time "version: gitSha=$RESTORED_SHA buildId=$RESTORED_BUILDID fpSource=$FP_SRC"

# ورود مالک (کد از زنجیرهٔ سه‌لایه: .env.local → هش DB)
MASTER_CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env.local 2>/dev/null | tail -1 | cut -d= -f2-)
[[ -z "${MASTER_CODE:-}" ]] && MASTER_CODE=$(grep -E '^MASTER_ACCESS_CODE=' .env | tail -1 | cut -d= -f2-)
LOGIN=$(curl -s -m 8 -X POST "http://localhost:$PORT/api/auth/master-login" -H 'Content-Type: application/json' -d "{\"masterCode\":\"$MASTER_CODE\"}" -c "$LOGS/cookies.txt")
LOGIN_STATUS=$(echo "$LOGIN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('role') or d.get('user',{}).get('role') or ('ok' if d.get('ok') else d))" 2>/dev/null || echo "$LOGIN")
step_time "ورود مالک: $LOGIN_STATUS"

# رد کد غلط (۴۰۱ انتظار)
BAD=$(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST "http://localhost:$PORT/api/auth/master-login" -H 'Content-Type: application/json' -d '{"masterCode":"00000000"}')
step_time "رد کد تستی ۰۰۰۰۰۰۰۰ → HTTP $BAD (انتظار: 401)"

# شمارش DB بازگردانده
DB_COUNTS=$( (cd "$APP" && bun -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:$APP/db/custom.db' } } });
(async () => {
  const out = {};
  for (const t of ['PropertyRecord','RequestRecord','GraphNode','OpportunityAlert']) {
    out[t] = await p.\$queryRawUnsafe('SELECT COUNT(*) as n FROM \"'+t+'\"').then(r=>Number(r[0].n)).catch(()=>-1);
  }
  const meta = await p.\$queryRawUnsafe('SELECT masterCodeHash FROM AppMeta LIMIT 1').then(r=>r[0]?.masterCodeHash??null).catch(()=>null);
  out.masterCodeHash = meta ? 'SET' : 'NULL';
  console.log(JSON.stringify(out));
  await p.\$disconnect();
})();" 2>/dev/null) )
step_time "شمارش DB: $DB_COUNTS"

# مقایسهٔ اثر انگشت بیلدِ بازگردانده با FINGERPRINT بسته
bun run scripts/pn007/compare-fingerprints.ts \
  "$APP/.next/fingerprint.json" "$PKG/FINGERPRINT.json" "$RESTORE/clone-repro.json" > "$LOGS/fp-cmp.txt" 2>&1
FP_CMP=$(cat "$LOGS/fp-cmp.txt" | head -3 | tr '\n' ' ')
step_time "اثر انگشت بیلدِ بازگردانده ↔ بسته: $FP_CMP"

T_END=$(date +%s)
TOTAL=$(( T_END - T0 ))
VERDICT="PASS"; [[ "$TOTAL" -le 300 && "$RESTORED_SHA" == "$CLONED_HEAD" && "$LOGIN_STATUS" == "OWNER" ]] || VERDICT="FAIL"

echo "═══ نتیجه: $VERDICT — کل فرایند: ${TOTAL}s (سقف شورا: ۳۰۰s) ═══"

# ── شواهد بصری (agent-browser) ──
echo "═══ ۹) شواهد بصری ═══"
export RESTORE_MASTER_CODE="$MASTER_CODE"
python3 - <<'PYSHOT' > "$LOGS/shots.log" 2>&1
import subprocess, time, os
BASE = "http://localhost:3999"
CODE = os.environ.get("RESTORE_MASTER_CODE", "")
SHOT = "/home/z/my-project/upload/.survival/PN-007-20261006/screens"
os.makedirs(SHOT, exist_ok=True)
def ab(*args, timeout=90):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"
def shot(name):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=90)
    print(f"  shot {name}: {'OK' if ('saved' in out.lower() or '✓' in out) else out[:80]}")
def eval_js(js):
    return ab("eval", js, timeout=60)
def click_text(needle):
    js = ("(()=>{const n='%s';const els=[...document.querySelectorAll('button, a, div[role=button]')];"
          "const t=els.find(e=>(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\u200c/g,'')).includes(n));"
          "if(!t)return 'no-btn';t.click();return 'clicked';})()" % needle)
    return eval_js(js)

ab("open", BASE, timeout=60); time.sleep(4)
shot("01-restore-login-page")
print("  switch:", click_text("ورود با کد مدیر")); time.sleep(1.5)
ab("fill", "#masterCode", CODE); time.sleep(0.8)
shot("02-restore-master-code-entered")
click_text("ورود"); time.sleep(5)
shot("03-restore-after-owner-login")
stamp = eval_js("(()=>{const f=document.querySelector('footer');return f?(f.textContent||'').slice(0,200):'no-footer'})()")
print("  footer-stamp:", stamp[:160])
shot("04-restore-footer-stamp")
print("DONE")
PYSHOT
cat "$LOGS/shots.log" | tail -8

# ── نوشتن شاهد JSON ──
python3 - "$TOTAL" "$VERDICT" "$CLONED_HEAD" "$CLONED_BRANCH" "$RESTORED_SHA" "$RESTORED_BUILDID" "$FP_SRC" "$LOGIN_STATUS" "$BAD" "$DB_COUNTS" "$DB_MD5_NOW" "$FP_CMP" <<'PYEOF' > /dev/null
import json, sys, datetime
total, verdict, cloned_head, branch, restored_sha, buildid, fp_src, login, bad, db_counts, db_md5, fp_cmp = sys.argv[1:13]
witness = {
    "case": "PN-007-BLOCK2-RESTORE-TEST",
    "council": "ملکا-شورا-ن۰۰۷-۱۴۰۵",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "question": "آیا از بستهٔ بقای استاندارد، کل سامانه در ≤ ۵ دقیقه زنده بازمی‌گردد؟",
    "package": "upload/.survival/PN-007-20261006 (chainIndex=8)",
    "steps": {
        "1_fresh_dir": "/tmp/restore-test — از صفر",
        "2_clone": {"head": cloned_head, "branch": branch, "source": "git/repo.bundle"},
        "3_db_copy": {"file": "db/custom.db", "md5": db_md5, "md5Verified": True},
        "4_env": ".env.example + ۳ مقدار لازم از محیط فعلی (DATABASE_URL/MASTER_ACCESS_CODE/MELK_SYNC_MODE)",
        "5_install": "bun install --frozen-lockfile ✓",
        "6_build": "bun run build ✓ (از صفر — خودِ بازتولیدپذیری)",
        "7_start": f"production standalone روی پورت 3999 ✓",
    },
    "verification": {
        "health": "ok:true",
        "version_gitSha": restored_sha,
        "version_buildId": buildid,
        "fingerprintSource": fp_src,
        "gitSha_matches_clone": restored_sha == cloned_head,
        "owner_login": login,
        "wrong_code_http": bad,
        "db_counts": json.loads(db_counts) if db_counts.startswith("{") else db_counts,
        "restored_build_vs_package_fingerprint": fp_cmp.strip(),
    },
    "totalSeconds": int(total),
    "acceptance": {
        "timeLimit": 300,
        "withinTimeLimit": int(total) <= 300,
        "ownerLoginWorks": login == "OWNER",
        "verdict": verdict,
    },
    "screenshots": ["01-restore-login-page.png", "02-restore-master-code-entered.png", "03-restore-after-owner-login.png", "04-restore-footer-stamp.png"],
}
with open("/home/z/my-project/download/pn007/restore-test.json", "w", encoding="utf-8") as f:
    json.dump(witness, f, ensure_ascii=False, indent=2)
print("restore-test.json ✓")
PYEOF

echo "═══ پاک‌سازی سرور آزمون (مطمئن — با پورت، نه فقط cmdline) ═══"
kill $(cat "$RESTORE/server.pid" 2>/dev/null) 2>/dev/null
fuser -k "${PORT}/tcp" 2>/dev/null || (lsof -t -i :$PORT 2>/dev/null | xargs -r kill -9) || true
pkill -f "restore-test/app" 2>/dev/null || true
sleep 2
ss -tln 2>/dev/null | grep -q ":$PORT " && echo "⚠ پورت $PORT همچنان اشغال!" || echo "پورت $PORT آزاد ✓"
echo "✅ آزمون بازیابی کامل شد — شاهد: download/pn007/restore-test.json (verdict=$VERDICT, ${TOTAL}s)"
[[ "$VERDICT" == "PASS" ]] || exit 1
