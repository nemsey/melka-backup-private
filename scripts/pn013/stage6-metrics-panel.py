#!/usr/bin/env python3
# PN-013 — آزمون زندهٔ پانل متریک OWNER با توکن شکار‌شده از رفت‌وبرگشت خود اپ
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

    captured = {}
    def capture_auth(route, request):
        h = request.headers.get("authorization")
        if h and h.startswith("Bearer "):
            captured["auth"] = h
        route.continue_()
    page.route("**/api/**", capture_auth)

    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(1200)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    page.click("button[type=submit]", timeout=8000)
    try:
        page.wait_for_selector("text=آگهی ملکا", timeout=20000)
    except Exception:
        print(json.dumps({"error": "no-dashboard (rate-limited?)"})); browser.close(); sys.exit(2)
    page.wait_for_timeout(2500)  # اپ چند فراخوانی احرازشده می‌کند ⇒ توکن شکار می‌شود

    if not captured.get("auth"):
        print("توکن احراز از رفت‌وبرگشت اپ دیده نشد"); browser.close(); sys.exit(3)

    # فراخوانی پانل متریک با همان توکن (داخل مرورگر با نشست واقعی)
    metrics = page.evaluate("""async (auth) => {
      const r = await fetch('/api/v1/runtime/metrics', {
        headers: { 'Authorization': auth, 'x-request-id': 'pn013-metrics-live' }
      });
      const body = await r.json().catch(() => null);
      return { status: r.status, requestId: r.headers.get('x-request-id'), body };
    }""", captured["auth"])
    json.dump(metrics, open("download/pn013/observability-live.json","w"), ensure_ascii=False, indent=1)

    print("metrics status:", metrics["status"], "| echo:", metrics["requestId"])
    body = metrics.get("body") or {}
    obs = body.get("observability", {})
    print("schema:", obs.get("schema"), "| pid:", obs.get("process",{}).get("pid"), "| rssMB:", obs.get("process",{}).get("rssMB"))
    for k, v in obs.get("families", {}).items():
        rows = "; ".join(f"{x['name'].split('{')[1][:-1] if '{' in x['name'] else 'کل'}: n={x['count']} p95={x['p95']}" for x in v[:3])
        print(f"  {k}: {len(v)} سری → {rows}")
    w = body.get("worker") or {}
    print("worker: alive =", w.get("alive"), "| jobs =", len(w.get("jobs", [])), "| heartbeatAgeSec =", w.get("heartbeatAgeSec"))
    browser.close()
