#!/usr/bin/env python3
"""
کاوش زندهٔ CRM ملکتون با اعتبارنامهٔ سینک فعلی (PN-052 · گام دوم)
هدف: تعیین دقیق سقف RBAC حساب فعلی برای نمای خصوصی (مالک/متقاضی)
رازها هرگز چاپ نمی‌شوند (قانون ۱۸)
"""
import json, re, sys, urllib.request, http.cookiejar, html as htmlmod

SEC = json.load(open('/home/z/my-project/upload/.runtime/melketun-secrets.json'))
BASE = SEC['crm']['base_url'].rstrip('/')
USER = SEC['crm']['username']
PASS = SEC['crm']['password']

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar),
    urllib.request.HTTPRedirectHandler()
)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener_nr = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect())

print(f"base={BASE} · user={'*'*(len(USER)-2)}{USER[-2:]} (hidden)")

# 1) GET /login (XSRF cookie)
r = opener.open(f"{BASE}/login", timeout=30)
print(f"GET /login → {r.status}")

# 2) POST /login-store
xsrf = None
for c in jar:
    if c.name == 'XSRF-TOKEN':
        xsrf = c.value
data = f"Username={urllib.parse.quote(USER)}&Password={urllib.parse.quote(PASS)}".encode() if False else None
import urllib.parse
data = f"Username={urllib.parse.quote(USER)}&Password={urllib.parse.quote(PASS)}".encode()
req = urllib.request.Request(f"{BASE}/login-store", data=data, headers={
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-XSRF-TOKEN': xsrf or '',
    'Accept': 'application/json, text/html;q=0.9',
}, method='POST')
try:
    r = opener_nr.open(req, timeout=30)
    print(f"POST /login-store → {r.status} (_redirect stopped)")
except urllib.error.HTTPError as e:
    print(f"POST /login-store → {e.code} (redirect = success)")

# 3) verify /dashboard
req = urllib.request.Request(f"{BASE}/dashboard", headers={'Accept': 'text/html'})
try:
    r = opener.open(req, timeout=30)
    print(f"GET /dashboard → {r.status} {'✓ AUTH OK' if r.status==200 else '✗'}")
except urllib.error.HTTPError as e:
    print(f"GET /dashboard → {e.code} ✗")

def inertia_props(page_html):
    m = re.search(r'<div[^>]*id="app"[^>]*data-page="([^"]*)"', page_html)
    if not m: return None
    try:
        page = json.loads(htmlmod.unescape(m.group(1)))
        comp = page.get('component', '')
        if comp.startswith('errors/'): return None
        return page.get('props')
    except Exception:
        return None

def probe_module(path, prop, label, max_pages=3):
    """فچ چند صفحه و شمارش ردیف‌ها + فیلدهای کلیدی + retry عین سینک (۳ تلاش)"""
    import time
    total, first_fields, nonnull_owner, nonnull_contact, codes = 0, None, 0, 0, set()
    for n in range(1, max_pages+1):
        url = f"{BASE}{path}{n if n>1 else ''}"
        got = False
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={'Accept': 'text/html'})
                r = opener.open(req, timeout=30)
                if r.status != 200:
                    codes.add(r.status)
                    if r.status in (301, 302, 303):
                        print(f"  {label} p{n}: HTTP {r.status} (redirect — RBAC رد کرد)"); got=True; break
                    if r.status >= 500:
                        time.sleep(1.5*(attempt+1)); continue
                    print(f"  {label} p{n}: HTTP {r.status}"); got=True; break
                body = r.read().decode('utf-8', 'ignore')
                props = inertia_props(body)
                if props is None:
                    print(f"  {label} p{n}: Inertia props not found (guest/خطا؟)"); got=True; break
                bucket = props.get(prop)
                rows = bucket.get('data') if isinstance(bucket, dict) else bucket
                if not isinstance(rows, list):
                    print(f"  {label} p{n}: prop '{prop}' ناموجود — کلیدها: {sorted(props.keys())[:8]}"); got=True; break
                total += len(rows)
                if rows:
                    if first_fields is None:
                        first_fields = sorted(rows[0].keys())
                    for row in rows:
                        if str(row.get('ownerName') or row.get('owner_name') or '').strip(): nonnull_owner += 1
                        if str(row.get('contactName') or '').strip(): nonnull_contact += 1
                got = True
                if len(rows) < 10: n = max_pages  # پایان
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  {label} p{n}: ERR {str(e)[:90]}")
                else:
                    time.sleep(1.5*(attempt+1))
        if not got and n >= max_pages: break
        if not got: break
    print(f"── {label}: {total} ردیف (تا {max_pages} صفحه) · ownerName پر: {nonnull_owner} · contactName پر: {nonnull_contact}")
    if first_fields:
        print(f"   فیلدها ({len(first_fields)}): {' | '.join(first_fields)}")
    return total

print()
print("═══ کاوش RBAC حساب فعلی ═══")
pub = probe_module('/MelketunPublicFilingPlus', 'filings', 'نمای عمومی آگهی (M7)', 2)
priv = probe_module('/Melketunfilingplus', 'filings', 'نمای خصوصی آگهی (مالک واقعی)', 3)
privp = probe_module('/Potentials', 'potentials', 'نمای خصوصی درخواست (متقاضی)', 3)
pubp = probe_module('/PublicPotentials', 'potentials', 'نمای عمومی درخواست (M8)', 2)
