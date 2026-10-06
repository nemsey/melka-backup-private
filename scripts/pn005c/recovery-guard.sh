#!/usr/bin/env bash
# ============================================================
# recovery-guard.sh — گارد خوددرمان ملکا (جلسهٔ فوق‌العاده ۰۰۵)
# تشخیص تخریب محیط (هش کدمستر NULL یا گراف صفر) →
#   بکاپ → بازگرداندن DB + env از تازه‌ترین بستهٔ بقا →
#   بیلد در صورت نبود → ری‌استارت سرور production (watchdog)
# خنثی و بی‌خطر: اگر تخریبی نبود، هیچ کاری نمی‌کند.
# ضدحلقه: اگر در ۱۰ دقیقهٔ گذشته بازیابی موفق ثبت شده، رد می‌شود.
# خاموشی کامل: MELK_AUTO_RECOVERY=disabled
# ============================================================
set -uo pipefail
cd /home/z/my-project
LOG="upload/.survival/recovery-log.jsonl"
STAMP() { date -u +%Y-%m-%dT%H:%M:%SZ; }
logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(STAMP)" "$1" "$2" >> "$LOG" 2>/dev/null || true; }

if [[ "${MELK_AUTO_RECOVERY:-}" == "disabled" ]]; then exit 0; fi

# ── گام ۰: ضدحلقه — بازیابی موفق در ۱۰ دقیقهٔ گذشته؟ ──
LAST_OK=$(grep 'guard-recovery-ok' "$LOG" 2>/dev/null | tail -1 | sed -n 's/.*"at":"\([^"]*\)".*/\1/p')
if [[ -n "$LAST_OK" ]]; then
  LAST_EP=$(date -d "$LAST_OK" +%s 2>/dev/null || echo 0)
  NOW_EP=$(date -u +%s)
  if (( NOW_EP - LAST_EP < 600 )); then
    echo "[guard] بازیابی موفق تازه (≤۱۰ دقیقه پیش) — رد شد (ضدحلقه)"
    exit 0
  fi
fi

# ── گام ۱: تشخیص تخریب ──
NEEDS=$(python3 - <<'PYEOF'
import sqlite3, os
db = 'db/custom.db'
if not os.path.exists(db):
    print('yes:db-missing'); raise SystemExit
try:
    con = sqlite3.connect(db)
    try:
        h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
        g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
    finally:
        con.close()
    if not (h and h[0]):
        print('yes:master-hash-null')
    elif g == 0:
        print('yes:graph-empty')
    else:
        print('no')
except Exception:
    print('yes:db-unreadable')
PYEOF
)
if [[ "$NEEDS" == no ]]; then exit 0; fi
logr guard-recovery-start "\"cause\":\"$NEEDS\""
echo "[guard] تخریب تشخیص داده شد: $NEEDS — آغاز بازیابی"

# ── گام ۲: تازه‌ترین بستهٔ بقا ──
# PN-006 BLOCK 3: الگوی P[0-9]* به بسته‌های PN-XXX کور بود (کشف آزمون قرق)
# الگوی تازه: همهٔ دایرکتوری‌های P* با custom.db — نسخه‌مرتب، آخرین = تازه‌ترین
PKG=""
for d in $(ls -d upload/.survival/P*/ 2>/dev/null | sort -V); do
  [[ -f "${d%/}/custom.db" ]] && PKG="${d%/}"
done
if [[ -z "$PKG" ]]; then
  logr guard-recovery-fail '"cause":"no-survival-package"'
  echo "[guard] بستهٔ بقا یافت نشد"; exit 1
fi

# ── گام ۳: توقف سرورها (قفل SQLite + تعویض تمیز) ──
touch .prod-stop 2>/dev/null || true
pkill -f 'prod-watchdog' 2>/dev/null || true
pkill -f 'next dev -p 3000' 2>/dev/null || true
pkill -f 'bun run dev' 2>/dev/null || true
sleep 2
if pgrep -f 'next-server|standalone/server.js' >/dev/null 2>&1; then
  pkill -9 -f 'next-server' 2>/dev/null || true
  pkill -9 -f 'standalone/server.js' 2>/dev/null || true
  sleep 2
fi

# ── گام ۴: بکاپ وضعیت فعلی (هرگز بدون بکاپ) ──
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
[[ -f db/custom.db ]] && cp db/custom.db "upload/dataset-backups/guard-pre-recovery-${TS}.db" 2>/dev/null || true

# ── گام ۵: بازگرداندن DB + env ──
if ! cp "$PKG/custom.db" db/custom.db; then
  logr guard-recovery-fail '"cause":"db-copy-failed"'
  exit 1
fi
if [[ ! -f .env.local && -f upload/.survival/env.local.template ]]; then
  cp upload/.survival/env.local.template .env.local
  chmod 600 .env.local
fi
git checkout -- .env 2>/dev/null || true
# شمارش‌های مورد انتظار برای وارسی‌های آیندهٔ auto-recovery
python3 - <<'PYEOF' > upload/.survival/expected-counts.json 2>/dev/null || true
import sqlite3, json, datetime
con = sqlite3.connect('db/custom.db')
def c(t):
    try: return con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
    except Exception: return 0
print(json.dumps({
  'PropertyRecord': c('PropertyRecord'), 'RequestRecord': c('RequestRecord'),
  'TransactionRecord': c('TransactionRecord'), 'ExpertRecord': c('ExpertRecord'),
  'PmPersonnelRecord': c('PmPersonnelRecord'),
  'updatedAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
}))
con.close()
PYEOF

# ── گام ۶: بیلد در صورت نبود سرور production ──
if [[ ! -f .next/standalone/server.js ]]; then
  echo "[guard] بیلد production…"
  if ! bun run build > upload/.survival/guard-build.log 2>&1; then
    logr guard-recovery-fail '"cause":"build-failed"'
    echo "[guard] بیلد شکست خورد — بازگشت به حالت dev (dfork)"
    rm -f .prod-stop
    bash scripts/pn004/dfork.sh dev-recovery.log /home/z/my-project bun run dev
    exit 1
  fi
fi

# ── گام ۷: ری‌استارت سرور production ──
rm -f .prod-stop
python3 scripts/start-prod-daemon.py
logr guard-recovery-ok "\"via\":\"$(basename "$PKG")\",\"cause\":\"$NEEDS\""
echo "[guard] بازیابی کامل شد از $(basename "$PKG") — سرور production بالا آمد"
