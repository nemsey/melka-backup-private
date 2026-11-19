#!/usr/bin/env python3
"""deleter-watch v2 — DIR-DB-RECOVERY-001
ناظر مقاوم: واچ‌های inotify هر ۵ ثانیه دوباره نصب می‌شوند (درس حذفِ خودکارِ
واچ پس از پاک شدن دایرکتوری توسط بیلد) + اسنپ‌شات ps هر ۱ ثانیه در بافر
حلقه‌ای + ثبت رویدادهای ساخت/حذف در دایرکتوری‌های حساس.
"""
import ctypes, ctypes.util, os, struct, subprocess, time, threading

REPO = "/home/z/my-project"
LOG = "/tmp/deleter-watch.log"
PS_LOG = "/tmp/deleter-ps.log"

IN_DELETE = 0x200
IN_DELETE_SELF = 0x400
IN_MOVED_FROM = 0x40
IN_MOVED_TO = 0x80
IN_CREATE = 0x100
MASK = IN_DELETE | IN_DELETE_SELF | IN_MOVED_FROM | IN_MOVED_TO | IN_CREATE

libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
fd = -1
wds = {}
lock = threading.Lock()

def log(msg):
    with open(LOG, "a") as f:
        f.write(f"{time.strftime('%H:%M:%S.%f')[:-5]} {msg}\n")

TARGETS = [
    REPO, REPO + "/.next", REPO + "/.next/static", REPO + "/.next/static/chunks",
    REPO + "/.next/standalone", REPO + "/.next/standalone/.next",
    REPO + "/node_modules", REPO + "/node_modules/.bin",
    REPO + "/upload/.runtime", REPO + "/db", REPO + "/db/.mirror",
    REPO + "/.build-parking",
]

def rearm():
    """نصب دوبارهٔ واچ‌ها برای مسیرهای موجود + کشف مسیرهای تازه."""
    global fd, wds
    with lock:
        if fd < 0:
            fd = libc.inotify_init1(os.O_NONBLOCK)
            if fd < 0:
                return
        cur = dict(wds)
        wds.clear()
        for t in TARGETS:
            if os.path.exists(t):
                wd = libc.inotify_add_watch(fd, t.encode(), MASK)
                if wd > 0:
                    if cur.get(wd) != t:
                        pass  # همان واچ قبلی
                    wds[wd] = t
        # واچ‌های ازدست‌رفته را گزارش کن
        gone = set(cur.values()) - set(wds.values())
        if gone:
            log(f"rearm: watches lost: {sorted(gone)}")

def watcher_loop():
    buf = b""
    while True:
        rearm()
        try:
            chunk = os.read(fd, 65536)
            buf += chunk
        except (BlockingIOError, OSError):
            buf = b""
            time.sleep(0.15)
            continue
        while len(buf) >= 16:
            wd, mask, cookie, name_len = struct.unpack_from("iIII", buf, 0)
            name = buf[16:16 + name_len].split(b"\x00")[0].decode(errors="replace")
            buf = buf[16 + name_len:]
            base = wds.get(wd, f"wd{wd}")
            if mask & IN_DELETE:
                log(f"DELETE {base}/{name}")
            elif mask & IN_DELETE_SELF:
                log(f"DIR-GONE {base}")
            elif mask & IN_MOVED_FROM:
                log(f"moved-from {base}/{name} cookie={cookie}")
            elif mask & IN_MOVED_TO:
                if "tmp" not in name:
                    log(f"moved-to {base}/{name}")

def ps_loop():
    while True:
        try:
            out = subprocess.run(
                ["ps", "-eo", "pid,ppid,lstart,cmd", "--no-headers"],
                capture_output=True, text=True, timeout=3).stdout
            lines = [l for l in out.splitlines()
                     if l.strip() and "deleter-watch" not in l and "ps -eo" not in l
                     and "chrome" not in l and "crashpad" not in l]
            with open(PS_LOG, "w") as f:
                f.write(f"=== snapshot {time.strftime('%H:%M:%S')} ===\n")
                f.write("\n".join(lines[-70:]))
        except Exception:
            pass
        time.sleep(1)

if __name__ == "__main__":
    threading.Thread(target=ps_loop, daemon=True).start()
    log(f"=== watcher v2 live pid={os.getpid()} ===")
    watcher_loop()
