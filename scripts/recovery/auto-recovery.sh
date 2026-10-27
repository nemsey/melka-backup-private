#!/usr/bin/env bash
# ============================================================
# auto-recovery.sh — چرخهٔ خودکار بازیابی ملکا (Tier 4)
# پرونده: P6548-recovery · BLOCK 4 · دستور ملکا-شورا-۱۴۰۵-۰۳۴
# ------------------------------------------------------------
# دستورها:
#   check   — وارسی یک‌باره (مهر زنده ↔ HEAD ↔ آینهٔ GitHub ↔ شمارش DB)
#   daemon  — همان وارسی هر ۶ ساعت (الگوی double-fork بقا — PPID=1)
#   recover — اجرای بازیابی (دستی یا خودکار)
#   start-daemon — راه‌اندازی دیمن مقاوم
# Env:
#   REPO_DIR   (پیش‌فرض /home/z/my-project) — برای شبیه‌سازی
#   CREDS_FILE (پیش‌فرض $REPO/upload/.mirror/credentials.env)
#   BASE_URL   (پیش‌فرض http://localhost:3000)
#   DRY_RUN=1  — فقط تشخیص و طرح، بدون اقدام
#   MELK_AUTO_RECOVERY=disabled — خاموشی کامل
# لاگ پایدار: upload/.survival/recovery-log.jsonl (عبورکننده از ریست)
# ============================================================
set -uo pipefail
REPO="${REPO_DIR:-/home/z/my-project}"
CREDS="${CREDS_FILE:-$REPO/upload/.mirror/credentials.env}"
BASE="${BASE_URL:-http://localhost:3000}"
SURV="$REPO/upload/.survival"
LOG="$SURV/recovery-log.jsonl"
EXPECTED="$SURV/expected-counts.json"
INTERVAL_SECONDS=21600  # ۶ ساعت
mkdir -p "$SURV" 2>/dev/null || true

if [[ "${MELK_AUTO_RECOVERY:-}" == "disabled" ]]; then echo "auto-recovery: خاموش (MELK_AUTO_RECOVERY=disabled)"; exit 0; fi

logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$LOG" 2>/dev/null || true; }

newest_pkg() {
  if [[ -n "${PKG_DIR:-}" ]]; then echo "$PKG_DIR"; return; fi
  # PN-006 BLOCK 3: الگوی P[0-9]* به بسته‌های PN-XXX کور بود (کشف آزمون قرق)
  # PN-007 BLOCK 2: ساختار استاندارد ن۰۰۷ — DB در زیرپوشهٔ db/؛ هر دو چیدمان پشتیبانی می‌شود
  local best=""
  for d in $(ls -d "$REPO"/upload/.survival/P*/ 2>/dev/null | sort -V); do
    if [[ -f "${d%/}/db/custom.db" || -f "${d%/}/custom.db" ]]; then best="${d%/}"; fi
  done
  echo "$best"
}

# درخت HEAD منهای فایل‌های بالای ۹۹MB — همان منطق build-snapshot.sh
tree_minus_oversized() {
  local tmp tree big
  tmp=$(mktemp) || return 1
  GIT_INDEX_FILE="$tmp" git -C "$REPO" read-tree HEAD >/dev/null 2>&1 || { rm -f "$tmp"; return 1; }
  while IFS= read -r big; do
    [[ -n "$big" ]] && GIT_INDEX_FILE="$tmp" git -C "$REPO" rm --cached -q --ignore-unmatch -- "$big" >/dev/null 2>&1
  done < <(git -C "$REPO" ls-tree -r -l HEAD | awk -F'\t' -v lim=$((99*1024*1024)) '{split($1,a," "); if ((a[1]=="100644"||a[1]=="100755"||a[1]=="120000") && (a[4]+0)>lim) print $2}')
  tree=$(GIT_INDEX_FILE="$tmp" git -C "$REPO" write-tree 2>/dev/null || echo "")
  rm -f "$tmp"
  echo "$tree"
}

