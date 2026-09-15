#!/usr/bin/env python3
"""
اجرای دیمون نگهبان production — با double-fork استاندارد یونیکس
---------------------------------------------------------------
فرزند نهایی: setsid + بدون ترمینال کنترلی + فرزند init (PPID=1)
→ از کشتنِ درخت فرایندِ فراخوان ابزار جان سالم به در می‌برد
(همان سازوکاری که دیمون agent-browser از آن زنده می‌ماند).
"""

import os
import signal
import sys

STOP_FLAG = "/home/z/my-project/.prod-stop"

# فلگ توقف قبلی را پاک کن (شروع تازه)
try:
    os.remove(STOP_FLAG)
except FileNotFoundError:
    pass

pid = os.fork()
if pid == 0:
    # فرزند اول — رهبر نشست جدید
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    pid2 = os.fork()
    if pid2 == 0:
        # فرزند نهایی — دیمون واقعی
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        os.execvp(
            "bash",
            ["bash", "/home/z/my-project/scripts/prod-watchdog.sh"],
        )
        os._exit(1)
    os._exit(0)

# والد — منتظر فرزند اول و خروج
os.waitpid(pid, 0)
print("نگهبان production به‌صورت دیمون اجرا شد ✓")
