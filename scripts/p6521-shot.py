#!/usr/bin/env python3
"""p6521-shot.py v3 — شاهدهای بصری P6521 (M1 + M2)

رفع v3: دکمه‌های ناوبری aria-label دارند (نه textContent) — helper هر دو را می‌بیند.
ترفند سبک‌سازی (افشاشده): تنها درخواست اولیهٔ بدون‌فیلتر با بدنهٔ واقعی سبکشده
(۶۰ ردیف واقعی + شمارش‌های واقعی) مسیریابی می‌شود؛ بلافاصله unroute تا کلیک‌ها
و فیلترها عین API واقعی اجرا شوند.
"""
import subprocess, time, os

BASE = "http://localhost:81"
SHOT = "/home/z/my-project/download/p6521-m1m2"
os.makedirs(SHOT, exist_ok=True)

LISTINGS_BODY = open("/tmp/p6521-listings-init.json").read()
REQUESTS_BODY = open("/tmp/p6521-requests-init.json").read()

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

def click_button_containing(text, scope_id=None, timeout=90):
    """کلیک سبک — aria-label یا textContent، مقاوم به نیم‌فاصله."""
    needle = text.replace("\u200c", "")
    if scope_id:
        js = (
            "(()=>{const c=document.getElementById('%s');if(!c)return 'no-scope';"
            "const b=[...c.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('%s'));"
            "if(!b)return 'no-btn';b.click();return 'clicked';})()" % (scope_id, needle)
        )
    else:
        js = (
            "(()=>{const b=[...document.querySelectorAll('button')].find(b=>(((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\u200c/g,'')).includes('%s'));"
            "if(!b)return 'no-btn';b.click();return 'clicked';})()" % needle
        )
    return eval_js(js, timeout=timeout)

# ---- ۰) مسیریابی سبک اولیه (هر دو الگو تازه ثبت می‌شوند) ----
print("۰) مسیریابی سبک اولیه")
print(" ", ab("network", "route", "**/arm-catalog/listings*", "--body", LISTINGS_BODY, timeout=60)[:50])
print(" ", ab("network", "route", "**/arm-catalog/requests*", "--body", REQUESTS_BODY, timeout=60)[:50])

# ---- ۱) اطمینان از ورود (اگر لاگین هستیم، صفحهٔ خانه است) ----
state = eval_js("document.querySelector('#masterCode') ? 'auth' : (document.querySelector('button[aria-label*=\\'داشبورد\\']') ? 'home' : 'other')")
print("۱) وضعیت:", state)
if "auth" in (state or ""):
    print(" ", click_button_containing("ورود با کد مدیر"))
    time.sleep(1)
    print(" ", ab("fill", "#masterCode", "41372895"))
    print(" ", ab("click", 'button[type="submit"]'))
    time.sleep(6)

# ---- ۲) داشبورد مدیریتی ----
print("۲) داشبورد مدیریتی")
print(" ", click_button_containing("رفتن به داشبورد مدیریتی"))
time.sleep(4)

# ---- ۳) کاشی آگهی‌ها (M1) ----
print("۳) کاشی آگهی‌های ملک تبریز (M1)")
print(" ", click_button_containing("باز کردن کاشی آگهیهای ملک تبریز", timeout=120))
time.sleep(8)
print(" ", "unroute:", ab("network", "unroute", "**/arm-catalog/listings*", timeout=60))

# ۳-الف) چیپ «نمایش خصوصی» → ۶۹ ردیف واقعی
print(" ", "chip نمایش خصوصی:", click_button_containing("نمایش خصوصی", scope_id="arm-listing-states-filter"))
time.sleep(6)
print("  ردیف‌های DOM (انتظار ۶۹):", eval_js("document.querySelectorAll('table tbody tr').length"))

# شاهد ۱: کارت بینش توزیع شش‌حالته
print(" ", eval_js("window.scrollTo(0,0)"))
time.sleep(1)
shot("01-listings-insight-distribution")
counts_txt = eval_js(
    "(()=>{const g=document.getElementById('arm-listing-states-insight');"
    "return g?[...g.querySelectorAll('button')].map(b=>b.textContent.replace(/\\s+/g,' ').trim()).join(' || '):'no-card';})()"
)
print("  بینش توزیع:", (counts_txt or "")[:420])

# شاهد ۲: چیپ‌های فیلتر چندانتخابی
print(" ", eval_js("document.getElementById('arm-listing-states-filter')?.scrollIntoView({block:'center'})"))
time.sleep(1)
shot("02-listings-multiselect-filter-active")
pressed_txt = eval_js(
    "(()=>{const g=document.getElementById('arm-listing-states-filter');"
    "return g?[...g.querySelectorAll('button')].map(b=>b.getAttribute('aria-pressed')+'='+b.textContent.replace(/\\s+/g,' ').trim()).join(' | '):'no';})()"
)
print("  چیپ‌ها (aria-pressed):", (pressed_txt or "")[:340])

# شاهد ۳: جدول — ستون مالک + Badge رنگی + آدرس
print(" ", eval_js("document.querySelector('table')?.scrollIntoView({block:'start'})"))
time.sleep(2)
shot("03-listings-table-badges-malik")
print("  هدر جدول آگهی‌ها:", eval_js("Array.from(document.querySelectorAll('table thead th')).map(th=>th.textContent.trim()).join(' | ')"))
print("  Badge ردیف اول:", eval_js("document.querySelector('table tbody tr td:nth-child(7) badge, table tbody tr td:nth-child(7) [data-slot=badge], table tbody tr td:nth-child(7) span')?.textContent?.trim()"))

# ۳-ب) + «منتشر شده» → ۸۵۱ ردیف واقعی
print("  chip منتشر شده:", click_button_containing("منتشر شده", scope_id="arm-listing-states-filter"))
time.sleep(7)
print("  ردیف‌های DOM با منتشر+خصوصی (انتظار ۸۵۱):", eval_js("document.querySelectorAll('table tbody tr').length"))
print(" ", eval_js("document.getElementById('arm-listing-states-filter')?.scrollIntoView({block:'center'})"))
time.sleep(1)
shot("04-listings-multiselect-two-states")

# ---- ۴) کاشی درخواست‌ها (M2) ----
print("۴) کاشی درخواست‌های ملک تبریز (M2)")
print(" ", "back:", click_button_containing("بازگشت"))
time.sleep(3)
print(" ", "open:", click_button_containing("باز کردن کاشی درخواستهای ملک تبریز", timeout=120))
time.sleep(8)
print(" ", "unroute:", ab("network", "unroute", "**/arm-catalog/requests*", timeout=60))

print(" ", ab("fill", "#arm-request-realtor", "مجتبی موذنی"))
print(" ", "submit:", click_button_containing("اعمال فیلتر"))
time.sleep(6)
print("  ردیف‌های DOM با فیلتر موذنی (انتظار ۲۵۹):", eval_js("document.querySelectorAll('table tbody tr').length"))

print(" ", eval_js("document.querySelector('table')?.scrollIntoView({block:'start'})"))
time.sleep(2)
shot("05-requests-table-area-motaghabi")
print("  هدر جدول درخواست‌ها:", eval_js("Array.from(document.querySelectorAll('table thead th')).map(th=>th.textContent.trim()).join(' | ')"))
print("  سلول منطقهٔ ردیف اول:", eval_js("document.getElementById('arm-request-area-cell')?.textContent?.trim()"))

print("DONE")
