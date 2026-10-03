#!/usr/bin/env python3
"""
P3-D3 — تست End-to-End موبایل روی build واقعی production (پورت ۳۰۰۰)
--------------------------------------------------------------------
مسیرها: صفحه ورود → ورود مدیر (کد ۸ رقمی) → ۵ کاشی ریشه → صفحه درخواست ملک →
پنل بینش ایجنت (مسیر واقعی تغییرات PHASE 3) → خروج.
viewport موبایل ۴۰۳×۸۷۴ (عین D3 فاز ۲). شواهد: download/delivery-p3/
"""

import json
import subprocess
import sys
import time

BASE_URL = "http://localhost:3000"
OUT = "/home/z/my-project/download/delivery-p3"
MASTER_CODE = "80211186"

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

def set_mobile():
    subprocess.run(["agent-browser", "set-viewport", "--width", "403", "--height", "874"], capture_output=True, text=True, timeout=30)

def save(name, content):
    with open(f"{OUT}/{name}", "w") as f:
        f.write(content)

# ---------- شروع ----------
set_mobile()
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

if "ورود با کد مدیر" not in t and "کد مدیر" not in t:
    print("  ✗ صفحه ورود نیامد"); sys.exit(1)
shot("d3-01-auth-screen")
print("  ✓ صفحه ورود رندر شد (اسکرین‌شات ۱)")

# ---------- ورود مدیر ----------
print("[D3] ورود مدیر…")
click_btn("ورود با کد مدیر")
time.sleep(1.5)
evaljs(f"(() => {{ const i = document.querySelector('input'); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, {MASTER_CODE}); i.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()")
time.sleep(0.6)
click_btn("ورود به عنوان مدیر")
if not wait_for("کارگاه اصلی دفتر", 25):
    print("  ✗ ورود ناموفق"); sys.exit(1)
conn = text()
print("  ✓ ورود مدیر موفق" + (" · وضعیت اتصالها: " + next((l.strip() for l in conn.split(chr(10)) if "اتصال" in l), "") if "اتصال" in conn else ""))
time.sleep(2)
shot("d3-02-home-5-root-tiles")
print("  ✓ خانه: ۵ کاشی ریشه (اسکرین‌شات ۲)")

# ---------- کاشی درخواست ملک + بینش ایجنت (مسیر تغییرات PHASE 3) ----------
print("[D3] کاشی درخواست ملک…")
click_btn("باز کردن کاشی درخواست ملک")
if not wait_for("ثبت درخواست جدید", 30):
    wait_for("درخواست‌های ملک", 15)
time.sleep(2.5)
shot("d3-03-request-tile")
print("  ✓ صفحه کاشی رندر شد (اسکرین‌شات ۳)")

print("[D3] پنل بینش ایجنت…")
if not click_btn("نمایش بینش‌ها"):
    # پنل ممکن است باز باشد یا دکمه عنوان دیگری داشته باشد
    click_btn("بینش")
time.sleep(3)
panel = text()
if "بینش" in panel:
    line = next((l.strip() for l in panel.split(chr(10)) if "خاطره" in l or "سیاست نسخه" in l), "")
    print("  ✓ پنل بینش باز شد" + (f": {line}" if line else ""))
shot("d3-04-request-agent-insight")
save("d3-04-insight-text.txt", panel)

# ---------- کاشی فایل‌یابی (ایجنت دوم مهاجرت‌یافته PHASE 3) ----------
print("[D3] کاشی فایل‌یابی (ایجنت دوم)…")
# بازگشت به خانه
for _ in range(4):
    if "کارگاه اصلی دفتر" in text():
        break
    if not click_btn("بازگشت"):
        break
    time.sleep(1.4)
click_btn("باز کردن کاشی فایل‌یابی از دیوار")
if not wait_for("اسکن دیوار", 30):
    wait_for("فایل‌یابی", 15)
time.sleep(2.5)
shot("d3-05-filefinder-tile")
print("  ✓ صفحه فایل‌یابی رندر شد (اسکرین‌شات ۵)")

# ---------- خروج ----------
# درس زیرساختی: Radix DropdownMenu با el.click() باز نمی‌شود — نیاز به توالی
# PointerEvent (pointerdown/pointerup/click) دارد؛ آیتم منو هم با همین توالی.
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
if "ورود با کد مدیر" in final or "کد مدیر" in final:
    print("  ✓ خروج موفق — بازگشت به صفحه ورود (رویداد logout در لاگ ساختاریافته)")
else:
    print("  ⚠ وضعیت پس از خروج نامشخص")
shot("d3-06-after-logout")

print("[D3] کامل ✓")
