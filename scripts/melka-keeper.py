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
import os, re, shutil, subprocess, sys, time, signal
import urllib.request

REPO = "/home/z/my-project"
STORE = "/home/z/melka-store"
LOG = f"{STORE}/keeper.log"
BUILD_FLAG = f"{REPO}/upload/.runtime/BUILD_RUNNING"
BUILD_FLAG_MAX_AGE = 1500

NEXT_LINK = f"{REPO}/.next"
NEXT_STORE = f"{STORE}/next"
NM_REAL = f"{REPO}/node_modules"
NM_STORE = f"{STORE}/node_modules"

# ─── DIR-STATIC-500-001: پروب سلامت سرو‌دهی + خودترمیمی رسمی ───
PROBE_URL = "http://127.0.0.1:3000"
PROBE_INTERVAL = 5.0          # هر ~۵ ثانیه
HEAL_LOCK = f"{STORE}/heal-deploy.lock"
HEAL_COOLDOWN = 240.0         # حداقل فاصلهٔ دو ترمیم خودکار
HEAL_TRIGGER_AFTER = 2         # دو پروب شکست‌خوردهٔ پیاپی (ضد لرزش)
_next_probe_at = 0.0
_probe_fails = 0
_last_heal_at = 0.0

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
        # DIR-STATIC-500-001 — پارک امن: اگر سرور زنده از درخت فروشگاه سرو می‌کند،
        # پارک (حذف درخت قدیمی) CWD سرور را می‌کشد → فقط با ری‌استارت همراه است؛
        # کیپر هرگز بدون ترمیم رسمی پارک نمی‌کند — درخت واقعی را دست‌نخورده می‌گذارد.
        if server_cwd_deleted() or any_server_cwd_in_store():
            log("WARN: .next واقعی کامل اما سرور از درخت فروشگاه سرو می‌کند — پارک خودکار متوقف (ترمیم رسمی لازم: heal-deploy.sh)")
            return
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


def server_cwd_deleted():
    """آیا CWD سرور زنده حذف شده؟ (ریشهٔ حادثهٔ ۵۰۰ چانک‌های 2026-11-20)"""
    try:
        out = subprocess.run(["pgrep", "-f", "next-server"],
                             capture_output=True, text=True, timeout=5).stdout.split()
    except Exception:
        return False
    for pid in out:
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
            if "deleted" in cwd:
                return True
        except OSError:
            continue
    return False


def any_server_cwd_in_store():
    """آیا سروری از درخت فروشگاه (melka-store/next) سرو می‌کند؟"""
    try:
        out = subprocess.run(["pgrep", "-f", "next-server"],
                             capture_output=True, text=True, timeout=5).stdout.split()
    except Exception:
        return False
    for pid in out:
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
            if NEXT_STORE in cwd:
                return True
        except OSError:
            continue
    return False


def http_get(path, timeout=4):
    try:
        with urllib.request.urlopen(PROBE_URL + path, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def serving_broken():
    """تشخیص چندوجهی خرابی سرو‌دهی ایستا: CWD حذف‌شده / چانک غیر۲۰۰ / drift."""
    # ۱) CWD حذف‌شده — قطعی‌ترین علامت
    if server_cwd_deleted():
        return True, "server-cwd-deleted"
    # ۲) پروب چانک — همان چیزی که مرورگر تجربه می‌کند
    code, html = http_get("/")
    if code != 200:
        return False, None  # سرور پایین/در بوت — دامنهٔ واچ‌داگ، نه کیپر
    m = re.search(r"/_next/static/chunks/[^\"\\\\]+?\.js", html)
    if not m:
        return False, None   # صفحهٔ بدون ارجاع چانک (ورود؟) — تصمیم‌ناپذیر
    ccode, _ = http_get(m.group(0))
    if ccode != 200:
        return True, f"chunk-{ccode}"
    # ۳) drift: بیلدِ سرو‌شده ≠ بیلدِ دیسک (سرور از درخت کهنه/مهاجم سرو می‌کند)
    try:
        vcode, vbody = http_get("/api/version")
        if vcode == 200:
            m2 = re.search(r'"buildId"\s*:\s*"([^-]+)-', vbody)
            disk_bid = open(f"{NEXT_STORE}/BUILD_ID").read().strip()
            disk_sha = disk_bid.split("-")[0]
            if m2 and m2.group(1) != disk_sha:
                return True, f"drift-live={m2.group(1)}-disk={disk_sha}"
    except OSError:
        pass
    return False, None


def heal_in_progress():
    """قفل ترمیم گرفته شده؟ (flock زنده توسط heal-deploy.sh)"""
    try:
        r = subprocess.run(["flock", "-n", HEAL_LOCK, "-c", "true"],
                           capture_output=True, timeout=5)
        return r.returncode != 0
    except Exception:
        return False


def trigger_heal(reason):
    """اجرای جدا شدهٔ ترمیم رسمی (بیلد رسمی + ری‌استارت + راستی‌آزمایی)."""
    global _last_heal_at
    _last_heal_at = time.time()
    log(f"HEAL-TRIGGER: {reason} — اجرای scripts/heal-deploy.sh")
    try:
        subprocess.Popen(
            ["setsid", "bash", f"{REPO}/scripts/heal-deploy.sh",
             "--reason", f"keeper:{reason}"],
            stdout=open(f"{STORE}/heal-deploy.log", "a"),
            stderr=subprocess.STDOUT,
            start_new_session=True,
            cwd="/",
        )
    except Exception as e:
        log(f"ERR trigger heal: {e}")


def probe_serving():
    """چرخهٔ پروب (هر PROBE_INTERVAL ثانیه) — با خنثی‌سازی حین بیلد/ترمیم."""
    global _next_probe_at, _probe_fails
    now = time.time()
    if now < _next_probe_at:
        return
    _next_probe_at = now + PROBE_INTERVAL
    if building():
        _probe_fails = 0
        return
    if heal_in_progress():
        _probe_fails = 0
        return
    if now - _last_heal_at < HEAL_COOLDOWN:
        return
    broken, reason = serving_broken()
    if not broken:
        if _probe_fails:
            log(f"probe recovered after {_probe_fails} fail(s)")
        _probe_fails = 0
        return
    _probe_fails += 1
    log(f"probe FAIL {_probe_fails}/{HEAL_TRIGGER_AFTER}: {reason}")
    if _probe_fails >= HEAL_TRIGGER_AFTER:
        _probe_fails = 0
        trigger_heal(reason)


def cycle():
    b = building()
    handle_node_modules(b)
    handle_next(b)
    probe_serving()


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
