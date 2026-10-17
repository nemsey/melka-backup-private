#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pn012-screens.py — شواهد بصری زندهٔ PN-012 (پس از بازیابی PN-011 + فاز ۳)"""
import asyncio, os, sys
from playwright.async_api import async_playwright

OUT = "/home/z/my-project/download/pn012/screens"
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:3000"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, locale="fa-IR")
        page = await ctx.new_page()

        # ۱) خانه (پس از احیا و فاز ۳)
        await page.goto(BASE, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f"{OUT}/00-home-after-pn012.png")

        # ۲) ورود مالک → داشبورد
        try:
            await page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(800)
            await page.screenshot(path=f"{OUT}/01-login.png")
            await page.fill("input[type='tel'], input[name='code'], input[placeholder*='کد']", "80211186", timeout=5000)
        except Exception as e:
            print("login fill skip:", str(e)[:80])

        # ۳) کاشی M1 — فیلتر چیپی بازیابی‌شدهٔ PN-011
        await page.goto(f"{BASE}/arm-listings", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/02-m1-listings.png")

        # ۴) v1 API — پاسخ زندهٔ نسخهٔ تازه
        await page.goto(f"{BASE}/api/v1/health", wait_until="networkidle", timeout=30000)
        await page.screenshot(path=f"{OUT}/03-v1-health.png")

        # ۵) تنظیمات — دیمن v2 (وضعیت Worker زنده)
        await page.goto(f"{BASE}/settings", wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=f"{OUT}/04-settings-worker.png")

        await browser.close()
        print("OK —", sorted(os.listdir(OUT)))

asyncio.run(main())
