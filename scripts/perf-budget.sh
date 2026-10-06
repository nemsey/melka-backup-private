#!/usr/bin/env bash
# ============================================================
# perf-budget.sh — گارد بودجهٔ کارایی ملکا (ملکا-شورا-ن۰۰۶ BLOCK 5)
# سنجه‌ها را می‌سنجد، با بودجهٔ رسمی مقایسه می‌کند و خروجی JSON می‌دهد.
# خروج: ۰ = همهٔ بودجه‌ها سبز · ۱ = حداقل یک بودجه قرمز
# استفاده: bash scripts/perf-budget.sh
# ============================================================
set -uo pipefail
cd /home/z/my-project
OUT="/home/z/my-project/download/pn006/perf-budget.json"
BASE="${BASE_URL:-http://localhost:3000}"

echo "[perf-budget] $(date -u +%FT%TZ)"

# ── ۱) RAM سرور production ──
RSS_KB=$(ps aux | grep 'standalone/server.js' | grep -v grep | awk '{s+=$6} END {print s}')
RSS_MB=$(( ${RSS_KB:-0} / 1024 ))

# ── ۲) API P95 (نقاط پایانی کلیدی، ۲۰ درخواست هر یک) ──
api_p95() {
  local ep="$1"
  python3 - "$ep" <<'PYEOF'
import subprocess, sys, time
ep = sys.argv[1]
lat = []
code = ""
for _ in range(20):
    t0 = time.time()
    try:
        r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}", "-m", "10", ep],
                           capture_output=True, text=True, timeout=15)
        code, tt = r.stdout.split()
        lat.append(float(tt) * 1000)
    except Exception:
        pass
if not lat:
    print("null"); raise SystemExit
lat.sort()
p95 = lat[int(len(lat) * 0.95) - 1] if len(lat) >= 20 else lat[-1]
print(int(p95))
PYEOF
}
P95_VERSION=$(api_p95 "$BASE/api/version")
P95_HEALTH=$(api_p95 "$BASE/api/health")
P95_HOME=$(api_p95 "$BASE/")

# ── ۳) سنجه‌های مرورگری (LCP/CLS/سفرها) ──
BROWSER_JSON=$(timeout 200 python3 scripts/pn006/perf-browser.py 2>/dev/null | tail -1)

# ── ۴) Initial JS (gzip تقریبی از چانک‌های .next) ──
INIT_JS_KB=$(python3 - <<'PYEOF'
import gzip, os, json
total = 0
d = "/home/z/my-project/.next/static/chunks"
if os.path.isdir(d):
    for f in os.listdir(d):
        if f.endswith(".js"):
            with open(os.path.join(d, f), "rb") as fh:
                total += len(gzip.compress(fh.read(), 6))
print(int(total / 1024))
PYEOF
)

# ── ۵) پیک Build (از تازه‌ترین سنجهٔ BLOCK 2) ──
BUILD_PEAK=$(python3 - <<'PYEOF'
import glob, json, os
files = sorted(glob.glob("/home/z/my-project/scripts/pn006/results/build-*.json"), key=os.path.getmtime)
print(int(json.load(open(files[-1]))["treePeakMB"]) if files else "null")
PYEOF
)

# ── جمع‌بندی ──
python3 - "$OUT" "$RSS_MB" "$P95_VERSION" "$P95_HEALTH" "$P95_HOME" "$INIT_JS_KB" "$BUILD_PEAK" "$BROWSER_JSON" <<'PYEOF'
import json, sys, datetime
out, rss, p95v, p95h, p95home, init_js, build_peak, browser_raw = sys.argv[1:9]
browser = {}
try: browser = json.loads(browser_raw)
except Exception: pass
lp = browser.get("loginPage", {})

def num(x, default=99999):
    try:
        return int(float(str(x)))
    except Exception:
        return default

budget = {
    "case": "PN-006-BLOCK5-PERF-BUDGET",
    "measuredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "budgets": [
        {"metric": "Initial JS (بار اول — سنجهٔ مرورگر)", "target": "< 300KB", "value": f"{(browser.get('initialJs') or {}).get('encodedKB')}KB", "pass": num((browser.get('initialJs') or {}).get('encodedKB'), 9999) < 300,
         "note": f"انتقال واقعی JS در بار اول صفحهٔ ورود ({(browser.get('initialJs') or {}).get('count')} چانک — encodedBodySize)"},
        {"metric": "LCP (صفحهٔ ورود، موبایل شبیه‌سازی)", "target": "< 2500ms", "value": f"{lp.get('lcp')}ms", "pass": num(lp.get('lcp'), 9999) < 2500},
        {"metric": "INP proxy (تأخیر تعامل)", "target": "< 200ms", "value": f"{browser.get('interactionLatencyMs')}ms", "pass": num(browser.get('interactionLatencyMs'), 999) < 200,
         "note": "INP واقعی نیازمند تعامل کاربر واقعی است — این proxy کلیک→فریم بعدی است"},
        {"metric": "CLS", "target": "< 0.1", "value": lp.get("cls"), "pass": (float(lp.get("cls")) if str(lp.get("cls")).replace(".","",1).isdigit() else 1.0) < 0.1},
        {"metric": "Login → Dashboard", "target": "< 2000ms", "value": f"{browser.get('loginToDashboardMs')}ms", "pass": num(browser.get('loginToDashboardMs')) < 2000},
        {"metric": "Dashboard → Tile (M1)", "target": "< 1000ms", "value": f"{browser.get('dashboardToTileMs')}ms", "pass": num(browser.get('dashboardToTileMs')) < 1000},
        {"metric": "Tile → First Insight", "target": "< 2000ms", "value": f"{browser.get('tileToFirstInsightMs')}ms", "pass": num(browser.get('tileToFirstInsightMs')) < 2000},
        {"metric": "API P95 /api/version", "target": "< 500ms", "value": f"{p95v}ms", "pass": num(p95v, 9999) < 500},
        {"metric": "API P95 /api/health", "target": "< 500ms", "value": f"{p95h}ms", "pass": num(p95h, 9999) < 500},
        {"metric": "API P95 / (خانه)", "target": "< 500ms", "value": f"{p95home}ms", "pass": num(p95home, 9999) < 500},
        {"metric": "RAM production", "target": "< 500MB", "value": f"{rss}MB", "pass": num(rss, 9999) < 500},
        {"metric": "RAM Build پیک", "target": "< 1500MB", "value": f"{build_peak}MB", "pass": num(build_peak, 9999) < 1500,
         "note": "PN-006 BLOCK 2: هدف محقق نشد — کف Native راست‌گرای Turbopack ~۱۷۴۳MB؛ مستند در build-peak.json"},
    ],
    "browserJourney": browser,
    "method": "playwright chromium (موبایل شبیه‌سازی‌شده 390×844) + curl P95 (۲۰ نمونه) + gzip چانک‌ها + ps RSS",
}
fails = [b["metric"] for b in budget["budgets"] if not b["pass"]]
budget["summary"] = {"total": len(budget["budgets"]), "pass": len(budget["budgets"]) - len(fails), "fail": len(fails), "failedMetrics": fails}
json.dump(budget, open(out, "w"), ensure_ascii=False, indent=2)
print(json.dumps(budget["summary"], ensure_ascii=False))
for b in budget["budgets"]:
    print(f"  {'✓' if b['pass'] else '✗'} {b['metric']}: {b['value']} (هدف {b['target']})")
sys.exit(1 if fails else 0)
PYEOF
RC=$?
echo "[perf-budget] خروج=$RC (۰=همه سبز)"
exit $RC
