#!/usr/bin/env bash
# ============================================================
# github-supreme-guard.sh — سپر عالی گیت‌هاب (PN-040 · گام ۴)
# ------------------------------------------------------------
# شورای عالی ملکا (جلسهٔ ۰۶۶ · ملکا-شورا-ن۰۶۶-۱۴۰۵ · دستور جامع PN-040):
#   «گام ۴ — ساخت سپر دفاعی گیت‌هاب: پس از هر ریست، سرور را مجبور
#    می‌کند از گیت‌هاب (که همیشه آخرین نسخه است) کد بگیرد و سریع
#    بالا بیاید.»
#
# مرجع کانونی: GitHub — شاخهٔ origin/main (قانون ۰۳۱: پوش فوری آینه پس
# از هر کامیت ⇒ origin/main همیشه آخرین نسخهٔ سالم است).
#
# دو-لایهٔ تشخیص (بستن هر دو حفرهٔ تاریخی):
#   الف) DRIFT — HEAD محلی ≠ origin/main (بازنشانیِ repo.tar پلتفرم):
#      درخت به عقب برگشته ⇒ بازیابی از origin/main.
#   ب) MIRROR-ROLLBACK — حفرهٔ K3 (درس بازنشانی هفتم): چرخهٔ آینهٔ پس از
#      بازنشانی، درختِ برگشته را روی GitHub پوش می‌کند و «آینه = مرجع»
#      سلامتِ دروغین می‌گوید. داور مستقل: شاخهٔ survival/code — اسنپ‌شات‌های
#      بقای کامل. اگر origin/main، کدِ سالمِ ثبت‌شده در جدیدترین اسنپ‌شات را
#      در تبار خود نداشته باشد ⇒ آینه هم برگشته ⇒ بازیابی از sha ثبت‌شده.
#
#   + BUILD-STALE — درخت سالم اما بیلدِ سروشده کهنه (حفرهٔ بازگشت دهم):
#     live build sha ≠ HEAD ⇒ ری‌بیلد.
#
# بازیابی (recover): git fetch origin → checkout -B main <هدف> →
#   bun install → bun run build → ری‌استارت سرور (نگهبان خودش ۵ث بعد
#   از بیلدِ تازه بالا می‌آورد؛ اگر نگهبان نیست → دیمن‌سازی PN-040) →
#   وارسی مهر /api/version → پوش باز-هم‌ترازی (فقط در حالت rollback).
#
# دستورها:
#   check   — فقط تشخیص: 0=HEALTHY · 2=DRIFT/ROLLBACK/BUILD-STALE · 1=ERROR
#   recover — تشخیص + بازیابی نرخ‌محدود (۳۰ دقیقه)
# Env:
#   REPO_DIR (پیش‌فرض /home/z/my-project)
#   ORIGIN_URL (پیش‌فرض: remote origin؛ نبود → credentials.env آینه)
#   FORCE_RECOVER=1 · DRILL=1 (بازیابی گیت بدون build/restart)
#   SUPREME_SKIP_SNAPSHOT=1 (غیرفعال‌سازی لایهٔ ب)
# لاگ: upload/.survival/recovery-log.jsonl
# شاهد: upload/.runtime/github-supreme-guard.json
# گارد مقدس: دیتابیس هرگز لمس نمی‌شود (gitignored · قانون شورا-ن۰۶۳) —
#   بازیابی صرفاً کد است؛ پس از هر بازیابی شاهد گارد مقدس هم ثبت می‌شود.
# ============================================================
set -uo pipefail

REPO="${REPO_DIR:-/home/z/my-project}"
MODE="${1:-check}"
CRED="$REPO/upload/.mirror/credentials.env"
RATE_FILE="$REPO/upload/.runtime/github-supreme-guard-last.json"
WITNESS="$REPO/upload/.runtime/github-supreme-guard.json"
SURV="$REPO/upload/.survival"
LOGR="$SURV/recovery-log.jsonl"
RATE_LIMIT_SECONDS=$((30 * 60))

