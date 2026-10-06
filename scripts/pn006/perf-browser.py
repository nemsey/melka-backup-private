#!/usr/bin/env python3
"""
PN-006 BLOCK 5 — سنجهٔ مرورگری بودجهٔ کارایی (production زنده) v2
SPA-آگاه: LCP با PerformanceObserver(buffered) + نشانگرهای واقعی UI.
خروجی: JSON روی stdout
"""
import json, re, sys, time

BASE = "http://localhost:3000"

def read_master_code():
    with open("/home/z/my-project/.env.local") as f:
        m = re.search(r"^MASTER_ACCESS_CODE=(.+)$", f.read(), re.M)
        return m.group(1).strip() if m else ""

CODE = read_master_code()
if not CODE:
    print(json.dumps({"error": "MASTER_ACCESS_CODE missing"})); sys.exit(1)

from playwright.sync_api import sync_playwright

INIT_JS = """
window.__perf = { lcp: 0, cls: 0, lcpUrl: '' };
try {
  new PerformanceObserver((l) => {
    const es = l.getEntries();
    if (es.length) { window.__perf.lcp = Math.round(es[es.length-1].startTime); window.__perf.lcpUrl = es[es.length-1].url || ''; }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
} catch {}
try {
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
} catch {}
"""

out = {"measuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "base": BASE}

with sync_playwright() as p:
    browser = p.chromium.launch()
    # ن۰۰۷ BLOCK 3 (رفع باگ سنجه — بازاعمال پس از گم‌شدن در پاک‌سازی mode):
    # کش SW در حین لود فعال می‌شد و Initial JS را آلوده می‌کرد (۲۹۰KB واقعی ↔ ۱۰۳۸KB).
    # با block، سنجه قطعی و تکرارپذیر می‌شود.
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844},
        is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        device_scale_factor=2,
        service_workers="block",
    )
    page = ctx.new_page()
    page.add_init_script(INIT_JS)

    # ── ۱) صفحهٔ ورود ──
    t0 = time.time()
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    out["loginFirstPaint"] = {"loadToInputMs": round((time.time() - t0) * 1000)}
    page.wait_for_timeout(2000)
    out["loginPage"] = page.evaluate("() => ({...window.__perf, cls: Math.round(window.__perf.cls*1000)/1000})")
    # JS واقعیِ بار اول (لحظهٔ ورود — بودجهٔ Initial JS)
    out["initialJs"] = page.evaluate("""
    () => {
      const s = performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js'));
      return { count: s.length, encodedKB: Math.round(s.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0) / 1024) };
    }
    """)

    # ── ۲) ورود → داشبورد (نشانگر: ناوبری پایین «آگهی ملکا») ──
    t0 = time.time()
    try:
        page.click("text=ورود با کد مدیر", timeout=6000)  # تغییر حالت به MASTER
    except Exception:
        pass  # شاید از قبل حالت مدیر باشد
    page.fill("#masterCode", CODE)
    page.click("button[type=submit]", timeout=8000)
    page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    out["loginToDashboardMs"] = round((time.time() - t0) * 1000)
    page.wait_for_timeout(2500)  # تسویح داشبورد + کاشی‌ها
    out["dashboard"] = page.evaluate("() => ({...window.__perf, cls: Math.round(window.__perf.cls*1000)/1000})")

    # ── ۳) داشبورد → کاشی آگهی (M1) ──
    t0 = time.time()
    try:
        # دکمهٔ ناوبری پایین (نه متن پاراگراف معرفی کاشی‌ها)
        page.locator("button", has_text="آگهی ملکا").last.click(timeout=10000)
        try:
            # نشانگر گذار: توصیف سرصفحهٔ کاشی M1 (اولین محتوای کاشی)
            page.wait_for_selector("text=دفتر مرکزی فایل‌های آگهی", timeout=15000)
        except Exception:
            pass  # محتوا دیرتر می‌آید — زمان را همان‌طور ثبت می‌کنیم
    except Exception as e:
        out["tileNavError"] = str(e)[:120]
    out["dashboardToTileMs"] = round((time.time() - t0) * 1000)
    page.wait_for_timeout(2500)
    out["tilePage"] = page.evaluate("() => ({...window.__perf, cls: Math.round(window.__perf.cls*1000)/1000})")
    try:
        out["tileBodySample"] = page.evaluate("() => document.body.innerText.slice(0, 300)")
    except Exception:
        out["tileBodySample"] = None

    # ── ۴) کاشی → اولین بینش ──
    t0 = time.time()
    insight_found = False
    try:
        page.wait_for_selector("text=بینش", timeout=10000)
        insight_found = True
    except Exception:
        pass
    out["tileToFirstInsightMs"] = round((time.time() - t0) * 1000)
    out["insightFound"] = insight_found

    # ── ۵) تأخیر تعامل تقریبی (INP proxy) ──
    out["interactionLatencyMs"] = page.evaluate("""
    () => new Promise(res => {
      const t0 = performance.now();
      const el = document.querySelector('button, [role=button], a') || document.body;
      el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t0))));
    })
    """)

    # ── ۶) JS بارگذاری‌شدهٔ این سفر (شمارش + بایت خام) ──
    out["jsResources"] = page.evaluate("""
    () => {
      const s = performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js'));
      return { count: s.length, encodedBodyKB: Math.round(s.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0) / 1024) };
    }
    """)

    browser.close()

print(json.dumps(out, ensure_ascii=False))
