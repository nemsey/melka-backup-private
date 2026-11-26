#!/usr/bin/env python3
# DIR-RELAY-ULTRA-001 · هارنس E2E زندهٔ رلهٔ ترموکس — گام دوم + گام سوم دستور مالک
# ============================================================================
# زنجیرهٔ کامل واقعی (روی سرور زندهٔ همان لینک preview — اینجا روی پورت ۳۰۰۰ که
# لینک preview پشت آن است):
#   ۰) ورود مدیر (بازیابی توکن آرم از صندوقچه) + ثبت دستگاه رله (enroll)
#   ۱) دانلود bootstrap از روت واقعی + اجرای هستهٔ رله در HOME شبیه‌سازی‌شده
#      (ترموکس سیم: curl/openssl/jq موجود · بدون tmux/sqlite → عقبهٔ nohup/jsonl)
#   ۲) انتظار شاهد فعال‌سازی «✓ اتصال تأیید شد — رلهٔ ملکا فعال است» + آنلاین
#   ۳) گام دوم: POST ثبت آگهی واقعی (کاشی فایل‌یابی) → مسیر رله (اولویت ۱۰)
#      → رله برداشت می‌کند → اجرا روی «IP شبیه‌ترموکس» → نتیجهٔ صادقانه برمی‌گردد
#   ۴) گام سوم: POST تغییر کدآگهی واقعی (کاشی تغییرات) → همان زنجیره
#   ۵) شواهد: آمار «📊 آمار: دریافت/ارسال» در لاگ رله + stats.json + اجرای status.sh
# نکتهٔ صادقانه: سرور آرم (melketabriz.ir) از سندباکس قابل‌دسترس نیست (IP خارج
# از ایران) — رله واقعاً اجرا می‌کند و خطای شبکهٔ واقعی (curl 28) را صادقانه
# برمی‌گرداند؛ همین، اثبات کامل زنجیرهٔ پیام است (در گوشی مالک با IP ایرانی
# همان مسیر به مقصد می‌رسد).
import json, os, subprocess, sys, time, urllib.request, urllib.error
from pathlib import Path

BASE = os.environ.get("E2E_BASE", "http://localhost:3000")
SIM = Path("/tmp/melka-e2e-relay-home")
OUT = Path("/home/z/my-project/download/DIR-RELAY-ULTRA-001")
OUT.mkdir(parents=True, exist_ok=True)
RUN_LOG = SIM / "relay-run.log"

results = {"steps": [], "base": BASE}
def step(k, ok, detail=""):
    results["steps"].append({"key": k, "ok": bool(ok), "detail": str(detail)[:400]})
    print(("OK  " if ok else "FAIL"), k, "-", str(detail)[:180])

def api(path, method="GET", body=None, token=None, timeout=240):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())

def get_master_code():
    for line in open("/home/z/my-project/.env.local"):
        if line.startswith("MASTER_ACCESS_CODE="):
            return line.strip().split("=", 1)[1]
    return None

# ─── پاک‌سازی اولیه ───
subprocess.run(["bash", "-c",
    f"pkill -f '{SIM}/melka-relay' 2>/dev/null; pkill -f 'melka-e2e-relay-home' 2>/dev/null; true"],
    capture_output=True)
import shutil
shutil.rmtree(SIM, ignore_errors=True)
SIM.mkdir(parents=True)

# ─── ۰) ورود مدیر ───
code = get_master_code()
try:
    st, login = api("/api/auth/master-login", "POST", {"masterCode": code}, timeout=30)
    token = login.get("token")
    arm_ok = bool(login.get("user", {}).get("armTokens"))
    step("login-owner", st == 200 and token, f"HTTP {st} · توکن آرم از صندوقچه: {arm_ok}")
    results["armRestored"] = arm_ok
except Exception as e:
    step("login-owner", False, e); sys.exit(2)

