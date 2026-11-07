#!/usr/bin/env bash
# pn031b-entry-lock.sh — قفل ورود PN-031-B: بکاپ VACUUM گرم + شاهد تشخیص بازنشانی هشتم
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="db/pre-pn031b-${TS}.db"
mkdir -p db download/pn031-b

# بکاپ VACUUM گرم (سرور روشن — WAL-safe)
python3 - "$OUT" <<'PYEOF'
import sqlite3, sys
out = sys.argv[1]
conn = sqlite3.connect("file:db/custom.db?mode=ro", uri=True)
conn.execute("VACUUM INTO ?", (out,))
conn.close()
print("vacuum-ok", out)
PYEOF

MD5=$(md5sum "$OUT" | awk '{print $1}')
SZ=$(stat -c%s "$OUT")

# وارسی سلامت بکاپ
INTEG=$(python3 -c "
import sqlite3
c = sqlite3.connect('file:${OUT}?mode=ro', uri=True)
print(c.execute('PRAGMA integrity_check').fetchone()[0])
c.close()
")

echo "{\"at\":\"$(date -u +%FT%TZ)\",\"file\":\"${OUT}\",\"bytes\":${SZ},\"md5\":\"${MD5}\",\"integrity\":\"${INTEG}\"}" > download/pn031b-backup.json
echo "BACKUP: ${OUT} · ${SZ} bytes · md5=${MD5} · integrity=${INTEG}"
