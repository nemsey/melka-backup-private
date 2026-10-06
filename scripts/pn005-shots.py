#!/usr/bin/env python3
"""PN-005 v2 — شاهدهای بصری بازیابی: ورود مالک + کاشی‌ها + مهر فوتر"""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/pn005/screens"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=90):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(name, timeout=90):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=timeout)
    print(f"  shot {name}: {'OK' if '✓' in out or 'saved' in out.lower() else out[:80]}")

def eval_js(js, timeout=60):
    return ab("eval", js, timeout=timeout)

def click_text(needle, timeout=90):
    js = ("(()=>{const n='%s';const els=[...document.querySelectorAll('button, a, div[role=button]')];"
          "const t=els.find(e=>(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\u200c/g,'')).includes(n));"
          "if(!t)return 'no-btn';t.click();return 'clicked';})()" % needle)
    return eval_js(js)

# ۱) باز کردن و ورود مدیر
print("۱) open + master login")
ab("open", BASE, timeout=60)
time.sleep(4)
shot("01-login-page")
print("  switch-to-master:", click_text("ورود با کد مدیر"))
time.sleep(2)
# تایپ رقم‌به‌رقم با رویداد input (React)
for d in "80211186":
    eval_js("""(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(i, i.value+'%s');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()""" % d)
    time.sleep(0.35)
time.sleep(1)
shot("02-master-code-entered")
print("  submit:", click_text("ورود به عنوان مدیر"))
time.sleep(8)
shot("03-after-login")
body = eval_js("document.body.innerText")
print("  after-login snippet:", (body or "")[:180].replace("\n", " | "))

# ۲) کاشی‌های خانه
print("۲) tiles on home")
for key, names in {
    "M5-تطبیق": ["تطبیق هوشمند"],
    "M6-یادگیری": ["یادگیری"],
    "شاخص-بازار": ["شاخص بازار"],
    "پوشش-داده": ["پوشش داده"],
    "مغز": ["مغز"],
}.items():
    print(f"  {key}: {'FOUND' if any(n in (body or '') for n in names) else 'NOT-FOUND'}")
shot("04-home-tiles")

# ۳) ورود به کاشی تطبیق هوشمند (M5)
print("۳) M5 tile")
print("  click:", click_text("تطبیق هوشمند"))
time.sleep(8)
shot("05-m5-smart-matching")
print("  m5 page:", eval_js("document.body.innerText.slice(0,200)").replace("\n", " | ")[:180])

# ۴) بازگشت → کاشی یادگیری (M6)
print("۴) M6 tile")
back = eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('بازگشت'));if(b){b.click();return 'back'};return 'no-back'})()")
print("  back:", back)
time.sleep(5)
print("  click:", click_text("یادگیری"))
time.sleep(8)
shot("06-m6-learning-tier")

# ۵) فوتر مهر
print("۵) footer")
foot = eval_js("""(()=>{const f=document.querySelector('footer');return f?(f.innerText||'').slice(0,250):'no-footer-el';})()""")
print("  footer:", (foot or "").replace("\n", " | ")[:220])
shot("07-footer-stamp")

print("DONE")
