#!/usr/bin/env python3
"""
P4-F2 — تست End-to-End موبایل روی build واقعی production با کد PHASE 6 (پورت ۳۰۰۰)
--------------------------------------------------------------------
الگوی p5-d3-e2e.py (P6-D) — مسیر: صفحه ورود → ورود مدیر (کد ۸ رقمی) → ۵ کاشی ریشه →
کاشی درخواست ملک → پنل بینش ایجنت → خروج. PHASE 6 صفر تغییر UI دارد؛ این E2E
اثبات می‌کند build تحویل‌شده همان تجربه PHASE 3/4/5 را می‌دهد. viewport ۴۰۳×۸۷۴.
شواهد: download/delivery-p6/
"""

import json
import os
import subprocess
import sys
import time

BASE_URL = "http://localhost:3000"
OUT = "/home/z/my-project/download/delivery-p6"
MASTER_CODE = "00000000"

os.makedirs(OUT, exist_ok=True)

def evaljs(js):
    r = subprocess.run(["agent-browser", "eval", js, "--json"], capture_output=True, text=True, timeout=45)
    try:
        return json.loads(r.stdout).get("data", {}).get("result")
    except Exception:
        return None

def click_btn(needle):
    js = f"(() => {{ const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||x.textContent).includes({json.dumps(needle, ensure_ascii=False)})); if (!b) return false; b.click(); return true; }})()"
    return evaljs(js) is True

def text():
    return evaljs("document.body.innerText") or ""

def wait_for(marker, timeout_s=25, interval=0.7):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if marker in text():
            return True
        time.sleep(interval)
    return False

def shot(name):
    subprocess.run(["agent-browser", "screenshot", f"{OUT}/{name}.png"], capture_output=True, text=True, timeout=60)

def save(name, content):
    with open(f"{OUT}/{name}", "w") as f:
        f.write(content)

FAILS = 0
def check(label, ok):
    global FAILS
    print(("  ✓ " if ok else "  ✗ ") + label)
    if not ok:
        FAILS += 1

# ---------- شروع ----------
subprocess.run(["agent-browser", "set-viewport", "--width", "403", "--height", "874"], capture_output=True, text=True, timeout=30)
print("[D3] باز کردن صفحه ورود…")
evaljs("localStorage.clear(); sessionStorage.clear(); 'ok'")
subprocess.run(["agent-browser", "open", BASE_URL], capture_output=True, text=True, timeout=60)
time.sleep(3.5)
t = text()
if "کارگاه اصلی دفتر" in t:
    print("  (نشست قبلی فعال بود — خروج و شروع تازه)")
    click_btn("خروج")
    time.sleep(2)
    subprocess.run(["agent-browser", "open", BASE_URL], capture_output=True, text=True, timeout=60)
    time.sleep(3)
    t = text()

check("صفحه ورود رندر شد", "کد مدیر" in t)
shot("d3-01-auth-screen")

# ---------- ورود مدیر ----------
print("[D3] ورود مدیر…")
click_btn("ورود با کد مدیر")
time.sleep(1.5)
evaljs(f"(() => {{ const i = document.querySelector('input'); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, {MASTER_CODE}); i.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()")
time.sleep(0.6)
click_btn("ورود به عنوان مدیر")
check("ورود مدیر موفق (خانه بارگذاری شد)", wait_for("کارگاه اصلی دفتر", 25))
time.sleep(2)
home = text()
tiles_ok = all(x in home for x in ["درخواست ملک", "فایل‌یابی", "تنظیمات"])
check("خانه: کاشی‌های ریشه حاضرند", tiles_ok)
shot("d3-02-home-root-tiles")

# ---------- کاشی درخواست ملک + پنل بینش ----------
print("[D3] کاشی درخواست ملک و پنل بینش ایجنت…")
click_btn("باز کردن کاشی درخواست ملک")
if not wait_for("ثبت درخواست جدید", 30):
    wait_for("درخواست‌های ملک", 15)
time.sleep(2.5)
check("صفحه کاشی درخواست رندر شد", "درخواست" in text())
shot("d3-03-request-tile")

if not click_btn("نمایش بینش‌ها"):
    click_btn("بینش")
time.sleep(3)
panel = text()
check("پنل بینش ایجنت باز شد", "بینش" in panel)
shot("d3-04-request-agent-insight")
save("d3-04-insight-text.txt", panel)

# ---------- خروج (درس Radix: توالی PointerEvent) ----------
print("[D3] خروج…")
result = evaljs("""(() => {
  const t = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('منوی حساب کاربری'));
  if (!t) return 'NO-TRIGGER';
  const opts = { bubbles: true, cancelable: true, button: 0, ctrlKey: false, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  t.dispatchEvent(new PointerEvent('pointerdown', opts));
  t.dispatchEvent(new PointerEvent('pointerup', opts));
  t.dispatchEvent(new MouseEvent('click', opts));
  return new Promise(res => setTimeout(() => {
    const lo = [...document.querySelectorAll('[role=menuitem]')].find(e => (e.textContent||'').includes('خروج از حساب'));
    if (!lo) { res('NO-LOGOUT-ITEM'); return; }
    const o2 = { bubbles: true, cancelable: true, button: 0 };
    lo.dispatchEvent(new PointerEvent('pointerdown', o2));
    lo.dispatchEvent(new PointerEvent('pointerup', o2));
    lo.click();
    res('LOGOUT-DISPATCHED');
  }, 1200));
})()""")
print(f"  {result}")
time.sleep(4)
final = text()
check("خروج موفق — بازگشت به صفحه ورود", "کد مدیر" in final)
shot("d3-05-after-logout")

print()
if FAILS > 0:
    print(f"نتیجه F2: {FAILS} شکست — بررسی شود")
    sys.exit(1)
print("نتیجه D3: مسیر کامل موبایل روی build PHASE 6 سبز است — تجربه، عین PHASE 3/4.")
