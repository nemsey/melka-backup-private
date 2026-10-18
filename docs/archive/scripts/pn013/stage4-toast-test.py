#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — آزمون ۴: توست (خارج جزیره) vs متن داشبورد (داخل جزیره) vs رفتن اسپلش
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
      window.__m = {};
      const of = window.fetch;
      window.fetch = async (...a) => {
        const r = await of(...a);
        if (String(a[0]).includes('master-login')) window.__m['api-done'] = performance.now();
        return r;
      };
      const mo = new MutationObserver(muts => {
        for (const mu of muts) for (const n of mu.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const t = (n.textContent || '').trim();
          if (!window.__m['toast'] && n.closest('[data-sonner-toast], [role="status"]')) window.__m['toast'] = performance.now();
          if (!window.__m['nav'] && (t === 'آگهی ملکا' || (n.querySelector && [...(n.querySelectorAll('button, p') ?? [])].some(e => (e.textContent||'').trim() === 'آگهی ملکا')))) window.__m['nav'] = performance.now();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
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
        print("429"); browser.close(); sys.exit(2)
    t_vis = time.time()
    time.sleep(2)  # اسپلش و توست هر دو رخ داده‌اند
    m = page.evaluate("()=>window.__m")
    api = m.get('api-done')
    out = {"submit_to_visible_ms": round((t_vis - t_submit)*1000)}
    for k, v in m.items():
        out[k + "_after_api_ms"] = round(v - api) if api else None
    print(json.dumps(out, ensure_ascii=False, indent=1))
    browser.close()