refresh_expected_counts() {
  [[ "$REPO" == "/home/z/my-project" && -f "$REPO/scripts/recovery-034/db-counts.ts" ]] || return 0
  local out ads req tx ex pm live_db
  live_db="$(bash "$REPO/scripts/recovery/live-db-path.sh" 2>/dev/null || echo "$REPO/db/custom.db")"
  out=$(bun "$REPO/scripts/recovery-034/db-counts.ts" "$live_db" 2>/dev/null) || return 0
  ads=$(echo "$out" | sed -n 's/^PropertyRecord: \([0-9]*\)/\1/p')
  req=$(echo "$out" | sed -n 's/^RequestRecord: \([0-9]*\)/\1/p')
  tx=$(echo "$out"  | sed -n 's/^TransactionRecord: \([0-9]*\)/\1/p')
  ex=$(echo "$out"  | sed -n 's/^ExpertRecord: \([0-9]*\)/\1/p')
  ep=$(echo "$out"  | sed -n 's/^ExpertProfile: \([0-9]*\)/\1/p')
  [[ -n "$ads" ]] || return 0
  printf '{"PropertyRecord":%s,"RequestRecord":%s,"TransactionRecord":%s,"ExpertRecord":%s,"ExpertProfile":%s,"updatedAt":"%s"}\n' \
    "$ads" "$req" "$tx" "$ex" "$ep" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$EXPECTED"
}

