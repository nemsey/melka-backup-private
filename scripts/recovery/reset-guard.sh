#!/usr/bin/env bash
# ============================================================
# reset-guard.sh — گارد بازنشانی پلتفرم (PN-015 · K3)
# ------------------------------------------------------------
# درس بازنشانی هفتم (۱۴۰۵-۰۷-۱۸ ~18:00Z): پلتفرم درخت کاری را به
# اسنپ‌شاتِ خودش برمی‌گرداند (repo.tar) و وارسیِ فقطِ survival/code
# کور می‌شود — چون نخستین چرخهٔ آینهٔ پس از بازنشانی، اسنپ‌شاتِ همین
# درختِ برگشته را روی آینه پوش می‌کند (شاهد زندهٔ ۱۹:۱۶Z: HEALTHY دروغین).
#
# راه‌حل: داوری با «شاخهٔ main آینه» — تبارِ مرجع کد که هرگز عقب
# نمی‌رود. اگر HEAD محلی جدِّ اکیدِ main آینه باشد یعنی درخت برگشته.
#
# دستورها:
#   check   — فقط تشخیص: ۰=HEALTHY · ۲=RESET-DETECTED · ۳=DIVERGED · ۱=خطا
#   recover — تشخیص + بازیابی نرخ‌محدود (fetch → reset --hard → install →
#             build → گارد chunk → ری‌استارت سرور → وارسی مهر)
# Env:
#   REPO_DIR        (پیش‌فرض /home/z/my-project)
#   MIRROR_REMOTE_URL  نشانی ریموت (پیش‌فرض: از credentials.env آینه)
#   FORCE_RECOVER=1  نادیده‌گرفتن نرخ‌حد (تست/دريل)
#   DRILL=1         حالت دریل: بازیابی گیت کامل، build/restart صرفاً طرح
# لاگ: upload/.survival/recovery-log.jsonl · شاهد: upload/.runtime/reset-guard.json
# ============================================================
set -uo pipefail

REPO="${REPO_DIR:-/home/z/my-project}"
MODE="${1:-check}"
CRED="$REPO/upload/.mirror/credentials.env"
RATE_FILE="$REPO/upload/.runtime/reset-guard-last.json"
WITNESS="$REPO/upload/.runtime/reset-guard.json"
SURV="$REPO/upload/.survival"
LOGR="$SURV/recovery-log.jsonl"
RATE_LIMIT_SECONDS=$((30 * 60))

mkdir -p "$REPO/upload/.runtime" 2>/dev/null || true
mkdir -p "$SURV" 2>/dev/null || true

logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$LOGR" 2>/dev/null || true; }

remote_url() {
  if [ -n "${MIRROR_REMOTE_URL:-}" ]; then echo "$MIRROR_REMOTE_URL"; return; fi
  [ -f "$CRED" ] && { set -a; . "$CRED"; set +a; echo "${MIRROR_URL_AUTHED:-}"; }
}

# ── تشخیص ──
# PN-031-I (جلسهٔ ۰۵۰ · درس بازگشت دهم): داوری دُکلایه —
#   ۱) درخت گیت در برابر آینه (قبلی)
#   ۲) بیلدِ زنده در برابر HEAD (تازه) — درختِ سالم + بیلدِ کهنه = همان
#      حالتی که ساعت ۰۷:۲۹ بازگشت دهم باقی گذاشت: درخت بازیابی شد اما
#      بیلد شکست خورد و detect بعدی «HEALTHY equal» گفت و بازیابی هرگز
#      ادامه نیافت — سرور ۱۴ ساعت نسخهٔ کهنه سرو کرد. از این پس
#      «درخت سالم + بیلد کهنه» = BUILD-STALE = همان مسیر recover.
live_build_sha() { # خروجی: gitSha کامل بیلد زنده — خالی یعنی سرور در دسترس نیست
  curl -s -m 8 "http://127.0.0.1:${MELK_HEAD_GUARD_PORT:-3000}/api/version" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fingerprint',{}).get('gitSha') or d.get('gitSha') or '')" 2>/dev/null || echo ""
}

