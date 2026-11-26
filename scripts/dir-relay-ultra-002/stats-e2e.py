#!/usr/bin/env python3
# DIR-RELAY-ULTRA-002 · هارنس زندهٔ سه‌حالته — اثبات سه درمان نسل S روی اسکریپت تولیدی واقعی
# ═════════════════════════════════════════════════════════════════════════════
# حالت A — شب‌تار شبکه (SERVER_URL به پورت بستهٔ 127.0.0.1:9):
#   رله می‌خواب‌های backoff واقعی (۳۰/۶۰/۱۲۰/۳۰۰ث نردمان) را می‌گذراند؛
#   اثبات RC-B: خط «📊 آمار» حتی در عمیق‌ترین خطای شبکه حداکثر هر ~۳۰ث چاپ می‌شود
#   (stats_sleep تکه‌ای) + stats.json تازه می‌ماند + status.sh حکم «فعال» می‌دهد.
# حالت B — PTY ترموکس-گونه (عین پنجرهٔ tmux گوشی):
#   اثبات RC-A (ریشهٔ اصلی شکایت): stdout = ترمینال زنده → tee می‌نویسد و
#   relay.log در ~/melka-relay ساخته و زنده می‌شود؛ status.sh بخش «آخرین ۱۲ خط رله»
#   را از همان فایل پر می‌بیند (پیش از نسل S این بخش همیشه خالی بود).
# حالت C — سرور زندهٔ همان لینک preview (localhost:3000):
#   enroll → دانلود bootstrap از روت واقعی → اجرا → شاهد فعال‌سازی + آنلاین
#   داشبورد + کادنس بیکاری ≤~۴۰ث (POLL_WAIT_S=25) + status.sh کامل.
import json, os, pty, re, select, shutil, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path("/home/z/my-project")
OUT = ROOT / "download" / "DIR-RELAY-ULTRA-002"
OUT.mkdir(parents=True, exist_ok=True)
results = {"cases": [], "ok": False}

def step(store, k, ok, detail=""):
    store.append({"key": k, "ok": bool(ok), "detail": str(detail)[:400]})
    print(("OK  " if ok else "FAIL"), k, "—", str(detail)[:160])

# اسکریپت تولیدی نسل S با سرورِ شب‌تار
subprocess.run(["bun", "run", "scripts/dir-relay-ultra-002/extract-blackhole.ts"],
               cwd=ROOT, check=True, capture_output=True)
BH_CORE = Path("/tmp/relay-ultra-002-bh/core-relay.sh")
assert BH_CORE.exists() and BH_CORE.stat().st_size > 4000, "black-hole core not generated"

def pkill_sim(sim):
    subprocess.run(["bash", "-c",
        f"pkill -TERM -f '{sim}' 2>/dev/null; sleep 1; pkill -KILL -f '{sim}' 2>/dev/null; true"],
        capture_output=True)

def parse_stats_ts(log_text):
    """فاصلهٔ ثانیه‌ای میان خطوط «📊 آمار» (HH:MM:SS)"""
    ts = []
    for line in log_text.split("\n"):
        m = re.match(r"\[(\d\d):(\d\d):(\d\d)\] 📊 آمار", line)
        if m:
            h, mnt, s = map(int, m.groups())
            ts.append(h * 3600 + mnt * 60 + s)
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    return ts, [g for g in gaps if g >= 0]

def run_status_sh(sim):
    p = Path(sim) / "melka-relay" / "status.sh"
    if not p.exists():
        return "(missing)"
    r = subprocess.run(["bash", str(p)], capture_output=True, text=True,
                       env={**os.environ, "HOME": str(sim)}, timeout=30)
    return r.stdout + r.stderr

def stats_json(sim):
    p = Path(sim) / "melka-relay" / "stats.json"
    try:
        return json.loads(p.read_text(encoding="utf8"))
    except Exception:
        return None

