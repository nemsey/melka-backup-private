#!/usr/bin/env python3
"""shots-v3.py — شواهد بصری بازیابی ۰۳۴ (BLOCK 3/5 · بند د) — نسخهٔ نهایی با جریان ورود درست"""
import subprocess, time, os

BASE = "http://localhost:81"
SHOT = "/home/z/my-project/download/p6548-recovery"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=120):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(name, timeout=120):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=timeout)
    print(f"  shot {name}: {'OK' if '✓' in out else out[:70]}")

def eval_js(js, timeout=90):
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
            return f"clicked via «{text}»"
    return "no-btn"

def buttons():
    return eval_js("[...document.querySelectorAll('button')].map(b=>((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,14).join(' || ')")

print("۱) صفحهٔ ورود")
ab("open", BASE)
time.sleep(4)
ab("set", "viewport", "412", "915")
time.sleep(2)
print("  title:", ab("get", "title"))
shot("00-auth-stamp")

print("۲) ورود با کد مدیر 80211186 (یک تلاش تمیز)")
print(" ", click_btn("ورود با کد مدیر"))
time.sleep(2)
print(" ", ab("fill", "#masterCode", "80211186"))
time.sleep(1)
print(" ", click_btn("ورود به عنوان مدیر"))
time.sleep(9)
state = eval_js("document.body.textContent.includes('داشبورد مدیریتی') ? 'HOME-OK' : 'STILL-AUTH'")
print("  وضعیت:", state)
shot("01-home-5tiles")
print("  دکمه‌ها:", (buttons() or "")[:340])
footer = eval_js("(()=>{const f=[...document.querySelectorAll('footer,div,span,p')].map(e=>e.textContent||'').find(t=>t.includes('نسخهٔ زنده'));return f?f.replace(/\\s+/g,' ').trim().slice(0,140):'no-footer';})()")
print("  مهر فوتر:", footer)

print("۳) داشبورد مدیریتی M1-M4")
print(" ", click_btn(["رفتن به داشبورد مدیریتی", "داشبورد مدیریتی"]))
time.sleep(6)
print("  دکمه‌ها:", (buttons() or "")[:420])
shot("02-mgmt-m1m4")

print("۴) کاشی M1 — آگهی ملک تبریز (دادهٔ واقعی + شعبه)")
print(" ", click_btn(["باز کردن کاشی آگهیهای ملک تبریز", "باز کردن کاشی آگهی ملک تبریز"]))
time.sleep(12)
shot("03-m1-list")
print("  هدر جدول:", (eval_js("Array.from(document.querySelectorAll('table thead th')).map(th=>th.textContent.trim()).join(' | ')") or "")[:420])
print("  ردیف اول:", (eval_js("(document.querySelector('table tbody tr')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,190)") or ""))
print("  شمار ردیف DOM:", eval_js("document.querySelectorAll('table tbody tr').length"))

print("۵) تنظیمات عمومی — کارت مغز")
ab("open", BASE)
time.sleep(7)
print(" ", click_btn(["تنظیمات عمومی", "باز کردن کاشی تنظیمات"]))
time.sleep(9)
ab("eval", "window.scrollTo(0, document.body.scrollHeight*0.35)")
time.sleep(2)
shot("04-brain-card")
brain = eval_js("(()=>{const c=[...document.querySelectorAll('div,section,article')].find(e=>(e.textContent||'').includes('مغز هوشمند'));return c?c.textContent.replace(/\\s+/g,' ').trim().slice(0,280):'no-card';})()")
print("  کارت مغز:", brain)

print("۶) فوتر تنظیمات — مهر نسخه")
ab("eval", "window.scrollTo(0, document.body.scrollHeight)")
time.sleep(1)
shot("05-footer-stamp")
footer2 = eval_js("(()=>{const f=[...document.querySelectorAll('footer,div,span,p')].map(e=>e.textContent||'').find(t=>t.includes('نسخهٔ زنده'));return f?f.replace(/\\s+/g,' ').trim().slice(0,140):'no-footer';})()")
print("  مهر فوتر:", footer2)

ab("close")
print("DONE")
