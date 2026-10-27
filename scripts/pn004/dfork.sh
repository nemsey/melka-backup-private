#!/bin/bash
# PN-004 — راه‌انداز double-fork: فرایند یتیم‌شده به init (بقا در برابر پاک‌سازی نشست ابزار)
# استفاده: dfork.sh <logfile> <workdir> <cmd> [args...]
LOG="$1"; WD="$2"; shift 2
exec python3 - "$LOG" "$WD" "$@" <<'PYEOF'
import os, sys

log, wd, cmd = sys.argv[1], sys.argv[2], sys.argv[3:]

pid = os.fork()
if pid == 0:
    if os.fork() > 0:
        os._exit(0)          # فرزند میانی فوراً خارج — نوه یتیم و به init سپرده می‌شود
    os.setsid()              # نشست جدید — مستقل از پوستهٔ فراخوان
    os.chdir(wd)
    with open(log, "ab") as f:
        os.dup2(f.fileno(), 1)
        os.dup2(f.fileno(), 2)
    devnull = os.open(os.devnull, os.O_RDONLY)
    os.dup2(devnull, 0)
    os.execvp(cmd[0], cmd)   # جایگزینی با فرمان هدف
os.waitpid(pid, 0)
print(f"dfork: spawned -> {cmd[:3]} (log={log})")
PYEOF
