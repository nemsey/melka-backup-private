#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — تجزیهٔ ۲: چه زمانی متن داشبورد در DOM ظاهر می‌شود نسبت به پاسخ API؟
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
      // ۱) زمان رفت‌وبرگشت API ورود
      const of = window.fetch;
      window.fetch = async (...a) => {
        const u = String(a[0]);
        if (u.includes('master-login')) window.__marks['post-sent'] = performance.now();
        const r = await of(...a);
        if (u.includes('master-login')) window.__marks['post-done'] = performance.now();
        return r;
      };
      // ۲) لحظهٔ ظاهر شدن متن داشبورد در DOM + برداشت پرچم اسپلش
      const mo = new MutationObserver(() => {
        if (window.__marks['dash-text']) return;
        const els = document.querySelectorAll('p, span, h1, h2, button');
        for (const e of els) {
          const t = (e.textContent || '').trim();
          if (t === 'آگهی ملکا' && e.children.length === 0) {
            window.__marks['dash-text'] = performance.now();
            mo.disconnect();
            return;
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    """)
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(2000)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    t_submit = time.time()
    page.click("button[type=submit]", timeout=8000)
    try: page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print(json.dumps({"error":"no-dashboard","marks":page.evaluate("()=>window.__marks")}, ensure_ascii=False)); browser.close(); sys.exit(2)
    t_dash = time.time()
    time.sleep(1.2)
    marks = page.evaluate("()=>window.__marks")
    derived = {}
    if 'post-done' in marks and 'dash-text' in marks:
        derived['api_to_dom_text_ms'] = round(marks['dash-text'] - marks['post-done'])
    if 'post-sent' in marks and 'post-done' in marks:
        derived['api_roundtrip_ms'] = round(marks['post-done'] - marks['post-sent'])
    print(json.dumps({
      "submit_to_visible_wall_ms": round((t_dash - t_submit)*1000),
      "marks_ms": {k: round(v) for k, v in marks.items()},
      "derived": derived
    }, ensure_ascii=False, indent=1))
    browser.close()
