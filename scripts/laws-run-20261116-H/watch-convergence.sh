#!/usr/bin/env bash
# LAW-RUN-20261116-H — watch head-guard convergence after docs push
# Polls every 30s for up to 14 min; prints status transitions only.
cd /home/z/my-project
TARGET_SHA=$(git rev-parse --short HEAD)
echo "target HEAD=$TARGET_SHA · watching head-guard convergence…"
prev=""
for i in $(seq 1 28); do
  bid=$(curl -s -m 6 http://localhost:3000/api/version 2>/dev/null | python3 -c "import sys,json
try: print(json.load(sys.stdin)['buildId'])
except Exception: print('ERR')" 2>/dev/null)
  port=$(curl -s -o /dev/null -w "%{http_code}" -m 6 http://localhost:3000/ 2>/dev/null)
  logm=$(stat -c %Y upload/.runtime/head-guard-last-build.log 2>/dev/null)
  hg=$(python3 -c "
import sqlite3
try:
    c=sqlite3.connect('file:db/custom.db?mode=ro', uri=True)
    r=c.execute(\"SELECT COUNT(*) FROM AuditLog WHERE action='HEAD_GUARD_AUTOBUILD' AND CAST(createdAt AS INTEGER) >= 1794798600000\").fetchone()[0]
    print(r)
except Exception: print('?')" 2>/dev/null)
  state="port=$port build=$bid hgLog=$logm hgEvts=$hg"
  if [ "$state" != "$prev" ]; then
    echo "[$(date -u '+%H:%M:%SZ')] $state"
    prev="$state"
  fi
  if [ "$bid" != "ERR" ] && [ -n "$bid" ] && [[ "$bid" == "$TARGET_SHA"* ]]; then
    echo "[$(date -u '+%H:%M:%SZ')] CONVERGED: live=$bid = HEAD"
    exit 0
  fi
  sleep 30
done
echo "watch window elapsed without convergence"
exit 1