mkdir -p "$REPO/upload/.runtime" 2>/dev/null || true
mkdir -p "$SURV" 2>/dev/null || true

logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$LOGR" 2>/dev/null || true; }

# مرجع گیت‌هاب — اولویت: ORIGIN_URL env → remote origin → credentials.env
origin_url() {
  if [ -n "${ORIGIN_URL:-}" ]; then echo "$ORIGIN_URL"; return; fi
  local u
  u=$(git -C "$REPO" remote get-url origin 2>/dev/null || true)
  [ -n "$u" ] && { echo "$u"; return; }
  [ -f "$CRED" ] && { set -a; . "$CRED"; set +a; echo "${MIRROR_URL_AUTHED:-}"; }
}

# sha بیلدِ زنده از روت /api/version (لایهٔ سوم — حفرهٔ بازگشت دهم)
live_build_sha() {
  curl -s -m 8 "http://127.0.0.1:${MELK_HEAD_GUARD_PORT:-3000}/api/version" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fingerprint',{}).get('gitSha') or d.get('gitSha') or '')" 2>/dev/null || echo ""
}

# sha کدِ سالمِ گم‌شده از اسنپ‌شات‌های بقا (داور مستقل K3 · چند‌اسنپ‌شاتی)
# ────────────────────────────────────────────────────────────────────────────
# درس کاستی تیپ‌تنها: اسنپ‌شاتِ تازه ممکن است خودش از درختِ برگشته گرفته شده
# باشد (چرخهٔ آینهٔ پس از بازنشانی، تیپ را با sha کهنه ثبت می‌کند — شاهد
# 0d5ab7a امروز). راه‌حل: ۸ اسنپ‌شات آخر را از تازه به کهنه می‌پیماییم؛
# نخستین sha ثبت‌شده که در تبارِ origin/main نیست = کدِ سالمِ گم‌شده.
# خروجی: sha کامل (خالی = اسنپ‌شات گواهِ گم‌شدگی ندارد)
snapshot_lost_sha() {
  [ "${SUPREME_SKIP_SNAPSHOT:-0}" = "1" ] && return 0
  local subjects sha full
  subjects=$(git -C "$REPO" log survival/code --format=%s -n 8 2>/dev/null || true)
  [ -z "$subjects" ] && return 0
  while IFS= read -r subject; do
    sha=$(printf '%s' "$subject" | sed -n 's/^survival snapshot \([0-9a-f]\{7,40\}\) .*/\1/p')
    [ -z "$sha" ] && continue
    full=$(git -C "$REPO" rev-parse --verify "$sha^{commit}" 2>/dev/null || true)
    [ -z "$full" ] && continue
    # هنوز در آینه هست؟ (نبودش = گم‌شده → همین را برگردان)
    if ! git -C "$REPO" merge-base --is-ancestor "$full" "$ORIGIN_MAIN_SHA" 2>/dev/null; then
      echo "$full"
      return 0
    fi
  done <<< "$subjects"
}

rate_limited() {
  [ "${FORCE_RECOVER:-0}" = "1" ] && return 1
  [ -f "$RATE_FILE" ] || return 1
  python3 - "$RATE_FILE" "$RATE_LIMIT_SECONDS" <<'PYEOF' 2>/dev/null || return 1
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
    age = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(d["at"].replace("Z", "+00:00")).replace(tzinfo=None)).total_seconds()
    sys.exit(0 if age < float(sys.argv[2]) else 1)
except Exception:
    sys.exit(1)
PYEOF
}

write_state() { # $1=verdict $2=head $3=originMain $4=snapshotSha $5=action $6=message
  python3 - "$WITNESS" "$1" "$2" "$3" "$4" "$5" "$6" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
w, verdict, head, origin_main, snap, action, message = sys.argv[1:8]
json.dump({
  "at": datetime.datetime.utcnow().isoformat() + "Z",
  "guard": "github-supreme-guard (PN-040/گام-۴)",
  "verdict": verdict,
  "localHead": head, "originMain": origin_main, "snapshotLostSha": snap,
  "action": action, "message": message,
}, open(w, "w"), ensure_ascii=False, indent=2)
PYEOF
}

