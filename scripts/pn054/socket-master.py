#!/usr/bin/env python3
"""
socket-master.py — PN-054 (دستور ۱): نگهدار سوکت + ری‌استارت بدون قطعی
------------------------------------------------------------------------
معماری (همان تکنیک PM2-cluster، بدون وابستگی):
  prod-watchdog.sh (bash، گیت‌ها/رازها/قفل‌ها)
      └── socket-master.py  ← این فایل (foreground فرزند واچ‌داگ)
            ├── سوکت اصلی 0.0.0.0:3000 — یک‌بار bind، برای همیشه
            └── فرزند سرور (node --max-old-space-size=384 + listen-patch.cjs)
                  └── listen روی fd ارث‌برده

چرا بدون قطعی است؟
  • کرش سرور → ری‌اسپاون با همان fd؛ طی وقفهٔ ۱ ثانیه‌ای، هستهٔ لینوکس
    اتصال‌های تازه را در صف accept (backlog=511) نگه می‌دارد — مشتری
    فقط تأخیر می‌بیند، نه خطا.
  • دیپلوی (Blue/Green) → فرزند تازه «کنار» فرزند فعلی روی همان fd بالا
    می‌آید، health چک می‌شود، بعد SIGTERM به فرزند قدیم → درخواست‌های
    در حال پرواز drain می‌شوند (مدیریت بومی Next) و قدیمی خاموش می‌شود.

دستورها (فایل upload/.runtime/pn054-cmd):
  {"cmd":"deploy"}   → چرخهٔ Blue/Green کامل
  {"cmd":"restart"}  → همان دیپلوی اما بدون انتظار برای بیلد تازه

مانیتور حافظه (دستور ۳): هر ساعت یک خط وضعیت در لاگ + هشدار اگر
RSS سرور از ۵۰۰MB گذشت. (cron در این محیط نیست — مانیتور در همین
فرایند پایدار زندگی می‌کند.)
"""

import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import time

REPO = os.environ.get("MELKA_REPO_DIR", "/home/z/my-project")
MASTER_PORT = int(os.environ.get("MELKA_MASTER_PORT", "3000"))  # برای تست: پورت موقت
LOG = os.path.join(REPO, "server.log")
RUNTIME_DIR = os.path.join(REPO, "upload", ".runtime")
CMD_FILE = os.path.join(RUNTIME_DIR, "pn054-cmd")
STOP_FLAG = os.path.join(REPO, ".prod-stop")
HEALTH_PORTS = (3100, 3101)          # ping-pong بین دیپلوی‌ها
HEALTH_STATE_FILE = os.path.join(RUNTIME_DIR, "pn054-health-port")
RAM_WARN_MB = 500                    # دستور ۳: آستانهٔ هشدار
RAM_CHECK_INTERVAL = 300             # هر ۵ دقیقه چک؛ هر ۱۲ چک = گزارش ساعتی
RESPAWN_DELAY_S = 1.0                # دستور ۱: خواب واچ‌داگ = ۱ ثانیه
DRAIN_TIMEOUT_S = 15                 # حداکثر منتظر drain فرزند قدیم
GREEN_HEALTH_TIMEOUT_S = 30          # حداکثر منتظر سلامت فرزند سبز

NODE_BIN = "/usr/bin/node"
PRELOAD = os.path.join(REPO, "scripts", "pn054", "listen-patch.cjs")
SERVER_JS = os.path.join(REPO, ".next", "standalone", "server.js")
HEAP_CAP_MB = int(os.environ.get("MELKA_HEAP_CAP_MB", "384"))  # دستور ۳


def log(msg: str) -> None:
    # فقط درج در فایل — خروجی استاندارد همین فایل را از طریق واچ‌داگ دنبال می‌کند
    # (نوشتن همزمان print+file باعث تکرار خطوط در server.log می‌شد)
    line = f"[socket-master] {time.strftime('%F %T')} {msg}"
    try:
        with open(LOG, "a") as f:
            f.write(line + "\n")
    except OSError:
        print(line, flush=True)


def load_env_local(env: dict) -> dict:
    """بارگذاری مجدد .env.local در هر اسپاون (حفظ خوددرمانی رازهای واچ‌داگ)."""
    path = os.path.join(REPO, ".env.local")
    try:
        with open(path) as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in ("DATABASE_URL",):  # DB URL را واچ‌داگ تعیین می‌کند
                    env[k] = v
    except OSError:
        pass
    return env


