#!/usr/bin/env python3
"""ws-build-daemon.py — DIR-DB-RECOVERY-001
بیلد بیرون از منطقهٔ پاک‌شدن (فرا-پروژه) + جابه‌جایی اتمی به فروشگاه.
دیمن double-fork (PPID=1) — از پاک‌سازی فرایندهای هم‌نشستِ ابزار زنده می‌ماند.
"""
import os, shutil, signal, subprocess, sys, time

WS = "/home/z/melka-build-ws"
STORE = "/home/z/melka-store"
LOG = f"{STORE}/ws-build-daemon.log"
REPO = "/home/z/my-project"
BUILD_FLAG = f"{REPO}/upload/.runtime/BUILD_RUNNING"


def log(m):
    with open(LOG, "a") as f:
        f.write(f"{time.strftime('%H:%M:%S')} {m}\n")


def kill_mirror_threats():
    """هر فرایند آینهٔ داغ / کپیِ آن را بکش — دیسک را در حین بیلد آزاد نگه می‌دارد."""
    try:
        out = subprocess.run(["pgrep", "-f", "hot-mirror"],
                             capture_output=True, text=True, timeout=5).stdout.split()
        for p in out:
            try:
                os.kill(int(p), signal.SIGKILL)
                log(f"killed hot-mirror pid {p}")
            except (ProcessLookupError, ValueError):
                pass
    except Exception:
        pass


