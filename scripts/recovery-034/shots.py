#!/usr/bin/env python3
"""shots.py v2 — شواهد بصری بازیابی ۰۳۴ (BLOCK 3/5 · بند د قانون ۰۳۱)
اصلاح v2: صفحهٔ ورود = کد پرسنلی + دکمهٔ «ورود با کد مدیر» → بعد #masterCode ظاهر می‌شود"""
import subprocess, time, os

BASE = "http://localhost:81"
SHOT = "/home/z/my-project/download/p6548-recovery"
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

def click_btn(needles, timeout=90):
    if isinstance(needles, str):
        needles = [needles]
    for text in needles:
        needle = text.replace("\u200c", "")
        js = ("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('%s'));"
              "if(!b)return 'no-btn';b.click();return 'clicked';})()" % needle)
        r = eval_js(js, timeout=timeout)
        if r == "clicked":
            return f"clicked via «{text}»"
    return "no-btn (all needles)"

def buttons():
    return eval_js("[...document.querySelectorAll('button')].map(b=>((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,14).join(' || ')")

print("۱) صفحهٔ ورود (شاهد نام تازهٔ اپ)")
print("  title:", ab("get", "title"))
shot("00-auth-stamp")

print("۲) ورود با کد مدیر 00000000")
print(" ", click_btn("ورود با کد مدیر"))
time.sleep(2)
has_master = eval_js("document.querySelector('#masterCode') ? 'yes' : ('ids:' + [...document.querySelectorAll('input')].map(i=>i.id||i.name||i.type).join(','))")
print("  masterCode field:", has_master)
if has_master == "yes":
    print(" ", ab("fill", "#masterCode", "00000000"))
    print(" ", ab("click", 'button[type="submit"]'))
    time.sleep(8)

print("۳) هوم — ۵ کاشی + مهر فوتر")
print("  دکمه‌ها:", (buttons() or "")[:360])
shot("01-home-5tiles")
footer = eval_js("(()=>{const f=[...document.querySelectorAll('footer,div,span,p')].map(e=>e.textContent||'').find(t=>t.includes('نسخهٔ زنده'));return f?f.replace(/\\s+/g,' ').trim().slice(0,140):'no-footer';})()")
print("  مهر فوتر:", footer)

print("۴) داشبورد مدیریتی M1-M4")
print(" ", click_btn(["رفتن به داشبورد مدیریتی", "داشبورد مدیریتی"]))
time.sleep(6)
print("  دکمه‌ها:", (buttons() or "")[:420])
shot("02-mgmt-m1m4")

print("۵) کاشی M1 — آگهی ملک تبریز")
print(" ", click_btn(["باز کردن کاشی آگهیهای ملک تبریز", "باز کردن کاشی آگهی ملک تبریز", "کاشی آگهی"], timeout=120))
time.sleep(10)
shot("03-m1-list")
print("  هدر جدول:", (eval_js("Array.from(document.querySelectorAll('table thead th')).map(th=>th.textContent.trim()).join(' | ')") or "")[:420])
print("  ردیف اول:", (eval_js("(document.querySelector('table tbody tr')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,180)") or ""))
print("  شمار ردیف DOM:", eval_js("document.querySelectorAll('table tbody tr').length"))

print("۶) تنظیمات عمومی — کارت مغز")
print(" ", ab("open", BASE, timeout=90)[:60])
time.sleep(7)
print(" ", click_btn(["تنظیمات عمومی", "باز کردن کاشی تنظیمات"], timeout=120))
time.sleep(8)
ab("eval", "window.scrollTo(0, document.body.scrollHeight*0.35)")
time.sleep(1)
shot("04-brain-card")
brain = eval_js("(()=>{const c=[...document.querySelectorAll('div,section,article')].find(e=>(e.textContent||'').includes('مغز هوشمند'));return c?c.textContent.replace(/\\s+/g,' ').trim().slice(0,260):'no-card';})()")
print("  کارت مغز:", brain)

print("۷) پاکسازی")
ab("close")
print("DONE")