# ── تشخیص ──
# خروجی: HEALTHY|DRIFT-behind|MIRROR-ROLLBACK|BUILD-STALE|ERROR-*
# کد:      0=HEALTHY · 2=بازیابی لازم · 1=خطا
detect() {
  local head url origin_main snap_sha live target
  head=$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "")
  [ -z "$head" ] && { echo "ERROR no-HEAD"; return 1; }
  url=$(origin_url)
  [ -z "$url" ] && { echo "ERROR no-origin-url"; return 1; }
  origin_main=$(timeout 60 git ls-remote "$url" refs/heads/main 2>/dev/null | awk '{print $1}')
  [ -z "$origin_main" ] && { echo "ERROR ls-remote (GitHub قطع؟ — قانون ۱۱: سرو از نسخهٔ محلی)"; return 1; }

  # اگر کامیتِ origin/main محلی موجود نیست، بگیر
  git -C "$REPO" cat-file -e "$origin_main^{commit}" 2>/dev/null || \
    timeout 120 git -C "$REPO" fetch "$url" refs/heads/main 2>/dev/null >/dev/null

  snap_sha=""
  ORIGIN_MAIN_SHA="$origin_main"
  snap_sha=$(snapshot_lost_sha)

  # ── لایهٔ ب: داور مستقل K3 — آینه خودش برگشته؟ (کدِ سالم در اسنپ‌شات‌ها هست اما در origin/main نیست) ──
  if [ -n "$snap_sha" ]; then
    echo "MIRROR-ROLLBACK lost=$snap_sha originMain=$origin_main"
    return 2
  fi

  # ── لایهٔ الف: درخت محلی در برابر origin/main ──
  if [ "$origin_main" != "$head" ]; then
    if git -C "$REPO" merge-base --is-ancestor "$head" "$origin_main" 2>/dev/null; then
      echo "DRIFT-behind originMain=$origin_main"; return 2
    fi
    echo "ERROR diverged (main محلی جلو/واگرا — پوش ۰۳۱ لازم)"; return 1
  fi

  # ── لایهٔ سوم: بیلد زنده در برابر HEAD (حفرهٔ بازگشت دهم) ──
  live=$(live_build_sha)
  if [ -n "$live" ] && [ "$live" != "$head" ]; then
    echo "BUILD-STALE live=$live head=$head"; return 2
  fi
  echo "HEALTHY"; return 0
}