# ───────────────────────── وارسی ─────────────────────────
do_check() {
  local verdict="" head running snap snap_src snap_date head_date local_tree mirror_tree msg
  head=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo unknown)
  echo "[check] $(date -u +%FT%TZ) REPO=$REPO HEAD=$head"

  # ۱) مهر نسخهٔ زنده در برابر HEAD
  # FIX 2026-10-19 (حمل‌شده از خط A · کامیت 755c048): sed با .* حریص آخرین gitSha (فرم کامل
  # ۴۰کاراکتری داخل fingerprint) را برمی‌داشت و با head ۷کاراکتری مقایسه می‌شد → ۲۳۵ هشدار
  # کاذب version-mismatch. اکنون: grep -o نخستین توکن (فرم کوتاه سطح-بالا) + مقایسهٔ پیشوندی.
  running=$(curl -s --max-time 20 "$BASE/api/version" 2>/dev/null | grep -o '"gitSha":"[^"]*"' | head -1 | sed 's/^"gitSha":"//; s/"$//')
  if [[ -n "$running" ]]; then
    echo "[check] RUNNING=$running"
    if [[ "${running:0:${#head}}" != "$head" ]]; then
      echo "[check] WARN: سرور $running سرو می‌کند ولی HEAD=$head است — ری‌استارت هم‌تراز‌ساز لازم"
      logr version-mismatch "\"running\":\"$running\",\"head\":\"$head\""
      verdict="VERSION-STALE"
    fi
  else
    echo "[check] سرور در دسترس نیست (در بوت/ری‌استارت طبیعی است)"
  fi

  # ۲) آینهٔ GitHub — تشخیص بازگشت
  if [[ -f "$CREDS" ]]; then
    set -a; . "$CREDS"; set +a
    git -C "$REPO" remote remove auto-mirror >/dev/null 2>&1 || true
    git -C "$REPO" remote add auto-mirror "${MIRROR_URL_AUTHED:?no-token}" 2>/dev/null
    if git -C "$REPO" fetch auto-mirror refs/heads/survival/code:refs/heads/survival/code >/dev/null 2>&1; then
      snap=$(git -C "$REPO" rev-parse refs/heads/survival/code)
      msg=$(git -C "$REPO" log -1 --format=%s refs/heads/survival/code)
      snap_src=$(echo "$msg" | sed -n 's/^survival snapshot \([^ ]*\) .*/\1/p')
      snap_date=$(echo "$msg" | sed -n 's/^survival snapshot [^ ]* \([^ ]*\) .*/\1/p')
      head_date=$(git -C "$REPO" log -1 --format=%cI HEAD)
      echo "[check] MIRROR survival/code=$(git -C "$REPO" rev-parse --short "$snap") source=$snap_src ($snap_date) · HEAD date=$head_date"

      if [[ -n "$snap_src" ]] \
         && git -C "$REPO" cat-file -e "${snap_src}^{commit}" 2>/dev/null \
         && git -C "$REPO" merge-base --is-ancestor "$snap_src" HEAD 2>/dev/null; then
        echo "[check] HEALTHY-AHEAD: محلی هم‌نسخه یا جلوتر از آینه است"
        verdict="HEALTHY"
      else
        local_tree=$(tree_minus_oversized)
        mirror_tree=$(git -C "$REPO" rev-parse "refs/heads/survival/code^{tree}" 2>/dev/null || echo "")
        if [[ -n "$local_tree" && "$local_tree" == "$mirror_tree" ]]; then
          echo "[check] HEALTHY-EQUAL: درخت محلی == اسنپ‌شات آینه (هم‌ارز محتوایی)"
          verdict="HEALTHY"
        elif [[ -n "$snap_date" && -n "$head_date" ]] \
             && [[ $(date -d "$snap_date" +%s 2>/dev/null || echo 0) -gt $(( $(date -d "$head_date" +%s 2>/dev/null || echo 0) + 3600 )) ]]; then
          echo "[check] ROLLBACK-DETECTED: آینه محتوای جدیدتری دارد ($snap_date > $head_date + 1h)"
          verdict="ROLLBACK"
        else
          echo "[check] WARN-UNSNAPSHOTTED: کار محلی جدیدتر از آخرین اسنپ‌شات آینه — دیمن آینه در چرخهٔ بعد پوش می‌کند"
          [[ "$verdict" != "VERSION-STALE" ]] && verdict="WARN-UNSNAPSHOTTED"
        fi
      fi
    else
      echo "[check] fetch آینه ناموفق (شبکه/توکن) — وارسی آینه رد شد"
      logr check-error "\"where\":\"fetch-mirror\""
    fi
  fi

  # ── ۳-ب) جلسهٔ ۰۰۵: تشخیص تخریب ساختاری DB (هش کدمستر/گراف) ──
  # دیمن‌ها آگهی/درخواست ARM را برمی‌گردانند و وارسی شمارش را می‌گذرانند؛
  # ولی گراف صفر/هش NULL فقط پس از تخریب محیط رخ می‌دهد — این وارسی کور نیست.
  # PN-041 (شورا-ن۰۶۷): مسیر زندهٔ رسمی از حل‌کنندهٔ واحد (قلعه اول، قدیم fallback)
  _LIVE_DB="$(bash "$REPO/scripts/recovery/live-db-path.sh" 2>/dev/null || echo "$REPO/db/custom.db")"
  if [[ -f "$_LIVE_DB" ]]; then
    wipe=$(LIVE_DB="$_LIVE_DB" python3 - <<'PYW'
import os, sqlite3
try:
    con = sqlite3.connect(os.environ.get('LIVE_DB', 'db/custom.db'))
    h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
    g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
    con.close()
    if not (h and h[0]): print('yes:master-hash-null')
    elif g == 0: print('yes:graph-empty')
    else: print('no')
except Exception:
    print('no')
PYW
)
    if [[ "$wipe" == yes:* ]]; then
      echo "[check] DB-WIPE-DETECTED: $wipe"
      logr db-wipe-detected "\"cause\":\"${wipe#yes:}\""
      verdict="ROLLBACK-DB-WIPE"
    fi
  fi

  # ۳) شمارش DB در برابر آخرین وضعیت معتبر پایدار
  if [[ -f "$EXPECTED" && -f "$_LIVE_DB" && -f "$REPO/scripts/recovery-034/db-counts.ts" ]]; then
    local exp_ads cur cur_ads
    exp_ads=$(sed -n 's/.*"PropertyRecord":\([0-9]*\).*/\1/p' "$EXPECTED")
    cur=$(bun "$REPO/scripts/recovery-034/db-counts.ts" "$_LIVE_DB" 2>/dev/null | sed -n 's/^PropertyRecord: \([0-9]*\)/\1/p')
    if [[ -n "$exp_ads" && -n "$cur" && "$cur" -lt $((exp_ads * 80 / 100)) ]]; then
      echo "[check] ROLLBACK-DB-DETECTED: آگهی‌ها $cur < ۸۰٪ انتظار $exp_ads"
      verdict="ROLLBACK-DB"
    fi
  fi

  logr check "\"verdict\":\"${verdict:-UNKNOWN}\",\"head\":\"$head\""

  case "${verdict:-UNKNOWN}" in
    HEALTHY)
      refresh_expected_counts
      echo "[check] نتیجه: سالم — شمارش‌های معتبر تازه‌سازی شد"; return 0 ;;
    ROLLBACK*)
      echo "[check] نتیجه: بازگشت تشخیص داده شد — آغاز بازیابی خودکار"
      logr auto-recovery-start "\"verdict\":\"$verdict\""
      if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo "[check] DRY_RUN: اقدام لازم بود اما انجام نشد (طرح: گارد بازیابی از بستهٔ بقا)"; return 2
      fi
      # جلسهٔ ۰۰۵ — گارد خوددرمان (بستهٔ تازه + env + بیلد در صورت نبود + ری‌استارت prod)
      if [[ -f "$REPO/scripts/pn005c/recovery-guard.sh" ]]; then
        bash "$REPO/scripts/pn005c/recovery-guard.sh"
        return $?
      fi
      do_recover; return $? ;;
    *)
      echo "[check] نتیجه: $verdict — هشدار ثبت شد، بازیابی لازم نیست"; return 1 ;;
  esac
}

