#!/usr/bin/env bash
# ============================================================
# PN-006 BLOCK 3 — آزمون ۲: قلاب بوت واقعی (بند ۳.۲.۲)
# تخریب قرق → بوت سرور production واقعی با DATABASE_URL قرق (پورت ۳۱۰۰)
# → انتظار: قلاب بوت (instrumentation · ۲۰ ثانیه پس از بوت) تشخیص + بازیابی
# نکته: مسیر «test-recovery» پیشنهادی دستور شامل واژهٔ test است و قلاب بوت
# عمداً روی آن خاموش می‌شود (گارد تست‌ها) — لذا قرق recovery-drill ساخته شد.
# خروجی: download/pn006/recovery-test-2.json
# ============================================================
set -uo pipefail
ROOT=/home/z/my-project/recovery-drill
PROJ=/home/z/my-project
OUT="$PROJ/download/pn006/recovery-test-2.json"
PORT=3100
[[ -d "$ROOT" ]] || { echo "قرق موجود نیست"; exit 1; }

dbstate() {
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys, json
try:
    con = sqlite3.connect(sys.argv[1])
    h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
    g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
    e = con.execute('SELECT COUNT(*) FROM GraphEdge').fetchone()[0]
    con.close()
    print(json.dumps({"masterCodeHashNull": not (h and h[0]), "graphNodes": g, "graphEdges": e}))
except Exception as ex:
    print(json.dumps({"error": str(ex)}))
PYEOF
}

# ── ۱) تخریب مصنوعی قرق ──
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute('UPDATE AppMeta SET masterCodeHash=NULL')
con.execute('DELETE FROM GraphEdge')
con.execute('DELETE FROM GraphNode')
con.commit(); con.close()
print("[test2] قرق تخریب شد")
PYEOF
BEFORE=$(dbstate)
echo "[test2] وضعیت تخریب‌شده: $BEFORE"

# ── ۲) بوت سرور production واقعی با DB قرق (dffork برای بقا) ──
echo "[test2] بوت سرور production روی پورت $PORT با DATABASE_URL قرق…"
cat > /tmp/pn006-drill-boot.sh <<'BOOT'
#!/usr/bin/env bash
set -a; . /home/z/my-project/.env.local; set +a
export DATABASE_URL="file:/home/z/my-project/recovery-drill/db/custom.db"
export MELKA_REPO_DIR="/home/z/my-project/recovery-drill"
export REPO_DIR="/home/z/my-project/recovery-drill"
export BASE_URL="http://localhost:3100"
export MELK_INTELLIGENCE_DAEMON=disabled
export MELK_CATALOG_DAEMON=disabled
export MELK_BACKGROUND_SYNC=disabled
export MELK_AUTO_RECOVERY="${MELK_AUTO_RECOVERY:-}"
cd /home/z/my-project
exec env PORT=3100 HOSTNAME=127.0.0.1 NODE_ENV=production bun .next/standalone/server.js
BOOT
chmod +x /tmp/pn006-drill-boot.sh
bash "$PROJ/scripts/pn004/dfork.sh" /tmp/pn006-drill-server.log /home/z/my-project /tmp/pn006-drill-boot.sh

# ── ۳) انتظار: بوت (~۲s) + قلاب (۲۰s) + تشخیص/بازیابی (~۵s) ──
BOOT_T0=$(date +%s)
for i in $(seq 1 24); do
  sleep 5
  EL=$(( $(date +%s) - BOOT_T0 ))
  STATE=$(dbstate)
  echo "[test2] t+${EL}s → $STATE"
  echo "$STATE" | grep -q '"masterCodeHashNull": false' && grep -q '"graphNodes": [1-9]' <<< "$STATE" && break
done
DUR=$(( $(date +%s) - BOOT_T0 ))

# ── ۴) راستی‌آزمایی سرور قرق بالا بود ──
VER=$(curl -s -m 5 "http://localhost:$PORT/api/version" 2>/dev/null || echo "")
AFTER=$(dbstate)
HOOKLOG=$(grep -c "auto-recovery-boot-check" /tmp/pn006-drill-server.log 2>/dev/null || echo 0)

# ── ۵) توقف سرور قرق (فقط تطابق دقیق پورت در environ) ──
for p in $(ps aux | grep "server.js" | grep -v grep | awk '{print $2}'); do
  if tr '\0' '\n' < "/proc/$p/environ" 2>/dev/null | grep -q "^PORT=3100$"; then
    kill "$p" 2>/dev/null || true
    echo "[test2] سرور قرق (PID $p) متوقف شد"
  fi
done
sleep 2

LOGTAIL=$(tail -8 "$ROOT/upload/.survival/recovery-log.jsonl" 2>/dev/null || echo "(خالی)")
MARKERS=$(cat "$ROOT/drill-actions.log" 2>/dev/null || echo "(خالی)")
SRVTAIL=$(tail -5 /tmp/pn006-drill-server.log 2>/dev/null || echo "")

python3 - "$OUT" "$BEFORE" "$AFTER" "$DUR" "$VER" "$HOOKLOG" "$LOGTAIL" "$MARKERS" "$SRVTAIL" <<'PYEOF'
import json, sys, datetime
out, before, after, dur, ver, hooklog, logtail, markers, srvtail = sys.argv[1:10]
before_d, after_d = json.loads(before), json.loads(after)
checks = {
    "قلاب_بوت_اجرا_شد": int(hooklog) >= 1,
    "تشخیص_تخریب": before_d.get("masterCodeHashNull") is True or before_d.get("graphNodes") == 0,
    "بازیابی_خودکار_هش": after_d.get("masterCodeHashNull") is False,
    "بازیابی_خودکار_گراف": (after_d.get("graphNodes") or 0) > 0,
    "سرور_قرق_بالا_آمد": '"buildId"' in ver,
}
result = {
    "test": "3.2.2 — آزمون قلاب بوت: بوت سرور با DB تخریب‌شدهٔ قرق",
    "executedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "setup": {
        "server": "بوت production واقعی (bun .next/standalone/server.js) روی پورت 3100",
        "env": "DATABASE_URL=recovery-drill/db/custom.db · MELKA_REPO_DIR=recovery-drill · دیمن‌ها خاموش (MELK_INTELLIGENCE/CATALOG_DAEMON=disabled)",
        "note": "مسیر test-recovery دقیقِ دستور شامل واژهٔ test است که قلاب بوت عمداً خود را روی آن خاموش می‌کند (گارد تست‌های خود پروژه) — قرق recovery-drill با همان نقش ساخته شد",
    },
    "beforeBoot": before_d,
    "afterHook": after_d,
    "recoveryTotalSec": int(dur),
    "drillServerVersion": ver[:200] if ver else "",
    "bootCheckLogLines": int(hooklog),
    "recoveryLogTail": logtail,
    "drillMarkers": markers,
    "drillServerLogTail": srvtail,
    "checks": checks,
}
result["verdict"] = "PASS" if all(checks.values()) else "FAIL"
json.dump(result, open(out, "w"), ensure_ascii=False, indent=2)
print(json.dumps({"verdict": result["verdict"], "checks": checks, "recoveryTotalSec": result["recoveryTotalSec"]}, ensure_ascii=False))
PYEOF
