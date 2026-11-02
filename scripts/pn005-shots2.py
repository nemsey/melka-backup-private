#!/usr/bin/env python3
"""PN-005 v4 — ثبت کاشی‌ها پس از ورود موفق مالک"""
import subprocess, time, os

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

def click_text(needle):
    js = ("(()=>{const n='%s';const els=[...document.querySelectorAll('button, a, div[role=button]')];"
          "const t=els.find(e=>(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).replace(/\\u200c/g,'')).includes(n));"
          "if(!t)return 'no-btn';t.click();return 'clicked';})()" % needle)
    return eval_js(js)

def body():
    return eval_js("document.body.innerText") or ""

# ۰) وضعیت فعلی: خانه پس از ورود
print("۰) home after login")
time.sleep(2)
shot("10-home-after-owner-login")
b = body()
print("  snippet:", b[:160].replace("\n", " | "))

# ۱) حضور کاشی‌ها در متن صفحه (اسکرول کامل)
print("۱) tile presence on home")
for key, names in {
    "فایل‌یاب": ["فایل یاب", "فایل‌یاب"],
    "تطبیق-هوشمند": ["تطبیق هوشمند"],
    "یادگیری": ["یادگیری"],
    "شاخص-بازار": ["شاخص بازار"],
    "پوشش-داده": ["پوشش داده"],
    "مغز": ["مغز"],
}.items():
    print(f"  {key}: {'FOUND' if any(n in b for n in names) else 'NOT-FOUND'}")

# ۲) کلیک روی کاشی تطبیق هوشمند (M5)
print("۲) M5 smart-matching")
r = click_text("تطبیق هوشمند")
print("  click:", r)
time.sleep(9)
shot("11-m5-smart-matching")
print("  m5:", body()[:180].replace("\n", " | "))

# ۳) بازگشت → یادگیری (M6)
print("۳) M6 learning-tier")
back = eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('بازگشت'));if(b){b.click();return 'back'};return 'no-back'})()")
print("  back:", back)
time.sleep(5)
r = click_text("یادگیری")
print("  click:", r)
time.sleep(9)
shot("12-m6-learning-tier")
print("  m6:", body()[:180].replace("\n", " | "))

# ۴) بازگشت → فایل‌یاب (کاشی روزمره اصلی)
print("۴) file-finder tile")
back = eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('بازگشت'));if(b){b.click();return 'back'};return 'no-back'})()")
time.sleep(5)
r = click_text("فایل یاب")
print("  click:", r)
time.sleep(9)
shot("13-file-finder")
print("  ff:", body()[:160].replace("\n", " | "))

# ۵) مهر فوتر/نسخه
print("۵) version stamp in UI")
foot = eval_js("""(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/BUILD|نسخه|def2f98|[0-9a-f]{7}-2026/.test(e.textContent||''));return el?('stamp:['+(el.textContent||'').trim().slice(0,80)+']'):'no-stamp-el';})()""")
print("  ", foot)
shot("14-footer-stamp")

print("DONE")