# ───────────────────────── بازیابی ─────────────────────────
do_recover() {
  local pkg target snap_for_head mirror_head pfile
  # PN-038/۱.۲ — گارد دادهٔ مقدس (شورا-ن۰۶۳): پیش از هر بازیابی، داوری DB.
  # BLOCK یعنی دیتابیس زنده مقدس است — بازیابی کد ادامه می‌یابد اما جایگزینی DB
  # توسط گارد درونی restore.sh / recovery-guard.sh متوقف می‌شود.
  local sacred_pkg_db
  sacred_pkg_db=$(newest_pkg 2>/dev/null)
  if [[ -n "$sacred_pkg_db" ]]; then
    [[ -f "$sacred_pkg_db/db/custom.db" ]] && sacred_pkg_db="$sacred_pkg_db/db/custom.db" || sacred_pkg_db="$sacred_pkg_db/custom.db"
    if [[ -n "$sacred_pkg_db" && -f "$sacred_pkg_db" && -f "$REPO/db/custom.db" ]] && command -v bun >/dev/null 2>&1; then
      if ! bun "$REPO/scripts/recovery/sacred-data-guard.ts" "$sacred_pkg_db" --live "$REPO/db/custom.db" >/dev/null 2>&1; then
        logr sacred-data-guard-block '"where":"auto-recovery.do_recover","pkg":"'"$sacred_pkg_db"'"'
        echo "[recover] گارد مقدس: دیتابیس زنده مقدس است — بازیابی کاد بدون جایگزینی DB ادامه می‌یابد (PN-038/۱.۲)"
      fi
    fi
  fi
  if [[ "$REPO" == "/home/z/my-project" ]]; then
    echo "[recover] اجرای restore.sh روی مخزن زنده…"
    if bash "$REPO/scripts/recovery-034/restore.sh"; then
      logr auto-recovery-ok "\"via\":\"restore.sh\""
      echo "[recover] بازیابی کامل انجام شد"
      return 0
    else
      logr auto-recovery-fail "\"via\":\"restore.sh\""
      echo "[recover] بازیابی ناموفق — گزارش در scripts/recovery-034/restore-log.txt"
      return 1
    fi
  fi
  # شبیه‌سازی/مخزن غیرزنده: فقط زنجیرهٔ git (بدون سرور/DB)
  pkg=$(newest_pkg)
  [[ -n "$pkg" && -f "$pkg/repo.bundle" ]] || { echo "[recover] بستهٔ بقا یافت نشد"; return 1; }
  echo "[recover] بستهٔ تازه: $pkg"
  git -C "$REPO" fetch "$pkg/repo.bundle" refs/heads/main >/dev/null 2>&1 || { echo "[recover] fetch باندل ناموفق"; return 1; }
  target=$(git -C "$REPO" rev-parse FETCH_HEAD)
  git -C "$REPO" merge-base --is-ancestor HEAD "$target" 2>/dev/null || { echo "[recover] HEAD اجداد باندل نیست — بازبینی دستی لازم"; return 1; }
  git -C "$REPO" merge --ff-only FETCH_HEAD >/dev/null 2>&1 || { echo "[recover] ff ناموفق"; return 1; }
  echo "[recover] ff → $(git -C "$REPO" rev-parse --short HEAD)"
  if git -C "$REPO" rev-parse --verify --quiet refs/heads/survival/code >/dev/null 2>&1; then
    mirror_head=$(git -C "$REPO" rev-parse refs/heads/survival/code)
    snap_for_head=$(git -C "$REPO" log --format='%H %s' refs/heads/survival/code \
      | awk -v src="$(git -C "$REPO" rev-parse --short HEAD)" '$2=="survival" && $3=="snapshot" && $4==src {print $1; exit}')
    if [[ -n "$snap_for_head" && "$snap_for_head" != "$mirror_head" ]]; then
      pfile=$(mktemp)
      git -C "$REPO" diff --binary "$snap_for_head" "$mirror_head" > "$pfile"
      if [[ -s "$pfile" ]] && git -C "$REPO" apply --index "$pfile" >/dev/null 2>&1; then
        git -C "$REPO" -c user.name="auto-recovery" -c user.email="recovery@melka.local" \
          commit -q -m "auto-recovery(P6548): بازسازی محتوای پس از باندل — از اسنپ‌شات آینه $(git -C "$REPO" rev-parse --short "$mirror_head")" >/dev/null 2>&1 || true
        echo "[recover] بازسازی محتوای پس از باندل ✓ → $(git -C "$REPO" rev-parse --short HEAD)"
      fi
      rm -f "$pfile"
    fi
  fi
  echo "[recover] بازیابی git کامل شد: $(git -C "$REPO" rev-parse --short HEAD)"
  return 0
}