# ── بازیابی: هدف = origin_main یا sha اسنپ‌شات (در حالت rollback) ──
recover_to() { # $1=target_sha $2=reason
  local target="$1" reason="$2"
  echo "[supreme-guard] بازیابی به $target ($reason)"
  if [ "${DRILL:-0}" = "1" ]; then
    echo "[supreme-guard] DRILL: بازیابی گیت صرفاً طرح — بدون install/build/restart"
    write_state "DRILL-$reason" "$(git -C "$REPO" rev-parse HEAD 2>/dev/null)" "$target" "" "drill" "دریل بدون اقدام"
    return 0
  fi
  # ۱) درخت — checkout -B main <هدف> (main به کد سالم می‌چسبد؛ تاریخچه واگرای ریست در reflog می‌ماند)
  if ! (cd "$REPO" && git checkout -q -B main "$target" 2>/dev/null); then
    echo "[supreme-guard] شکست checkout — دسترسی دستی لازم"
    write_state "RECOVER-FAILED" "$(git -C "$REPO" rev-parse HEAD 2>/dev/null)" "$target" "" "checkout-failed" "git checkout -B main ناکام"
    logr supreme-guard-failed '"stage":"checkout"'
    return 5
  fi
  echo "[supreme-guard] درخت → $(git -C "$REPO" rev-parse --short HEAD)"
  # ۲) گارد مقدس — شاهد وضعیت DB پس از بازیابی کد (DB هرگز جایگزین نمی‌شود؛ gitignored)
  if [[ -f "$REPO/db/custom.db" ]] && command -v bun >/dev/null 2>&1; then
    local _pkg_db=""
    for _d in $(ls -d "$REPO"/upload/.survival/P*/ 2>/dev/null | sort -V | tail -1); do
      [[ -f "${_d%/}/db/custom.db" ]] && _pkg_db="${_d%/}/db/custom.db"
    done
    if [[ -n "$_pkg_db" ]]; then
      bun "$REPO/scripts/recovery/sacred-data-guard.ts" "$_pkg_db" --live "$REPO/db/custom.db" >/dev/null 2>&1 || true
    fi
  fi
  # ۳-الف) توقف تمیز پیش از بیلد — درس OOM جلسهٔ ۰۶۶ (۱۴۰۵/۰۷/۲۸):
  #        سرورِ زندهٔ رم‌گرفته (تا ۱.۲GB پس از ساعت‌ها سینک رله) + بیلدِ
  #        سقف ۳GB = کشته‌شدن بیلد با OOM-137. در بازیابی، سرورِ کهنه را
  #        زودتر بخوابانیم: فلگ توقف نگهبان + خاتمه سرور + انتظار خروج
  #        نگهبان (حلقه در چرخهٔ بعد فلگ را می‌بیند و بدون ری‌اسپاون
  #        خارج می‌شود) → رم آزاد → بیلد سبز → بوت تازه.
  local _wd_pid _k
  touch "$REPO/.prod-stop" 2>/dev/null || true
  pkill -f "standalone/server.js" 2>/dev/null || true
  for _k in $(seq 1 10); do
    sleep 2
    pgrep -f "standalone/server.js" >/dev/null 2>&1 || break
  done
  for _k in $(seq 1 5); do
    pgrep -f "prod-watchdog.sh" >/dev/null 2>&1 || break
    sleep 2
  done
  echo "[supreme-guard] سرور کهنه خاتمه یافت — رم آزاد برای بیلد (درس OOM)"
  # ۳-ب) وابستگی‌ها + بیلد (خروجی به فایل — درس PN-014: هرگز لوله به head نکن)
  (cd "$REPO" && bun install && bun run build) >> /tmp/pn040-supreme-recover.log 2>&1 || {
    echo "[supreme-guard] بیلد ناکام — بوت مجدد نگهبان با بیلد موجود (قانون ۱۱)"
    rm -f "$REPO/.prod-stop" 2>/dev/null || true
    pgrep -f "prod-watchdog.sh" >/dev/null 2>&1 || (cd "$REPO" && python3 scripts/pn040/daemonize-watchdog.py >/dev/null 2>&1)
    write_state "RECOVER-FAILED" "$(git -C "$REPO" rev-parse HEAD)" "$target" "" "build-failed" "بیلد شکست خورد — سرور با بیلد موجود ادامه"
    logr supreme-guard-failed '"stage":"build"'
    return 6
  }
  # ۴) بوت تازه — دیمن‌سازی PN-040 (دو-فورکی — درس مرز reap ابزار)
  rm -f "$REPO/.prod-stop" 2>/dev/null || true
  if pgrep -f "prod-watchdog.sh" >/dev/null 2>&1; then
    # نگهبان هنوز زنده (فلگ را در چرخهٔ بعد می‌بیند و خروج) — بیدارش کن:
    pkill -f "prod-watchdog.sh" 2>/dev/null || true; sleep 2
  fi
  (cd "$REPO" && python3 scripts/pn040/daemonize-watchdog.py >/dev/null 2>&1) \
    && echo "[supreme-guard] نگهبان تازه دیمن‌سازی شد — سرور از بیلد تازه بالا می‌آید"
  # ۵) وارسی مهر — تا ۶۰ث فرصت (نگهبان ۵ث + بوت سرور)
  local live="" i
  for i in $(seq 1 12); do
    sleep 5
    live=$(live_build_sha)
    [ -n "$live" ] && [ "$live" = "$target" ] && break
  done
  if [ "$live" = "$target" ]; then
    echo "[supreme-guard] ✅ مهر زنده = هدف ($live)"
    write_state "RECOVERED" "$live" "$target" "" "rebuild+restart" "سرور روی کد سالم گیت‌هاب بالا آمد"
    logr supreme-guard-recovered "\"to\":\"$target\",\"reason\":\"$reason\",\"live\":\"$live\""
    # ۶) باز-هم‌ترازی آینه در حالت rollback (K3 — آینه را به کد سالم برگردان)
    if [ "$reason" = "mirror-rollback" ]; then
      (cd "$REPO" && timeout 90 git push --force-with-lease origin main 2>/dev/null >/dev/null) \
        && echo "[supreme-guard] آینه باز-هم‌ترازی شد (force-with-lease)" \
        || echo "[supreme-guard] پوش باز-هم‌ترازی ناکام — قانون ۱۱: سرو محلی ادامه دارد"
    fi
    return 0
  fi
  echo "[supreme-guard] مهر زنده تأیید نشد (live=${live:-none}) — نگهبان در چرخهٔ خود می‌کوشد"
  write_state "RECOVERED-UNVERIFIED" "${live:-none}" "$target" "" "rebuild+restart-unverified" "مهر در مهلت وارسی نشد — چرخهٔ بعدی دوباره"
  logr supreme-guard-unverified "\"to\":\"$target\",\"live\":\"${live:-none}\""
  return 7
}

