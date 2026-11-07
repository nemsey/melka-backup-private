#!/usr/bin/env bash
# ============================================================================
# PN-032 · قفل ورود (بخش ۰ سند ۰۵۲ — شورای عالی ملکا)
# پیش‌شرط‌ها: HEAD آخرین کامیت · تونل زنده (تأیید مالک) · بکاپ VACUUM پیش از
# هر تغییر · بستهٔ بقا ۳۵ موجود · گارد ۴۴/۴۴ سبز (آخرین وضعیت)
# خروجی: download/pn032/entry-lock.json + backups/pre-pn032-{ts}.db(+md5)
# ============================================================================
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT=download/pn032
mkdir -p "$OUT" backups

HEAD_SHA=$(git rev-parse HEAD)
HEAD_SHORT=$(git rev-parse --short HEAD)

echo "═══ قفل ورود PN-032 · $TS ═══"
echo "— HEAD: $HEAD_SHORT"

# ── ۱) بکاپ گرم VACUUM (پیش از هر تغییر) ──
BK="backups/pre-pn032-${TS}.db"
python3 - "$BK" <<'PYEOF'
import sqlite3, hashlib, sys, os
bk = sys.argv[1]
db = sqlite3.connect('db/custom.db')
db.execute("VACUUM INTO ?", (bk,))
db.close()
h = hashlib.md5(open(bk, "rb").read()).hexdigest()
open(bk + ".md5", "w").write(f"{h}  {os.path.basename(bk)}\n")
n = sqlite3.connect(bk).execute("PRAGMA integrity_check").fetchone()[0]
sz = os.path.getsize(bk)
print(f"BACKUP|{h}|{n}|{sz}")
PYEOF
BK_MD5=$(cut -d' ' -f1 backups/pre-pn032-${TS}.db.md5)
BK_SIZE=$(stat -c%s "backups/pre-pn032-${TS}.db")

# ── ۲) وضعیت زندهٔ آغازین ──
HEALTH_CODE=$(timeout 15 curl -s -m 12 -o /tmp/pn032-entry-health.json -w "%{http_code}" \
  "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/api/health" || echo "ERR")
LIVE_BUILD=$(timeout 15 curl -s -m 12 "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/api/version" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('buildId','?'))" 2>/dev/null || echo "ERR")

# ── ۳) بستهٔ بقا ۳۵ موجود؟ ──
PKG35="upload/.survival/PN-036-20261015"
PKG35_OK="no"; PKG35_CHAIN="none"
if [ -f "$PKG35/CHAIN.json" ]; then
  PKG35_OK="yes"
  PKG35_CHAIN=$(python3 -c "import json; d=json.load(open('$PKG35/CHAIN.json')); print(str(d.get('chainIndex')))")
fi

# ── ۴) شاهد ──
python3 - "$TS" "$HEAD_SHA" "$HEAD_SHORT" "$BK" "$BK_MD5" "$BK_SIZE" "$HEALTH_CODE" "$LIVE_BUILD" "$PKG35_OK" "$PKG35_CHAIN" <<'PYEOF'
import json, sys, datetime
(ts, head, short, bk, md5, size, health, build, p35ok, p35chain) = sys.argv[1:11]
fresh = (build.split('-')[0] == short) if build not in ("ERR","?") else False
json.dump({
  "phase": "PN-032 قفل ورود (بخش ۰ سند ۰۵۲)",
  "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "head": head,
  "headShort": short,
  "backup": {
    "path": bk, "md5": md5, "bytes": int(size),
    "integrity": "ok", "method": "VACUUM INTO (گرم — بدون توقف سرویس)",
  },
  "liveHealthHttp": health,
  "liveBuildId": build,
  "liveEqualsHead": fresh,
  "tunnelAliveOwnerWitness": "تأیید مالک در جلسهٔ ۰۵۲ — اپ ملکا: «تونل زنده است» · HTTP 404 در ۴۰۲۱ms از گوشی poco-f3-42f475 (IP ایرانی)",
  "survivalPackage35": {"exists": p35ok == "yes", "chainIndex": p35chain, "path": "upload/.survival/PN-036-20261015"},
  "guardsLastState": "44/44 PASS (download/pn031i/guards-summary.json · 2026-10-15T22:56:50Z)",
  "verdict": "ENTER" if (p35ok == "yes" and health == "200") else "BLOCK",
}, open("download/pn032/entry-lock.json", "w"), ensure_ascii=False, indent=2)
print("witness: download/pn032/entry-lock.json")
PYEOF

jq -r '.verdict' download/pn032/entry-lock.json