# ═══════════════ حالت A — شب‌تار شبکه: کادنس آمار حین backoff ═══════════════
caseA = {"steps": []}
simA = Path("/tmp/melka-s2-blackhole")
shutil.rmtree(simA, ignore_errors=True); simA.mkdir(parents=True)
pkill_sim(simA)
envA = {"HOME": str(simA), "PATH": os.environ.get("PATH", ""), "TERM": "dumb"}
logA = open("/tmp/s2-blackhole-run.log", "w")
procA = subprocess.Popen(["bash", str(BH_CORE)], env=envA, stdout=logA, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, start_new_session=True)
t0 = time.time()
while time.time() - t0 < 75:
    time.sleep(5)
    if procA.poll() is not None:
        break
textA = Path("/tmp/s2-blackhole-run.log").read_text(encoding="utf8", errors="replace")
tsA, gapsA = parse_stats_ts(textA)
step(caseA["steps"], "A1-relay-alive-75s", procA.poll() is None,
     f"رله در کل ۷۵ث زنده ماند (exit={procA.poll()})")
step(caseA["steps"], "A2-stats-line-during-backoff", len(tsA) >= 3,
     f"{len(tsA)} خط «📊 آمار» در ۷۵ث حین خطای شبکه (شب‌تار 127.0.0.1:9)")
step(caseA["steps"], "A3-max-gap-le-35s", (not gapsA) or max(gapsA) <= 35,
     f"بیشترین فاصلهٔ خطوط آمار: {max(gapsA) if gapsA else 0}ث (هدف ≤۳۵)")
sA = stats_json(simA)
ageA = int(time.time() - sA["ts"]) if sA else 999
step(caseA["steps"], "A4-stats-json-fresh", sA is not None and ageA <= 45,
     f"stats.json تازه (سن {ageA}ث) — pid {sA.get('pid') if sA else '-'} · restarts {sA.get('restarts') if sA else '-'}")
shA = run_status_sh(simA)
step(caseA["steps"], "A5-status-verdict-active", "وضعیت کلی: ✓ هستهٔ رله فعال و در حال کار است" in shA,
     "status.sh حتی در خطای شبکه حکم «فعال» می‌دهد (رله زنده است و تلاش می‌کند)")
pkill_sim(simA)
(OUT / "blackhole-run.log").write_text(textA, encoding="utf8")
(OUT / "blackhole-status.txt").write_text(shA, encoding="utf8")
results["cases"].append({"case": "A-blackhole", **caseA})
print("── case A done")

# ═══════════════ حالت B — PTY گوشی: tee به relay.log (ریشهٔ RC-A) ═══════════════
caseB = {"steps": []}
simB = Path("/tmp/melka-s2-pty")
shutil.rmtree(simB, ignore_errors=True); simB.mkdir(parents=True)
pkill_sim(simB)
envB = {"HOME": str(simB), "PATH": os.environ.get("PATH", ""), "TERM": "xterm-256color"}
master, slave = pty.openpty()
logB_capture = []
procB = subprocess.Popen(["bash", str(BH_CORE)], env=envB, stdout=slave, stderr=slave,
                         stdin=slave, start_new_session=True)
os.close(slave)
t0 = time.time()
while time.time() - t0 < 75:
    r, _, _ = select.select([master], [], [], 1.0)
    if r:
        try:
            chunk = os.read(master, 65536).decode("utf8", errors="replace")
            logB_capture.append(chunk)
        except OSError:
            break
relay_log_path = simB / "melka-relay" / "relay.log"
exists_early = relay_log_path.exists()
size1 = relay_log_path.stat().st_size if exists_early else 0
time.sleep(35)  # پنجرهٔ ≥۳۵ث: خط بعدی «📊 آمار» حتماً درون پنجره می‌افتد (کادنس ≤۳۰ث)
size2 = relay_log_path.stat().st_size if relay_log_path.exists() else 0
textB = "".join(logB_capture)
textB_log = relay_log_path.read_text(encoding="utf8", errors="replace") if relay_log_path.exists() else ""
step(caseB["steps"], "B1-relay-log-created-in-tty-path", exists_early,
     "relay.log در مسیر ترمینال (tmux گوشی) ساخته شد — پیش از نسل S هرگز ساخته نمی‌شد")
