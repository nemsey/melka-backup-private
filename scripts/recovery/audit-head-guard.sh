#!/usr/bin/env bash
# ============================================================
# audit-head-guard.sh — گارد تازگی بیلد زنده (PN-031-B · جلسهٔ ۰۳۹)
# ------------------------------------------------------------
# درس بازنشانی‌های هفتم و هشتم: درخت گیت سالم ماند اما بیلد زنده
# (.next/standalone از کش پلتفرم) کهنه شد. reset-guard درخت گیت را
# می‌سنجید (HEALTHY دروغین — شاهد upload/.runtime/reset-guard.json)
# و preview-guard فقط هشدار AuditLog می‌داد (بدون توان بیلد/ری‌استارت).
#
# این گارد حلقهٔ بسته است — طبق معماری مصوب جلسهٔ ۰۳۹:
#   ۱) HEAD_git  = git rev-parse HEAD
#   ۲) BUILD_live = GET /api/version → fingerprint.gitSha
#   ۳) ناهم‌خوانی ⇒ بیلد تازه + ری‌استارت + تأیید + شاهد AuditLog
#   ۴) هم‌خوانی ⇒ بی‌صدا (صفر نوشتن تکراری)
#
# دستورها:
#   check   — 0=OK (بیلد=HEAD) · 2=STALE (بیلد کهنه) · 1=خطا
#   rebuild — بیلد + ری‌استارت + تأیید؛ خروجی 0=تأییدشده · 4=قفل‌شده
#             (نرخ‌حد یا پارک/CI) · 5=شکست
#
# Env:
#   REPO_DIR              ریشهٔ مخزن (پیش‌فرض /home/z/my-project)
#   MELK_HEAD_GUARD_PORT  پورت سرور زنده (پیش‌فرض 3000)
#   FORCE_RECOVER=1       دور زدن نرخ‌حد (تست/دريل)
#
# قوانین:
#   • نرخ‌حد ۳۰ دقیقه بین rebuild های خودکار (ضد چرخهٔ مرگ بیلد)
#   • مطیع قانون ۹ پارک اتمی: PARK_ACTIVE/CI_RUNNING ⇒ صرف نظر
#   • صفر auto_execute کسب‌وکاری — فقط بیلد زیرساختی (بند ۲.۴ سند ۰۳۹)
#   • صفر تغییر در دادهٔ مقدس — فقط AuditLog (شاهد) و فایلهای شاهد
#
# شاهدها:
#   upload/.runtime/head-guard.json        — آخرین check/rebuild
#   upload/.runtime/head-guard-last.json    — مهر زمانی نرخ‌حد
#   upload/.runtime/head-guard-last-build.log — خروجی آخرین بیلد
#   upload/.runtime/head-guard.jsonl        — تاریخچهٔ کامل (upload/.runtime)
#   AuditLog(action=HEAD_GUARD_AUTOBUILD)   — شاهد دیتابیسی
# ============================================================
set -uo pipefail

REPO="${REPO_DIR:-/home/z/my-project}"
MODE="${1:-check}"
PORT="${MELK_HEAD_GUARD_PORT:-3000}"
WITNESS="$REPO/upload/.runtime/head-guard.json"
RATE_FILE="$REPO/upload/.runtime/head-guard-last.json"
HIST="$REPO/upload/.runtime/head-guard.jsonl"
BUILD_LOG="$REPO/upload/.runtime/head-guard-last-build.log"
DB="$REPO/db/custom.db"
RATE_LIMIT_SECONDS=$((30 * 60))
RESTART_TIMEOUT_SECONDS=240

mkdir -p "$REPO/upload/.runtime" 2>/dev/null || true

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

witness() { # $1=json — نوشتن شاهد check/rebuild
  printf '%s\n' "$1" > "$WITNESS" 2>/dev/null || true
}

hist() { # $1=json — تاریخچهٔ append-only
  printf '%s\n' "$1" >> "$HIST" 2>/dev/null || true
}

