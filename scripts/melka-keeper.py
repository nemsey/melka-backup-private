#!/usr/bin/env python3
"""melka-keeper.py v2 — DIR-DB-RECOVERY-001
============================================================
درس‌های زندهٔ حادثهٔ ۱۴۰۵/۰۸/۲۹:
  ۱) عامل پلتفرمیِ ناشناخته هر ~۱۰-۱۵ دقیقه my-project/.next و
     my-project/node_modules را پاک می‌کند (فرایندهای دیمن‌شده و مسیرهای
     بیرونی زنده می‌مانند).
  ۲) Turbopack سیم‌لینکِ node_modules را رد می‌کند
     («Symlink node_modules is invalid, it points out of the filesystem root»).

معماری v2:
  • node_modules: همیشه دایرکتوری واقعی از «هاردلینک‌ها» به فروشگاه
    (/home/z/melka-store/node_modules) — پاک‌شدن فقط لینک‌ها را می‌برد؛
    بازسازی با cp -al زیر چند ثانیه؛ Turbopack راضی (دایرکتوری واقعی).
  • .next: حین بیلد واقعی (خودِ next build واقعی‌اش می‌سازد)؛ پس از بیلدِ
    کامل → mv اتمیک به فروشگاه + سیم‌لینک در my-project (سرورِ زنده از طریق
    دentry و مسیرِ رشته‌ای بی‌وقفه ادامه می‌دهد؛ پاک‌شدن فقط لینک = بازپیوند
    زیر ۰٫۳ ثانیه).
  • همگام‌سازی فروشگاه node_modules پس از پایان هر بیلد (cp -al تازه).

دیمن: double-fork → PPID=1 (الگوی prod-watchdog که از همهٔ موج‌ها زنده ماند).
"""
import os, shutil, subprocess, sys, time, signal

REPO = "/home/z/my-project"
STORE = "/home/z/melka-store"
LOG = f"{STORE}/keeper.log"
BUILD_FLAG = f"{REPO}/upload/.runtime/BUILD_RUNNING"
BUILD_FLAG_MAX_AGE = 1500

NEXT_LINK = f"{REPO}/.next"
NEXT_STORE = f"{STORE}/next"
NM_REAL = f"{REPO}/node_modules"
NM_STORE = f"{STORE}/node_modules"

STABLE_SECS = 10.0
_state = {"next_mtime": None, "next_seen": 0.0, "nm_mtime": None, "nm_seen": 0.0}


def log(msg):
    try:
        with open(LOG, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}\n")
    except Exception:
        pass


def building():
    try:
        return (time.time() - os.stat(BUILD_FLAG).st_mtime) < BUILD_FLAG_MAX_AGE
    except FileNotFoundError:
        return False


def is_real_dir(p):
    return os.path.isdir(p) and not os.path.islink(p)


def dir_mtime(p):
    try:
        return os.stat(p).st_mtime
    except OSError:
        return None


def stable(key, path):
    """آیا mtime دایرکتوری به مدت STABLE_SECS ثابت مانده؟"""
    m = dir_mtime(path)
    now = time.time()
    if m is None:
        _state[key] = None
        return False
    if _state.get(key) != m:
        _state[key] = m
        _state[key + "_seen"] = now
        return False
    return (now - _state.get(key + "_seen", now)) >= STABLE_SECS


def cp_al(src, dst):
    """کپی هاردلینکی درخت (هم‌فایل‌سیستم) — سریع و کم‌مصرف.
    مقصد ممکن است نصفه‌حذف‌شده باشد → پاک و بازسازی اتمی‌گونه (tmp + rename)."""
    tmp = dst + ".restore-tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    subprocess.run(["cp", "-al", src, tmp], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    shutil.rmtree(dst, ignore_errors=True)
    os.rename(tmp, dst)


def handle_node_modules(is_building):
    # ۱) سیم‌لینک ممنوع (درس Turbopack) — با هاردلینک جایگزین کن
    if os.path.islink(NM_REAL):
        try:
            os.unlink(NM_REAL)
            log("removed forbidden node_modules symlink")
        except OSError as e:
            log(f"ERR unlink nm symlink: {e}")
    # ۲) غایب → بازسازی از فروشگاه با هاردلینک
    if not os.path.exists(NM_REAL) and is_real_dir(NM_STORE):
        try:
            cp_al(NM_STORE, NM_REAL)
            log("restored node_modules via hardlink tree from store")
        except Exception as e:
            log(f"ERR restore nm: {e}")
            return
    # ۳) حین بیلد: فروشگاه را دست نمی‌زنیم
    if is_building:
        return
    # ۴) واقعیِ کاملِ باثبات → همگام‌سازی فروشگاه (فقط وقتی فروشگاه کهنه/ناقص است)
    if is_real_dir(NM_REAL) and os.path.exists(f"{NM_REAL}/.bin/next") and stable("nm", NM_REAL):
        need_sync = not os.path.exists(f"{NM_STORE}/.bin/next")
        if need_sync:
            tmp = NM_STORE + ".new"
            shutil.rmtree(NM_STORE + ".old", ignore_errors=True)
            try:
                if os.path.exists(NM_STORE):
                    os.rename(NM_STORE, NM_STORE + ".old")
                cp_al(NM_REAL, tmp)
                os.rename(tmp, NM_STORE)
                shutil.rmtree(NM_STORE + ".old", ignore_errors=True)
                log("synced node_modules store (hardlink copy)")
            except Exception as e:
                log(f"ERR sync nm store: {e}")


def handle_next(is_building):
    if is_building:
        return  # بیلد خودش .next واقعی می‌سازد
    complete = os.path.exists(f"{NEXT_LINK}/BUILD_ID") and os.path.exists(f"{NEXT_LINK}/fingerprint.json")
    if is_real_dir(NEXT_LINK) and complete and stable("next", NEXT_LINK):
        # پارک: mv اتمیک + سیم‌لینک
        shutil.rmtree(NEXT_STORE + ".old", ignore_errors=True)
        try:
            if os.path.exists(NEXT_STORE):
                os.rename(NEXT_STORE, NEXT_STORE + ".old")
            os.rename(NEXT_LINK, NEXT_STORE)
            os.symlink(NEXT_STORE, NEXT_LINK)
            shutil.rmtree(NEXT_STORE + ".old", ignore_errors=True)
            log("parked .next → store + symlink")
        except Exception as e:
            log(f"ERR park .next: {e}")
    elif os.path.islink(NEXT_LINK):
        if not os.path.isdir(NEXT_STORE):
            log(f"WARN .next symlink → missing target")
    elif not os.path.exists(NEXT_LINK) and is_real_dir(NEXT_STORE):
        try:
            os.symlink(NEXT_STORE, NEXT_LINK)
            log("re-linked wiped .next → store")
        except OSError as e:
            log(f"ERR relink .next: {e}")


def cycle():
    b = building()
    handle_node_modules(b)
    handle_next(b)


def main_loop():
    os.makedirs(STORE, exist_ok=True)
    log(f"=== keeper v2 live pid={os.getpid()} ===")
    while True:
        try:
            cycle()
        except Exception as e:
            log(f"cycle-ERR {e}")
        time.sleep(0.3)


def daemonize():
    pid = os.fork()
    if pid > 0:
        os.waitpid(pid, 0)
        print(f"keeper v2 daemonized (store={STORE})")
        return
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)
    devnull = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(devnull, fd)
    main_loop()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--foreground":
        main_loop()
    else:
        daemonize()