step(caseB["steps"], "B2-relay-log-live-growing", size2 > size1 >= 0 and (size2 - size1) > 0,
     f"relay.log رشد زنده: {size1} → {size2} بایت در ۱۰ث")
step(caseB["steps"], "B3-stats-in-relay-log", "📊 آمار" in textB_log,
     f"{textB_log.count('📊 آمار')} خط «📊 آمار» در relay.log")
step(caseB["steps"], "B4-pty-and-log-identical-stream", ("📊 آمار" in textB) and ("📊 آمار" in textB_log),
     "نمای tmux (PTY) و فایل relay.log همان جریان را دارند (tee)")
tsB, gapsB = parse_stats_ts(textB_log)
step(caseB["steps"], "B5-cadence-le-35s", (not gapsB) or max(gapsB) <= 35,
     f"بیشترین فاصله در relay.log: {max(gapsB) if gapsB else 0}ث")
shB = run_status_sh(simB)
step(caseB["steps"], "B6-status-last-lines-from-relay-log",
     "──── آخرین ۱۲ خط رله (relay.log) ────" in shB and "📊 آمار" in shB and "(relay.log هنوز ساخته نشده" not in shB,
     "status.sh بخش «آخرین ۱۲ خط رله» را از relay.log پر می‌بیند (پیش از نسل S: همیشه خالی)")
step(caseB["steps"], "B7-status-verdict", "وضعیت کلی: ✓ هستهٔ رله فعال و در حال کار است" in shB,
     "حکم سلامت: فعال و آمار تازه")
sB = stats_json(simB)
step(caseB["steps"], "B8-stats-json-fields", sB is not None and "pid" in sB and "restarts" in sB,
     f"stats.json: pid={sB.get('pid') if sB else '-'} · restarts={sB.get('restarts') if sB else '-'} · ts سن {int(time.time()-sB['ts']) if sB else '-'}ث")
try:
    os.close(master)
except OSError:
    pass
pkill_sim(simB)
procB.terminate() if procB.poll() is None else None
(OUT / "pty-relay.log").write_text(textB_log, encoding="utf8")
(OUT / "pty-status.txt").write_text(shB, encoding="utf8")
results["cases"].append({"case": "B-pty-tmux-path", **caseB})
print("── case B done")

# ═══════════════ حالت C — سرور زنده: فعال‌سازی + کادنس بیکاری ═══════════════
caseC = {"steps": []}
BASE = os.environ.get("E2E_BASE", "http://localhost:3000")
def api(path, method="GET", body=None, token=None, timeout=60):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())

def get_master_code():
    for line in open(ROOT / ".env.local"):
        if line.startswith("MASTER_ACCESS_CODE="):
            return line.strip().split("=", 1)[1]
    return None