def prepare_ws():
    """منبع تازه از HEAD + وصلهٔ مسیر + env + گیتِ حداقلی.
    (درس 20:50: git archive تازه وصلهٔ cd را بازمی‌گرداند → هر بار دوباره وصله می‌زنیم)
    (درس DIR-STATIC-500-002 14:00: فضای کاری هرگز «تمیز فرض» نمی‌شود — هر
     پسماندی از اجراهای قبلی (به‌ویژه سیم‌لینک/دایرکتوری WS/.next که گارد پوسته
     بیلد رسمی را برای همیشه می‌بندد) پیش از بیلد پاک می‌شود.)"""
    # ── پاکسازی پسماند فرا-مهم: WS/.next از هر نوعی (سیم‌لینک/دایرکتوری/فایل) ──
    # حادثهٔ 2026-11-20 14:03-14:40: سیم‌لینک یتیم WS/.next → store/next باعث شد
    # گارد پوسته build-with-parking.sh هر بیلد رسمی را در همان ۲ ثانیهٔ اول
    # ببندد («بیلد درجا ممنوع») → کیپر ۱۰ بار ترمیم → ۱۰ شکست → اپ مرده ماند.
    try:
        if os.path.islink(f"{WS}/.next"):
            os.unlink(f"{WS}/.next")
            log("sanitized WS: removed stale .next symlink (DIR-STATIC-500-002)")
        elif os.path.exists(f"{WS}/.next"):
            shutil.rmtree(f"{WS}/.next", ignore_errors=True)
            log("sanitized WS: removed stale .next tree (DIR-STATIC-500-002)")
    except OSError as e:
        log(f"ERR sanitize WS/.next: {e}")
    # پسماند پارک بیلدهای کشته‌شده
    shutil.rmtree(f"{WS}/.build-parking", ignore_errors=True)
    archive = subprocess.run(["git", "archive", "HEAD"], cwd=REPO,
                             stdout=subprocess.PIPE, check=True).stdout
    with subprocess.Popen(["tar", "-x", "-C", WS],
                          stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL) as tar:
        tar.stdin.write(archive)
        tar.stdin.close()
        tar.wait()
    # وصلهٔ مسیر — بیلد همیشه در ws (نه my-project)
    bp = f"{WS}/scripts/build-with-parking.sh"
    try:
        src = open(bp).read()
        patched = src.replace("cd /home/z/my-project", f"cd {WS}")
        if patched != src:
            open(bp, "w").write(patched)
            log("patched build-with-parking cd → ws")
    except OSError as e:
        log(f"WARN patch: {e}")
    # env و پلتفرم
    for f in (".env", ".env.local", "env.platform.json"):
        try:
            shutil.copy2(f"{REPO}/{f}", f"{WS}/{f}")
        except FileNotFoundError:
            pass
    # گیت حداقلی برای fingerprint (rev-parse بدون آبجکت)
    sha = subprocess.run(["git", "-C", REPO, "rev-parse", "HEAD"],
                         capture_output=True, text=True, check=True).stdout.strip()
    os.makedirs(f"{WS}/.git/objects", exist_ok=True)
    os.makedirs(f"{WS}/.git/refs/heads", exist_ok=True)
    open(f"{WS}/.git/HEAD", "w").write("ref: refs/heads/main\n")
    open(f"{WS}/.git/refs/heads/main", "w").write(sha + "\n")
    if not os.path.exists(f"{WS}/.git/config"):
        open(f"{WS}/.git/config", "w").write(
            "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n")
    # node_modules: هاردلینک از فروشگاه اگر غایب/ناقص است
    if not os.path.exists(f"{WS}/node_modules/.bin/next") and os.path.exists(f"{STORE}/node_modules/.bin/next"):
        shutil.rmtree(f"{WS}/node_modules", ignore_errors=True)
        subprocess.run(["cp", "-al", f"{STORE}/node_modules", f"{WS}/node_modules"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log("ws node_modules restored from store")
    return sha


def run():
    log("=== ws build daemon start ===")
    t0 = time.time()
    # DIR-STATIC-500-001: پرچم BUILD_RUNNING — کیپر و سایر نگهبانان حین بیلد
    # رسمی پروب/ترمیم را متوقف می‌کنند (پنجرهٔ جابه‌جایی طبیعی است، نه حادثه)
    os.makedirs(os.path.dirname(BUILD_FLAG), exist_ok=True)
    # DIR-STATIC-500-002: محتوای پرچم = timestamp (نه PID) — هم‌پروتکل با
    # build-with-parking.sh (خط ۱۱۵: age = now - محتوا) و کیپر (mtime).
    # با PID، قفل درون‌بیلد همیشه «stale» تشخیص داده می‌شد → بیلدهای موازی
    # (همان مسابقهٔ ۱۵:۲۷ که دو بیلد پشت‌سرهم ساخت).
    open(BUILD_FLAG, "w").write(str(int(time.time())))
    try:
        return _run_inner(t0)
    finally:
        try:
            os.remove(BUILD_FLAG)
        except OSError:
            pass


def _run_inner(t0):
    prepare_ws()
    # بیلد در فضای کاری (امن از پاک‌شدن‌ها)
    r = subprocess.run(
        ["bun", "run", "build"],
        cwd=WS,
        stdout=open(f"{STORE}/ws-build.log", "w"),
        stderr=subprocess.STDOUT,
        env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=2048",
             "RAYON_NUM_THREADS": "1"},
    )
    log(f"build exit={r.returncode} in {time.time()-t0:.0f}s")
    if r.returncode != 0:
        log("BUILD FAILED — no swap")
        return 1

    # وارسی محصول
    bid = open(f"{WS}/.next/BUILD_ID").read().strip()
    fp = os.path.exists(f"{WS}/.next/fingerprint.json")
    srv = os.path.exists(f"{WS}/.next/standalone/server.js")
    log(f"BUILD_ID={bid} fingerprint={fp} standalone={srv}")
    if not (fp and srv):
        log("BUILD INCOMPLETE — no swap")
        return 1

    # جابه‌جایی به فروشگاه (mv هم‌فایل‌سیستم = آنی)
    # DIR-STATIC-500-002: next.old دیگر بلافاصله حذف نمی‌شود — درختِ کهنه ممکن
    # است هنوز CWD سرورِ زنده باشد (سواپ پیش از ری‌استارت). حذف فقط پس از
    # راستی‌آزمایی ری‌استارت موفق (پایین). اگر ترمیم ناتمام بمیرد، دور بعدی
    # همین ابتدای سواپ پسماند را می‌پاکد.
    shutil.rmtree(f"{STORE}/next.older", ignore_errors=True)
    if os.path.exists(f"{STORE}/next.old"):
        os.rename(f"{STORE}/next.old", f"{STORE}/next.older")
    if os.path.exists(f"{STORE}/next"):
        os.rename(f"{STORE}/next", f"{STORE}/next.old")
    os.rename(f"{WS}/.next", f"{STORE}/next")

    # سیم‌لینک my-project/.next (اگر کیپر زنده باشد خودش هم می‌سازد)
    try:
        if os.path.islink(f"{REPO}/.next"):
            os.unlink(f"{REPO}/.next")
        elif os.path.isdir(f"{REPO}/.next"):
            shutil.rmtree(f"{REPO}/.next")
        os.symlink(f"{STORE}/next", f"{REPO}/.next")
        log("symlink my-project/.next → store/next")
    except OSError as e:
        log(f"ERR symlink: {e}")

    # همگام‌سازی node_modules فروشگاه (پرisma client و…) با هاردلینک تازه
    try:
        shutil.rmtree(f"{STORE}/node_modules.new", ignore_errors=True)
        subprocess.run(["cp", "-al", f"{WS}/node_modules", f"{STORE}/node_modules.new"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(f"{STORE}/node_modules.old", ignore_errors=True)
        if os.path.exists(f"{STORE}/node_modules"):
            os.rename(f"{STORE}/node_modules", f"{STORE}/node_modules.old")
        os.rename(f"{STORE}/node_modules.new", f"{STORE}/node_modules")
        shutil.rmtree(f"{STORE}/node_modules.old", ignore_errors=True)
        log("store node_modules synced")
    except Exception as e:
        log(f"WARN nm sync: {e}")

    log(f"=== SWAP DONE buildId={bid} (next.old محفوظ تا راستی‌آزمایی) ===")
    verified = restart_and_verify(bid)
    # DIR-PN080-001 (درس شب ۲۰۲۶-۱۱-۲۰): نتیجهٔ راستی‌آزمایی محترم شمرده می‌شود —
    # اگر همگرا نشد، next.old (آخرین بیلد سالمِ سرو‌شده) برای بازگشت سریع
    # محفوظ می‌ماند؛ چرخهٔ بعدی دیمن دوباره می‌سازد و تلاش می‌کند.
    if verified:
        shutil.rmtree(f"{STORE}/next.old", ignore_errors=True)
        shutil.rmtree(f"{STORE}/next.older", ignore_errors=True)
        log(f"=== HEARTBEAT-VERIFIED buildId={bid} — next.old/older پاک شد ===")
    else:
        log(f"=== VERIFY-FAILED buildId={bid} — next.old محفوظ ماند (چرخهٔ بعد دوباره تلاش می‌کند) ===")
    return 0 if verified else 1


def revive_stack_if_dead():
    """DIR-PN080-001 (درس شب ۲۰۲۶-۱۱-۲۰): اگر deploy-done نیامد، ریشه معمولاً
    socket-master/watchdog مرده یا سرور تغییرعنوان‌یافتهٔ کهنه است که پورت
    ۳۰۰۰ را گروگان گرفته. درمان: کشتن سرور کهنه (الگوی تغییرعنوان‌آگاه) +
    زنده‌سازی زنجیرهٔ نگهبان → socket-master → سرور تازه از درخت تازه."""
    import subprocess as _sp
    try:
        # ۱) سرورهای کهنهٔ تغییرعنوان‌یافته (cmdline = "next-server (v16.1.3)") —
    #    pkill -f "standalone/server.js" آن‌ها را نمی‌بیند (ریشهٔ drift امشب)
        _sp.run(["pkill", "-f", "next-server \\(v"], capture_output=True, timeout=10)
        _sp.run(["pkill", "-f", "standalone/server.js"], capture_output=True, timeout=10)
        # ۲) نگهبان زنده است؟ (خودش socket-master را در حلقه‌اش احیا می‌کند)
        r = _sp.run(["pgrep", "-f", "scripts/prod-watchdog.sh"], capture_output=True, text=True, timeout=10)
        watchdog_alive = bool(r.stdout.strip())
        if not watchdog_alive:
            log("revive: نگهبان production مرده — استارت دوباره (start-prod-daemon)")
            _sp.Popen(["setsid", "python3", f"{REPO}/scripts/start-prod-daemon.py"],
                      stdout=_sp.DEVNULL, stderr=_sp.DEVNULL, start_new_session=True, cwd="/")
        else:
            log("revive: نگهبان زنده است — کشتن سرور کهنه کافی است (socket-master دوباره اسپاون می‌کند)")
        # ۳) socket-master مرده اما نگهبان زنده؟ حلقهٔ نگهبان تا ۱ث بعد تلاش می‌کند — کافی است.
        return True
    except Exception as e:
        log(f"revive ERR: {e}")
        return False


def restart_and_verify(bid: str, timeout_s: int = 90) -> bool:
    """DIR-STATIC-500-002: سواپ بدون ری‌استارت = مرگ سرو‌دهی (چانک BUILD_ID-hash
    هر بیلد عوض می‌شود چون timestamp داخل باندل پخته می‌شود). این دیمن اکنون
    خودش ری‌استارت Blue/Green را تضمین می‌کند و تا همگرایی live==disk صبر
    می‌کند — وابسته به هیچ عاملی از بیرون نیست."""
    import urllib.request
    RUNTIME = f"{REPO}/upload/.runtime"
    t0 = time.time()
    try:
        with open(f"{RUNTIME}/pn054-cmd", "w") as f:
            f.write('{"cmd":"restart"}')
        log("restart cmd sent to socket-master (pn054)")
    except OSError as e:
        log(f"ERR send restart cmd: {e}")
        return False
    # انتظار برای deploy-done تازه (mtime > t0) — نه نشانگر کهنه
    deadline = t0 + timeout_s
    deployed = False
    while time.time() < deadline:
        try:
            if os.path.getmtime(f"{RUNTIME}/pn054-deploy-done") > t0:
                deployed = True
                break
        except OSError:
            pass
        time.sleep(1.0)
    if not deployed:
        log(f"WARN: deploy-done تازه در {timeout_s}s نیامد — احیای زنجیرهٔ نگهبان (DIR-PN080)")
        revive_stack_if_dead()
        # پس از احیا، پنجرهٔ دومی برای deploy-done
        deadline2 = time.time() + 60
        while time.time() < deadline2:
            try:
                if os.path.getmtime(f"{RUNTIME}/pn054-deploy-done") > t0:
                    deployed = True
                    break
            except OSError:
                pass
            time.sleep(1.0)
    # راستی‌آزمایی نهایی: buildId زنده == دیسک
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:3000/api/version", timeout=5) as r:
                import json as _json
                live = _json.loads(r.read().decode()).get("buildId", "")
            if live == bid:
                log(f"RESTART-VERIFIED: live buildId == {bid}")
                return True
            log(f"drift transient: live={live} disk={bid} — انتظار…")
        except Exception:
            pass
        time.sleep(2.0)
    log(f"FAIL: live buildId پس از ری‌استارت همگرا نشد (disk={bid}) — next.old محفوظ می‌ماند")
    return False


def main():
    # پاک‌سازی تهدیدهای دیسک در پس‌زمینه حین بیلد
    import threading
    stop = threading.Event()

    def guard():
        while not stop.wait(30):
            kill_mirror_threats()
            try:
                for f in os.listdir(f"{REPO}/backups"):
                    if f.startswith("backup-") and f.endswith(".db"):
                        p = f"{REPO}/backups/{f}"
                        sz = os.path.getsize(p)
                        if sz > 100_000_000:
                            os.remove(p)
                            log(f"guard: removed rootfs backup {f} ({sz//2**20}MB)")
            except Exception:
                pass

    t = threading.Thread(target=guard, daemon=True)
    t.start()
    rc = run()
    stop.set()
    sys.exit(rc)


def daemonize():
    pid = os.fork()
    if pid > 0:
        os.waitpid(pid, 0)
        print("ws-build daemonized")
        return
    os.setsid()
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if os.fork() > 0:
        os._exit(0)
    devnull = os.open(os.devnull, os.O_RDWR)
    for fd in (0, 1, 2):
        os.dup2(devnull, fd)
    main()


if __name__ == "__main__":
    # DIR-STATIC-500-001: --foreground برای فراخوانی همگام از نگهبان‌ها
    # (heal-deploy / prod-watchdog) — بدون دوبار fork، خروجی همزمان.
    if len(sys.argv) > 1 and sys.argv[1] == "--foreground":
        sys.exit(main())
    daemonize()
