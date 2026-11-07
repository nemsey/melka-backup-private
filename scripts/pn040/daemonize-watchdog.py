#!/usr/bin/env python3
# ============================================================
# daemonize-watchdog.py — PN-040 · گام ۱ (بوت پایدار)
# ------------------------------------------------------------
# درس این جلسه: فرایندهای زمینه‌ایِ عادیِ هر دستورِ ابزار، در مرز دستور
# بعدی reap می‌شوند (شاهد زنده: sleeper ساده مرد، دیمنِ دو-فورکی زنده).
# راه‌حل: دیمن‌سازی دو-فورکی (یتیمِ PID 1 = tini) → نگهبان production
# بیرون از درختِ reap می‌نشیند و سرور + Worker را مثل بوتِ خودِ پلتفرم
# (الگوی 02:14 امروز) نگه می‌دارد.
#
# اجرا:  python3 scripts/pn040/daemonize-watchdog.py
# خروجی: upload/.runtime/watchdog.pid + شروع نگهبان (exec در همان PID)
# لاگ:   server.log (همان لاگ رسمی سرور/نگهبان)
# ============================================================
import os
import sys

REPO = "/home/z/my-project"
LOG = os.path.join(REPO, "server.log")
PIDFILE = os.path.join(REPO, "upload", ".runtime", "watchdog.pid")
STOP_FLAG = os.path.join(REPO, ".prod-stop")

# فلگ توقف رسمی قبلی را پاک کن (بوت تازه)
try:
    if os.path.exists(STOP_FLAG):
        os.remove(STOP_FLAG)
except OSError:
    pass

# ─── دیمن‌سازی دو-فورکی ───
if os.fork() > 0:
    sys.exit(0)           # والد اول خارج — فرزند به init سپرده می‌شود
os.setsid()               # جلسهٔ جدید — بدون کنترل‌کنندهٔ tty
if os.fork() > 0:
    sys.exit(0)           # فورک دوم → قطع رهبری جلسه + یتیمیِ تضمینی (PPID=1)

# ─── هدایت fd ها: لاگ سرور + /dev/null ───
fd_out = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd_out, 1)
os.dup2(fd_out, 2)
fd_in = os.open(os.devnull, os.O_RDONLY)
os.dup2(fd_in, 0)

# ─── ثبت PID + اجرای نگهبان (exec — همان PID در pidfile) ───
os.makedirs(os.path.dirname(PIDFILE), exist_ok=True)
with open(PIDFILE, "w") as f:
    f.write(str(os.getpid()))

os.chdir(REPO)
os.execvp("bash", ["bash", os.path.join(REPO, "scripts", "prod-watchdog.sh")])