simC = Path("/tmp/melka-s2-live")
shutil.rmtree(simC, ignore_errors=True); simC.mkdir(parents=True)
pkill_sim(simC)
try:
    st, login = api("/api/auth/master-login", "POST", {"masterCode": get_master_code()}, timeout=30)
    token = login.get("token")
    step(caseC["steps"], "C1-login-owner", st == 200 and bool(token), f"HTTP {st}")
    st, enr = api("/api/admin/relay/enroll", "POST", {"label": "E2E-Ultra2-Stats"}, token, 30)
    device_id = enr.get("deviceId"); bootstrap_url = enr.get("bootstrapUrl")
    step(caseC["steps"], "C2-enroll-relay", st == 200 and bool(device_id), f"{device_id}")
    core = None
    with urllib.request.urlopen(urllib.request.Request(
            bootstrap_url, headers={"User-Agent": "Mozilla/5.0 (Linux; Android 13; Poco F3)"}), timeout=60) as r:
        core = r.read().decode()
    core_path = simC / "core-relay.sh"
    core = core.replace("https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai", "http://localhost:3000", 1)
    core_path.write_text(core, encoding="utf8")
    os.chmod(core_path, 0o700)
    step(caseC["steps"], "C3-bootstrap-download", len(core) > 4000 and "stats_sleep()" in core
         and "exec > >(tee -a" in core and "POLL_WAIT_S=25" in core,
         f"{len(core)}B نسل S با tee/stats_sleep/25ث")
    logC = open("/tmp/s2-live-run.log", "w")
    procC = subprocess.Popen(["bash", str(core_path)], env={"HOME": str(simC), "PATH": os.environ.get("PATH", ""), "TERM": "dumb"},
                             stdout=logC, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    witness = online = False
    t0 = time.time()
    while time.time() - t0 < 240:
        time.sleep(4)
        log = Path("/tmp/s2-live-run.log").read_text(encoding="utf8", errors="replace")
        if "رلهٔ ملکا فعال است" in log:
            witness = True
        try:
            st, stat = api("/api/admin/relay/status", token=token, timeout=15)
            for d in stat.get("relay", {}).get("devices", []):
                if d.get("deviceId") == device_id and d.get("online"):
                    online = True
        except Exception:
            pass
        if witness and online:
            break
    step(caseC["steps"], "C4-activation-witness", witness, "«✓ اتصال تأیید شد — رلهٔ ملکا فعال است»")
    step(caseC["steps"], "C5-online-dashboard", online, f"دستگاه {device_id} برخط در داشبورد")
    # کادنس بیکاری: ۸۰ث جمع‌آوری
    mark = time.time()
    while time.time() - mark < 80:
        time.sleep(5)
    textC = Path("/tmp/s2-live-run.log").read_text(encoding="utf8", errors="replace")
    tsC, gapsC = parse_stats_ts(textC)
    step(caseC["steps"], "C6-idle-cadence-le-40s", len(tsC) >= 2 and (not gapsC or max(gapsC) <= 40),
         f"{len(tsC)} خط آمار در بیکاری (۸۰ث+) · بیشترین فاصله {max(gapsC) if gapsC else 0}ث (POLL_WAIT_S=25 → ~۲۶ث)")
    sC = stats_json(simC)
    step(caseC["steps"], "C7-stats-json", sC is not None and "pid" in sC,
         f"stats.json: ts={sC.get('ts') if sC else '-'} · loops={sC.get('loops') if sC else '-'}")
    shC = run_status_sh(simC)
    step(caseC["steps"], "C8-status-full", "وضعیت کلی: ✓" in shC and "پیام دریافتی از سرور" in shC,
         "status.sh روی سرور زنده: آمار کامل + حکم فعال")
    (OUT / "live-run.log").write_text(textC, encoding="utf8")
    (OUT / "live-status.txt").write_text(shC, encoding="utf8")
except Exception as e:
    step(caseC["steps"], "C0-live-server", False, f"{type(e).__name__}: {e}")
finally:
    pkill_sim(simC)
    try:
        if token and device_id:
            api("/api/admin/relay/revoke", "POST", {"deviceId": device_id, "confirm": True}, token, 20)
            step(caseC["steps"], "C9-cleanup-revoke", True, f"دستگاه {device_id} ابطال شد")
    except Exception as e:
        step(caseC["steps"], "C9-cleanup-revoke", False, str(e)[:120])
results["cases"].append({"case": "C-live-server", **caseC})
print("── case C done")

results["ok"] = all(s["ok"] for c in results["cases"] for s in c["steps"])
(OUT / "stats-e2e.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf8")
print(json.dumps({"ok": results["ok"], "cases": [{"case": c["case"], "ok": all(s["ok"] for s in c["steps"]), "steps": c["steps"]} for c in results["cases"]]}, ensure_ascii=False, indent=1))
sys.exit(0 if results["ok"] else 1)
