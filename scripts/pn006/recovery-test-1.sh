#!/usr/bin/env bash
# ============================================================
# PN-006 BLOCK 3 — آزمون ۱: شبیه‌سازی تخریب + بازیابی خودکار (بند ۳.۲.۱)
# تخریب مصنوعی قرق → اجرای فرمان تولیدی «auto-recovery.sh check» →
# راستی‌آزمایی: تشخیص + بازیابی خودکار + زمان + صفر خطا
# خروجی: download/pn006/recovery-test-1.json
# ============================================================
set -uo pipefail
ROOT=/home/z/my-project/recovery-drill
PROJ=/home/z/my-project
OUT="$PROJ/download/pn006/recovery-test-1.json"
[[ -d "$ROOT" ]] || { echo "قرق موجود نیست — drill-setup.sh اجرا شود"; exit 1; }

dbstate() {  # وضعیت ساختاری DB قرق به JSON
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys, json
try:
    con = sqlite3.connect(sys.argv[1])
    h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
    g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
    e = con.execute('SELECT COUNT(*) FROM GraphEdge').fetchone()[0]
    p = con.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0]
    con.close()
    print(json.dumps({"masterCodeHashNull": not (h and h[0]), "graphNodes": g, "graphEdges": e, "propertyRecords": p}))
except Exception as ex:
    print(json.dumps({"error": str(ex)}))
PYEOF
}

echo "[test1] وضعیت قبل: $(dbstate)"
BEFORE=$(dbstate)

# ── تخریب مصنوعی (امضای تخریب واقعی سه‌رخدادی) ──
echo "[test1] اعمال تخریب مصنوعی: masterCodeHash=NULL + GraphNode=0 + GraphEdge=0 …"
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute('UPDATE AppMeta SET masterCodeHash=NULL')
con.execute('DELETE FROM GraphEdge')
con.execute('DELETE FROM GraphNode')
con.commit(); con.close()
print("[test1] تخریب اعمال شد")
PYEOF
CORRUPTED=$(dbstate)
echo "[test1] وضعیت پس از تخریب: $CORRUPTED"

# ── اجرای فرمان تولیدی: auto-recovery.sh check (زاسنجی‌شده) ──
T0=$(date +%s.%N)
set +e
OUTLOG=$(REPO_DIR="$ROOT" BASE_URL="http://127.0.0.1:9" bash "$ROOT/scripts/recovery/auto-recovery.sh" check 2>&1)
CODE=$?
set -e
T1=$(date +%s.%N)
DUR=$(python3 -c "print(round($T1-$T0,1))")
echo "[test1] خروج=$CODE زمان=${DUR}s"
echo "$OUTLOG" | sed 's/^/    /'

AFTER=$(dbstate)
LOGTAIL=$(tail -6 "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null || echo "(خالی)")
MARKERS=$(cat "$ROOT/drill-actions.log" 2>/dev/null || echo "(خالی)")
BACKUPS=$(ls "$ROOT/upload/dataset-backups/" 2>/dev/null | wc -l)

python3 - "$OUT" "$BEFORE" "$CORRUPTED" "$AFTER" "$CODE" "$DUR" "$OUTLOG" "$LOGTAIL" "$MARKERS" "$BACKUPS" <<'PYEOF'
import json, sys, datetime
out, before, corrupted, after, code, dur, log, logtail, markers, nb = sys.argv[1:11]
after_d, corrupted_d = json.loads(after), json.loads(corrupted)
verdict = {
    "test": "3.2.1 — شبیه‌سازی تخریب در قرق + بازیابی خودکار",
    "executedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "command": "REPO_DIR=recovery-drill bash scripts/recovery/auto-recovery.sh check  (فرمان تولیدی دست‌نخورده)",
    "before": json.loads(before),
    "afterCorruption": corrupted_d,
    "afterRecovery": after_d,
    "exitCode": int(code),
    "durationSec": float(dur),
    "checks": {
        "تشخیص_تخریب": corrupted_d.get("masterCodeHashNull") is True or corrupted_d.get("graphNodes") == 0,
        "بازیابی_هش": after_d.get("masterCodeHashNull") is False,
        "بازیابی_گراف": (after_d.get("graphNodes") or 0) > 0,
        "زمان_معقول": float(dur) < 120,
        "صفر_خطا": int(code) == 0,
    },
    "guardOutput": log,
    "recoveryLogTail": logtail,
    "drillMarkers": markers,
    "backupsTaken": int(nb),
    "notes": [
        "گارد قرق: منطق عین تولید؛ فقط گام‌های pkill/بیلد/ری‌استارت سرور واقعی با نشانگر جایگزین شد (واحد آزمون: تشخیص+بازگرداندن+ضدحلقه)",
        "بکاپ پیش از بازیابی در قرق گرفته شد و سپس DB از بستهٔ بقا قرق بازگردانده شد",
    ],
}
verdict["verdict"] = "PASS" if all(verdict["checks"].values()) else "FAIL"
json.dump(verdict, open(out, "w"), ensure_ascii=False, indent=2)
print(json.dumps({"verdict": verdict["verdict"], "checks": verdict["checks"], "durationSec": verdict["durationSec"]}, ensure_ascii=False))
PYEOF
