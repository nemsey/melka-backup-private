#!/usr/bin/env python3
"""p6549-shots-v4.py — نسخهٔ نهایی-نهایی: ورود فقط یک‌بار در ابتدا؛ در حلقه هیچ ورودی نیست؛
هر شات با marker راستی‌آزمایی می‌شود؛ فقط انتظار طولانی‌تر در صورت نیاز."""
import subprocess, time, os, sys

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
        if marker in t:
            return True
        if "ورود با کد مدیر" in t:  # نشست افتاده — بی‌درنگ گزارش
            return False
        time.sleep(2.5)
    return False

def logged_in():
    return "خوش آمدید" in page_text() or "وضعیت اتصال" in page_text()

# ═══ ۰) پاک‌سازی ═══
for f in os.listdir(SHOT):
    os.remove(os.path.join(SHOT, f))

# ═══ ۱) شات‌های صفحهٔ ورود (بدون نشست؛ فقط یک‌بار clear) ═══
ab("set", "viewport", "412", "915")
eval_js("localStorage.clear(); localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(5)
ok = wait_marker("ورود با کد مدیر", 15)
ab("screenshot", f"{SHOT}/01-login-light.png")
print(f"01-login-light {'✓' if ok else '⚠'}", flush=True)
eval_js("localStorage.setItem('theme','dark'); 'ok'")
ab("open", BASE); time.sleep(5)
ok = wait_marker("ورود با کد مدیر", 15)
ab("screenshot", f"{SHOT}/27-login-dark.png")
print(f"27-login-dark {'✓' if ok else '⚠'}", flush=True)

# ═══ ۲) ورود فقط همین‌جا ═══
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2.5)
ab("fill", "#masterCode", "00000000"); time.sleep(1.2)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='ورود');if(b){b.click();return 'y'}return 'n'})()")
ok = wait_marker("خوش آمدید", 30)
print("ورود:", "✓" if ok else "✗✗✗", flush=True)
if not ok:
    sys.exit("ورود ناموفق — توقف")

# ═══ ۳) سطح‌ها — بدون هیچ ورود مجددی ═══
surfaces = [
    ("03-home-light", None, "light", "خوش آمدید", None),
    ("15-home-dark", None, "dark", "خوش آمدید", None),
    ("04-finder-light", "file-finder", "light", "فایل", None),
    ("16-finder-dark", "file-finder", "dark", "فایل", None),
    ("05-melka-listing-light", "listings", "light", "آگهی", None),
    ("17-melka-listing-dark", "listings", "dark", "آگهی", None),
    ("06-melka-request-light", "requests", "light", "درخواست", None),
    ("18-melka-request-dark", "requests", "dark", "درخواست", None),
    ("07-settings-light", "settings", "light", "تنظیمات", None),
    ("19-settings-dark", "settings", "dark", "تنظیمات", None),
    ("08-ai-brain-light", "settings", "light", "مغز هوشمند", "مغز هوشمند"),
    ("20-ai-brain-dark", "settings", "dark", "مغز هوشمند", "مغز هوشمند"),
    ("09-mgmt-light", "management-dashboard", "light", "کاشی مدیریتی", None),
    ("21-mgmt-dark", "management-dashboard", "dark", "کاشی مدیریتی", None),
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
    ok = wait_marker(marker, 35)
    if frag:
        eval_js(f"(()=>{{const el=[...document.querySelectorAll('h2,h3,h4')].find(e=>(e.textContent||'').includes('{frag}'));if(el)el.scrollIntoView({{block:'start'}});return 'ok'}})()")
        time.sleep(1.6)
    else:
        eval_js("window.scrollTo(0,0)"); time.sleep(1.1)
    ab("screenshot", f"{SHOT}/{name}.png")
    size = os.path.getsize(f"{SHOT}/{name}.png") // 1024
    print(f"{name} {'✓' if ok else '⚠ NO-MARKER'} ({size}KB)", flush=True)
    if not ok:
        fails.append(name)

print(f"\nپایان: {len([f for f in os.listdir(SHOT) if f.endswith('.png')])} شات · ناموفق: {fails or 'هیچ'}")
