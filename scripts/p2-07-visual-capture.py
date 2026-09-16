#!/usr/bin/env python3
"""
P2-07a — پروتکل چهارلایه رگرسیون بصری (baseline 3001 ↔ فعلی 3000)
لایه‌ها: (۱) امضای DOM (۲) متن کامل (۳) هندسه SVG (۴) اسکرین‌شات
صفحات کلیدی: معاملات / کارشناسان / درخواست ملک
ناوبری مبتنی بر «وضعیت فعلی» — از هر وضعیتی به هدف می‌رسد.
"""
import json
import subprocess
import sys
import time

PORT = sys.argv[1]
PREFIX = sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else "/home/z/my-project/download/phase2-visual"
BASE_URL = f"http://localhost:{PORT}"
MASTER_CODE = "20700000"

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

def go_home():
    """بازگشت به خانه با دکمه بازگشت (تا ۴ سطح)"""
    for _ in range(4):
        t = text()
        if "کارگاه اصلی دفتر" in t:
            return True
        if not click_btn("بازگشت"):
            break
        time.sleep(1.4)
    return "کارگاه اصلی دفتر" in text()

def save(name, content):
    with open(f"{OUT}/{name}", "w") as f:
        f.write(content)

def capture(page_name):
    time.sleep(1.5)  # تثبیت رندر + پایان انیمیشن‌ها
    dom = evaljs("(() => { const sig = (el, d) => { if (d > 18 || !el.tagName) return ''; const cls = el.getAttribute && el.getAttribute('class') ? '.' + el.getAttribute('class').split(' ').slice(0,12).join('.') : ''; const kids = [...el.children].map(c => sig(c, d+1)).join(''); return el.tagName.toLowerCase() + cls + (kids ? '|' + kids : ''); }; return sig(document.getElementById('root') ?? document.body, 0); })()")
    full_text = text()
    svg = evaljs("(() => [...document.querySelectorAll('svg')].map(s => { const r = s.getAttribute('viewBox') ?? ''; const cls = s.getAttribute('class') ?? ''; const paths = [...s.children].map(c => c.tagName + (c.getAttribute('d') ? ':' + c.getAttribute('d').slice(0,80) : '')).join(',').slice(0, 500); return r + '|' + cls + '|' + paths; }).join('\\n'))()")
    subprocess.run(["agent-browser", "screenshot", f"{OUT}/{PREFIX}-{page_name}.png"], capture_output=True, text=True, timeout=60)
    save(f"{PREFIX}-{page_name}.dom.txt", dom or "EMPTY")
    save(f"{PREFIX}-{page_name}.text.txt", full_text or "EMPTY")
    save(f"{PREFIX}-{page_name}.svg.txt", svg or "EMPTY")
    print(f"  {page_name}: dom={len(dom or '')} text={len(full_text or '')} svg={len(svg or '')}")

# ---------- ورود ----------
print(f"[{PREFIX}] ورود…")
evaljs("localStorage.clear(); sessionStorage.clear(); 'ok'")
subprocess.run(["agent-browser", "open", BASE_URL], capture_output=True, text=True, timeout=60)
time.sleep(3.5)
t = text()
if "کارگاه اصلی دفتر" not in t:
    if "ورود با کد مدیر" in t or True:
        click_btn("ورود با کد مدیر")
        time.sleep(1.5)
        evaljs(f"(() => {{ const i = document.querySelector('input'); if (!i) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, {MASTER_CODE}); i.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()")
        time.sleep(0.6)
        click_btn("ورود به عنوان مدیر")
    if not wait_for("کارگاه اصلی دفتر", 25):
        print("  ✗ ورود ناموفق"); sys.exit(1)
print("  ورود ✓")

# ---------- صفحه ۱: معاملات ----------
print(f"[{PREFIX}] معاملات…")
if not go_home():
    print("  ✗ خانه در دسترس نیست"); sys.exit(1)
click_btn("باز کردن کاشی داشبورد مدیریتی")
if not wait_for("مرکز فرمان تحلیل‌ها", 20):
    print("  ✗ داشبورد مدیریتی باز نشد"); sys.exit(1)
time.sleep(1)
click_btn("باز کردن کاشی معاملات")
if not wait_for("تعداد کل معاملات", 30):
    print("  ✗ صفحه معاملات بارگذاری نشد"); sys.exit(1)
time.sleep(2.5)  # جدول + نمودار
capture("transactions")

# ---------- صفحه ۲: کارشناسان ----------
print(f"[{PREFIX}] کارشناسان…")
go_home()
click_btn("باز کردن کاشی داشبورد مدیریتی")
wait_for("مرکز فرمان تحلیل‌ها", 20)
time.sleep(1)
click_btn("باز کردن کاشی کارشناسان")
if not wait_for("مشاوران", 30):
    print("  ⚠ نشانگر کارشناسان نیامد — ادامه"); time.sleep(5)
time.sleep(2.5)
capture("experts")

# ---------- صفحه ۳: درخواست ملک ----------
print(f"[{PREFIX}] درخواست ملک…")
go_home()
click_btn("باز کردن کاشی درخواست ملک")
if not wait_for("ثبت درخواست جدید", 30):
    # نشانگر جایگزین — عنوان کاشی درخواست
    if not wait_for("درخواست‌های ملک", 15):
        print("  ⚠ نشانگر درخواست نیامد — ادامه"); time.sleep(5)
time.sleep(2.5)
capture("requests")

print(f"[{PREFIX}] کامل ✓")
