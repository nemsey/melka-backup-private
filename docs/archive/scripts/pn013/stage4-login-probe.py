#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — تشخیص زمانی: ورود → داشبورد (کجا وقت صرف می‌شود؟)
import json, time, sys
sys.path.insert(0, "/home/z/my-project/scripts/pn006")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
# کد مستر از env
import subprocess
code = subprocess.run(["bash","-c","grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        device_scale_factor=2, service_workers="block")
    page = ctx.new_page()
    events = []
    page.on("console", lambda m: events.append((time.time(), f"console:{m.text[:120]}")) if m.type in ("log","info") else None)
    page.on("response", lambda r: events.append((time.time(), f"resp:{r.status} {r.url.split('/')[-1][:40]}")) if "master-login" in r.url else None)
    page.add_init_script("""
      window.__t = { start: 0, marks: {} };
      const origFetch = window.fetch;
      window.fetch = async (...a) => { const r = await origFetch(...a); if (String(a[0]).includes('master-login')) window.__t.marks['login-api-done'] = performance.now(); return r; };
    """)
    t0 = time.time()
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    t_input = time.time()
    page.wait_for_timeout(2000)  # st — همان پنجرهٔ اسکریپت رسمی
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    print("code len:", len(code), "first:", code[:2])
    page.fill("#masterCode", code)
    t_submit = time.time()
    page.click("button[type=submit]", timeout=8000)
    try:
        page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print(json.dumps({"error": "dashboard not reached", "events": [(round((e[0]-t0)*1000), e[1]) for e in events][-12:], "body": page.evaluate("() => document.body.innerText.slice(0,300)")}, ensure_ascii=False))
        browser.close(); raise SystemExit(2)
    t_dash = time.time()
    marks = page.evaluate("() => window.__t.marks")
    page.wait_for_timeout(1500)
    extra = page.evaluate("""() => {
      const r = performance.getEntriesByType('resource').filter(x => x.name.endsWith('.js'));
      return { jsCount: r.length, totalKB: Math.round(r.reduce((a,x)=>a+(x.encodedBodySize||0),0)/1024),
               slowest: r.slice().sort((a,b)=>b.duration-a.duration).slice(0,4).map(x=>({name:x.name.split('/').pop(), dur:Math.round(x.duration), kb:Math.round((x.encodedBodySize||0)/1024)})) };
    }""")
    print(json.dumps({
      "toInput_ms": round((t_input-t0)*1000),
      "submitToDashboard_ms": round((t_dash-t_submit)*1000),
      "apiMark_ms": marks,
      "js": extra
    }, ensure_ascii=False, indent=1))
    browser.close()
