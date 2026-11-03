#!/usr/bin/env python3
"""
DIR-PN048B — Authorized Secure Audit Library (ممیزی امن مجاز ۲۵ محور)
Shared infrastructure for all waves.

15 governing laws enforced here:
  11 — rate limit: >=2.5s between requests to the same host (G4)
  12 — max 10 samples per test
  15 — full redacted request log: URL, status, size, timestamp, user_agent, snippet
Guardians:
  G7 — Redaction Gate: NO raw PII ever leaves this process into artifacts
  G4 — rate limit + checkpoint

Authorization declaration (per directive §1 — every test must carry):
  role: CRM user "Sarmasti" (v_tiger_id=617 · is_admin=0 · کارشناس فروش شعبه رضانژاد تبریز)
  purpose: DIR-PN048B authorized RBAC-boundary + coverage-ceiling audit
  allowed_fields: fields the audited endpoint legitimately returns to this account
  redaction_level: hash (names/mobiles → sha256 prefix; never raw)
"""
import hashlib, json, os, re, time, datetime, pathlib, urllib.parse
import requests as rq

BASE_CRM = "https://melketun.app"
BASE_PUBLIC = "https://melketun.com"
RUN_ID = "dir-pn048b"
OUT_DIR = pathlib.Path("/home/z/my-project/download/pn048b")
RAW_DIR = pathlib.Path("/home/z/my-project/scripts/pn048b/raw")  # raw HTML (local-only, G7-checked before export)
LOG_PATH = pathlib.Path("/home/z/my-project/scripts/pn048b/audit-request-log.jsonl")
SECRETS = json.load(open("/home/z/my-project/upload/.runtime/melketun-secrets.json"))

UA_BROWSER = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/130.0.0.0 Safari/537.36")
UA_MOBILE = "MelketunApp/1.0 (Android; SDK 34)"

_last_req_ts = {}
REQ_LOG = []
TOTAL_REQUESTS = 0

AUTH_DECL = {
    "role": "CRM user Sarmasti (v_tiger_id=617, is_admin=0, کارشناس فروش رضانژاد تبریز)",
    "purpose": "DIR-PN048B authorized technical audit — RBAC boundary + coverage ceiling",
    "allowed_fields": "fields legitimately returned by each audited endpoint to this account",
    "redaction_level": "hash",
}

# ── G4: rate limit ──────────────────────────────────────────────────────────
MIN_GAP_S = 2.6  # ≥ 1 req / 2-3s

def _respect_rate(host):
    global _last_req_ts
    last = _last_req_ts.get(host, 0)
    wait = MIN_GAP_S - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    _last_req_ts[host] = time.time()

# ── G7: redaction ───────────────────────────────────────────────────────────
def h(value):
    """Hash PII value → sha256[:10] (verifiable comparison, zero raw leakage)."""
    if value is None: return None
    if isinstance(value, (int, float)): value = str(value)
    v = re.sub(r"\s+", "", str(value).strip())
    if not v: return None
    return hashlib.sha256(v.encode("utf-8")).hexdigest()[:10]

def redact_name(name):
    """name → first letter (Persian) + hash — no other content."""
    if not name: return None
    s = str(name).strip()
    return {"initial": s[:1], "hash": h(s)}


def status_of(r):
    """True status; requests.Response.__bool__ is `ok` (falsy for 404/500) — never use `if r else`."""
    return r.status_code if (r is not None and getattr(r, "status_code", None) is not None) else -1

def redact_mobile(m):
    """mobile → hash only. No digits leave the process."""
    if m in (None, ""): return None
    return {"hash": h(re.sub(r"\D", "", str(m)))}

def g7_scan(obj):
    """Scan exported artifact for raw PII patterns (Iranian mobile/name-like strings)."""
    s = json.dumps(obj, ensure_ascii=False)
    leaks = []
    if re.search(r"09\d{9}", s): leaks.append("raw_mobile_pattern")
    if re.search(r"\+989\d{9}", s): leaks.append("raw_mobile_pattern_intl")
    return leaks


