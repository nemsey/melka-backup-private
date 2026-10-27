#!/usr/bin/env python3
"""PN-055 — راه‌انداز دیمن خزندهٔ وب‌سایت (double-fork)"""
import os, signal
os.chdir("/home/z/my-project")
pid = os.fork()
if pid == 0:
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    pid2 = os.fork()
    if pid2 == 0:
        devnull = os.open(os.devnull, os.O_RDWR)
        log = os.open("download/pn055/crawl-web.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o664)
        os.dup2(devnull, 0); os.dup2(log, 1); os.dup2(log, 2)
        os.execvp("bun", ["bun", "scripts/pn055-crawl-web.ts"])
        os._exit(1)
    os._exit(0)
os.waitpid(pid, 0)
print("خزندهٔ وب PN-055 دیمن شد ✓")
