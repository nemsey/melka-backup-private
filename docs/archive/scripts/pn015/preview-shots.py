#!/usr/bin/env python3
"""PN-015 · مرحلهٔ ۷ — راستی‌آزمایی بصری دامنهٔ preview (تازگی نسخه)
۱) صفحهٔ ورود از دامنهٔ preview (مسیر عمومی)
۲) ورود مالک (کد مستر) + داشبورد + مهر نسخه در پابرگ (7a54a98 = HEAD)
"""
import subprocess, time, os, sys

PREVIEW = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
SHOT = "/home/z/my-project/download/pn015/screens"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=90):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def shot(name, timeout=90):
    out = ab("screenshot", f"{SHOT}/{name}.png", timeout=timeout)
    print(f"  shot {name}: {'OK' if ('✓' in out or 'saved' in out.lower()) else out[:90]}")

def ev(js, timeout=60):
    return ab("eval", js, timeout=timeout)

print("۱) باز کردن دامنهٔ preview")
print(" ", ab("open", PREVIEW)[:100])
time.sleep(6)
shot("01-preview-login")

# متن صفحه باید صفحهٔ ورود باشد (نه خطا/صفحهٔ خالی)
body = ev("document.body.innerText") or ""
print("  snippet:", body[:140].replace("\n", " | "))
if "ورود" not in body and "کد" not in body:
    print("  ⚠ متن ورود یافت نشد — بررسی دستی لازم")

print("۲) ورود مالک (کد مستر)")
code = os.environ.get("MASTER_ACCESS_CODE", "80211186")
ev(f"(()=>{{const i=document.querySelector('input[type=password],input[inputmode=numeric],input');if(!i)return 'no-input';i.value='{code}';i.dispatchEvent(new Event('input',{{bubbles:true}}));return 'ok';}})()")
time.sleep(1)
r = ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('ورود'));if(!b)return 'no-btn';b.click();return 'ok';})()")
print("  submit:", r)
time.sleep(8)
shot("02-preview-after-login")

print("۳) داشبورد + مهر نسخه")
time.sleep(3)
body = ev("document.body.innerText") or ""
print("  snippet:", body[:160].replace("\n", " | "))
shot("03-preview-dashboard")

stamp = ev("(()=>{const el=[...document.querySelectorAll('footer *,[class*=version],[class*=Version]')].map(e=>e.textContent||'').join(' ');return (el.match(/[0-9a-f]{{7}}-[0-9]{{8}}-[0-9]{{4}}/)||[''])[0];})()")
print("  مهر نسخهٔ پابرگ:", stamp)
shot("04-preview-footer-stamp")
print("VERDICT:", "FRESH" if "7a54a98" in (stamp or "") else "NEED-CHECK")
