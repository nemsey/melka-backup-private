#!/usr/bin/env bash
# ============================================================
# db-fortress-guard.sh — گارد قلعهٔ داده (PN-041 · فاز ۵ · شورا-ن۰۶۷)
# ------------------------------------------------------------
# لایه‌های بازیابی دیتابیس زنده (اولویت):
#   ۱) upload/.data/custom.db      — قلعه (منطقهٔ پایدار · لایهٔ ۱)
#   ۲) upload/.data/rolling/*.db   — چرخشی ۵دقیقه‌ای (لایهٔ ۲)
#   ۳) db/custom.db                — کپیِ pre-stop در منطقهٔ ریست (تازه‌تر از بقا)
#   ۴) upload/.survival/P*/        — بسته‌های بقا (لایهٔ ۳)
#   ۵) GitHub Release              — ابر (لایهٔ ۴ · آخرین پناه)
#
# منطق داوری:
#   · قلعه سالم ⇒ صفر مداخله (فقط هم‌ترازی env)
#   · قلعه غایب/معیوب ⇒ بهترین نامزدِ «سالمِ پرتر» (داور: شمارش رکورد
#     PropertyRecord + integrity_check) از میان همهٔ لایه‌ها
#   · گارد دادهٔ مقدس (PN-038): اگر قلعهٔ موجود پرتر از نامزد است ⇒ BLOCK
#     (جایگزینی ممنوع — همان قانون شورا-ن۰۶۳)
#   · اعمال: VACUUM INTO اتمی (فایل تمیز تازه) + WAL + هم‌ترازی env
#   · فایل معیوب قلعه هرگز حذف نمی‌شود — با مهر .broken-{ts} نگه داشته می‌شود
#
# دستورها:
#   check   — فقط داوری: 0=HEALTHY · 2=FORTRESS-MISSING/BROKEN · 1=ERROR
#   recover — داوری + بازیابی نرخ‌محدود (۱۰ دقیقه)
# Env:
#   REPO_DIR (پیش‌فرض /home/z/my-project) · FORCE_FORTRESS=1 (نادیده‌گیری نرخ‌حد)
#   FORTRESS_SKIP_CLOUD=1 (غیرفعال‌سازی لایهٔ ۵)
# شاهد: upload/.runtime/db-fortress-guard.json
# لاگ: upload/.survival/recovery-log.jsonl
# ============================================================
set -uo pipefail

REPO="${REPO_DIR:-/home/z/my-project}"
MODE="${1:-check}"
FORTRESS="$REPO/upload/.data/custom.db"
ROLLING_DIR="$REPO/upload/.data/rolling"
SACRED_DIR="$REPO/upload/.data/sacred"
LEGACY="$REPO/db/custom.db"
WITNESS="$REPO/upload/.runtime/db-fortress-guard.json"
RATE_FILE="$REPO/upload/.runtime/db-fortress-guard-last.json"
LOGR="$REPO/upload/.survival/recovery-log.jsonl"
RATE_LIMIT_SECONDS=$((10 * 60))
CRED="$REPO/upload/.mirror/credentials.env"
GH_REPO="nemsey/melka-backup-private"

mkdir -p "$REPO/upload/.runtime" "$REPO/upload/.data" 2>/dev/null || true

logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$LOGR" 2>/dev/null || true; }

probe() { # $1=file → خروجی: 0=ok 2=broken 3=missing (JSON روی stdout)
  # ⚠ بدون || true — کد خروجِ پروب قراردادِ داوری است (درس دریل: بلعیدن کد = HEALTHY کاذب)
  bun "$REPO/scripts/pn041/db-probe.ts" "$1" 2>/dev/null
}

probe_field() { # $1=json $2=field
  printf '%s' "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get(sys.argv[1], ''))" "$2" 2>/dev/null || echo ""
}

