#!/usr/bin/env python3
"""shots-pn031d.py — شاهد بصری کارت «اپ اندروید ملکا» در تنظیمات عمومی (PN-031-D فاز ۳)"""
import subprocess, time, os, json

BASE = "http://localhost:81"
SHOT = "/home/z/my-project/download/pn031d/screens"
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

print("۱) ورود با کد مدیر")
ab("open", BASE, timeout=90)
time.sleep(6)
print(" ", click_btn("ورود با کد مدیر"))
time.sleep(2)
if eval_js("document.querySelector('#masterCode') ? 'yes' : 'no'") == "yes":
    ab("fill", "#masterCode", "00000000")
    ab("click", 'button[type="submit"]')
    time.sleep(9)
shot("01-home")

print("۲) تنظیمات عمومی")
print(" ", click_btn(["تنظیمات عمومی", "باز کردن کاشی تنظیمات"], timeout=120))
time.sleep(9)

print("۳) اسکرول به بخش رلهٔ موبایل + کارت APK")
eval_js("(()=>{const el=document.getElementById('settings-mobile-relay'); if(el){el.scrollIntoView({block:'start'});return 'scrolled';} return 'no-section';})()")
time.sleep(2)
shot("02-relay-apk-card")

card = eval_js("(()=>{const s=document.getElementById('settings-mobile-relay'); const t=s?(s.textContent||''):''; return JSON.stringify({hasCard:t.includes('اپ اندروید ملکا'), hasDownload:t.includes('دانلود اپ'), hasQrBtn:t.includes('QR دانلود'), hasTermux:t.includes('Termux'), hasTunnel:t.includes('تست تونل')});})()")
print("  کارت:", card)

# کلیک «QR دانلود» تا QR واقعی هم در شاهد باشد
print(" ", click_btn("QR دانلود"))
time.sleep(3)
shot("03-relay-apk-qr")

qr = eval_js("(()=>{const s=document.getElementById('settings-mobile-relay'); const svg=s?s.querySelector('svg'):null; return svg?'qr-svg-rendered':'no-qr';})()")
print("  QR:", qr)

print("۴) پاکسازی")
ab("close")

with open("/home/z/my-project/download/pn031d/ui-card.json", "w", encoding="utf-8") as f:
    json.dump({"ok": "hasCard:true" in (card or ""), "card": card, "qr": qr,
               "shots": ["screens/01-home.png", "screens/02-relay-apk-card.png", "screens/03-relay-apk-qr.png"]},
              f, ensure_ascii=False, indent=2)
print("DONE")