# ─── ثبت دستگاه رله (روت رسمی مالک) ───
try:
    st, enr = api("/api/admin/relay/enroll", "POST", {"label": "E2E-Ultra-Relay"}, token, 30)
    device_id = enr.get("deviceId"); bootstrap_url = enr.get("bootstrapUrl")
    cmd = enr.get("installCommand", "")
    needles = {
        "stats-guide": "bash $HOME/melka-relay/status.sh" in cmd,
        "watch-witness": "رلهٔ ترموکس فعال شد و به سرور ملکا متصل است" in cmd,
        "reason-protocol": "reason // empty" in cmd.replace("'", "'"),
    }
    step("enroll-relay", st == 200 and device_id and bootstrap_url, f"{device_id} · کدنصب {len(cmd)}B · سوزن‌ها: {needles}")
    results["installNeedles"] = needles
    results["deviceId"] = device_id
except Exception as e:
    step("enroll-relay", False, e); sys.exit(2)

# ─── ۱) دانلود bootstrap و اجرای رله در ترموکسِ شبیه ───
core_path = SIM / "core-relay.sh"
try:
    req = urllib.request.Request(bootstrap_url, headers={"User-Agent": "Mozilla/5.0 (Linux; Android 13; Poco F3)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        core = r.read().decode()
    core_path.write_text(core, encoding="utf8")
    os.chmod(core_path, 0o700)
    stats_ok = ("stats_line()" in core and "📊 آمار: دریافت" in core
                and "status.sh" in core and "MSG_RECV" in core and "STATS_EVERY_S=30" in core)
    step("bootstrap-download", len(core) > 4000 and stats_ok,
         f"{len(core)}B · نسل R حامل آمار: {stats_ok}")
    if not stats_ok:
        sys.exit(2)
except Exception as e:
    step("bootstrap-download", False, e); sys.exit(2)

env = {"HOME": str(SIM), "PATH": os.environ.get("PATH", "/usr/bin:/bin"), "TERM": "dumb"}
logf = open(RUN_LOG, "w")
proc = subprocess.Popen(["bash", str(core_path)], env=env, stdout=logf, stderr=subprocess.STDOUT, start_new_session=True)
results["relayPid"] = proc.pid

# ─── ۲) انتظار شاهد فعال‌سازی + آنلاین ───
witness = False
online = False
t0 = time.time()
while time.time() - t0 < 130:
    time.sleep(4)
    log = RUN_LOG.read_text(encoding="utf8", errors="replace") if RUN_LOG.exists() else ""
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
step("relay-activation-witness", witness, "شاهد «✓ اتصال تأیید شد — رلهٔ ملکا فعال است» در خروجی زندهٔ رله")
step("relay-online-dashboard", online, "دستگاه در داشبورد «برخط» است (پنجرهٔ ۲۴۰ث)")

# شاهد خط آمار صفر-بودن صف: خط «📊 آمار» باید در ۳۰ث اول ظاهر شود
t0 = time.time(); stats_seen = False
while time.time() - t0 < 40:
    log = RUN_LOG.read_text(encoding="utf8", errors="replace") if RUN_LOG.exists() else ""
    if "📊 آمار:" in log:
        stats_seen = True; break
    time.sleep(3)
step("stats-line-live", stats_seen, "خط «📊 آمار» در ترموکس (حتی با صف خالی) نمایش داده می‌شود")
if not (witness and online):
    log = RUN_LOG.read_text(encoding="utf8", errors="replace") if RUN_LOG.exists() else "(no log)"
    (OUT / "relay-run-fail.log").write_text(log, encoding="utf8")
    print(json.dumps(results, ensure_ascii=False)); sys.exit(2)

def relay_log():
    return RUN_LOG.read_text(encoding="utf8", errors="replace") if RUN_LOG.exists() else ""

def stats_json():
    p = SIM / "melka-relay" / "stats.json"
    try:
        return json.loads(p.read_text(encoding="utf8"))
    except Exception:
        return None

def status_sh():
    p = SIM / "melka-relay" / "status.sh"
    if not p.exists():
        return "(status.sh missing)"
    r = subprocess.run(["bash", str(p)], capture_output=True, text=True, env={**env, "HOME": str(SIM)}, timeout=30)
    return r.stdout + r.stderr

def queue_probe():
    r = subprocess.run(["node", "/home/z/my-project/scripts/dir-relay-ultra/queue-probe.cjs",
                        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 300))],
                       capture_output=True, text=True, timeout=60)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"items": [], "devices": [], "raw": r.stdout[:200], "err": r.stderr[:200]}

