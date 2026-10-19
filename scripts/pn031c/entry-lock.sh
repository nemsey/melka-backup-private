#!/bin/bash
# PN-031-C · بخش ۰ — قفل ورود: بکاپ VACUUM گرم + سلامت + شاهد
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT=download/pn031c
mkdir -p "$OUT"

python3 - "$TS" <<'PYEOF'
import sqlite3, json, sys, os, datetime, urllib.request, subprocess

ts = sys.argv[1]
os.makedirs("db", exist_ok=True)
backup = f"db/pre-pn031c-{ts}.db"

# ۱) بکاپ گرم VACUUM INTO
conn = sqlite3.connect("db/custom.db", timeout=30)
conn.execute("VACUUM INTO ?", (backup,))
integ = conn.execute("PRAGMA integrity_check;").fetchone()[0]
conn.close()

import hashlib
md5 = hashlib.md5(open(backup, "rb").read()).hexdigest()
size_mb = round(os.path.getsize(backup) / 1024 / 1024, 1)

# ۲) سلامت زنده
try:
    health = urllib.request.urlopen("http://127.0.0.1:3000/api/health", timeout=8).status
except Exception as e:
    health = f"ERR:{getattr(e, 'code', 'unreachable')}"
try:
    live = json.load(urllib.request.urlopen("http://127.0.0.1:3000/api/version", timeout=8)).get("gitSha", "?")
except Exception:
    live = "?"

head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

# ۳) گارد پایه
gn = len([f for f in os.listdir("scripts") if f.startswith("audit-") and f.endswith(".sh")])
ghg = 1 if os.path.exists("scripts/recovery/audit-head-guard.sh") else 0

w = {
  "phase": "PN-031-C · بخش ۰ — قفل ورود (جلسهٔ فوق‌العاده ۰۴۰)",
  "lockedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "ownerStatement": "رفع دائمی، پایان چرخه — بیانیهٔ مالک (سند ۰۴۰)",
  "backup": {"file": backup, "md5": md5, "sizeMB": size_mb, "integrity": integ, "method": "VACUUM INTO (گرم — سرور روشن)"},
  "live": {"health": health, "liveGitSha": live},
  "head": head,
  "note": "HEAD = bc7c3fa شامل کامیت خودکار پلتفرم (شواهد شبیه‌سازی PN-031-B) روی بیلد 7bdd513؛ بیلد نهایی پس از کامیت PN-031-C ساخته و راستی‌آزمایی می‌شود.",
  "guardsBaseline": {"auditScripts": gn, "headGuardScript": ghg, "reproducibility": 1, "totalExpected": gn + ghg + 1},
}
json.dump(w, open("download/pn031c/entry-lock.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({"backup": backup, "md5": md5, "integrity": integ, "sizeMB": size_mb, "health": health, "live": live, "head": head[:7], "guardsExpected": gn + ghg + 1}, ensure_ascii=False))
PYEOF
