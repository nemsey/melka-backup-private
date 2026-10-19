#!/usr/bin/env python3
"""PN-015 · مرحلهٔ ۷ (ادامه) — تکمیل ورود مالک + مهر نسخه"""
import subprocess, time, os

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

def body():
    return ev("document.body.innerText") or ""

# ورود مدیر سامانه: دکمهٔ تأیید (معمولاً «ورود» یا «تأیید» در همان پنل)
for label in ["ورود", "تأیید", "ادامه"]:
    r = ev(f"(()=>{{const b=[...document.querySelectorAll('button')].find(x=>((x.textContent||'').replace(/\\u200c/g,'')).includes('{label}'));if(!b)return 'no-btn';b.click();return 'ok';}})()")
    print(f"  دکمهٔ «{label}»:", r)
    if r == "ok":
        break

time.sleep(9)
b = body()
print("  snippet:", b[:200].replace("\n", " | "))
shot("05-preview-home-owner")

# اسکرول به پابرگ برای مهر نسخه
ev("window.scrollTo(0, document.body.scrollHeight)")
time.sleep(2)
shot("06-preview-footer")

# مهر نسخه از DOM (هر الگوی buildId)
stamp = ev("(()=>{const t=document.body.innerText;const m=t.match(/[0-9a-f]{7}-[0-9]{8}-[0-9]{4}/g)||[];return m.join(',');})()")
print("  مهرهای نسخه در متن:", stamp)
stamp2 = ev("(()=>{const el=document.querySelector('footer')||document.body;return (el.textContent||'').slice(-300);})()")
print("  انتهای پابرگ:", stamp2[-160:].replace("\n", " | "))
shot("07-preview-stamp-zoom")
