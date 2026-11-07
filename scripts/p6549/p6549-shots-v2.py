#!/usr/bin/env python3
"""p6549-shots-v2.py — بازتصویربرداری قطعی با پیوند عمیق ?tile= (الگوی میان‌برهای PWA)
تم با localStorage ست می‌شود (next-themes در بوت می‌خواند) — بدون وابستگی به کلیک."""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/p6549/screenshots"
PWA = "/home/z/my-project/public/screenshots"
os.makedirs(SHOT, exist_ok=True)
os.makedirs(PWA, exist_ok=True)

def ab(*args, timeout=180):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(path):
    out = ab("screenshot", path, timeout=180)
    print(f"    {os.path.basename(path)}: {'OK' if ('✓' in out or 'shot' in out.lower()) else out[:50]}")

def capture(name, tile, theme, viewport=("412", "915"), wait=8, scroll_top=True):
    t = "dark" if theme == "dark" else "light"
    ab("set", "viewport", viewport[0], viewport[1])
    ab("eval", f"localStorage.setItem('theme','{t}'); sessionStorage.removeItem('melka-splash-shown'); 'ok'")
    url = BASE + (f"/?tile={tile}" if tile else "/")
    ab("open", url)
    time.sleep(wait)
    if scroll_top:
        ab("eval", "window.scrollTo(0,0)")
        time.sleep(1)
    shot(f"{SHOT}/{name}")

# ═══ ورود (یک‌بار — نشست در localStorage می‌ماند) ═══
print("نشست ورود...")
ab("set", "viewport", "412", "915")
ab("open", BASE)
time.sleep(5)
state = ab("eval", "document.body.innerText.includes('خوش آمدید') ? 'home' : document.body.innerText.slice(0,60).replace(/\\n/g,' ')")
print("   وضعیت:", state)
if "home" not in str(state):
    print("   نیاز به ورود — جریان کدمستر")
    r = ab("eval", "(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
    print("   دکمه:", r)
    time.sleep(2)
    ab("fill", "#masterCode", "00000000")
    time.sleep(1)
    ab("eval", "(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('ورود'));if(b){b.click();return 'y'}return 'n'})()")
    time.sleep(10)
    print("   پس از ورود:", ab("eval", "document.body.innerText.includes('خوش آمدید') ? 'HOME ✓' : document.body.innerText.slice(0,50).replace(/\\n/g,' ')"))

# ═══ ۱۳ سطح × ۲ تم ═══
surfaces = [
    ("01-login-light", None, "light"), ("27-login-dark", None, "dark"),
    ("03-home-light", None, "light"), ("15-home-dark", None, "dark"),
    ("04-finder-light", "file-finder", "light"), ("16-finder-dark", "file-finder", "dark"),
    ("05-melka-listing-light", "listings", "light"), ("17-melka-listing-dark", "listings", "dark"),
    ("06-melka-request-light", "requests", "light"), ("18-melka-request-dark", "requests", "dark"),
    ("07-settings-light", "settings", "light"), ("19-settings-dark", "settings", "dark"),
    ("08-ai-brain-light", "settings", "light"), ("20-ai-brain-dark", "settings", "dark"),
    ("09-mgmt-light", "management-dashboard", "light"), ("21-mgmt-dark", "management-dashboard", "dark"),
    ("10-m1-light", "arm-listings", "light"), ("22-m1-dark", "arm-listings", "dark"),
    ("11-consultant-agentpanel-light", "arm-listings", "light"), ("23-consultant-agentpanel-dark", "arm-listings", "dark"),
    ("12-m2-light", "arm-requests", "light"), ("24-m2-dark", "arm-requests", "dark"),
    ("13-m3-light", "transactions-contracts", "light"), ("25-m3-dark", "transactions-contracts", "dark"),
    ("14-m4-light", "experts", "light"), ("26-m4-dark", "experts", "dark"),
]
for name, tile, theme in surfaces:
    print(f"{name} ({tile or 'home'} · {theme})")
    capture(name, tile, theme)

# مغز: اسکرول به بخش مغز در تنظیمات
for name, theme in [("08-ai-brain-light", "light"), ("20-ai-brain-dark", "dark")]:
    ab("eval", f"localStorage.setItem('theme','{theme}')")
    ab("open", f"{BASE}/?tile=settings")
    time.sleep(8)
    ab("eval", "(()=>{const el=[...document.querySelectorAll('h3,h4')].find(e=>(e.textContent||'').includes('مغز'));if(el)el.scrollIntoView({block:'start'});return 'ok'})()")
    time.sleep(1.5)
    shot(f"{SHOT}/{name}")

# ═══ اسکرین‌شات‌های PWA ═══
print("PWA screenshots")
ab("eval", "localStorage.setItem('theme','light')")
ab("open", BASE); time.sleep(8)
ab("eval", "window.scrollTo(0,0)"); time.sleep(1)
ab("screenshot", f"{PWA}/mobile-home.png")
print("    mobile-home OK")
ab("set", "viewport", "1280", "800"); time.sleep(2)
ab("open", f"{BASE}/?tile=arm-listings"); time.sleep(10)
ab("eval", "window.scrollTo(0,0)"); time.sleep(1)
ab("screenshot", f"{PWA}/desktop-m1.png")
print("    desktop-m1 OK")
# بازگشت به تم روشن پیش‌فرض
ab("eval", "localStorage.setItem('theme','light')")
print("پایان:", len([f for f in os.listdir(SHOT) if f.endswith('.png')]), "شات در", SHOT)
