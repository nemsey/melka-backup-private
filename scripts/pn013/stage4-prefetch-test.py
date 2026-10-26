#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — آزمون ۳: زمان شروع دانلود چانک داشبورد (پیش‌واکشی کار می‌کند؟)
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
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(2000)  # پنجرهٔ بیکاری — پیش‌واکشی باید اینجا انجام شده باشد
    # پیش از submit: چه چانک‌هایی آمده‌اند؟
    pre = page.evaluate("""() => performance.getEntriesByType('resource')
        .filter(r => r.name.endsWith('.js'))
        .map(r => ({ f: r.name.split('/').pop(), start: Math.round(r.startTime), kb: Math.round((r.encodedBodySize||0)/1024) }))
        .sort((a,b) => a.start-b.start)""")
    print("چانک‌ها تا لحظهٔ submit:")
    for r in pre: print(f"  start={r['start']:>5}ms  {r['kb']:>4}KB  {r['f']}")
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    t_submit = time.time()
    page.click("button[type=submit]", timeout=8000)
    try: page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print("429 احتمالاً"); browser.close(); sys.exit(2)
    t_dash = time.time()
    time.sleep(1)
    post = page.evaluate("""() => performance.getEntriesByType('resource')
        .filter(r => r.name.endsWith('.js'))
        .map(r => ({ f: r.name.split('/').pop(), start: Math.round(r.startTime), kb: Math.round((r.encodedBodySize||0)/1024) }))
        .sort((a,b) => a.start-b.start)""")
    pre_set = {r['f'] for r in pre}
    fresh = [r for r in post if r['f'] not in pre_set]
    print("\nچانک‌های تازه پس از submit:")
    for r in fresh: print(f"  start={r['start']:>5}ms  {r['kb']:>4}KB  {r['f']}")
    print(f"\nsubmit→dashboard: {round((t_dash-t_submit)*1000)}ms")
    browser.close()
