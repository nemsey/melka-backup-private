#!/usr/bin/env python3
# PN-013 مرحلهٔ ۴ — شواهد بصری پیش از ورود (اسپلش + صفحهٔ ورود)
import json, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
out = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    # موبایل ۳۹۰px (قانون شواهد بصری پروژه)
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        device_scale_factor=2, service_workers="block")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(400)
    page.screenshot(path="download/pn013/screens/01-splash-server-html.png")
    # صفحهٔ ورود (پس از boot بدون نشست)
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(700)
    page.screenshot(path="download/pn013/screens/02-auth-flow-island.png")
    # دسکتاپ
    ctx2 = browser.new_context(viewport={"width":1440,"height":900}, service_workers="block")
    page2 = ctx2.new_page()
    page2.goto(BASE, wait_until="load")
    page2.wait_for_selector("input", timeout=20000)
    page2.wait_for_timeout(700)
    page2.screenshot(path="download/pn013/screens/03-auth-desktop.png")
    out["consoleErrors"] = len(errors)
    out["errors"] = errors[:5]
    browser.close()
json.dump(out, open("download/pn013/shell-screens.json","w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False))
