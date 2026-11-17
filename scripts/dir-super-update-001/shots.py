#!/usr/bin/env python3
"""dir-super-update-001/shots.py — شاهد بصری زندهٔ گام اول + گام دوم (مرورگر واقعی، نمای موبایل).
ورود مدیر → M1: بخش فوق پیشرفته (اولین بخش) + فیلتر چندمنطقه (انتخاب دو گزینه) →
M2: همین‌ها + M3/M4: بخش فوق پیشرفته. خروجی: download/dir-super-update-001/*.png
"""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/dir-super-update-001"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=150):
    try:
        r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
        return (r.stdout or r.stderr).strip()
    except subprocess.TimeoutExpired:
        return "TIMEOUT"

def eval_js(js, timeout=100):
    return ab("eval", js, timeout=timeout)

def page_text():
    return eval_js("document.body.innerText") or ""

def wait_marker(marker, timeout=45):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if marker in page_text(): return True
        time.sleep(2.5)
    return False


def open_tile(label, wait_marker_txt, timeout=70):
    """ناوبری مطمئن: هوم → کلیک دکمهٔ برچسب در نوار پایین/کاشی (پیوند عمیق ?tile= در بوت نادیده گرفته می‌شود)."""
    ab("open", BASE); time.sleep(5)
    ok = wait_marker("وضعیت اتصال", 40)
    if not ok:
        return False
    eval_js("(()=>{const b=[...document.querySelectorAll('button, a')].find(b=>(b.textContent||'').trim().includes('" + label + "'));if(b){b.click();return 'y'}return 'n'})()")
    return wait_marker(wait_marker_txt, timeout)

def shot(name):
    ab("screenshot", f"{SHOT}/{name}.png")
    size = os.path.isfile(f"{SHOT}/{name}.png") and os.path.getsize(f"{SHOT}/{name}.png") // 1024
    print(f"{name}: {size}KB", flush=True)

# ═══ ورود مدیر ═══
# کد مستر از .env.local خوانده می‌شود (هرگز در کد هاردکد نمی‌شود)
def master_code():
    for f in ("/home/z/my-project/.env.local", "/home/z/my-project/.env"):
        try:
            for line in open(f, encoding="utf-8"):
                if line.startswith("MASTER_ACCESS_CODE="):
                    v = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if v: return v
        except OSError:
            pass
    raise SystemExit("MASTER_ACCESS_CODE یافت نشد")

MC = master_code()
ab("set", "viewport", "412", "915")
# پاک‌سازی کامل محیط مرورگر: سرویس‌ورکر کهنهٔ بیلد قبلی (ChunkLoadError) + کش + localStorage
eval_js("localStorage.clear(); localStorage.setItem('theme','light'); 'ok'")
ab("open", BASE); time.sleep(4)
eval_js("(async()=>{const rs=await navigator.serviceWorker?.getRegistrations?.()||[];for(const r of rs)await r.unregister();const ks=await caches.keys();for(const k of ks)await caches.delete(k);return 'sw:'+rs.length})()")
time.sleep(2)
ab("open", BASE); time.sleep(6)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').replace(/\\u200c/g,'').includes('ورود با کد مدیر'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2.5)
eval_js(f"(()=>{{const i=document.querySelector('#masterCode');if(!i)return 'n';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'{MC}');i.dispatchEvent(new Event('input',{{bubbles:true}}));return 'y'}})()")
time.sleep(1.2)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('ورود به عنوان مدیر'));if(b){b.click();return 'y'}return 'n'})()")
print("نشست:", "ACTIVE" if wait_marker("خوش آمدید", 40) else "DEAD", flush=True)

# ═══ M1 — بخش فوق پیشرفته = اولین بخش کاشی ═══
print("M1 فوق‌پیشرفته:", "OK" if open_tile("آگهی", "بروزرسانی فهرست فوق پیشرفته") else "NO-MARKER", flush=True)
time.sleep(3)
eval_js("window.scrollTo(0,0)"); time.sleep(1.2)
shot("01-m1-super-update-first.png")
# سه مسیر اجرا برای مالک
t = page_text()
print("M1 سه‌مسیره:", all(m in t for m in ["بروزرسانی برشی همین فهرست", "چرخهٔ فوری همین فهرست", "هر چهار فهرست"]), flush=True)
print("M1 کارهای پس‌زمینه:", "کارهای پس‌زمینهٔ هماهنگ" in t, flush=True)