rate_limited() {
  [ "${FORCE_FORTRESS:-0}" = "1" ] && return 1
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

write_witness() { # $1=verdict $2=action $3=message $4=extra-json
  python3 - "$WITNESS" "$1" "$2" "$3" "${4:-{\}}" <<'PYEOF' 2>/dev/null || true
import json, sys, datetime
w, verdict, action, message, extra = sys.argv[1:6]
try: extra = json.loads(extra)
except Exception: extra = {}
json.dump({
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "guard": "db-fortress-guard (PN-041/۵ · شورا-ن۰۶۷)",
  "verdict": verdict, "action": action, "message": message, **extra,
}, open(w, "w"), ensure_ascii=False, indent=2)
PYEOF
}

# ── داوری قلعه ──
fortress_state() { # خروجی: HEALTHY|MISSING|BROKEN · $2=JSON پروب
  local json rc
  json="$(probe "$FORTRESS")"
  rc=$?
  case $rc in
    0) echo "HEALTHY|$json" ;;
    3) echo "MISSING|$json" ;;
    *) echo "BROKEN|$json" ;;
  esac
}

# ── هم‌ترازی env: env.platform.json + .env به مسیر قلعه ──
align_env() {
  python3 - "$REPO" <<'PYEOF' 2>/dev/null || true
import json, sys, os
repo = sys.argv[1]
url = "file:" + os.path.join(repo, "upload/.data/custom.db")
# env.platform.json — فقط اگر مسیر قدیمی/متفاوت است
try:
    p = os.path.join(repo, "env.platform.json")
    d = json.load(open(p))
    if d.get("DATABASE_URL") != url:
        d["DATABASE_URL"] = url
        d["_pn041"] = "شورا-ن۰۶۷: دیتابیس زنده در منطقهٔ پایدار upload/.data — هم‌ترازی خودکار توسط گارد قلعه"
        json.dump(d, open(p, "w"), indent=2, ensure_ascii=False)
except Exception:
    pass
# .env (هدف Prisma CLI) — پلتفرم در هر بوت با مسیر قدیمی بازنویسی‌اش می‌کند
try:
    open(os.path.join(repo, ".env"), "w").write(f"DATABASE_URL={url}\n")
except Exception:
    pass
PYEOF
}

# ── جمع‌آوری نامزدها (ترتیب اولویت) ──
candidates() {
  # چرخشی (تازه‌ترین اول) — لایهٔ ۲
  ls -t "$ROLLING_DIR"/live-*.db 2>/dev/null | head -5 || true
  # مقدس پایدار — لایهٔ ۲.۵ (هر ۱۵ دقیقه)
  ls -t "$SACRED_DIR"/sacred-*.db 2>/dev/null | head -3 || true
  # کپی pre-stop منطقهٔ ریست — تازه‌تر از بقا (اگر ریست نرم بوده)
  [ -f "$LEGACY" ] && echo "$LEGACY"
  # بسته‌های بقا — لایهٔ ۳ (جدی‌ترین اول)
  for d in $(ls -d "$REPO"/upload/.survival/P*/ 2>/dev/null | sort -Vr | head -3); do
    [ -f "${d%/}/db/custom.db" ] && echo "${d%/}/db/custom.db"
    [ -f "${d%/}/custom.db" ] && echo "${d%/}/custom.db"
  done
}

# ── بهترین نامزد: سالم + بیشترین شمارش رکورد ──
best_candidate() { # خروجی: path|count (خالی = هیچ نامزد سالم)
  local best="" best_count=-1
  while IFS= read -r cand; do
    [ -z "$cand" ] && continue
    local json count integrity
    json="$(probe "$cand")" || true
    integrity="$(probe_field "$json" integrity)"
    count="$(printf '%s' "$json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('counts',{}).get('PropertyRecord',-1))" 2>/dev/null || echo -1)"
    if [ "$integrity" = "ok" ] && [ "$count" -gt "$best_count" ] 2>/dev/null; then
      best="$cand"; best_count=$count
    fi
  done < <(candidates)
  echo "$best|$best_count"
}

