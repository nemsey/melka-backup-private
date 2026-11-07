#!/usr/bin/env python3
"""
p6513-launch-daemon.py — اجرای دیمون تکمیل انتقال P6.5-13 با double-fork
-------------------------------------------------------------------------
فرزند نهایی: setsid + بدون ترمینال کنترلی + فرزند init (PPID=1)
→ از کشتنِ درخت فرایندِ فراخوان ابزار جان سالم به در می‌برد
(همان سازوکار start-prod-daemon.py — شاهد بقای دیمون dev روی همین جعبه)

دیمون: bun scripts/p6513-complete-transfer.ts --wait-for-token --max-minutes 350
لاگ:   /home/z/my-project/p6513-transfer.log
"""

import os
import signal
import sys

LOG = "/home/z/my-project/p6513-transfer.log"
PID_FILE = "/home/z/my-project/p6513-transfer.pid"

pid = os.fork()
if pid == 0:
    # فرزند اول — رهبر نشست جدید
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    pid2 = os.fork()
    if pid2 == 0:
        # فرزند نهایی — دیمون واقعی
        logf = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        os.dup2(logf, 1)
        os.dup2(logf, 2)
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.execvp(
            "bun",
            [
                "bun",
                "/home/z/my-project/scripts/p6513-complete-transfer.ts",
                "--wait-for-token",
                "--max-minutes",
                sys.argv[1] if len(sys.argv) > 1 else "350",
            ],
        )
        os._exit(1)
    # والد میانی — PID دیمون را ثبت کن و خارج شو
    with open(PID_FILE, "w") as f:
        f.write(str(pid2))
    os._exit(0)

# والد — منتظر فرزند اول و خروج
os.waitpid(pid, 0)
try:
    with open(PID_FILE) as f:
        print(f"دیمون تکمیل انتقال اجرا شد ✓ (PID {f.read().strip()}) — لاگ: {LOG}")
except FileNotFoundError:
    print("دیمون اجرا شد ✓")
