#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — پروب قطعی تجزیهٔ زمان ورود→داشبورد (پس از باز شدن پنجرهٔ نرخ)
import json, time, subprocess, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
code = subprocess.run(["bash","-c","grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        device_scale_factor=2, service_workers="block")
    page = ctx.new_page()
    page.add_init_script("""
      window.__marks = {};
      const of = window.fetch;
      window.fetch = async (...a) => {
        const u = String(a[0]);
        if (u.includes('master-login')) { window.__marks['login-post-sent'] = performance.now(); }
        const r = await of(...a);
        if (u.includes('master-login')) { window.__marks['login-post-done'] = performance.now(); }
        return r;
      };
    """)
    t0 = time.time()
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(2000)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    t_submit_wall = time.time()
    page.click("button[type=submit]", timeout=8000)
    try:
        page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print(json.dumps({"error":"no-dashboard","marks":page.evaluate("()=>window.__marks"),
                          "body":page.evaluate("()=>document.body.innerText.slice(0,200)")}, ensure_ascii=False))
        browser.close(); sys.exit(2)
    t_dash_wall = time.time()
    marks = page.evaluate("()=>window.__marks")
    # زمان دقیق ظاهر شدن نخستین عنصر «آگهی ملکا» (DomContentLoaded-محور از رکوردها)
    first_paint = page.evaluate("""() => {
      const el = [...document.querySelectorAll('*')].find(e => e.children.length===0 && /آگهی ملکا/.test(e.textContent||''));
      // PerformanceObserver برای LCP این صفحه را هم می‌خوانیم
      return { found: !!el, tag: el ? el.tagName : null };
    }""")
    resources = page.evaluate("""() => {
      const r = performance.getEntriesByType('resource').filter(x => x.name.endsWith('.js'));
      return r.slice().sort((a,b)=>b.duration-a.duration).slice(0,5).map(x => ({
        f: x.name.split('/').pop(), dur: Math.round(x.duration),
        start: Math.round(x.startTime), end: Math.round(x.responseEnd), kb: Math.round((x.encodedBodySize||0)/1024) }));
    }""")
    print(json.dumps({
      "submit_to_dashboard_wall_ms": round((t_dash_wall - t_submit_wall)*1000),
      "marks": {k: round(v) for k,v in marks.items()},
      "dashboard_el": first_paint,
      "slowest_js": resources
    }, ensure_ascii=False, indent=1))
    browser.close()
