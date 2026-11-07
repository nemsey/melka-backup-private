#!/usr/bin/env python3
# PN-013 — آزمون زندهٔ نهایی مرحلهٔ ۶ + شواهد بصری داشبورد/کاشی
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
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(1500)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    page.click("button[type=submit]", timeout=8000)
    try:
        page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print(json.dumps({"error": "no-dashboard", "rate-limited-likely": True}, ensure_ascii=False)); browser.close(); sys.exit(2)
    page.wait_for_timeout(2500)  # اسپلش داشبورد تمام شود + کاشی‌ها ساکن
    page.screenshot(path="download/pn013/screens/04-dashboard-mobile.png")
    # باز کردن کاشی M1 (آگهی ملکا)
    try:
        page.locator("button", has_text="آگهی ملکا").last.click(timeout=10000)
        page.wait_for_selector("text=دفتر مرکزی فایل‌های آگهی", timeout=15000)
        page.wait_for_timeout(1500)
        page.screenshot(path="download/pn013/screens/05-tile-listings-mobile.png")
    except Exception as e:
        print("tile open issue:", str(e)[:100])
    # دسکتاپ: داشبورد
    ctx2 = browser.new_context(viewport={"width":1440,"height":900}, service_workers="block")
    page2 = ctx2.new_page()
    page2.goto(BASE, wait_until="load")
    try:
        page2.wait_for_selector("text=آگهی ملکا", timeout=20000)
        page2.wait_for_timeout(2000)
        page2.screenshot(path="download/pn013/screens/06-dashboard-desktop.png")
    except Exception:
        pass  # نشست دسکتاپ جدا = بدون ورود؛ اسکرین‌شات اختیاری
    # پانل متریک OWNER از داخل مرورگر دارای نشست
    metrics = page.evaluate("""async () => {
      const r = await fetch('/api/v1/runtime/metrics', { headers: { 'x-request-id': 'pn013-metrics-live' } });
      const body = await r.json().catch(() => null);
      return { status: r.status, requestId: r.headers.get('x-request-id'), body };
    }""")
    json.dump(metrics, open("download/pn013/observability-live.json","w"), ensure_ascii=False, indent=1)
    fam = (metrics.get("body") or {}).get("observability", {}).get("families", {})
    print("metrics status:", metrics["status"], "| echo:", metrics["requestId"])
    for k, v in fam.items():
        print(f"  {k}: {len(v)} سری — آخرین: {v[0]['last'] if v else '—'}")
    worker = (metrics.get("body") or {}).get("worker")
    if worker: print("worker alive:", worker.get("alive"), "| heartbeat age:", worker.get("heartbeatAgeSec"))
    print("console errors:", len(errors), errors[:3])
    browser.close()
