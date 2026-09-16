#!/usr/bin/env python3
"""
p3-visual-daemon.py — دیمون double-fork استاندارد یونیکس برای سرورهای رگرسیون بصری PHASE 3
------------------------------------------------------------------------------------
اجرا: python3 scripts/p3-visual-daemon.py <worktree-dir> <port>
سرور standalone داخل worktree روی پورت داده‌شده با پایگاه تست ایزوله بالا می‌آید.
(پورت ۳۰۰۰ هرگز لمس نمی‌شود — production زنده است.)
"""

import os
import sys

WORKTREE = sys.argv[1]
PORT = sys.argv[2]
NAME = os.path.basename(WORKTREE)

ENV = {
    **os.environ,
    "PORT": PORT,
    "HOSTNAME": "0.0.0.0",
    "NODE_ENV": "production",
    "DATABASE_URL": "file:/home/z/my-project/db/test-repository.db",
    "MELK_TOKEN_KEY": "test-only-key-not-a-real-secret",
    "MASTER_ACCESS_CODE": "20700000",
}

pid = os.fork()
if pid == 0:
    os.setsid()
    pid2 = os.fork()
    if pid2 == 0:
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0)
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        # درس P1-06: سرور standalone در worktree در مسیر تودرتو ساخته می‌شود؛
        # CWD = ریشه standalone (برای static/public) و exec = server.js تودرتو
        os.chdir(f"{WORKTREE}/.next/standalone")
        os.execvpe("bun", ["bun", f"{WORKTREE}/.next/standalone/{NAME}/server.js"], ENV)
        os._exit(1)
    os._exit(0)

os.waitpid(pid, 0)
print(f"daemon started: {WORKTREE} on :{PORT} (PPID=1)")