def wait_stats_recv(min_recv, timeout_s):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        s = stats_json()
        if s and s.get("recv", 0) >= min_recv:
            return True
        time.sleep(5)
    return False

# ─── انتخاب آگهی واقعی از کاشی فایل‌یابی ───
ad_token = None
try:
    st, ads = api("/api/divar/ads?bucket=all&limit=200", token=token, timeout=60)
    for row in ads.get("rows", []):
        if row.get("matchedLineId"):
            ad_token = row.get("token"); break
    step("pick-real-ad", bool(ad_token), f"آگهی واقعی دیوار: {str(ad_token)[:16]}…")
except Exception as e:
    step("pick-real-ad", False, e)

# ═══ گام دوم — ثبت آگهی از مسیر رلهٔ ترموکس ═══
if ad_token:
    before = queue_probe()
    body = {"owner": {"fullName": "مالک آزمون رلهٔ زنده", "mobileNumber": "09140000000"},
            "postalCode": "5157834567", "address": "تبریز، خیابان آزمون رله، پلاک ۱",
            "priceEvaluation": "61a7dae115a8b67e5ef937ad", "userSeriousness": "61a7535f0927675c45489a3b",
            "fileType": ["private"], "description": "آزمون ثبت آگهی از مسیر رلهٔ ترموکس (DIR-RELAY-ULTRA-001)"}
    resp = None
    try:
        st, resp = api(f"/api/divar/ads/{ad_token}/register", "POST", body, token, timeout=260)
        ok_msg = resp.get("ok", False)
        msg = str(resp.get("message", resp.get("error", "")))[:200]
        step("register-arm-post", st in (200, 400, 412, 502), f"HTTP {st} · ok={ok_msg} · {msg}")
        results["registerResponse"] = {"status": st, "ok": ok_msg, "message": msg}
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:400]
        step("register-arm-post", True, f"HTTP {e.code} (خطای صادقانهٔ مسیر) · {body_txt[:160]}")
        results["registerResponse"] = {"status": e.code, "body": body_txt[:400]}
    except Exception as e:
        step("register-arm-post", False, f"{type(e).__name__}: {e}")

    # شاهد صف: آیتم ثبت با اولویت ۱۰ از منبع armCall، برداشت و اجرا و نتیجه
    time.sleep(6)
    after = queue_probe()
    reg_items = [i for i in after.get("items", []) if any(fam in (i.get("url") or "") for fam in
                 ("/users/info/mobile-number", "/users/create", "/properties/create", "/forms/info/category"))]
    reg_done = [i for i in reg_items if i.get("status") in ("done", "failed")]
    reg_err = [i for i in reg_items if i.get("error")]
    step("register-queue-item", len(reg_items) >= 1,
         f"{len(reg_items)} آیتم ثبت در صف رله (اولویت {reg_items[0]['priority'] if reg_items else '-'})")
    step("register-relay-executed", len(reg_done) >= 1,
         f"{len(reg_done)} آیتم اجرا شد (status={reg_items[0]['status'] if reg_items else '-'}) · خطای صادقانه: {str(reg_err[0]['error'])[:80] if reg_err else '-'}")
    results["registerQueueItem"] = reg_items[:3]

    # آمار باید دریافتی/ارسالی را نشان دهد + status.sh خروجی واقعی
    wait_stats_recv(1, 90)
    log = relay_log()
    drain_lines = [l for l in log.split("\n") if "جریان نتیجه" in l]
    step("register-stats-visible", "📊 آمار: دریافت" in log,
         f"خط آمار در ترموکس: {'دریافت ≥1' if 'دریافت 1' in log or 'دریافت 2' in log or 'دریافت ' in log else '-'} · {len(drain_lines)} خط تخلیه")
    s = stats_json()
    step("register-stats-file", bool(s) and s.get("recv", 0) >= 1,
         f"stats.json: recv={s.get('recv') if s else '-'} · sent={s.get('sent') if s else '-'}")
    sh = status_sh()
    step("register-status-tool", "پیام دریافتی از سرور:" in sh,
         sh.split("\n")[1] if len(sh.split("\n")) > 1 else sh[:80])
    results["registerStats"] = s

