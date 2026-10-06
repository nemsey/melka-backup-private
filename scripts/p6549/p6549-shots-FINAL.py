#!/usr/bin/env python3
"""p6549-shots-FINAL.py — اجرای یک‌پارچه: شات ورود×۲ → ورود درست → ۲۴ سطح — بدون هیچ clear بعد از ورود."""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/p6549/screenshots"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=150):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def eval_js(js, timeout=100):
    return ab("eval", js, timeout=timeout)

def page_text():
    return eval_js("document.body.innerText") or ""

def wait_marker(marker, timeout=35):
    t0 = time.time()
    while time.time() - t0 < timeout:
        t = page_text()
        if marker in t: return True
        time.sleep(2.5)
    return False

# پاک‌سازی مجموعه
for f in os.listdir(SHOT):
    os.remove(os.path.join(SHOT, f))

# ═══ ۱) شات‌های صفحهٔ ورود ═══
ab("set", "viewport", "412", "915")
eval_js("localStorage.clear(); localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(5)
ok1 = ("ورود کارشناس" in page_text()) or ("ورود مدیر سامانه" in page_text())
ab("screenshot", f"{SHOT}/01-login-light.png")
print(f"01-login-light {'OK' if ok1 else 'FAIL'}", flush=True)
eval_js("localStorage.setItem('theme','dark'); 'ok'")
ab("open", BASE); time.sleep(5)
ok2 = ("ورود کارشناس" in page_text()) or ("ورود مدیر سامانه" in page_text())
ab("screenshot", f"{SHOT}/27-login-dark.png")
print(f"27-login-dark {'OK' if ok2 else 'FAIL'}", flush=True)

# ═══ ۲) ورود (دکمهٔ درست: «ورود به عنوان مدیر») ═══
eval_js("localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(5)
print("ورود...", flush=True)
# ۱) دکمهٔ «ورود با کد مدیر» (پیش‌فرض صفحه، ورود کارشناس است)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2.5)
# ۲) پرکردن کد
ab("fill", "#masterCode", "00000000"); time.sleep(1.2)
# ۳) دکمهٔ «ورود به عنوان مدیر»
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('ورود به عنوان مدیر'));if(b){b.click();return 'y'}return 'n'})()")
loggedin = wait_marker("خوش آمدید", 30)
print("نشست:", "ACTIVE" if loggedin else "DEAD", flush=True)
if not loggedin:
    raise SystemExit("LOGIN FAILED — STOP")

# ═══ ۳) سطح‌ها ═══
surfaces = [
    ("03-home-light", None, "light", "خوش آمدید", None),
    ("15-home-dark", None, "dark", "خوش آمدید", None),
    ("04-finder-light", "file-finder", "light", "فایل یابی", None),
    ("16-finder-dark", "file-finder", "dark", "فایل یابی", None),
    ("05-melka-listing-light", "listings", "light", "آگهی ملکا", None),
    ("17-melka-listing-dark", "listings", "dark", "آگهی ملکا", None),
    ("06-melka-request-light", "requests", "light", "درخواست ملکا", None),
    ("18-melka-request-dark", "requests", "dark", "درخواست ملکا", None),
    ("07-settings-light", "settings", "light", "تنظیمات", None),
    ("19-settings-dark", "settings", "dark", "تنظیمات", None),
    ("08-ai-brain-light", "settings", "light", "مغز هوشمند", "مغز هوشمند"),
    ("20-ai-brain-dark", "settings", "dark", "مغز هوشمند", "مغز هوشمند"),
    ("09-mgmt-light", "management-dashboard", "light", "داشبورد مدیریتی", None),
    ("21-mgmt-dark", "management-dashboard", "dark", "داشبورد مدیریتی", None),
    ("10-m1-light", "arm-listings", "light", "فهرست آگهی‌ها", None),
    ("22-m1-dark", "arm-listings", "dark", "فهرست آگهی‌ها", None),
    ("11-consultant-agentpanel-light", "arm-listings", "light", "ایجنت", None),
    ("23-consultant-agentpanel-dark", "arm-listings", "dark", "ایجنت", None),
    ("12-m2-light", "arm-requests", "light", "فهرست درخواست", None),
    ("24-m2-dark", "arm-requests", "dark", "فهرست درخواست", None),
    ("13-m3-light", "transactions-contracts", "light", "معاملات", None),
    ("25-m3-dark", "transactions-contracts", "dark", "معاملات", None),
    ("14-m4-light", "experts", "light", "کارشناس", None),
    ("26-m4-dark", "experts", "dark", "کارشناس", None),
]
fails = []
for name, tile, theme, marker, frag in surfaces:
    eval_js(f"localStorage.setItem('theme','{theme}'); 'ok'")
    ab("open", BASE + (f"/?tile={tile}" if tile else "/"))
    ok = wait_marker(marker, 40)
    if frag:
        eval_js(f"(()=>{{const el=[...document.querySelectorAll('h2,h3,h4')].find(e=>(e.textContent||'').includes('{frag}'));if(el)el.scrollIntoView({{block:'start'}});return 'ok'}})()")
        time.sleep(1.6)
    else:
        eval_js("window.scrollTo(0,0)"); time.sleep(1.1)
    ab("screenshot", f"{SHOT}/{name}.png")
    size = os.path.getsize(f"{SHOT}/{name}.png") // 1024
    print(f"{name} {'OK' if ok else 'NO-MARKER'} ({size}KB)", flush=True)
    if not ok: fails.append(name)

# ═══ ۴) اسکرین‌شات‌های PWA ═══
eval_js("localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(8)
eval_js("window.scrollTo(0,0)"); time.sleep(1)
ab("screenshot", "public/screenshots/mobile-home.png")
ab("set", "viewport", "1280", "800"); time.sleep(2)
ab("open", f"{BASE}/?tile=arm-listings"); time.sleep(12)
eval_js("window.scrollTo(0,0)"); time.sleep(1)
ab("screenshot", "public/screenshots/desktop-m1.png")
print("PWA shots OK", flush=True)
print(f"END: {len(os.listdir(SHOT))} files; fails: {fails or 'none'}", flush=True)