# ═══ M1 — فیلتر چندمنطقه/چندمحله (گام اول) ═══
# باز کردن آکاردئون فیلتر (در موبایل بسته است)
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('فیلتر فهرست آگهی'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2)
print("M1 گروه مناطق:", "OK" if wait_marker("چندانتخابی — عین رجیستری سامانه ملک تبریز", 30) else "NO-MARKER", flush=True)
# جست‌وجوی منطقه در ترکیب‌باکس و انتخاب دو گزینه
eval_js("(()=>{const i=document.querySelector('#arm-listing-area-line-search');if(i){i.value='خاوران';i.dispatchEvent(new Event('input',{bubbles:true}));return 'y'}return 'n'})()")
time.sleep(1.8)
# کلیک روی اولین گزینهٔ پیشنهاد (منطقهٔ «خاوران»)
eval_js("(()=>{const li=[...document.querySelectorAll('[id^=arm-listing-area-line-listbox] li[role=option] button')];if(li.length){li[0].click();return 'y:'+li.length}return 'n'})()")
time.sleep(2.2)
# جست‌وجوی گزینهٔ دوم
eval_js("(()=>{const i=document.querySelector('#arm-listing-area-line-search');if(i){i.value='ولیعصر';i.dispatchEvent(new Event('input',{bubbles:true}));return 'y'}return 'n'})()")
time.sleep(1.8)
eval_js("(()=>{const li=[...document.querySelectorAll('[id^=arm-listing-area-line-listbox] li[role=option] button')];if(li.length){li[0].click();return 'y:'+li.length}return 'n'})()")
time.sleep(3.5)
t = page_text()
sel = "منطقه و" in t and "محله انتخاب شده" in t
print("M1 انتخاب دوگانه (چیپ‌ها):", sel, flush=True)
shot("02-m1-mult-area-filter.png")

# ═══ M2 — همین شاهد‌ها ═══
print("M2 فوق‌پیشرفته:", "OK" if open_tile("درخواست", "بروزرسانی فهرست فوق پیشرفته — فهرست درخواست‌ها") else "NO-MARKER", flush=True)
time.sleep(3)
eval_js("window.scrollTo(0,0)"); time.sleep(1.2)
shot("03-m2-super-update-first.png")
eval_js("(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('فیلتر فهرست درخواست'));if(b){b.click();return 'y'}return 'n'})()")
time.sleep(2)
print("M2 گروه مناطق:", "OK" if wait_marker("چندانتخابی — عین رجیستری سامانه ملک تبریز", 30) else "NO-MARKER", flush=True)
eval_js("(()=>{const i=document.querySelector('#arm-request-area-line-search');if(i){i.value='باغچه';i.dispatchEvent(new Event('input',{bubbles:true}));return 'y'}return 'n'})()")
time.sleep(1.8)
eval_js("(()=>{const li=[...document.querySelectorAll('[id^=arm-request-area-line-listbox] li[role=option] button')];if(li.length){li[0].click();return 'y:'+li.length}return 'n'})()")
time.sleep(3.5)
t = page_text()
print("M2 انتخاب فعال:", "انتخاب شده — اعمال خودکار" in t, flush=True)
shot("04-m2-mult-area-filter.png")

# ═══ M3 و M4 — بخش فوق پیشرفته در هر چهار کاشی ═══
print("M3 فوق‌پیشرفته:", "OK" if open_tile("معاملات", "بروزرسانی فهرست فوق پیشرفته — فهرست معاملات") else "NO-MARKER", flush=True)
time.sleep(2.5)
eval_js("window.scrollTo(0,0)"); time.sleep(1.2)
shot("05-m3-super-update-first.png")

print("M4 فوق‌پیشرفته:", "OK" if open_tile("کارشناسان", "بروزرسانی فهرست فوق پیشرفته — فهرست مشاوران") else "NO-MARKER", flush=True)
time.sleep(2.5)
eval_js("window.scrollTo(0,0)"); time.sleep(1.2)
shot("06-m4-super-update-first.png")

print("END", flush=True)
