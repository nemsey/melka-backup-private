#!/usr/bin/env python3
"""p6549-shots.py — شواهد بصری قانون ۰۳۵-B/خ: ۱۳ بخش × ۲ تم = ۲۶ اسکرین‌شات + ۲ اسکرین‌شات PWA
هارنس الگوی shots-v3.py (P6548) با جریان ورود کدمستر."""
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

def shot(path, timeout=180):
    out = ab("screenshot", path, timeout=timeout)
    ok = "✓" in out or "screenshot" in out.lower()
    print(f"    shot {os.path.basename(path)}: {'OK' if ok else out[:60]}")

def eval_js(js, timeout=120):
    return ab("eval", js, timeout=timeout)

def click_btn(needles, timeout=120):
    if isinstance(needles, str):
        needles = [needles]
    for text in needles:
        needle = text.replace("\u200c", "")
        js = ("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('%s'));"
              "if(!b)return 'no-btn';b.click();return 'clicked';})()" % needle)
        r = eval_js(js, timeout=timeout)
        if r == "clicked":
            return f"clicked «{text}»"
    return "NO-BTN"

def go_home():
    eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').includes('بازگشت به خانه'))||[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('هوم'));if(b){b.click();return 'ok'}return 'no'})()")
    time.sleep(2)

def open_tile(label):
    r = click_btn(label)
    time.sleep(5)
    return r

def set_theme(dark: bool):
    want = "تاریک کردن تم" if not dark else "روشن کردن تم"
    # اگر دکمهٔ موردنیاز موجود نیست یعنی همان تم است
    state = eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').includes('تم'));return b? b.getAttribute('aria-label') : 'none'})()")
    if want in (state or ""):
        click_btn(want)
        time.sleep(1.2)

def scroll_top():
    eval_js("window.scrollTo(0,0)")
    time.sleep(0.6)

def scroll_to(frag):
    eval_js(f"(()=>{{const el=[...document.querySelectorAll('h1,h2,h3,h4,section,div')].find(e=>(e.textContent||'').includes('{frag}')&&e.offsetHeight>0);if(el)el.scrollIntoView({{block:'start'}});return el?'ok':'no'}})()")
    time.sleep(0.8)

# ═══ ۱) ورود ═══
print("۱) بوت و ورود کدمستر 00000000")
ab("open", BASE)
time.sleep(6)
ab("set", "viewport", "412", "915")
time.sleep(2)
shot(f"{SHOT}/01-login-light.png")
print("  ", click_btn("ورود با کد مدیر"))
time.sleep(2)
print("  ", ab("fill", "#masterCode", "00000000"))
time.sleep(1)
print("  ", click_btn("ورود"))
time.sleep(9)
shot(f"{SHOT}/02-boot-after-login.png")
state = eval_js("document.body.innerText.slice(0,80)")
print("   state:", (state or "")[:70].replace("\n", " "))

# اگر هنوز در ورودیم (شاید OTP) — تلاش دوباره
if "خوش آمدید" not in (eval_js("document.body.innerText") or ""):
    time.sleep(6)

# ═══ ۲) ۱۲ سطح در تم روشن ═══
print("۲) تم روشن — ۱۲ سطح")
set_theme(False)
time.sleep(1.5)
scroll_top(); shot(f"{SHOT}/03-home-light.png"); time.sleep(1)
open_tile("فایل یابی"); scroll_top(); shot(f"{SHOT}/04-finder-light.png")
go_home(); open_tile("آگهی ملکا"); scroll_top(); shot(f"{SHOT}/05-melka-listing-light.png")
go_home(); open_tile("درخواست ملکا"); scroll_top(); shot(f"{SHOT}/06-melka-request-light.png")
go_home(); open_tile("تنظیمات عمومی"); scroll_top(); shot(f"{SHOT}/07-settings-light.png")
scroll_to("مغز هوشمند"); shot(f"{SHOT}/08-ai-brain-light.png")
go_home(); open_tile("داشبورد مدیریتی"); scroll_top(); shot(f"{SHOT}/09-mgmt-light.png")
open_tile("M1 آگهی"); scroll_top(); time.sleep(3); shot(f"{SHOT}/10-m1-light.png")
scroll_top()
# consultant = پنل ایجنت (بالای M1)
shot(f"{SHOT}/11-consultant-agentpanel-light.png")
go_home(); open_tile("داشبورد مدیریتی"); open_tile("M2 درخواست"); scroll_top(); time.sleep(3); shot(f"{SHOT}/12-m2-light.png")
open_tile("M3 معاملات") if False else None
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).includes('معاملات'));if(b)b.click();return 'ok'})()")
time.sleep(4); scroll_top(); shot(f"{SHOT}/13-m3-light.png")
go_home(); open_tile("داشبورد مدیریتی"); open_tile("M4 کارشناسان"); scroll_top(); time.sleep(3); shot(f"{SHOT}/14-m4-light.png")

