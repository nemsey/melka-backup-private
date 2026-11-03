#!/usr/bin/env python3
"""PN-015 · مرحلهٔ ۷ (پایان) — ورود مدیر + داشبورد + مهر نسخه زنده"""
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

code = os.environ.get("MASTER_ACCESS_CODE", "80211186")

# ۱) پنل مدیر: پر کردن «کد مدیر (۸ رقم)» + دکمهٔ ورود
r = ev(f"""(()=>{{
  const inp=document.getElementById('masterCode')||[...document.querySelectorAll('input')].find(i=>(i.name||'').includes('master')||i.placeholder);
  if(!inp) return 'no-input';
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(inp,'{code}');
  inp.dispatchEvent(new Event('input',{{bubbles:true}}));
  return 'ok';
}})()""")
print("۱) input:", r)
time.sleep(1)
r2 = ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>((x.textContent||'').replace(/\\u200c/g,'')).includes('ورود')&&x.closest('form,div'));if(!b)return 'no-btn';b.click();return 'ok';})()")
print("۲) submit:", r2)
time.sleep(10)

b = ev("document.body.innerText") or ""
print("۳) snippet:", b[:220].replace("\n", " | "))
shot("05-preview-home-owner")

# ۴) مهر نسخه (VersionBadge → متن دکمه/بج شامل buildId)
time.sleep(2)
stamp = ev("(()=>{const t=document.body.innerText||'';const m=t.match(/[0-9a-f]{7}-\\d{8}-\\d{4}/g);return m?m.join(','):'none';})()")
print("۴) مهر نسخه در متن صفحه:", stamp)
ab_js = ev("document.querySelector('[data-testid=version-badge], footer')?.click() || 'skip'")
ev("window.scrollTo(0, document.body.scrollHeight)")
time.sleep(2)
shot("06-preview-footer")
stamp2 = ev("(()=>{const b=[...document.querySelectorAll('button,span,div')].map(e=>e.textContent||'').join(' ');const m=b.match(/[0-9a-f]{7}-\\d{8}-\\d{4}/g);return m?m[m.length-1]:'none';})()")
print("۵) مهر نهایی:", stamp2)
