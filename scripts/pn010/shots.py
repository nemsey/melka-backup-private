#!/usr/bin/env python3
"""PN-010 شواهد بصری v3 — ورود تازه + JSONهای زندهٔ احرازشده (نمایش پاسخ واقعی)"""
import subprocess, time, json, os, urllib.request

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/pn010/screens"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=90):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(name, timeout=90):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=timeout)
    print(f"  shot {name}: {'OK' if '✓' in out else out[:70]}")

def eval_js(js, timeout=60):
    return ab("eval", js, timeout=timeout)

def click_btn(needles):
    for text in ([needles] if isinstance(needles, str) else needles):
        js = ("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('%s'));"
              "if(!b)return 'no-btn';b.click();return 'clicked';})()" % text.replace("\u200c", ""))
        if eval_js(js) == "clicked":
            return f"clicked «{text}»"
    return "no-btn"

def api_json(path, token):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

def render_json(name, title, obj, note=""):
    pretty = json.dumps(obj, ensure_ascii=False, indent=1)
    js = ("document.open();document.write(`<pre style=\"direction:ltr;text-align:left;font:12px/1.45 monospace;background:#0b1220;color:#d7e3ff;padding:18px;white-space:pre-wrap\">"
          + title + "\\n" + (note + "\\n" if note else "") + "\\n"
          + pretty.replace("&", "&amp;").replace("<", "&lt;").replace("`", "\\u0060") + "</pre>`);document.close()")
    eval_js(js)
    time.sleep(1)
    shot(name)

# ─── توکن مالک ───
req = urllib.request.Request(BASE + "/api/auth/master-login", data=json.dumps({"masterCode": "80211186"}).encode(),
                             headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=30) as r:
    TOKEN = json.loads(r.read().decode())["token"]
print("توکن مالک:", TOKEN[:20] + "...")

# ─── ۱) ورود تازه (پاک‌سازی نشست قبلی) ───
ab("navigate", BASE)
time.sleep(3)
eval_js("try{localStorage.clear()}catch(e){}; 'cleared'")
time.sleep(1)
ab("navigate", BASE)
time.sleep(6)
print("صفحهٔ ورود:", ab("get", "title"))
shot("01-login")

# ─── ۲) ورود مالک ───
print(" ", click_btn("ورود با کد مدیر"))
time.sleep(2)
print(" ", ab("fill", "#masterCode", "80211186"))
print(" ", ab("click", 'button[type="submit"]'))
time.sleep(8)
body = eval_js("document.body.innerText.slice(0, 120)")
print("  بعد از ورود:", (body or "").replace("\n", " ")[:100])
shot("02-home-owner")

# ─── ۳) JSONهای زندهٔ احرازشده ───
h = api_json("/api/runtime/health", TOKEN)
print("سلامت رانتایم: معماری", h.get("architecture"), "· web", h["web"]["pid"], "· worker alive:", h["worker"]["alive"], "· age:", h["worker"]["lastHeartbeatAgeSec"], "s")
print("  کارها:", [(j["id"], j["runs"]) for j in h["jobQueue"]["jobs"]])
ab("navigate", "about:blank")
render_json("03-runtime-health", "GET /api/runtime/health (OWNER-only) — معماری ۱ Web + ۱ Worker — زنده", h,
            "Web PID " + str(h["web"]["pid"]) + " · Worker PID " + str(h["worker"]["pid"]) + " · ضربان " + str(h["worker"]["lastHeartbeatAgeSec"]) + " ثانیه پیش")

d = api_json("/api/intelligence/status", TOKEN)
print("وضعیت هوشمندی: daemon:", json.dumps(d.get("daemon"), ensure_ascii=False))
cd = {k: v for k, v in d.get("catalogDaemon", {}).items() if k != "lastResult"}
print("  catalogDaemon:", json.dumps(cd, ensure_ascii=False))
render_json("04-intelligence-daemon-worker-channel", "/api/intelligence/status → daemon + catalogDaemon (منبع حقیقت: کانال Worker)", {
    "daemon": d.get("daemon"),
    "catalogDaemon": cd,
    "outcomeLoop": {k: d["outcomeLoop"][k] for k in ["predictions", "linked", "ranAt"]},
})

p10 = d.get("coreCycle", {}).get("p10", {})
diag = next((c for c in p10.get("checks", []) if c["id"] == "DIAG-DATA-005"), None)
print("DIAG-DATA-005:", json.dumps(diag, ensure_ascii=False))
render_json("05-diag-data-005-green", "DIAG-DATA-005 (بکاپ‌ها) — پس از ترمیم BLOCK 1 — زنده از /api/intelligence/status", {
    "check": diag,
    "checksSummary": p10.get("checksSummary"),
    "systemHealth": p10.get("systemHealth"),
    "overallScore": p10.get("overallScore"),
})

# ─── ۴) UI تنظیمات → وضعیت مغز ───
ab("navigate", BASE)
time.sleep(6)
print(" ", click_btn("تنظیمات"))
time.sleep(6)
found = eval_js("(()=>{const el=[...document.querySelectorAll('*')].find(e=>/وضعیت مغز|مغز هوشمند و یادگیر/.test(e.textContent||'')&&e.children.length<14);if(el){el.scrollIntoView({block:'center'});return 'scrolled'}return 'not-found'})()")
print("  کارت مغز:", found)
time.sleep(2)
shot("06-settings-brain-status")
print("  «زنده» در متن:", eval_js("document.body.innerText.includes('زنده')"))

worker = json.load(open("/home/z/my-project/upload/.runtime/runtime-status.json"))
print("Worker زنده: pid", worker["worker"]["pid"], "· ticks:", worker["dispatcher"]["ticks"], "· jobs:", {k: v["runs"] for k, v in worker["jobs"].items()})