# ── شاهد AuditLog — بهترین-تلاش، هرگز مسیر اصلی را نمی‌شکند ──
audit() { # $1=action $2=detail-json
  [ -f "$DB" ] || return 0
  ACTION="$1" DETAIL="$2" DBP="$DB" python3 - <<'PYEOF' 2>/dev/null || true
import json, os, sqlite3, datetime
try:
    conn = sqlite3.connect(os.environ["DBP"], timeout=5)
    conn.execute(
        "INSERT INTO AuditLog (id, action, actor, detail, createdAt, tenantId) VALUES (?, ?, ?, ?, ?, ?)",
        (
            f"headguard-{int(datetime.datetime.now().timestamp() * 1000)}-{os.getpid()}",
            os.environ["ACTION"],
            "worker:head-guard",
            os.environ["DETAIL"],
            datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "melk-tabriz",
        ),
    )
    conn.commit()
    conn.close()
except Exception:
    pass
PYEOF
}

head_git() { git -C "$REPO" rev-parse HEAD 2>/dev/null || echo ""; }

live_version() { # خروجی: <gitSha-full> — خالی یعنی سرور در دسترس نیست
  curl -s -m 10 "http://127.0.0.1:${PORT}/api/version" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fingerprint',{}).get('gitSha') or d.get('gitSha') or '')" 2>/dev/null || echo ""
}

# ══════════════════════════════ check ══════════════════════════════
cmd_check() {
  local head live
  head=$(head_git)
  if [ -z "$head" ]; then
    witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"ERROR\",\"reason\":\"no-git-head\",\"exit\":1}"
    echo "ERROR no-git-head"
    return 1
  fi
  live=$(live_version)
  if [ -z "$live" ]; then
    # سرور در دسترس نیست — عهدهٔ watchdog است، نه این گارد؛ خطا بدون rebuild
    witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"ERROR\",\"reason\":\"server-unreachable\",\"head\":\"$head\",\"exit\":1}"
    echo "ERROR server-unreachable"
    return 1
  fi
  if [ "$live" = "$head" ]; then
    # بی‌صدا طبق معماری مصوب — شاهد فقط هنگام تغییر وضعیت بازنویسی می‌شود
    if ! grep -q '"verdict": *"OK"' "$WITNESS" 2>/dev/null; then
      witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"OK\",\"head\":\"$head\",\"live\":\"$live\",\"exit\":0}"
    fi
    echo "OK build-equals-head"
    return 0
  fi
  witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"STALE\",\"head\":\"$head\",\"live\":\"$live\",\"reason\":\"live-build-behind-head\",\"exit\":2}"
  echo "STALE live=$live head=$head"
  return 2
}