# ───────────────────────── دیمن ─────────────────────────
do_daemon() {
  logr daemon-start "\"pid\":$$,\"intervalSec\":$INTERVAL_SECONDS"
  echo "[daemon] start pid=$$ interval=${INTERVAL_SECONDS}s"
  while true; do
    do_check || true
    sleep "$INTERVAL_SECONDS"
  done
}

start_daemon() {
  if pgrep -f 'auto-recovery\.sh daemon' >/dev/null 2>&1; then
    echo "OK: دیمن بازیابی از قبل فعال است (pid $(pgrep -f 'auto-recovery\.sh daemon' | head -1))"
    return 0
  fi
  ( setsid nohup bash "$0" daemon >> "$SURV/auto-recovery-daemon.out" 2>&1 </dev/null & )
  sleep 2
  if pgrep -f 'auto-recovery\.sh daemon' >/dev/null 2>&1; then
    echo "OK: دیمن بازیابی ۶ساعته فعال شد (pid $(pgrep -f 'auto-recovery\.sh daemon' | head -1) · PPID=$(ps -o ppid= -p "$(pgrep -f 'auto-recovery\.sh daemon' | head -1)" | tr -d ' '))"
  else
    echo "FAIL: دیمن راه نیفتاد — $SURV/auto-recovery-daemon.out"; return 1
  fi
}

case "${1:-check}" in
  check)       do_check ;;
  daemon)      do_daemon ;;
  recover)     do_recover ;;
  start-daemon) start_daemon ;;
  *) echo "usage: auto-recovery.sh {check|daemon|recover|start-daemon}"; exit 64 ;;
esac
