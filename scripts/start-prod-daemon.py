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
import subprocess
import sys

STOP_FLAG = "/home/z/my-project/.prod-stop"

# ─── DIR-DB-RECOVERY-001: گارد تک‌نمونهٔ نگهبان ───
# درس حادثهٔ ۱۴۰۵/۰۸/۲۹ (ساعت ~۱۸:۳۳): بوت دوم در حالی که نگهبان اول زنده بود،
# دو نگهبان همزمان → دو socket-master → حلقهٔ EADDRINUSE + فشار همزمان نوشتن
# روی SQLite زنده (ریشهٔ مشارکت‌کننده در خرابی صفحه‌های RelayQueue/AuditLog).
# اکنون: اگر نگهبانی زنده است، دیمن تازه هرگز spawn نمی‌شود (پاس صادقانه).
try:
    out = subprocess.run(
        ["pgrep", "-f", "scripts/prod-watchdog.sh"],
        capture_output=True, text=True, timeout=10,
    )
    alive = [p for p in out.stdout.split() if p and int(p) != os.getpid()]
except Exception:
    alive = []
if alive:
    print(f"نگهبان production از قبل زنده است (PID {' '.join(alive)}) — spawn تازه رد شد ✓")
    sys.exit(0)

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