# ── لایهٔ ۵: آخرین پناه — GitHub Release ──
cloud_candidate() {
  [ "${FORTRESS_SKIP_CLOUD:-0}" = "1" ] && return 0
  local gh_token=""
  [ -f "$CRED" ] && gh_token="$(grep -o 'https://[^:@]*:\([^@]*\)@' "$CRED" | head -1 | sed 's|https://[^:@]*:\([^@]*\)@|\1|')"
  [ -z "$gh_token" ] && return 0
  local tmp="/tmp/pn041-cloud-$$.db"
  # تازه‌ترین Release از نوع db-*
  local tag asset_url
  tag="$(curl -s -m 20 -H "Authorization: token $gh_token" "https://api.github.com/repos/$GH_REPO/releases?per_page=30" \
    | python3 -c "import json,sys; rs=json.load(sys.stdin); print(next((r['tag_name'] for r in rs if r.get('tag_name','').startswith('db-')), ''))" 2>/dev/null || echo "")"
  [ -z "$tag" ] && return 0
  asset_url="$(curl -s -m 20 -H "Authorization: token $gh_token" "https://api.github.com/repos/$GH_REPO/releases/tags/$tag" \
    | python3 -c "import json,sys; r=json.load(sys.stdin); a=[x for x in r.get('assets',[]) if x['name'].endswith('.gz')]; print(a[0]['url'] if a else '')" 2>/dev/null || echo "")"
  [ -z "$asset_url" ] && return 0
  if curl -sL -m 300 -H "Authorization: token $gh_token" -H "Accept: application/octet-stream" "$asset_url" -o "$tmp.gz" \
     && gunzip -c "$tmp.gz" > "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    rm -f "$tmp.gz"
    echo "$tmp"
  else
    rm -f "$tmp" "$tmp.gz" 2>/dev/null || true
  fi
}

# ═══ اجرا ═══
STATE_OUT="$(fortress_state)"
VERDICT="${STATE_OUT%%|*}"
PROBE_JSON="${STATE_OUT#*|}"

