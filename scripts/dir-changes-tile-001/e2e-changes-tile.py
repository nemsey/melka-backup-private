#!/usr/bin/env python3
# DIR-CHANGES-TILE-001 · E2E واقعی مرورگر — کاشی «تغییرات» (الگوی PN-024)
# ۱) ورود با کد مدیر ۲) حضور کارت کاشی روی هوم ۳) باز کردن کاشی + کارت حالت تمام‌ظرفیت
# ۴) جستجوی زندهٔ کد درخواست ۵۵۹۲۰ (فقط-خواندن — از طریق UI) ۵) اسکرین‌شات‌ها
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/dir-changes-tile-001")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"steps": [], "errors": [], "consoleErrors": []}

def step(k, ok, detail=""):
    out["steps"].append({"key": k, "ok": ok, "detail": detail})
    print(("OK" if ok else "FAIL"), k, detail)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["consoleErrors"].append(m.text) if m.type == "error" else None)

    # ── ورود ──
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(2500)
    try:
        # هوم جدید (PN-086): هفت‌تایی + تغییرات — نشست ذخیره‌شده؟
        page.wait_for_selector('button[aria-label="باز کردن کاشی تغییرات"]', timeout=8000)
        step("login", True, "نشست ذخیره‌شده")
    except Exception:
        page.wait_for_selector("input", timeout=20000)
        page.wait_for_timeout(1000)
        try: page.click("text=ورود با کد مدیر", timeout=6000)
        except Exception: pass
        page.fill("#masterCode", code)
        page.click("button[type=submit]", timeout=8000)
        page.wait_for_selector('button[aria-label="باز کردن کاشی تغییرات"]', timeout=25000)
        page.wait_for_timeout(2000)
        step("login", True, "لاگین تازه")

    # ── ۱) کارت کاشی روی هوم ──
    try:
        card = page.locator('button[aria-label="باز کردن کاشی تغییرات"]').first
        card.wait_for(timeout=10000)
        step("home-card", True, "کارت کاشی «تغییرات» روی هوم دیده می‌شود")
        page.screenshot(path=str(OUT / "01-home-changes-card.png"))
        card.click(timeout=10000)
        page.wait_for_timeout(2500)
    except Exception as e:
        step("home-card", False, str(e)[:140])

    # ── ۲) صفحهٔ کاشی: کارت حالت تمام‌ظرفیت + دو قابلیت ──
    try:
        page.wait_for_selector("text=حالت تمام‌ظرفیت ترموکس", timeout=10000)
        step("full-capacity-card", True, "کارت حالت تمام‌ظرفیت بار شد")
        page.wait_for_selector("text=قابلیت ۱ — کدآگهی", timeout=6000)
        page.wait_for_selector("text=قابلیت ۲ — کد درخواست", timeout=6000)
        step("two-capabilities", True, "هر دو قابلیت (تب‌ها) حاضرند")
        # وضعیت رله در کارت (نبض ۱۵ث — چند ثانیه صبر)
        page.wait_for_timeout(3500)
        page.screenshot(path=str(OUT / "02-changes-page.png"), full_page=False)
        step("screenshot-page", True)
    except Exception as e:
        step("full-capacity-card", False, str(e)[:140])

    # ── ۳) جستجوی زندهٔ ۵۵۹۲۰ در قابلیت ۲ (فقط-خواندن) ──
    try:
        # پیش‌فرض تب «کد درخواست» فعال است (defaultValue=request)
        page.wait_for_selector('input[placeholder*="55920"]', timeout=6000)
        page.fill('input[placeholder*="55920"]', "55920")
        page.get_by_role("button", name="جستجو").first.click(timeout=8000)
        page.wait_for_timeout(6000)  # جستجوی زنده از طریق رلهٔ ترموکس
        body = page.locator("text=تاریخچهٔ تغییرات درخواست")
        body.first.wait_for(timeout=30000)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "03-lookup-55920.png"), full_page=False)
        step("lookup-55920", True, "جستجوی زندهٔ ۵۵۹۲۰ + تاریخچهٔ تغییرات نمایش داده شد")
    except Exception as e:
        page.screenshot(path=str(OUT / "03-lookup-55920.png"), full_page=False)
        step("lookup-55920", False, str(e)[:160])

    # ── ۴) نمای تب «کدآگهی» (قابلیت ۱) ──
    try:
        page.get_by_role("tab", name="قابلیت ۱ — کدآگهی").click(timeout=8000)
        page.wait_for_timeout(1200)
        page.wait_for_selector("text=جستجوی کدآگهی در خود سامانهٔ ARM", timeout=6000)
        page.screenshot(path=str(OUT / "04-listing-capability.png"), full_page=False)
        step("listing-tab", True, "قابلیت ۱ (کدآگهی) باز شد")
    except Exception as e:
        step("listing-tab", False, str(e)[:140])

    browser.close()

out["consoleErrorCount"] = len(out["consoleErrors"])
out["consoleErrorSample"] = out["consoleErrors"][:5]
out["allPassed"] = all(s["ok"] for s in out["steps"])
(OUT / "e2e-result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print("═" * 50)
print(f"نتیجه: {sum(1 for s in out['steps'] if s['ok'])}/{len(out['steps'])} گام OK · خطای کنسول: {out['consoleErrorCount']}")
sys.exit(0 if out["allPassed"] else 1)
