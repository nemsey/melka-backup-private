#!/usr/bin/env python3
"""
p6519-restart-dev.py — بازگرداندن سرور dev + سوپروایزر با double-fork
--------------------------------------------------------------------
فرزند نهایی: setsid + بدون ترمینال کنترلی + فرزند init (PPID=1)
→ از کشتنِ درخت فرایندِ فراخوان ابزار جان سالم به در می‌برد
(همان سازوکار اثبات‌شدهٔ p6513-launch-daemon.py)

دیمون: bash /home/z/my-project/.zscripts/dev.sh
       (restore env → bun install → db:generate → سوپروایزر خودترمیم → :3000)
لاگ:   /home/z/my-project/.zscripts/dev-restart-p6519.log
"""

import os
import signal
import sys

LOG = "/home/z/my-project/.zscripts/dev-restart-p6519.log"
PID_FILE = "/home/z/my-project/.zscripts/dev-restart.pid"

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
            "bash",
            ["bash", "/home/z/my-project/.zscripts/dev.sh"],
        )
        os._exit(1)
    # والد میانی — PID دیمون را ثبت کن و خارج شو
    with open(PID_FILE, "w") as f:
        f.write(str(pid2))
    os._exit(0)

# والد — منتظر فرزند اول و خروج
os.waitpid(pid, 0)
print(f"dev.sh launcher forked (child pid در {PID_FILE})")
sys.exit(0)