detect() {
  local head remote_main live
  head=$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "")
  if [ -z "$head" ]; then echo "ERROR no-HEAD"; return 1; fi
  local url; url=$(remote_url)
  if [ -z "$url" ]; then echo "ERROR no-remote"; return 1; fi
  remote_main=$(timeout 60 git ls-remote "$url" refs/heads/main 2>/dev/null | awk '{print $1}')
  if [ -z "$remote_main" ]; then echo "ERROR ls-remote"; return 1; fi
  if [ "$remote_main" = "$head" ]; then
    # درخت سالم است — اما بیلد زنده؟ (حفرهٔ بازگشت دهم)
    live=$(live_build_sha)
    if [ -n "$live" ]; then
      if [ "$live" = "$head" ]; then echo "HEALTHY equal"; return 0; fi
      echo "BUILD-STALE live=$live head=$head"; return 2
    fi
    # سرور در دسترس نیست — عهدهٔ watchdog است، نه این گارد
    echo "HEALTHY equal (server-unreachable)"; return 0
  fi
  # آیا main آینه به‌طور محلی موجود است؟ (اگر نه، بگیر)
  if ! git -C "$REPO" cat-file -e "$remote_main^{commit}" 2>/dev/null; then
    timeout 120 git -C "$REPO" fetch "$url" refs/heads/main:refs/heads/reset-guard-mirror-main >/dev/null 2>&1 || true
  fi
  if git -C "$REPO" cat-file -e "$remote_main^{commit}" 2>/dev/null; then
    if git -C "$REPO" merge-base --is-ancestor "$head" "$remote_main" 2>/dev/null; then
      # درخت عقب است — و بیلد زنده هم قطعاً عقب/کهنه است (reset کامل لازم)
      echo "RESET-DETECTED behind"; return 2
    fi
    if git -C "$REPO" merge-base --is-ancestor "$remote_main" "$head" 2>/dev/null; then
      # درخت جلو است (کار تازه کامیت‌نشده روی آینه) — اما اگر بیلد زنده هم عقب
      # باشد باز هم BUILD-STALE است (بیلد باید به HEAD برسد)
      live=$(live_build_sha)
      if [ -n "$live" ] && [ "$live" != "$head" ]; then
        echo "BUILD-STALE live=$live head=$head (ahead-of-mirror)"; return 2
      fi
      echo "HEALTHY ahead"; return 0
    fi
    echo "DIVERGED"; return 3
  fi
  # شاخهٔ main آینه محلی نیست و fetch نشد — محافظه‌کارانه: خطا
  echo "ERROR fetch-main"; return 1
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

write_state() { # $1=kind $2=verdict $3=head $4=remote $5=action $6=message
  python3 - "$WITNESS" "$1" "$2" "$3" "$4" "$5" "$6" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
w, kind, verdict, head, remote, action, message = sys.argv[1:8]
json.dump({
  "at": datetime.datetime.utcnow().isoformat() + "Z",
  "guard": "platform-reset-guard (PN-015/K3)",
  "kind": kind, "verdict": verdict,
  "localHead": head, "mirrorMain": remote,
  "action": action, "message": message,
}, open(w, "w"), ensure_ascii=False, indent=2)
PYEOF
}

# ── اجرا ──
VERDICT_LINE=""; DETECT_CODE=0
detect > /tmp/pn015-reset-guard-detect.txt 2>&1 || DETECT_CODE=$?
VERDICT_LINE="$(cat /tmp/pn015-reset-guard-detect.txt)"
HEAD_SHA=$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "?")
REMOTE_SHA=$(remote_url | head -c 0; timeout 60 git ls-remote "$(remote_url)" refs/heads/main 2>/dev/null | awk '{print $1}')
REMOTE_SHA="${REMOTE_SHA:-?}"