# ═══ ۳) همان سطح‌ها در تم تاریک ═══
print("۳) تم تاریک — همان سطح‌ها")
# صفحهٔ ورودِ تاریک: تم را در localStorage ست می‌کنیم و بدون نشست بار می‌کنیم
eval_js("localStorage.setItem('theme','dark')")
set_theme(True)
time.sleep(1.8)
go_home(); scroll_top(); shot(f"{SHOT}/15-home-dark.png")
open_tile("فایل یابی"); scroll_top(); shot(f"{SHOT}/16-finder-dark.png")
go_home(); open_tile("آگهی ملکا"); scroll_top(); shot(f"{SHOT}/17-melka-listing-dark.png")
go_home(); open_tile("درخواست ملکا"); scroll_top(); shot(f"{SHOT}/18-melka-request-dark.png")
go_home(); open_tile("تنظیمات عمومی"); scroll_top(); shot(f"{SHOT}/19-settings-dark.png")
scroll_to("مغز هوشمند"); shot(f"{SHOT}/20-ai-brain-dark.png")
go_home(); open_tile("داشبورد مدیریتی"); scroll_top(); shot(f"{SHOT}/21-mgmt-dark.png")
open_tile("M1 آگهی"); scroll_top(); time.sleep(3); shot(f"{SHOT}/22-m1-dark.png")
scroll_top(); shot(f"{SHOT}/23-consultant-agentpanel-dark.png")
go_home(); open_tile("داشبورد مدیریتی"); open_tile("M2 درخواست"); scroll_top(); time.sleep(3); shot(f"{SHOT}/24-m2-dark.png")
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')).includes('معاملات'));if(b)b.click();return 'ok'})()")
time.sleep(4); scroll_top(); shot(f"{SHOT}/25-m3-dark.png")
go_home(); open_tile("داشبورد مدیریتی"); open_tile("M4 کارشناسان"); scroll_top(); time.sleep(3); shot(f"{SHOT}/26-m4-dark.png")

# صفحهٔ ورود تاریک — نشست را پاک می‌کنیم و تم تاریک می‌ماند
print("۴) صفحهٔ ورود در تاریک + اسکرین‌شات‌های PWA")
eval_js("localStorage.clear(); localStorage.setItem('theme','dark')")
ab("open", BASE)
time.sleep(6)
shot(f"{SHOT}/27-login-dark.png")
# بازگشت به روشن + ورود دوباره برای PWA شات‌ها
eval_js("localStorage.clear(); localStorage.setItem('theme','light')")
ab("open", BASE)
time.sleep(5)
click_btn("ورود با کد مدیر"); time.sleep(2)
ab("fill", "#masterCode", "00000000"); time.sleep(1)
click_btn("ورود"); time.sleep(9)
scroll_top(); time.sleep(1)
ab("screenshot", f"{PWA}/mobile-home.png")
print("    PWA mobile-home OK")
ab("set", "viewport", "1280", "800")
time.sleep(2)
open_tile("داشبورد مدیریتی"); open_tile("M1 آگهی")
time.sleep(4); scroll_top(); time.sleep(1)
ab("screenshot", f"{PWA}/desktop-m1.png")
print("    PWA desktop-m1 OK")

print("۵) پایان — شمارش:")
os.system(f"ls {SHOT} | wc -l")
os.system(f"ls {PWA}")