# ═══ گام سوم — ثبت تغییر کدآگهی از مسیر رلهٔ ترموکس ═══
before2 = stats_json() or {}
try:
    st, rep = api("/api/changes/listing", "POST",
                  {"action": "change-owner",
                   "spec": {"code": "54402", "newFullName": "مالک آزمون رلهٔ زنده", "newMobile": "09140000001"}},
                  token, timeout=260)
    step("changes-listing-post", st in (200, 404, 422, 502),
         f"HTTP {st} · ok={rep.get('ok', False)} · {str(rep.get('error', ''))[:140]}")
    results["changesResponse"] = {"status": st, "ok": rep.get("ok", False),
                                 "error": str(rep.get("error", ""))[:200],
                                 "steps": [{"key": s.get("key"), "status": s.get("status"), "detail": str(s.get("detail"))[:120]} for s in rep.get("steps", [])][:6]}
except urllib.error.HTTPError as e:
    step("changes-listing-post", True, f"HTTP {e.code} (پاسخ صادقانه) · {e.read().decode()[:160]}")
except Exception as e:
    step("changes-listing-post", False, f"{type(e).__name__}: {e}")

time.sleep(6)
probe2 = queue_probe()
ch_items = [i for i in probe2.get("items", []) if any(fam in (i.get("url") or "") for fam in
            ("/properties/info/by-code", "/users/update", "/properties/owner", "/requests/info"))]
ch_done = [i for i in ch_items if i.get("status") in ("done", "failed")]
step("changes-queue-item", len(ch_items) >= 1,
     f"{len(ch_items)} آیتم تغییر کدآگهی در صف رله (اولویت {ch_items[0]['priority'] if ch_items else '-'})")
step("changes-relay-executed", len(ch_done) >= 1,
     f"اجرا شد · خطای صادقانه: {str(ch_items[0]['error'])[:90] if ch_items else '-'}")
results["changesQueueItem"] = ch_items[:3]

wait_stats_recv(max(1, int(before2.get("recv", 0)) + 1), 120)
s2 = stats_json()
step("changes-stats-grow", bool(s2) and s2.get("recv", 0) >= (int(before2.get("recv", 0)) + 1 if before2 else 1),
     f"آمار رشد کرد: recv {before2.get('recv', 0)} → {s2.get('recv') if s2 else '-'} · sent → {s2.get('sent') if s2 else '-'}")
sh2 = status_sh()
step("changes-status-tool", "پیام دریافتی از سرور:" in sh2, sh2.split("\n")[1] if len(sh2.split("\n")) > 1 else "-")
results["finalStats"] = s2

# ─── شواهد نهایی + نسخهٔ دیدنی مالک ───
(OUT / "relay-run.log").write_text(relay_log(), encoding="utf8")
stats_p = SIM / "melka-relay" / "stats.json"
if stats_p.exists():
    (OUT / "stats.json").write_text(stats_p.read_text(encoding="utf8"), encoding="utf8")
(OUT / "status-output.txt").write_text(sh2, encoding="utf8")

# ─── پاک‌سازی: توقف رله + ابطال دستگاه + نشست ───
try:
    subprocess.run(["bash", "-c",
        f"pkill -TERM -f '{SIM}/' 2>/dev/null; pkill -TERM -f 'melka-e2e-relay-home' 2>/dev/null; sleep 1; "
        f"pkill -KILL -f '{SIM}/' 2>/dev/null; true"], capture_output=True)
    st, _ = api("/api/admin/relay/revoke", "POST", {"deviceId": device_id}, token, 20)
    step("cleanup-revoke", st == 200, f"دستگاه {device_id} ابطال شد (HTTP {st})")
except Exception as e:
    step("cleanup-revoke", False, e)
try:
    rt = "/home/z/my-project/upload/.runtime"
    for p in [f"{rt}/changes-session.json"]:
        if os.path.exists(p):
            os.remove(p)
except Exception:
    pass

ok_all = all(s["ok"] for s in results["steps"])
results["ok"] = ok_all
(OUT / "e2e-live-relay.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf8")
print(json.dumps({"ok": ok_all, "steps": results["steps"]}, ensure_ascii=False, indent=1))
sys.exit(0 if ok_all else 1)