case "$MODE" in
  check)
    case "$VERDICT" in
      HEALTHY)
        echo "[db-fortress] HEALTHY — قلعه سالم است (صفر مداخله)"
        write_witness "HEALTHY" "none" "قلعهٔ داده سالم" "$PROBE_JSON"
        exit 0 ;;
      *)
        echo "[db-fortress] $VERDICT — بازیابی لازم"
        write_witness "$VERDICT" "needed" "قلعه غایب/معیوب" "$PROBE_JSON"
        logr db-fortress-alert "\"verdict\":\"$VERDICT\""
        exit 2 ;;
    esac
    ;;

  recover)
    if [ "$VERDICT" = "HEALTHY" ]; then
      align_env
      echo "[db-fortress] قلعه سالم — صفر مداخله (فقط هم‌ترازی env)"
      write_witness "HEALTHY" "align-env-only" "قلعه سالم؛ env هم‌تراز شد" "$PROBE_JSON"
      exit 0
    fi
    if rate_limited; then
      echo "[db-fortress] نرخ‌حد ۱۰ دقیقه — چرخهٔ بعد دوباره"
      write_witness "$VERDICT" "rate-limited" "پنجرهٔ بازیابی باز نیست"
      logr db-fortress-rate-limited "\"verdict\":\"$VERDICT\""
      exit 4
    fi
    python3 -c "import json,datetime; json.dump({'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, open('$RATE_FILE','w'))" 2>/dev/null || true

    # نامزدهای محلی
    BEST_OUT="$(best_candidate)"
    BEST="${BEST_OUT%%|*}"; BEST_COUNT="${BEST_OUT#*|}"
    SOURCE_LAYER="local"
    [ -z "$BEST" ] && { BEST="$(cloud_candidate)"; [ -n "$BEST" ] && SOURCE_LAYER="github-release"; }

    if [ -z "$BEST" ]; then
      echo "[db-fortress] هیچ نامزدی از هیچ لایه‌ای — قانون ۱۱: سرور با دی‌بی خالی/موجود بالا می‌آید"
      write_witness "$VERDICT" "no-candidate" "همهٔ لایه‌ها خالی — دیتابیس تازه در بوت ساخته می‌شود"
      logr db-fortress-no-candidate "\"verdict\":\"$VERDICT\""
      exit 3
    fi

    # گارد مقدس: اگر قلعهٔ موجود (حتی معیوبِ خوانا) پرتر از نامزد ⇒ BLOCK
    if [ "$VERDICT" = "BROKEN" ] && command -v bun >/dev/null 2>&1 \
       && [ -f "$REPO/scripts/recovery/sacred-data-guard.ts" ]; then
      bun "$REPO/scripts/recovery/sacred-data-guard.ts" "$BEST" --live "$FORTRESS" >/dev/null 2>&1 || true
      SACRED_RC=${PIPESTATUS[0]:-$?}
      # داوری از شاهد مکتوب (خروجی مستقیم با tee لوله نشده)
      if grep -q '"verdict": "BLOCK"' "$REPO/upload/.runtime/sacred-data-guard.json" 2>/dev/null; then
        SACRED_RC=2
      fi
      if [ "$SACRED_RC" = "2" ]; then
        echo "[db-fortress] گارد مقدس: BLOCK — قلعهٔ موجود پرتر از نامزد است؛ نگه داشته شد"
        write_witness "BLOCKED-SACRED" "keep-fortress" "زنده پرتر از نامزد — جایگزینی ممنوع (شورا-ن۰۶۳)"
        logr db-fortress-sacred-block "\"candidate\":\"$BEST\""
        exit 5
      fi
    fi

    # اعمال: VACUUM INTO اتمی + مهر فایل معیوب (حذف ممنوع)
    TS=$(date -u +%Y%m%dT%H%M%SZ)
    [ "$VERDICT" = "BROKEN" ] && mv "$FORTRESS" "$FORTRESS.broken-$TS" 2>/dev/null || true
    rm -f "$FORTRESS-wal" "$FORTRESS-shm" 2>/dev/null || true
    if ! bun "$REPO/scripts/pn041/vacuum-copy.ts" "$BEST" "$FORTRESS" >/dev/null 2>&1; then
      # VACUUM ناکام (شاید نامزد WAL-آلوده) → کپی خام + پروب
      cp "$BEST" "$FORTRESS" 2>/dev/null || true
    fi
    # وارسی پس از اعمال
    AFTER=""
    AFTER_RC=0
    AFTER="$(probe "$FORTRESS")"
    AFTER_RC=$?
    if [ "$AFTER_RC" != "0" ]; then
      echo "[db-fortress] اعمال ناکام — نامزد بعدی در چرخهٔ بعد"
      write_witness "RECOVER-FAILED" "apply-failed" "پس از اعمال، سلامت تأیید نشد"
      logr db-fortress-failed '"stage":"apply"'
      exit 6
    fi
    align_env
    AFTER_COUNT="$(printf '%s' "$AFTER" | python3 -c "import json,sys; print(json.load(sys.stdin).get('counts',{}).get('PropertyRecord',-1))" 2>/dev/null || echo -1)"
    echo "[db-fortress] بازیابی کامل: $BEST ($AFTER_COUNT رکورد · لایه: $SOURCE_LAYER)"
    write_witness "RECOVERED" "vacuum-into" "قلعه از بهترین لایه احیا شد" "{\"source\":\"$BEST\",\"layer\":\"$SOURCE_LAYER\",\"records\":$AFTER_COUNT}"
    logr db-fortress-recovered "\"source\":\"$BEST\",\"layer\":\"$SOURCE_LAYER\",\"records\":$AFTER_COUNT\""
    exit 0
    ;;

  *)
    echo "استفاده: $0 {check|recover}"; exit 1 ;;
esac
