#!/usr/bin/env python3
"""p6551-shots.py — شواهد بصری کارت «بستهٔ انتقال ملکا» (BLOCK 2.3)
ورود مالک → ?tile=settings → اسکرول به کارت → ۴ شات: دسکتاپ روشن/تاریک + موبایل + کلیک دانلود
"""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/p6551/screens"
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

def wait_marker(marker, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if marker in page_text():
            return True
        time.sleep(2.5)
    return False

def scroll_to_card():
    eval_js("(()=>{const el=document.getElementById('settings-skeleton-delivery');if(el){el.scrollIntoView({block:'start'});return 'y'}return 'n'})()")
    time.sleep(1.8)

# ═══ ۱) ورود مدیر ═══
ab("set", "viewport", "1280", "900")
eval_js("localStorage.clear(); localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(6)
print("ورود...", flush=True)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2.5)
ab("fill", "#masterCode", "80211186"); time.sleep(1.2)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('ورود به عنوان مدیر'));if(b){b.click();return 'y'}return 'n'})()")
if not wait_marker("خوش آمدید", 35):
    raise SystemExit("LOGIN FAILED")
print("نشست مالک: ACTIVE", flush=True)

# ═══ ۲) شات ۱ — دسکتاپ روشن ═══
ab("open", BASE + "/?tile=settings"); time.sleep(4)
if not wait_marker("تنظیمات", 40):
    raise SystemExit("SETTINGS NOT LOADED")
scroll_to_card()
ok_card = "بستهٔ انتقال ملکا" in page_text()
ab("screenshot", f"{SHOT}/01-settings-card-light-desktop.png")
print(f"01-desktop-light {'OK' if ok_card else 'NO-CARD'}", flush=True)

# ═══ ۳) شات ۲ — دسکتاپ تاریک ═══
eval_js("localStorage.setItem('theme','dark'); 'ok'")
ab("open", BASE + "/?tile=settings"); time.sleep(5)
wait_marker("تنظیمات", 40)
scroll_to_card()
ab("screenshot", f"{SHOT}/02-settings-card-dark-desktop.png")
print("02-desktop-dark OK", flush=True)

# ═══ ۴) شات ۳ — موبایل (۴۱۲×۹۱۵) ═══
eval_js("localStorage.setItem('theme','light'); 'ok')")
ab("set", "viewport", "412", "915"); time.sleep(2)
ab("open", BASE + "/?tile=settings"); time.sleep(5)
wait_marker("تنظیمات", 40)
scroll_to_card()
ab("screenshot", f"{SHOT}/03-settings-card-mobile.png")
print("03-mobile OK", flush=True)

# ═══ ۵) شات ۴ — کلیک روی دکمهٔ دانلود «مانیفست» ═══
clicked = eval_js("(()=>{const card=document.getElementById('settings-skeleton-delivery');if(!card)return 'no-card';const btn=[...card.querySelectorAll('button')].find(b=>(b.textContent||'').includes('دانلود'));if(btn){btn.click();return 'y'}return 'no-btn'})()")
time.sleep(4)
txt = page_text()
done_badge = "دریافت شد" in txt
ab("screenshot", f"{SHOT}/04-download-clicked.png")
print(f"04-download-click clicked={clicked} badge={'دریافت شد' if done_badge else 'WAIT'}", flush=True)

# بازگشت به دسکتاپ برای ادامهٔ کار
ab("set", "viewport", "1280", "900")
print("SHOTS-DONE", flush=True)
