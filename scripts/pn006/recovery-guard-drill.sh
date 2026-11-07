#!/usr/bin/env bash
# ============================================================
# recovery-guard-drill.sh — نسخهٔ قرقِ گارد خوددرمان برای آزمون BLOCK 3
# (ملکا-شورا-ن۰۰۶-۱۴۰۵ · بند ۳.۲)
# ------------------------------------------------------------
# این یک «وسیلهٔ آزمون» است — نه زیرساخت تولید:
#   ✓ منطق تشخیص/ضدحلقه/بکاپ/بازیابی: عین recovery-guard.sh تولیدی
#   ✗ توقف سرورهای واقعی (pkill): با نشانگر (marker) جایگزین شد
#   ✗ بیلد/ری‌استارت سرور تولید: با نشانگر جایگزین شد
#     (آن دو گام در PN-005-C در محیط واقعی اثبات شده‌اند؛ واحدِ آزمون اینجا
#      تشخیص + بازگرداندن + ضدحلقه است.)
# قرق: /home/z/my-project/recovery-drill — هرگز مسیر تولید.
# ============================================================
set -uo pipefail
ROOT="/home/z/my-project/recovery-drill"
[[ "$ROOT" == "/home/z/my-project/recovery-drill" ]] || { echo "[drill-guard] مسیر قرق نامعتبر"; exit 99; }
cd "$ROOT"
LOG="upload/.survival/recovery-log.jsonl"
MARK="drill-actions.log"
mkdir -p upload/.survival upload/dataset-backups
STAMP() { date -u +%Y-%m-%dT%H:%M:%SZ; }
logr() { printf '{"at":"%s","kind":"%s",%s}\n' "$(STAMP)" "$1" "$2" >> "$LOG" 2>/dev/null || true; }
mark() { printf '[%s] %s\n' "$(STAMP)" "$1" >> "$MARK"; }

if [[ "${MELK_AUTO_RECOVERY:-}" == "disabled" ]]; then mark "guard-skip:disabled"; exit 0; fi

# ── گام ۰: ضدحلقه — بازیابی موفق در ۱۰ دقیقهٔ گذشته؟ (عین تولید) ──
LAST_OK=$(grep 'guard-recovery-ok' "$LOG" 2>/dev/null | tail -1 | sed -n 's/.*"at":"\([^"]*\)".*/\1/p')
if [[ -n "$LAST_OK" ]]; then
  LAST_EP=$(date -d "$LAST_OK" +%s 2>/dev/null || echo 0)
  NOW_EP=$(date -u +%s)
  if (( NOW_EP - LAST_EP < 600 )); then
    mark "guard-reject:anti-loop (آخرین بازیابی موفق: $LAST_OK)"
    echo "[drill-guard] بازیابی موفق تازه (≤۱۰ دقیقه پیش) — رد شد (ضدحلقه)"
    exit 0
  fi
fi

# ── گام ۱: تشخیص تخریب (عین تولید — روی DB قرق) ──
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
if [[ "$NEEDS" == no ]]; then mark "guard-skip:healthy"; exit 0; fi
logr guard-recovery-start "\"cause\":\"$NEEDS\""
mark "guard-detect:$NEEDS"
echo "[drill-guard] تخریب تشخیص داده شد: $NEEDS — آغاز بازیابی (قرق)"

# ── گام ۲: تازه‌ترین بستهٔ بقا (الگوی اصلاح‌شدهٔ PN-006: P*/ با custom.db) ──
PKG=""
for d in $(ls -d upload/.survival/P*/ 2>/dev/null | sort -V); do
  [[ -f "${d%/}/custom.db" ]] && PKG="${d%/}"
done
if [[ -z "$PKG" ]]; then
  logr guard-recovery-fail '"cause":"no-survival-package"'
  mark "guard-fail:no-survival-package"
  echo "[drill-guard] بستهٔ بقا یافت نشد"; exit 1
fi

# ── گام ۳: توقف سرورها → در قرق: نشانگر (هرگز pkill تولید) ──
mark "would-stop-servers (در تولید: pkill watchdog+server)"

# ── گام ۴: بکاپ وضعیت فعلی (هرگز بدون بکاپ — عین تولید) ──
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
[[ -f db/custom.db ]] && cp db/custom.db "upload/dataset-backups/guard-pre-recovery-${TS}.db" 2>/dev/null || true
mark "backup-taken:guard-pre-recovery-${TS}.db"

# ── گام ۵: بازگرداندن DB + env (عین تولید — از بستهٔ قرق) ──
if ! cp "$PKG/custom.db" db/custom.db; then
  logr guard-recovery-fail '"cause":"db-copy-failed"'
  mark "guard-fail:db-copy-failed"
  exit 1
fi
if [[ ! -f .env.local && -f upload/.survival/env.local.template ]]; then
  cp upload/.survival/env.local.template .env.local
  chmod 600 .env.local
fi
mark "db-restored-from:$(basename "$PKG")"
mark "env-restored-if-missing:yes"

# ── گام ۶/۷: بیلد در صورت نبود + ری‌استارت → در قرق: نشانگر ──
mark "would-build-if-missing (در تولید: bun run build)"
mark "would-restart-prod (در تولید: start-prod-daemon.py)"

logr guard-recovery-ok "\"via\":\"$(basename "$PKG")\",\"cause\":\"$NEEDS\",\"mode\":\"drill\""
mark "guard-recovery-ok"
echo "[drill-guard] بازیابی کامل شد از $(basename "$PKG") (قرق — بدون بیلد/ری‌استارت واقعی)"