# ── اجرا ──
VERDICT=""; CODE=0
detect > /tmp/pn040-supreme-detect.txt 2>&1 || CODE=$?
VERDICT="$(cat /tmp/pn040-supreme-detect.txt)"
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "?")
ORIGIN_SHA=$(timeout 60 git ls-remote "$(origin_url)" refs/heads/main 2>/dev/null | awk '{print $1}')
ORIGIN_SHA="${ORIGIN_SHA:-?}"
ORIGIN_MAIN_SHA="$ORIGIN_SHA"
SNAP_SHA=$(snapshot_lost_sha)

case "$MODE" in
  check)
    echo "[supreme-guard] $VERDICT"
    write_state "$VERDICT" "$HEAD_SHA" "$ORIGIN_SHA" "${SNAP_SHA:-}" "none" "وارسی دوره‌ای"
    case "$CODE" in 0) exit 0 ;; 2) logr supreme-guard-alert "\"verdict\":\"$VERDICT\""; exit 2 ;; *) logr supreme-guard-error "\"line\":\"$VERDICT\""; exit 1 ;; esac
    ;;
  recover)
    if [ "$CODE" -ne 2 ]; then
      echo "[supreme-guard] recover فراخوانی شد اما تشخیص: $VERDICT — اقدامی لازم نیست"
      write_state "$VERDICT" "$HEAD_SHA" "$ORIGIN_SHA" "${SNAP_SHA:-}" "no-op" "تشخیص بازیابی را تأیید نکرد"
      exit 0
    fi
    if rate_limited; then
      echo "[supreme-guard] نرخ‌حد ۳۰ دقیقه — رد ثبت شد؛ چرخهٔ بعد دوباره"
      write_state "$VERDICT" "$HEAD_SHA" "$ORIGIN_SHA" "${SNAP_SHA:-}" "rate-limited" "پنجرهٔ بازیابی باز نیست"
      logr supreme-guard-rate-limited "\"verdict\":\"$VERDICT\""
      exit 4
    fi
    python3 -c "import json,datetime; json.dump({'at': datetime.datetime.utcnow().isoformat()+'Z'}, open('$RATE_FILE','w'))" 2>/dev/null || true
    TARGET="$ORIGIN_SHA"
    REASON="drift"
    case "$VERDICT" in
      MIRROR-ROLLBACK*) TARGET=$(git -C "$REPO" rev-parse --verify "${SNAP_SHA}^{commit}" 2>/dev/null || echo "$SNAP_SHA"); REASON="mirror-rollback" ;;
      BUILD-STALE*) TARGET="$HEAD_SHA"; REASON="build-stale" ;;
    esac
    recover_to "$TARGET" "$REASON"
    exit $?
    ;;
  *)
    echo "استفاده: $0 {check|recover}"; exit 1
    ;;
esac
