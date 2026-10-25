#!/usr/bin/env python3
"""
p6514-launch-daemon.py — اجرای دیمون BLOCK C غنی‌سازی معاملات با double-fork
-----------------------------------------------------------------------------
فرزند نهایی: setsid + بدون ترمینال کنترلی + فرزند init (PPID=1)
→ از کشتنِ درخت فرایندِ فراخوان ابزار جان سالم به در می‌برد
(همان سازوکار p6513-launch-daemon.py — شاهد بقای دیمون‌های قبلی)

دیمون: bun scripts/p6514-tx-info-run.ts --max-minutes N
لاگ:   /home/z/my-project/p6514-tx-info.log
"""

import os
import signal
import sys

LOG = "/home/z/my-project/p6514-tx-info.log"
PID_FILE = "/home/z/my-project/p6514-tx-info.pid"

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
                "/home/z/my-project/scripts/p6514-tx-info-run.ts",
                "--max-minutes",
                sys.argv[1] if len(sys.argv) > 1 else "40",
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
        print(f"دیمون BLOCK C اجرا شد ✓ (PID {f.read().strip()}) — لاگ: {LOG}")
except FileNotFoundError:
    print("دیمون اجرا شد ✓")
