#!/usr/bin/env bash
# ============================================================
# PN-006 BLOCK 3 — آزمون ۳: ضدحلقه (بند ۳.۲.۳)
# بلافاصله پس از یک بازیابی موفق (< ۱۰ دقیقه): تخریب دوباره →
# انتظار: گارد فقط یک بار اجرا شده و این بار «ضدحلقه» آن را رد می‌کند؛
# DB تخریب‌شده می‌ماند (هیچ بکاپ/بازیابی تازه‌ای رخ نمی‌دهد).
# خروجی: download/pn006/recovery-test-3.json
# ============================================================
set -uo pipefail
ROOT=/home/z/my-project/recovery-drill
PROJ=/home/z/my-project
OUT="$PROJ/download/pn006/recovery-test-3.json"

dbstate() {
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys, json
try:
    con = sqlite3.connect(sys.argv[1])
    h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
    g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
    con.close()
    print(json.dumps({"masterCodeHashNull": not (h and h[0]), "graphNodes": g}))
except Exception as ex:
    print(json.dumps({"error": str(ex)}))
PYEOF
}

# پیش‌شرط: آخرین رخداد باید بازیابی موفق تازه باشد
LAST_OK=$(grep 'guard-recovery-ok' "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null | tail -1 | sed -n 's/.*"at":"\([^"]*\)".*/\1/p')
OK_COUNT_BEFORE=$(grep -c 'guard-recovery-ok' "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null || echo 0)
BACKUPS_BEFORE=$(ls "$ROOT/upload/dataset-backups/" 2>/dev/null | wc -l)
DB_MTIME_BEFORE=$(stat -c %Y "$ROOT/db/custom.db" 2>/dev/null || echo 0)
echo "[test3] آخرین بازیابی موفق: ${LAST_OK:-هیچ} · شمار ok=$OK_COUNT_BEFORE · بکاپ=$BACKUPS_BEFORE"

# ── تخریب متوالی دوم (همان امضا، بلافاصله پس از بازیابی) ──
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute('UPDATE AppMeta SET masterCodeHash=NULL')
con.execute('DELETE FROM GraphEdge')
con.execute('DELETE FROM GraphNode')
con.commit(); con.close()
print("[test3] تخریب دوم اعمال شد (در پنجرهٔ ۱۰ دقیقه‌ای)")
PYEOF
AFTER_CORRUPT=$(dbstate)
echo "[test3] وضعیت: $AFTER_CORRUPT"

# ── اجرای check دوباره (شبیه بوت/تیک بعدی) ──
set +e
OUTLOG=$(REPO_DIR="$ROOT" BASE_URL="http://127.0.0.1:9" bash "$ROOT/scripts/recovery/auto-recovery.sh" check 2>&1)
CODE=$?
set -e
echo "$OUTLOG" | sed 's/^/    /'

sleep 2
FINAL=$(dbstate)
OK_COUNT_AFTER=$(grep -c 'guard-recovery-ok' "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null || echo 0)
BACKUPS_AFTER=$(ls "$ROOT/upload/dataset-backups/" 2>/dev/null | wc -l)
DB_MTIME_AFTER=$(stat -c %Y "$ROOT/db/custom.db" 2>/dev/null || echo 0)
ANTIREJECT=$(grep -c 'anti-loop' "$ROOT/drill-actions.log" 2>/dev/null || echo 0)
LOGTAIL=$(tail -5 "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null || echo "(خالی)")

python3 - "$OUT" "$LAST_OK" "$AFTER_CORRUPT" "$FINAL" "$CODE" "$OK_COUNT_BEFORE" "$OK_COUNT_AFTER" "$BACKUPS_BEFORE" "$BACKUPS_AFTER" "$DB_MTIME_BEFORE" "$DB_MTIME_AFTER" "$ANTIREJECT" "$OUTLOG" "$LOGTAIL" <<'PYEOF'
import json, sys, datetime
out = sys.argv[1]
last_ok, after_corrupt, final, code, okb, oka, bb, ba, mb, ma, antireject, outlog, logtail = sys.argv[2:15]
after_corrupt_d, final_d = json.loads(after_corrupt), json.loads(final)
checks = {
    "پیش‌شرط_بازیابی_تازه_موجود": bool(last_ok),
    "تخریب_دوم_اعمال_شد": after_corrupt_d.get("masterCodeHashNull") is True,
    "ضدحلقه_رد_کرد": int(antireject) >= 1,
    "بازیابی_مجدد_رخ_نداد": int(oka) == int(okb),
    "بکاپ_تازه_نگرفته_شد": int(ba) == int(bb),
    "DB_تخریب‌شده_ماند": final_d.get("masterCodeHashNull") is True and (final_d.get("graphNodes") == 0),
}
result = {
    "test": "3.2.3 — آزمون ضدحلقه: تخریب متوالی (۲ بار در پنجرهٔ ۱۰ دقیقه)",
    "executedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "lastSuccessfulRecovery": last_ok,
    "afterSecondCorruption": after_corrupt_d,
    "afterSecondCheck": final_d,
    "exitCode": int(code),
    "okCount": {"before": int(okb), "after": int(oka)},
    "backupCount": {"before": int(bb), "after": int(ba)},
    "antiLoopRejections": int(antireject),
    "checkOutput": outlog,
    "recoveryLogTail": logtail,
    "checks": checks,
    "note": "رفتار صحیح: پنجرهٔ ضدحلقه ۱۰ دقیقه‌ای رد می‌کند؛ پس از انقضای پنجره، بوت/تیک بعدی دوباره بازیابی می‌کند (سازوکار عمدی ضد طوفانِ بازنشانی‌های پیاپی پلتفرم)",
}
result["verdict"] = "PASS" if all(checks.values()) else "FAIL"
json.dump(result, open(out, "w"), ensure_ascii=False, indent=2)
print(json.dumps({"verdict": result["verdict"], "checks": checks}, ensure_ascii=False))
PYEOF