case "$MODE" in
  check)
    echo "[reset-guard] $VERDICT_LINE"
    write_state check "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "none" "وارسی دوره‌ای"
    case "$DETECT_CODE" in
      0) exit 0 ;;
      2) logr reset-guard-alert "\"verdict\":\"$VERDICT_LINE\",\"head\":\"$HEAD_SHA\",\"mirrorMain\":\"$REMOTE_SHA\""; exit 2 ;;
      *) logr reset-guard-error "\"line\":\"$VERDICT_LINE\""; exit "$DETECT_CODE" ;;
    esac
    ;;
  recover)
    if [ "$DETECT_CODE" -ne 2 ]; then
      echo "[reset-guard] recover فراخوانی شد اما تشخیص: $VERDICT_LINE — اقدامی لازم نیست"
      write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "no-op" "تشخیص بازیابی را تأیید نکرد"
      exit 0
    fi
    echo "[reset-guard] RESET-DETECTED — درخت به عقب برگشته (HEAD=$HEAD_SHA · آینه main=$REMOTE_SHA)"
    if rate_limited; then
      echo "[reset-guard] نرخ‌حد بازیابی (۳۰ دقیقه) — این رد صرفاً ثبت شد؛ چرخهٔ بعد دوباره می‌کوشد"
      write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "rate-limited" "بازیابی اخیراً انجام شده — صبر تا پنجرهٔ بعدی"
      logr reset-guard-rate-limited "\"head\":\"$HEAD_SHA\""
      exit 4
    fi
    date -u +%Y-%m-%dT%H:%M:%SZ > /dev/null
    python3 -c "import json,datetime; json.dump({'at': datetime.datetime.utcnow().isoformat()+'Z'}, open('$RATE_FILE','w'))" 2>/dev/null || true
    # ۱) بازگرداندن درخت از آینه — دکترین: کد کامیت‌نشده = کد گم‌شده (آینه هر ۵ دقیقه پوش می‌کند)
    (cd "$REPO" && timeout 180 git fetch "$(remote_url)" refs/heads/main:refs/heads/reset-guard-mirror-main >/dev/null 2>&1 \
      && git reset --hard "$REMOTE_SHA") >> /tmp/pn015-reset-guard-recover.log 2>&1
    if [ "$(git -C "$REPO" rev-parse HEAD 2>/dev/null)" != "$REMOTE_SHA" ]; then
      echo "[reset-guard] شکست بازگرداندن درخت — دسترسی دستی لازم"; write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "git-failed" "reset --hard ناکام"
      logr reset-guard-failed "\"stage\":\"git\",\"head\":\"$HEAD_SHA\",\"target\":\"$REMOTE_SHA\""
      exit 5
    fi
    echo "[reset-guard] درخت بازگشت → $REMOTE_SHA"
    if [ "${DRILL:-0}" = "1" ]; then
      echo "[reset-guard] DRILL: بازیابی گیت کامل شد؛ build/restart صرفاً طرح (در تولید انجام می‌شود)"
      write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "drill-git-recovered" "دریل: بازیابی کامل گیت بدون build"
      logr reset-guard-recovered "\"mode\":\"drill\",\"from\":\"$HEAD_SHA\",\"to\":\"$REMOTE_SHA\""
      exit 0
    fi
    # ۲) وابستگی‌ها + بیلد تازه — خروجی به فایل؛ هرگز از طریق head لوله نمی‌شود (درس PN-014)
    (cd "$REPO" && bun install --frozen-lockfile && bun run build) >> /tmp/pn015-reset-guard-recover.log 2>&1 || {
      echo "[reset-guard] build شکست خورد — سرور با بیلد قبلی ادامه می‌دهد؛ لاگ: /tmp/pn015-reset-guard-recover.log"
      write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "build-failed" "بیلد ناکام — شاهد لاگ"
      logr reset-guard-failed "\"stage\":\"build\",\"to\":\"$REMOTE_SHA\""
      exit 6
    }
    # ۳) گارد یکپارچگی chunk پیش از ری‌استارت (K1)
    if [ -x "$REPO/scripts/audit-chunk-integrity.sh" ]; then
      bash "$REPO/scripts/audit-chunk-integrity.sh" --root "$REPO" >> /tmp/pn015-reset-guard-recover.log 2>&1 || {
        echo "[reset-guard] بیلد تازه هم ناقص است — ری‌استارت انجام نمی‌شود"
        write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "chunk-failed" "یکپارچگی chunk ناکام پس از بیلد"
        logr reset-guard-failed "\"stage\":\"chunk\",\"to\":\"$REMOTE_SHA\""
        exit 7
      }
    fi
    # ۴) ری‌استارت تمیز سرور: کشتن سرور → نگهبان با بیلد تازه بالا می‌آورد
    pkill -f "standalone/server.js" 2>/dev/null || true
    # PN-031-I (جلسهٔ ۰۵۰ · درس بازگشت دهم): Worker قدیمی هم تازه می‌شود —
    # Workerِ بوت‌شده از درختِ بازگشته، رجیستری کارهای قدیمی (بدون head-guard)
    # در حافظه داشت و تا ری‌بوت بعدی تازه نمی‌شد. سرور تازه Worker تازه spawn
    # می‌کند (supervisor) → رجیستری از درختِ بازیابی‌شده بارگذاری می‌شود.
    sleep 2
    pkill -f "scripts/runtime/worker.ts" 2>/dev/null || true
    # ۵) وارسی مهر تازه (تا ۹۰ ثانیه)
    for _ in $(seq 1 45); do
      V=$(curl -s --max-time 3 http://localhost:3000/api/version 2>/dev/null | sed -n 's/.*"gitSha":"\([^"]*\)".*/\1/p')
      if [ -n "$V" ] && [ "$V" = "$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo x)" ]; then
        echo "[reset-guard] بازیابی کامل: سرور روی HEAD تازه است ($(git -C "$REPO" rev-parse --short HEAD))"
        write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "recovered" "بازگردانی درخت + بیلد + ری‌استارت + مهر یکسان"
        logr reset-guard-recovered "\"mode\":\"auto\",\"from\":\"$HEAD_SHA\",\"to\":\"$REMOTE_SHA\""
        exit 0
      fi
      sleep 2
    done
    echo "[reset-guard] سرور پس از ۹۰ ثانیه مهر تازه نداد — وارسی دستی"
    write_state recover "$VERDICT_LINE" "$HEAD_SHA" "$REMOTE_SHA" "restart-unverified" "مهر تازه تأیید نشد"
    logr reset-guard-partial "\"from\":\"$HEAD_SHA\",\"to\":\"$REMOTE_SHA\",\"stage\":\"verify\""
    exit 8
    ;;
  *) echo "کاربرد: reset-guard.sh [check|recover]"; exit 2 ;;
esac
