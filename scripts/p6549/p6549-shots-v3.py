#!/usr/bin/env python3
"""p6549-shots-v3.py — مجموعهٔ نهایی ۲۷ شات با ورود تازه + راستی‌آزمایی هر شات (marker در DOM) + تلاش مجدد."""
import subprocess, time, os, json

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/p6549/screenshots"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=180):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def eval_js(js, timeout=120):
    return ab("eval", js, timeout=timeout)

def page_text():
    return eval_js("document.body.innerText") or ""

def wait_marker(marker, timeout=25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if marker in page_text():
            return True
        time.sleep(2)
    return False

def login():
    ab("set", "viewport", "412", "915")
    eval_js("localStorage.clear(); 'ok'")
    ab("open", BASE)
    time.sleep(5)
    if "خوش آمدید" in page_text():
        print("   نشست قبلی فعال — ورود لازم نیست")
        return True
    eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
    time.sleep(2)
    ab("fill", "#masterCode", "00000000")
    time.sleep(1)
    eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='ورود'||(b.getAttribute('aria-label')||'').includes('ورود'));if(b){b.click();return 'y'}return 'n'})()")
    return wait_marker("خوش آمدید", 30)

def capture(name, tile, theme, marker, viewport=("412", "915"), wait=14, scroll_frag=None):
    path = f"{SHOT}/{name}.png"
    ab("set", "viewport", viewport[0], viewport[1])
    eval_js(f"localStorage.setItem('theme','{theme}'); 'ok'")
    ab("open", BASE + (f"/?tile={tile}" if tile else "/"))
    ok = wait_marker(marker, 30)
    if not ok:  # تلاش دوباره با ورود تازه
        print(f"    ↻ marker نه — ورود دوباره + تلاش مجدد")
        login()
        eval_js(f"localStorage.setItem('theme','{theme}'); 'ok'")
        ab("open", BASE + (f"/?tile={tile}" if tile else "/"))
        ok = wait_marker(marker, 30)
    if scroll_frag:
        eval_js(f"(()=>{{const el=[...document.querySelectorAll('h2,h3,h4')].find(e=>(e.textContent||'').includes('{scroll_frag}'));if(el)el.scrollIntoView({{block:'start'}});return 'ok'}})()")
        time.sleep(1.5)
    else:
        eval_js("window.scrollTo(0,0)")
        time.sleep(1)
    ab("screenshot", path)
    size = os.path.getsize(path) if os.path.exists(path) else 0
    print(f"    {name}: {'✓' if ok and size > 30000 else '⚠ VERIFY'} ({size//1024}KB)")
    return ok

# ═══ ۰) پاک‌سازی مجموعهٔ قبلی ═══
for f in os.listdir(SHOT):
    os.remove(os.path.join(SHOT, f))
print("۰) پاک‌سازی انجام شد")

# ═══ ۱) شات‌های صفحهٔ ورود (بدون نشست) ═══
print("۱) صفحهٔ ورود ×۲ تم")
for name, theme in [("01-login-light", "light"), ("27-login-dark", "dark")]:
    ab("set", "viewport", "412", "915")
    eval_js(f"localStorage.clear(); localStorage.setItem('theme','{theme}'); 'ok'")
    ab("open", BASE)
    ok = wait_marker("ورود با کد مدیر", 20)
    ab("screenshot", f"{SHOT}/{name}.png")
    print(f"    {name}: {'✓' if ok else '⚠'}")

# ═══ ۲) ورود ═══
print("۲) ورود کدمستر")
login()
print("   نشست:", "فعال ✓" if "خوش آمدید" in page_text() else "⚠")

# ═══ ۳) ۲۵ شات سطح‌ها (۱۲ سطح × ۲ تم + مغز ×۲) ═══
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
    ("09-mgmt-light", "management-dashboard", "light", "داشبورد مدیریتی", None),
    ("21-mgmt-dark", "management-dashboard", "dark", "داشبورد مدیریتی", None),
    ("10-m1-light", "arm-listings", "light", "فهرست آگهی‌ها", None),
    ("22-m1-dark", "arm-listings", "dark", "فهرست آگهی‌ها", None),
    ("11-consultant-agentpanel-light", "arm-listings", "light", "ایجنت", None),
    ("23-consultant-agentpanel-dark", "arm-listings", "dark", "ایجنت", None),
    ("12-m2-light", "arm-requests", "light", "فهرست درخواست‌ها", None),
    ("24-m2-dark", "arm-requests", "dark", "فهرست درخواست‌ها", None),
    ("13-m3-light", "transactions-contracts", "light", "معاملات", None),
    ("25-m3-dark", "transactions-contracts", "dark", "معاملات", None),
    ("14-m4-light", "experts", "light", "کارشناس", None),
    ("26-m4-dark", "experts", "dark", "کارشناس", None),
]
print("۳) سطح‌ها")
for name, tile, theme, marker, frag in surfaces:
    print(f"  {name}")
    capture(name, tile, theme, marker, scroll_frag=frag)

print("۴) پایان — شمارش:", len([f for f in os.listdir(SHOT) if f.endswith(".png")]))