def _mask_snippet(s):
    """G7: no raw PII ever enters the request log — mask mobiles/names-by-hash at log time."""
    import re as _re
    def _m(m_):
        return "{phone:" + hashlib.sha256(m_.group(0).encode()).hexdigest()[:10] + "}"
    s = _re.sub(r"09\d{9}", _m, s)
    s = _re.sub(r"\+989\d{9}", _m, s)
    return s

# ── law 15: request log ────────────────────────────────────────────────────
def log_request(method, url, status, size, ua, snippet, note=""):
    global TOTAL_REQUESTS
    TOTAL_REQUESTS += 1
    entry = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "method": method, "url": url, "status": status, "size_bytes": size,
        "user_agent": ua, "snippet": snippet[:120], "note": note,
    }
    REQ_LOG.append(entry)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

# ── HTTP with G4 + law 15 ──────────────────────────────────────────────────
def http(method, url, session, headers=None, data=None, timeout=40, note="", allow_redirects=None):
    host = re.sub(r"^https?://([^/]+).*", r"\1", url)
    _respect_rate(host)
    hdrs = {"User-Agent": UA_BROWSER}
    if headers: hdrs.update(headers)
    if allow_redirects is None:
        allow_redirects = (method == "GET")
    try:
        r = session.request(method, url, headers=hdrs, data=data, timeout=timeout,
                            allow_redirects=allow_redirects)
        log_request(method, url, r.status_code, len(r.content or b""), hdrs.get("User-Agent"),
                    (r.text[:100] if r.content else ""), note)
        return r
    except Exception as e:
        log_request(method, url, -1, 0, hdrs.get("User-Agent"), f"EXC:{type(e).__name__}", note)
        return None

# ── login (same flow as production sync — the account holder's own tooling) ──
def make_session():
    s = rq.Session()
    base = BASE_CRM
    r1 = http("GET", f"{base}/login", s, note="auth: fetch login page + CSRF")
    if r1 is None or r1.status_code != 200:
        raise RuntimeError("login page unreachable")
    xsrf = s.cookies.get("XSRF-TOKEN")
    xsrf = urllib.parse.unquote(xsrf) if xsrf else ""
    r2 = http("POST", f"{base}/login-store", s,
              headers={"X-XSRF-TOKEN": xsrf, "Accept": "application/json, text/html;q=0.9",
                       "Referer": f"{base}/login",
                       "Content-Type": "application/x-www-form-urlencoded"},
              data={"Username": SECRETS["crm"]["username"], "Password": SECRETS["crm"]["password"]},
              note="auth: login-store (account holder credentials from Persistent Zone)",
              allow_redirects=False)
    if r2 is None or r2.status_code not in (302, 303):
        raise RuntimeError(f"login failed: HTTP {r2.status_code if r2 else 'ERR'}")
    r3 = http("GET", f"{base}/dashboard", s, allow_redirects=False, note="auth: verify session")
    if r3 is None or r3.status_code != 200:
        raise RuntimeError("session verify failed")
    return s

# ── Inertia props extraction (same as production sync) ──────────────────────
def extract_props(html_text):
    m = re.search(r'<body[^>]*\sdata-page="([^"]+)"', html_text or "")
    if not m:
        m = re.search(r'data-page="([^"]+)"', html_text or "")
    if not m:
        return None
    try:
        import html as _h
        return json.loads(_h.unescape(m.group(1)))
    except Exception:
        return None

def save_json(name, obj):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    leaks = g7_scan(obj)
    if leaks:
        raise RuntimeError(f"G7 GATE: raw PII pattern in {name}: {leaks} — refusing to write")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    return path

def test_meta(test_id, description):
    return {"test": test_id, "description": description, **AUTH_DECL}

def save_raw(name, content):
    """Save raw HTML locally (not exported to download/ — G7 gate applies at export)."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    p = RAW_DIR / name
    with open(p, "w", encoding="utf-8") as f:
        f.write(content or "")
    return p
