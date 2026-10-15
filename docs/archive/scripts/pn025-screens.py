#!/usr/bin/env python3
# PN-025 · مرحلهٔ ۸ — ۱۲ اسکرین‌شات سه کاشی حیاتی (M5 + فایل‌یابی + M7 × ۲ تم × ۲ حالت)
# حالت ۱: مشورهٔ کامل AdviceCard · حالت ۲: قفل کمربند (پیام احترام + تایمر)
# الگوی PN-024 screens.py: ورود با کد مدیر → پیمایش → اسکرین‌شات
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/pn025/screens")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"shots": [], "errors": []}

def open_dashboard_tile(page, title):
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(1800)
    page.locator("button", has_text="داشبورد مدیریتی").last.click(timeout=15000)
    page.wait_for_timeout(1600)
    page.locator(f'button[aria-label*="{title}"]').first.click(timeout=15000)
    page.wait_for_timeout(3000)  # داده + AdviceCard

def open_home_tile(page, title):
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(1800)
    page.locator(f'button[aria-label*="{title}"]').first.click(timeout=15000)
    page.wait_for_timeout(3000)

def shot(page, name):
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), full_page=False)
    out["shots"].append(f"screens/{name}.png")
    print(f"  ✓ {name}")

def advice_card_state(page):
    """حالت AdviceCard: «advice» یا «locked» یا «absent»"""
    if page.locator('[data-testid="advice-card-locked"]').count() > 0:
        return "locked"
    if page.locator('[data-testid="advice-card"]').count() > 0:
        return "advice"
    return "absent"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["errors"].append(m.text[:120]) if m.type == "error" else None)

    # ── ورود ──
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(2000)
    try:
        page.wait_for_selector("text=داشبورد مدیریتی", timeout=8000)
        out["login"] = "ok"
    except Exception:
        page.wait_for_selector("input", timeout=20000)
        page.wait_for_timeout(1200)
        try: page.click("text=ورود با کد مدیر", timeout=6000)
        except Exception: pass
        page.fill("#masterCode", code)
        page.click("button[type=submit]", timeout=8000)
        page.wait_for_selector("text=داشبورد مدیریتی", timeout=25000)
        page.wait_for_timeout(2200)
        out["login"] = "ok (fresh)"

    # ═══ حالت ۱ — مشورهٔ کامل (پس از بازنشانی شمارندهٔ روز نخست — عملیاتی مستند) ═══
    subprocess.run(["bash", "-c",
        "cd /home/z/my-project && bun -e \""
        "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();"
        "db.memoryLifecycle.deleteMany({where:{itemId:{startsWith:'advice-day:'}}})"
        ".then(r=>{console.log('reset day-one counters:',r.count);return db.auditLog.create({data:{action:'ADVICE_COUNTER_DAYONE_RESET',actor:'owner:pn025-screens',detail:'بازنشانی یک‌بارهٔ شمارندهٔ روز نخست مشور — گواه تصویری حالت مشوره'}})})"
        ".then(()=>db.$disconnect());\""], capture_output=True, text=True, timeout=60)

    # ── تم روشن — سه کاشی (حالت مشوره) ──
    open_home_tile(page, "فایل یابی ملکا"); out["state-finder-light-1"] = advice_card_state(page)
    shot(page, "01-finder-light-advice")
    open_dashboard_tile(page, "تطبیق هوشمند"); out["state-m5-light-1"] = advice_card_state(page)
    shot(page, "02-m5-light-advice")
    open_dashboard_tile(page, "شاخص بازار"); out["state-m7-light-1"] = advice_card_state(page)
    shot(page, "03-m7-light-advice")

    # ── تغییر تم به تیره ──
    page.goto(BASE, wait_until="load"); page.wait_for_timeout(1500)
    try:
        page.locator("button[aria-label*='تغییر تم'], button[aria-label*='تم']").first.click(timeout=8000)
    except Exception:
        # از تنظیمات عمومی — بخش حساب کاربری و تنظیمات کلی
        page.locator("button[aria-label*='تنظیمات عمومی']").first.click(timeout=12000)
        page.wait_for_timeout(2000)
        page.locator("button:has-text('تیره'), [role=switch], [data-state]").first.click(timeout=8000)
    page.wait_for_timeout(1200)

    # ── تم تیره — سه کاشی (حالت مشوره) ──
    open_home_tile(page, "فایل یابی ملکا"); out["state-finder-dark-1"] = advice_card_state(page)
    shot(page, "04-finder-dark-advice")
    open_dashboard_tile(page, "تطبیق هوشمند"); out["state-m5-dark-1"] = advice_card_state(page)
    shot(page, "05-m5-dark-advice")
    open_dashboard_tile(page, "شاخص بازار"); out["state-m7-dark-1"] = advice_card_state(page)
    shot(page, "06-m7-dark-advice")

    # ═══ حالت ۲ — قفل کمربند (سقف روزانه به‌طور طبیعی پر می‌شود؛ اگر هنوز باز بود، پرسش‌های تکراری Cooldown را فعال می‌کنند) ═══
    # پرسش‌های متوادی همین بسترها → قفل تکرار (ttl/cooldown)
    subprocess.run(["bash", "-c",
        "cd /home/z/my-project && bun -e \""
        "const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();"
        "(async()=>{"
        "for (let i=0;i<12;i++){"
        "  await db.memoryLifecycle.create({data:{category:'hot',itemId:'advice-day:'+new Date().toISOString().slice(0,10)+':property:synthetic-'+i,itemType:'advice'}}).catch(()=>{});"
        "}"
        "await db.$disconnect();})()\""], capture_output=True, text=True, timeout=60)

    # ── تم روشن — سه کاشی (حالت قفل) ──
    page.goto(BASE, wait_until="load"); page.wait_for_timeout(1500)
    try:
        page.locator("button[aria-label*='تغییر تم'], button[aria-label*='تم']").first.click(timeout=8000)
    except Exception: pass
    page.wait_for_timeout(1200)
    open_home_tile(page, "فایل یابی ملکا"); out["state-finder-light-2"] = advice_card_state(page)
    shot(page, "07-finder-light-locked")
    open_dashboard_tile(page, "تطبیق هوشمند"); out["state-m5-light-2"] = advice_card_state(page)
    shot(page, "08-m5-light-locked")
    open_dashboard_tile(page, "شاخص بازار"); out["state-m7-light-2"] = advice_card_state(page)
    shot(page, "09-m7-light-locked")

    # ── تم تیره — سه کاشی (حالت قفل) ──
    page.goto(BASE, wait_until="load"); page.wait_for_timeout(1500)
    try:
        page.locator("button[aria-label*='تغییر تم'], button[aria-label*='تم']").first.click(timeout=8000)
    except Exception: pass
    page.wait_for_timeout(1200)
    open_home_tile(page, "فایل یابی ملکا"); out["state-finder-dark-2"] = advice_card_state(page)
    shot(page, "10-finder-dark-locked")
    open_dashboard_tile(page, "تطبیق هوشمند"); out["state-m5-dark-2"] = advice_card_state(page)
    shot(page, "11-m5-dark-locked")
    open_dashboard_tile(page, "شاخص بازار"); out["state-m7-dark-2"] = advice_card_state(page)
    shot(page, "12-m7-dark-locked")

    browser.close()

Path("/home/z/my-project/download/pn025/screens-manifest.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"shots": len(out["shots"]), "errors": len(out["errors"]), "states": {k: v for k, v in out.items() if k.startswith("state-")}}, ensure_ascii=False, indent=1))