# ══════════════════════════════ rebuild ══════════════════════════════
cmd_rebuild() {
  local head live_before
  head=$(head_git)
  live_before=$(live_version)

  # ۱) نرخ‌حد — ضد چرخهٔ مرگ بیلد (درس ENOSPC/بیلدهای پی‌درپی)
  if [ "${FORCE_RECOVER:-0}" != "1" ] && [ -f "$RATE_FILE" ]; then
    if python3 - "$RATE_FILE" "$RATE_LIMIT_SECONDS" <<'PYEOF' 2>/dev/null
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
    age = (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(d["at"].replace("Z", "+00:00"))).total_seconds()
    raise SystemExit(0 if age < float(sys.argv[2]) else 1)
except Exception:
    raise SystemExit(1)
PYEOF
    then
      witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"RATE-LIMITED\",\"reason\":\"rebuild-window\",\"exit\":4}"
      echo "RATE-LIMITED skip"
      return 4
    fi
  fi

  # ۲) قانون ۹ پارک اتمی — rebuild در پارک/CI ممنوع
  if [ -f "$REPO/upload/.runtime/PARK_ACTIVE" ] || [ -f "$REPO/upload/.runtime/CI_RUNNING" ]; then
    witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"LOCKED\",\"reason\":\"park-or-ci-active\",\"exit\":4}"
    echo "LOCKED park-or-ci"
    return 4
  fi

  echo "{\"at\":\"$(now)\",\"action\":\"auto-rebuild-start\",\"head\":\"$head\",\"liveBefore\":\"$live_before\"}" > "$RATE_FILE" 2>/dev/null || true

  # ۳) بیلد تازه از HEAD (سرور کهنه حین بیلد به کار خود ادامه می‌دهد — الگوی اثبات‌شده)
  if ! (cd "$REPO" && bun run build) > "$BUILD_LOG" 2>&1; then
    witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"BUILD-FAILED\",\"head\":\"$head\",\"exit\":5,\"log\":\"upload/.runtime/head-guard-last-build.log\"}"
    audit "HEAD_GUARD_AUTOBUILD" "{\"at\":\"$(now)\",\"outcome\":\"build-failed\",\"head\":\"$head\"}"
    hist "{\"at\":\"$(now)\",\"action\":\"rebuild\",\"outcome\":\"build-failed\",\"head\":\"$head\"}"
    echo "BUILD-FAILED"
    return 5
  fi

  # ۴) تأیید پیش از ری‌استارت — اثر انگشت بیلد تازه باید HEAD باشد
  local baked
  baked=$(python3 -c "import json; print(json.load(open('$REPO/.next/fingerprint.json')).get('gitSha',''))" 2>/dev/null || echo "")
  if [ -z "$baked" ] || [ "$baked" != "$head" ]; then
    witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"FINGERPRINT-MISMATCH\",\"baked\":\"$baked\",\"head\":\"$head\",\"exit\":5}"
    audit "HEAD_GUARD_AUTOBUILD" "{\"at\":\"$(now)\",\"outcome\":\"fingerprint-mismatch\",\"baked\":\"$baked\",\"head\":\"$head\"}"
    hist "{\"at\":\"$(now)\",\"action\":\"rebuild\",\"outcome\":\"fingerprint-mismatch\",\"head\":\"$head\"}"
    echo "FINGERPRINT-MISMATCH"
    return 5
  fi

  # ۵) ری‌استارت — سرور سپس Worker (فرایندهای تازه کد تازه می‌بارند؛
  #    نگهبان watchdog سرور را تا ~۱۵ ثانیه دوباره بالا می‌آورد و سرورِ
  #    تازه Worker تازه spawn می‌کند — jobs رجیستری تازه بارگذاری می‌شود)
  pkill -f "$REPO/.next/standalone/server.js" 2>/dev/null || true
  sleep 3
  pkill -f "scripts/runtime/worker.ts" 2>/dev/null || true

  # ۶) تأیید نهایی — poll تا BUILD زنده == HEAD
  local live_after="" waited=0
  while [ "$waited" -lt "$RESTART_TIMEOUT_SECONDS" ]; do
    sleep 5
    waited=$((waited + 5))
    live_after=$(live_version)
    if [ -n "$live_after" ] && [ "$live_after" = "$head" ]; then
      witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"VERIFIED\",\"action\":\"auto-rebuild\",\"head\":\"$head\",\"liveBefore\":\"$live_before\",\"liveAfter\":\"$live_after\",\"exit\":0}"
      audit "HEAD_GUARD_AUTOBUILD" "{\"at\":\"$(now)\",\"outcome\":\"rebuild-verified\",\"head\":\"$head\",\"liveBefore\":\"$live_before\",\"liveAfter\":\"$live_after\"}"
      hist "{\"at\":\"$(now)\",\"action\":\"rebuild\",\"outcome\":\"verified\",\"head\":\"$head\",\"liveBefore\":\"$live_before\",\"liveAfter\":\"$live_after\"}"
      echo "VERIFIED build=$head"
      return 0
    fi
  done
  witness "{\"at\":\"$(now)\",\"guard\":\"head-guard (PN-031-B)\",\"verdict\":\"VERIFY-TIMEOUT\",\"head\":\"$head\",\"liveAfter\":\"$live_after\",\"exit\":5}"
  audit "HEAD_GUARD_AUTOBUILD" "{\"at\":\"$(now)\",\"outcome\":\"verify-timeout\",\"head\":\"$head\",\"liveAfter\":\"$live_after\"}"
  hist "{\"at\":\"$(now)\",\"action\":\"rebuild\",\"outcome\":\"verify-timeout\",\"head\":\"$head\"}"
  echo "VERIFY-TIMEOUT"
  return 5
}

case "$MODE" in
  check)   cmd_check ;;
  rebuild) cmd_rebuild ;;
  *) echo "usage: audit-head-guard.sh {check|rebuild}"; exit 64 ;;
esac