class SocketMaster:
    def __init__(self) -> None:
        self.master_sock: socket.socket | None = None
        self.child: subprocess.Popen | None = None
        self.child_role_port = HEALTH_PORTS[0]
        self.next_green_port = HEALTH_PORTS[1]
        self.stopping = False
        self.ram_checks = 0

    # ─────────────────────────── سوکت اصلی ───────────────────────────
    def bind_master_socket(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("0.0.0.0", MASTER_PORT))
        s.listen(511)
        # fd ارث‌بری از طریق pass_fds — شمارهٔ واقعی به فرزند اعلام می‌شود
        s.set_inheritable(True)
        self.master_sock = s
        log(f"سوکت اصلی 0.0.0.0:{MASTER_PORT} بسته شد (fd={s.fileno()}, backlog=511)")

    # ─────────────────────────── اسپاون سرور ───────────────────────────
    def spawn_server(self, health_port: int) -> subprocess.Popen:
        assert self.master_sock is not None
        env = dict(os.environ)
        env = load_env_local(env)
        env.update({
            "MELKA_LISTEN_FD": str(self.master_sock.fileno()),  # شمارهٔ fd واقعی در فرزند
            "MELKA_HEALTH_PORT": str(health_port),
            "MELKA_ROLE": "web",
            "MELKA_HEAP_CAP_MB": str(HEAP_CAP_MB),
            "NODE_ENV": "production",
            "PORT": "3000",
            "HOSTNAME": "0.0.0.0",
        })
        argv = [
            NODE_BIN,
            f"--max-old-space-size={HEAP_CAP_MB}",   # دستور ۳: سقف heap
            "--require", PRELOAD,                     # دستور ۱: fd + health
            SERVER_JS,
        ]
        logf = open(LOG, "a")
        child = subprocess.Popen(
            argv,
            pass_fds=(self.master_sock.fileno(),),
            env=env,
            stdout=logf,
            stderr=subprocess.STDOUT,
            cwd=REPO,
        )
        logf.close()  # فرزند dup خودش را دارد — نشت fd در والد نه
        try:
            with open(HEALTH_STATE_FILE, "w") as f:
                f.write(str(health_port))
        except OSError:
            pass
        log(f"فرزند سرور spawn شد (pid={child.pid}, health=127.0.0.1:{health_port}, "
            f"heap-cap={HEAP_CAP_MB}MB, node)")
        return child

    # ─────────────────────────── سلامت فرزند ───────────────────────────
    @staticmethod
    def child_healthy(port: int) -> dict | None:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            conn.request("GET", "/healthz")
            resp = conn.getresponse()
            body = resp.read().decode()
            conn.close()
            if resp.status == 200:
                return json.loads(body)
        except Exception:
            return None
        return None

    def wait_green_healthy(self, port: int, child: subprocess.Popen) -> bool:
        deadline = time.monotonic() + GREEN_HEALTH_TIMEOUT_S
        while time.monotonic() < deadline:
            if child.poll() is not None:
                log(f"❌ فرزند سبز پیش از سلامت مرد (rc={child.returncode})")
                return False
            if self.child_healthy(port):
                return True
            time.sleep(0.4)
        return False

    # ─────────────────────────── توقف drain ───────────────────────────
    def stop_child_graceful(self, child: subprocess.Popen) -> None:
        if child.poll() is not None:
            return
        child.send_signal(signal.SIGTERM)   # → drain بومی Next
        deadline = time.monotonic() + DRAIN_TIMEOUT_S
        while time.monotonic() < deadline and child.poll() is None:
            time.sleep(0.3)
        if child.poll() is None:
            log(f"⚠️ فرزند pid={child.pid} drain نشد — SIGKILL")
            child.kill()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass

    # ─────────────────────────── Blue/Green ───────────────────────────
    def blue_green(self) -> None:
        green_port = self.next_green_port
        log(f"🔄 Blue/Green آغاز: فرزند سبز روی health:{green_port}")
        green = self.spawn_server(green_port)
        if not self.wait_green_healthy(green_port, green):
            log("❌ سلامت فرزند سبیم برقرار نشد — سبز دور ریخته شد، آبی ادامه می‌دهد")
            self.stop_child_graceful(green)
            return
        log(f"✅ فرزند سبز سالم است (pid={green.pid}) — SIGTERM به آبی (pid={self.child.pid if self.child else '?'})")
        if self.child is not None:
            blue_pid = self.child.pid
            self.stop_child_graceful(self.child)
            log(f"آبی pid={blue_pid} با موفقیت drain و خاموش شد — صفر قطعی")
        self.child = green
        self.child_role_port = green_port
        self.next_green_port = HEALTH_PORTS[0] if green_port == HEALTH_PORTS[1] else HEALTH_PORTS[1]
        # مارکر پایان دیپلوی
        try:
            with open(os.path.join(RUNTIME_DIR, "pn054-deploy-done"), "w") as f:
                json.dump({"pid": green.pid, "port": green_port,
                           "at": time.strftime("%F %T")}, f)
        except OSError:
            pass

    # ─────────────────────────── مانیتور RAM (دستور ۳) ───────────────────────────
    def ram_monitor_tick(self) -> None:
        if not self.child or self.child.poll() is not None:
            return
        info = None
        # port سلامت فعال ممکن است هر دو باشد (blue/green لحظه‌ای) — آبی اول
        for p in (self.child_role_port,) + HEALTH_PORTS:
            info = self.child_healthy(p)
            if info and info.get("pid") == self.child.pid:
                break
            info = None
        if not info:
            return
        rss = info.get("rssMB", 0)
        self.ram_checks += 1
        hourly = self.ram_checks % (3600 // RAM_CHECK_INTERVAL) == 1
        if rss > RAM_WARN_MB:
            log(f"⚠️ RAM سرور {rss}MB > {RAM_WARN_MB}MB (pid={info.get('pid')}) — هشدار حافظه (دستور ۳)")
        elif hourly:
            log(f"📊 RAM سرور {rss}MB (heap {info.get('heapUsedMB')}MB) — عادی")

    # ─────────────────────────── حلقهٔ اصلی ───────────────────────────
    def read_cmd(self) -> dict | None:
        try:
            with open(CMD_FILE) as f:
                raw = f.read().strip()
            if raw:
                os.remove(CMD_FILE)
                return json.loads(raw)
        except (OSError, ValueError):
            try:
                os.remove(CMD_FILE)
            except OSError:
                pass
        return None

    def run(self) -> int:
        self.bind_master_socket()
        self.child = self.spawn_server(self.child_role_port)
        last_ram_check = 0.0
        last_respawn_notice = 0.0
        while not self.stopping:
            # فلگ توقف تمیز (سازگار با واچ‌داگ/resurrect قبلی)
            if os.path.exists(STOP_FLAG):
                log("فلگ توقف دیده شد — drain فرزند و خروج")
                if self.child:
                    self.stop_child_graceful(self.child)
                try:
                    os.remove(STOP_FLAG)
                except OSError:
                    pass
                return 0

            # دستور دیپلوی
            cmd = self.read_cmd()
            if cmd and cmd.get("cmd") in ("deploy", "restart"):
                self.blue_green()
                continue

            # مرگ فرزند → ری‌اسپاون سریع (سقف خواب = ۱ ثانیه — دستور ۱)
            if self.child and self.child.poll() is not None:
                now = time.monotonic()
                if now - last_respawn_notice > 60:
                    log(f"فرزند سرور مرد (rc={self.child.returncode}) — ری‌اسپاون")
                    last_respawn_notice = now
                if RESPAWN_DELAY_S > 0:
                    time.sleep(RESPAWN_DELAY_S)
                self.child = self.spawn_server(self.child_role_port)
                continue

            # مانیتور حافظه هر ۵ دقیقه
            if time.monotonic() - last_ram_check > RAM_CHECK_INTERVAL:
                last_ram_check = time.monotonic()
                self.ram_monitor_tick()

            time.sleep(0.5)
        return 0


def main() -> int:
    if not os.path.exists(SERVER_JS):
        print(f"[socket-master] CRITICAL: {SERVER_JS} وجود ندارد", flush=True)
        return 1
    sm = SocketMaster()

    def on_term(signum, frame):  # noqa: ARG001 — خاموشی تمیز (resurrect/pkill سازگار)
        log("SIGTERM — drain فرزند و خروج تمیز")
        sm.stopping = True
        if sm.child and sm.child.poll() is None:
            sm.stop_child_graceful(sm.child)
        os._exit(0)

    signal.signal(signal.SIGTERM, on_term)
    try:
        return sm.run()
    except OSError as e:
        # EADDRINUSE → سرور قدیمی هنوز روی ۳۰۰۰ است؛ واچ‌داگ بعد از ۱ ثانیه دوباره امتحان می‌کند
        log(f"خطای سوکت: {e} — خروج برای تلاش مجدد توسط واچ‌داگ")
        return 2
    except Exception as e:  # noqa: BLE001
        log(f"خطای غیرمنتظره: {e!r} — خروج برای تلاش مجدد")
        return 3


if __name__ == "__main__":
    sys.exit(main())
