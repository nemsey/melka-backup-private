#!/usr/bin/env python3
"""PN-005-C — شاهدهای بصری حالت PRODUCTION (BLOCK 0.2 + BLOCK 1.2)
ورود مالک با کد مستر + کاشی‌های خانه + داشبورد مدیریتی M1-M8 + M5 + M6 + مهر فوتر"""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/pn005/screens-prod"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=90):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(name, timeout=90):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=timeout)
    print(f"  shot {name}: {'OK' if ('✓' in out or 'saved' in out.lower()) else out[:60]}")

def eval_js(js, timeout=60):
    return ab("eval", js, timeout=timeout)

def click_text(needle, timeout=90):
    js = ("(()=>{const n='%s';const els=[...document.querySelectorAll('button, a, div[role=button]')];"
          "const t=els.find(e=>(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\u200c/g,'')).includes(n));"
          "if(!t)return 'no-btn';t.click();return 'clicked';})()" % needle)
    return eval_js(js, timeout)

print("۱) باز کردن + ورود مدیر (حالت production)")
ab("open", BASE, timeout=60)
time.sleep(5)
shot("01-login-page-prod")
print("  switch-to-master:", click_text("ورود با کد مدیر"))
time.sleep(2)
for d in "80211186":
    eval_js("""(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(i, i.value+'%s');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()""" % d)
    time.sleep(0.3)
time.sleep(1.5)
shot("02-master-code-entered-prod")
print("  submit:", click_text("ورود به عنوان مدیر"))
time.sleep(9)
shot("03-home-after-owner-login-prod")
body = eval_js("document.body.innerText") or ""
print("  snippet:", body[:200].replace("\n", " | "))

print("۲) حضور کاشی‌ها در خانه")
for key, names in {
    "داشبورد-مدیریتی": ["داشبورد مدیریتی"],
    "تطبیق-هوشمند": ["تطبیق هوشمند"],
    "مغز/یادگیری": ["یادگیری", "مغز ملکا"],
    "شاخص-بازار": ["شاخص بازار"],
    "پوشش-داده": ["پوشش داده"],
}.items():
    print(f"  {key}: {'FOUND' if any(n in body for n in names) else 'NOT-FOUND'}")

print("۳) داشبورد مدیریتی (M1-M8)")
print("  click:", click_text("داشبورد مدیریتی"))
time.sleep(10)
shot("04-management-dashboard-prod")
md = eval_js("document.body.innerText") or ""
print("  md snippet:", md[:220].replace("\n", " | "))
for key, names in {
    "M1-آگهی": ["آگهی", "فایل"],
    "M2-درخواست": ["درخواست"],
    "M3-معاملات": ["معاملات"],
    "M4-کارشناسان": ["کارشناسان"],
    "M5-تطبیق": ["تطبیق"],
    "M6-مغز": ["مغز"],
    "M7-شاخص": ["شاخص"],
    "M8-پوشش": ["پوشش"],
}.items():
    print(f"  {key}: {'FOUND' if any(n in md for n in names) else 'NOT-FOUND'}")

print("۴) M5 تطبیق هوشمند — اجرای زنده")
back = eval_js("history.back()"); time.sleep(4)
print("  click:", click_text("تطبیق هوشمند"))
time.sleep(10)
shot("05-m5-matching-prod")
print("  m5:", (eval_js("document.body.innerText") or "")[:180].replace("\n", " | "))

print("۵) M6 مغز ملکا — یادگیری و Tier")
back = eval_js("history.back()"); time.sleep(4)
print("  click:", click_text("مغز ملکا") or click_text("یادگیری"))
time.sleep(10)
shot("06-m6-brain-prod")
m6 = eval_js("document.body.innerText") or ""
print("  m6:", m6[:220].replace("\n", " | "))
print("  Tier evidence:", "tier" in m6.lower() or "Tier" in m6)

print("۶) مهر فوتر")
shot("07-footer-stamp-prod")
foot = eval_js("""(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/BUILD|نسخه|c3d8610|[0-9a-f]{7}-2026/.test(e.textContent||''));return el?('stamp:['+(el.textContent||'').trim().slice(0,90)+']'):'no-stamp-el';})()""")
print("  ", foot)
print("DONE-PROD")
