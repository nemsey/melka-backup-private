#!/usr/bin/env python3
"""بازگرفتن اسکرین‌شات پنل بینش — انتظار طولانی‌تر پس از باز شدن Sheet"""
import json, subprocess, time

OUT = "/home/z/my-project/download/delivery-p4"
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

def shot(name):
    subprocess.run(["agent-browser", "screenshot", f"{OUT}/{name}.png"], capture_output=True, text=True, timeout=60)

subprocess.run(["agent-browser", "set-viewport", "--width", "403", "--height", "874"], capture_output=True, text=True, timeout=30)
evaljs("localStorage.clear(); sessionStorage.clear(); 'ok'")
subprocess.run(["agent-browser", "open", "http://localhost:3000"], capture_output=True, text=True, timeout=60)
time.sleep(4)
click_btn("ورود با کد مدیر")
time.sleep(1.5)
evaljs(f"(() => {{ const i = document.querySelector('input'); if (!i) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(i, {MASTER_CODE}); i.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()")
time.sleep(0.6)
click_btn("ورود به عنوان مدیر")
for _ in range(36):
    if "کارگاه اصلی دفتر" in text():
        break
    time.sleep(0.8)
time.sleep(2)
click_btn("باز کردن کاشی درخواست ملک")
for _ in range(36):
    if "ثبت درخواست جدید" in text() or "دفتر درخواست‌های ملک" in text():
        break
    time.sleep(0.8)
time.sleep(3)
if not click_btn("نمایش بینش‌ها"):
    click_btn("بینش")
time.sleep(6)  # انتظار طولانی برای انیمیشن Sheet + رندر کامل
open_state = "بینش‌های ایجنت هوشمند" in text()
print("panel open:", open_state)
shot("f2-04-request-agent-insight")
# اسکرول به پایین پنل برای اطمینان از محتوای قابل‌مشاهده
evaljs("(() => { const sc = document.querySelector('[data-slot=sheet-content]') || document.querySelector('[role=dialog]'); if (sc) sc.scrollTop = 300; return 'scrolled'; })()")
time.sleep(1.5)
shot("f2-04b-insight-scrolled")
print("done")
