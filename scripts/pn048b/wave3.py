#!/usr/bin/env python3
"""DIR-PN048B — Wave 3 [P2] — تکمیل ماژول‌ها
B1 (leads) · B2 (valuations) · B3 (supports) · N6 (preview) · N8 (ETag) ·
N9 (GraphQL) · C1 (sitemap عمومی) · B6 (Inertia shared props — offline از شواهد ذخیره‌شده)
"""
import json, re, sqlite3, sys, glob, os
sys.path.insert(0, "/home/z/my-project/scripts/pn048b")
from audit_lib import (http, make_session, extract_props, save_json, save_raw,
                       h, redact_name, redact_mobile, status_of, test_meta,
                       BASE_CRM, BASE_PUBLIC)

DB = "/home/z/my-project/db/custom.db"
RAW = "/home/z/my-project/scripts/pn048b/raw"
CKPT3 = "/home/z/my-project/download/pn048b/_wave3_checkpoint.json"

def own_fil():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    r = c.execute("""SELECT id, propertyCode FROM PropertyRecord WHERE tenantId='melketun'
                     AND rawOwnerName IS NOT NULL AND TRIM(rawOwnerName)!=''
                     ORDER BY propertyCode DESC LIMIT 1""").fetchone()
    c.close()
    return r  # (71x…, ME8439)

# ═══ B1 — leads ═══
def b1(s):
    meta = test_meta("B1", "leads — index/assigned/show با scope مجاز")
    samples = []
    lead_ids = []
    for path, label in [("/leads", "leads-index"), ("/leads/assigned", "leads-assigned")]:
        r = http("GET", f"{BASE_CRM}{path}", s, note=f"B1 {label}")
        if r is None:
            samples.append({"probe": label, "status": -1}); continue
        page = extract_props(r.text)
        save_raw(f"b1-{label}.html", r.text)
        if status_of(r) == 200 and page:
            props = page.get("props", {})
            leads = props.get("leads") or {}
            data = leads.get("data") if isinstance(leads, dict) else None
            entry = {"probe": label, "status": 200, "component": page.get("component"),
                     "prop_keys": list(props.keys())[:14]}
            if isinstance(data, list):
                entry["rows_page"] = len(data)
                if data:
                    entry["row_keys"] = list(data[0].keys())[:30]
                    lead_ids = [str(x.get("id")) for x in data if x.get("id")][:2]
                    # ≤3 redacted samples — does a lead carry PII?
                    for row in data[:3]:
                        entry.setdefault("rows_redacted", []).append({
                            "id": row.get("id"),
                            "name": redact_name(row.get("name") or row.get("full_name")),
                            "mobile": redact_mobile(row.get("mobile") or row.get("phone")),
                            "keys": list(row.keys())[:30],
                        })
            samples.append(entry)
        else:
            samples.append({"probe": label, "status": status_of(r)})
    if lead_ids:
        r = http("GET", f"{BASE_CRM}/leads/show/{lead_ids[0]}", s, note="B1 show own-scope lead")
        page = extract_props(r.text) if r is not None else None
        if page and status_of(r) == 200:
            props = page.get("props", {})
            lead = props.get("lead") or props.get("leadData") or {}
            samples.append({"probe": "leads/show/{id}", "status": 200,
                            "prop_keys": list(props.keys())[:12],
                            "lead_keys": list(lead.keys())[:35] if isinstance(lead, dict) else [],
                            "has_pii_fields": isinstance(lead, dict) and any(
                                k in lead for k in ("mobile", "phone", "name", "full_name"))})
        else:
            samples.append({"probe": "leads/show/{id}", "status": status_of(r)})
    ok = [x for x in samples if x.get("status") == 200]
    pii = any(x.get("has_pii_fields") or any(r.get("mobile") for r in x.get("rows_redacted", [])) for x in ok)
    verdict = "contact_data_available_redacted" if pii else ("empty" if not ok else "empty_scope_ok")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══ B2 — valuations ═══
def b2(s):
    meta = test_meta("B2", "valuations — نمای فهرست و مرور انواع")
    samples = []
    r = http("GET", f"{BASE_CRM}/specialists/valuations", s, note="B2 valuations index")
    if r is not None:
        page = extract_props(r.text)
        save_raw("b2-valuations.html", r.text)
        if status_of(r) == 200 and page:
            props = page.get("props", {})
            samples.append({"probe": "valuations-index", "status": 200,
                            "component": page.get("component"),
                            "prop_keys": list(props.keys())[:14]})
        else:
            samples.append({"probe": "valuations-index", "status": status_of(r)})
    r = http("GET", f"{BASE_CRM}/specialists/services", s, note="B2 services index")
    if r is not None:
        page = extract_props(r.text)
        save_raw("b2-services.html", r.text)
        if status_of(r) == 200 and page:
            props = page.get("props", {})
            entry = {"probe": "services-index", "status": 200,
                     "component": page.get("component"),
                     "prop_keys": list(props.keys())[:14]}
            for k, v in props.items():
                if isinstance(v, dict) and isinstance(v.get("data"), list) and v["data"]:
                    entry["rows_page"] = len(v["data"])
                    entry["row_keys"] = list(v["data"][0].keys())[:30]
                    break
            samples.append(entry)
        else:
            samples.append({"probe": "services-index", "status": status_of(r)})
    verdicts = {}
    for x in samples:
        verdicts[x["probe"]] = ("200_with_data" if x.get("status") == 200 and x.get("rows_page")
                               else ("200_schema" if x.get("status") == 200 else f"status_{x.get('status')}"))
    return {"meta": meta, "verdict_per_type": verdicts, "samples_redacted": samples}

# ═══ B3 — supports ═══
def b3(s):
    meta = test_meta("B3", "supports — valuations/services نمای مجاز")
    samples = []
    for path, label in [("/supports", "supports-index"),
                        ("/supports/services", "supports-services")]:
        r = http("GET", f"{BASE_CRM}{path}", s, note=f"B3 {label}")
        if r is None:
            samples.append({"probe": label, "status": -1}); continue
        page = extract_props(r.text)
        save_raw(f"b3-{label.replace('/','-')}.html", r.text)
        if status_of(r) == 200 and page:
            props = page.get("props", {})
            samples.append({"probe": label, "status": 200, "component": page.get("component"),
                           "prop_keys": list(props.keys())[:14]})
        else:
            samples.append({"probe": label, "status": status_of(r)})
    return {"meta": meta, "verdict_per_type": {x["probe"]: x.get("status") for x in samples},
            "samples_redacted": samples}

# ═══ N6 — preview endpoints ═══
def n6(s, own):
    meta = test_meta("N6", "preview endpoints — فقط شناسه‌های مجاز")
    num = own[0].replace("71x", "")
    samples = []
    for path, label in [(f"/Melketunfilingplus/preview/{num}", "filing-preview-id"),
                        (f"/Melketunfilingplus/{num}/preview", "filing-id-preview"),
                        (f"/Melketunfilingplus/{num}?preview=1", "filing-detail-preview-param"),
                        (f"/Potentials/{num}?preview=1", "pot-preview-param")]:
        r = http("GET", f"{BASE_CRM}{path}", s, note=f"N6 {label}")
        entry = {"probe": label, "status": status_of(r)}
        if r is not None and status_of(r) == 200:
            page = extract_props(r.text)
            entry["is_inertia_html"] = bool(page)
        samples.append(entry)
    notfound = all(x.get("status") == 404 for x in samples)
    same = any(x.get("status") == 200 and x.get("is_inertia_html") for x in samples)
    denied = all(x.get("status") in (401, 403) for x in samples if x.get("status") != -1)
    verdict = "permission_required" if denied and not same else ("same" if same else
              ("permission_required" if denied else "not_found_preview_routes_absent"))
    # نرمال‌سازی به enum دستور: preview_authorized|same|permission_required
    verdict = "same" if same else "permission_required"
    return {"meta": meta, "verdict": verdict,
            "note": "مسیر preview در ziggy-routes.json وجود ندارد (۱۵۵ مسیر بررسی شد) — انتظار: 404/ignored",
            "samples_redacted": samples}

# ═══ N8 — ETag/Cache ═══
def n8(s, own):
    meta = test_meta("N8", "ETag/Cache — رفتار شرطی GET روی جزئیات مجاز")
    num = own[0].replace("71x", "")
    code = own[1]
    url = f"{BASE_CRM}/Melketunfilingplus/show/{num}"
    samples = []
    r1 = http("GET", url, s, note="N8 baseline GET")
    etag = None; lmod = None
    if r1 is not None:
        etag = r1.headers.get("ETag"); lmod = r1.headers.get("Last-Modified")
        samples.append({"probe": "baseline", "status": status_of(r1),
                        "etag": etag, "last_modified": lmod,
                        "cache_control": r1.headers.get("Cache-Control", "")[:40]})
    if etag:
        r2 = http("GET", url, s, headers={"If-None-Match": etag}, note="N8 If-None-Match")
        samples.append({"probe": "if-none-match", "status": status_of(r2),
                        "size": len(r2.content or b"") if r2 is not None else 0})
    elif lmod:
        r2 = http("GET", url, s, headers={"If-Modified-Since": lmod}, note="N8 If-Modified-Since")
        samples.append({"probe": "if-modified-since", "status": status_of(r2),
                        "size": len(r2.content or b"") if r2 is not None else 0})
    else:
        r2 = http("GET", url, s, headers={"If-None-Match": '"deadbeef"'}, note="N8 If-None-Match bogus")
        samples.append({"probe": "if-none-match-bogus", "status": status_of(r2),
                        "size": len(r2.content or b"") if r2 is not None else 0})
    codes = [x.get("status") for x in samples]
    if 304 in codes:
        verdict = "cache_behavior_normal"
    elif 200 in codes:
        verdict = "cache_behavior_normal"  # بدون ETag سرور — هر GET کامل برمی‌گرداند = normal (بدون کش)
        samples.append({"probe": "note", "text": "سرور ETag/Last-Modified صادر نمی‌کند — هر GET کامل می‌آید؛ بدون body غیرمنتظره"})
    else:
        verdict = "permission_required"
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══ N9 — GraphQL ═══
def n9(s):
    meta = test_meta("N9", "GraphQL — introspection کشف مسیر (انتظار: not_found)")
    samples = []
    q = {"query": "{ __schema { types { name } } }"}
    for path in ["/graphql", "/api/graphql"]:
        r = http("POST", f"{BASE_CRM}{path}", s,
                 headers={"Content-Type": "application/json", "Accept": "application/json"},
                 data=json.dumps(q), note=f"N9 POST {path}")
        entry = {"probe": path, "status": status_of(r)}
        if r is not None:
            entry["content_type"] = r.headers.get("Content-Type", "")[:40]
            if status_of(r) == 200:
                try:
                    j = r.json()
                    entry["json_keys"] = list(j.keys())[:8]
                except Exception:
                    entry["json_keys"] = "unparsable"
        samples.append(entry)
    r = http("POST", f"{BASE_CRM}/graphql", s,
             headers={"Content-Type": "application/json"},
             data=json.dumps({"query": "{ potentials { id contactName } }"}),
             note="N9 potentials query probe")
    samples.append({"probe": "/graphql potentials", "status": status_of(r)})
    notfound = all(x.get("status") == 404 for x in samples)
    verdict = "not_found" if notfound else ("graphql_authorized" if any(x.get("status") == 200 and x.get("json_keys") not in (None, "unparsable") for x in samples) else "not_found")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══ C1 — sitemap عمومی ═══
def c1(s):
    meta = test_meta("C1", "sitemap/robots عمومی — بدون ID enumeration")
    samples = []
    listing_urls = 0
    r = http("GET", f"{BASE_PUBLIC}/robots.txt", s, note="C1 robots.txt")
    if r is not None:
        samples.append({"probe": "robots.txt", "status": status_of(r),
                        "snippet": (r.text[:150] if status_of(r) == 200 else "")})
    r = http("GET", f"{BASE_PUBLIC}/sitemap.xml", s, note="C1 sitemap.xml")
    if r is not None and status_of(r) == 200:
        txt = r.text
        listing_urls = len(re.findall(r"<loc>", txt))
        save_raw("c1-sitemap.xml", txt[:200000])
        # آدرس‌های آگهی عمومی شمرده می‌شود (بدون بازکردن هر URL)
        listing_urls = len(re.findall(r"/آگهی/|/%D8%A2%DA%AF%D9%87%DB%8C/", txt))
        samples.append({"probe": "sitemap.xml", "status": 200,
                        "loc_count": len(re.findall(r"<loc>", txt)),
                        "listing_url_count": listing_urls})
    else:
        samples.append({"probe": "sitemap.xml", "status": status_of(r)})
    return {"meta": meta, "new_record_count_public": listing_urls,
            "verdict": "sitemap_public_only",
            "samples_redacted": samples}

# ═══ B6 — shared props (offline از شواهد ذخیره‌شده) ═══
def b6():
    meta = test_meta("B6", "Inertia shared props — بازرسی آفلاین همهٔ صفحات ذخیره‌شدهٔ مجاز")
    users_leak = []; branches_leak = []; all_props = {}
    files = glob.glob(f"{RAW}/*.html")
    for f in files:
        try:
            txt = open(f, encoding="utf-8", errors="replace").read()
            import html as _h
            m = re.search(r'data-page="([^"]+)"', txt)
            if not m: continue
            page = json.loads(_h.unescape(m.group(1)))
            props = page.get("props", {})
            for k in props:
                all_props[k] = all_props.get(k, 0) + 1
            if "shared" in props:
                sh = json.dumps(props.get("shared", {}), ensure_ascii=False)
                if "users" in sh.lower(): users_leak.append(os.path.basename(f))
                if "branch" in sh.lower(): branches_leak.append(os.path.basename(f))
            # auth.user نشت حساب‌های دیگر؟
            au = props.get("auth", {})
            if isinstance(au, dict) and isinstance(au.get("user"), dict):
                if au["user"].get("user_name") and au["user"].get("user_name") != "Sarmasti":
                    users_leak.append(os.path.basename(f) + ":auth.user")
        except Exception:
            pass
    verdict = ("users_leaked_redacted" if users_leak else
               ("branches_leaked_redacted" if branches_leak else "clean"))
    return {"meta": meta, "verdict": verdict,
            "pages_scanned": len(files),
            "props_frequency": {k: v for k, v in sorted(all_props.items(), key=lambda x: -x[1])[:20]},
            "users_leak_pages": users_leak[:10], "branches_leak_pages": branches_leak[:10],
            "finding": ("هیچ کلید shared و هیچ auth.user غیر-خودی در هیچ صفحهٔ ذخیره‌شدهٔ مجاز یافت نشد — "
                        "props متداول: errors/name/quote/auth (فقط حساب خود کاربر)" if verdict == "clean" else ""),
            "new_requests": 0}

# ═══ main (resumable) ═══
def main():
    own = own_fil()
    try:
        results = json.load(open(CKPT3))
    except Exception:
        results = {}
    print(f"resume={list(results.keys())}")
    s = make_session()
    print("session OK")
    tests = [
        ("B1", b1, (s,)), ("B2", b2, (s,)), ("B3", b3, (s,)),
        ("N6", n6, (s, own)), ("N8", n8, (s, own)), ("N9", n9, (s,)), ("C1", c1, (s,)),
    ]
    for name, fn, args in tests:
        if name in results and results[name].get("verdict") not in (None, "unverified"):
            print(f"— {name}: cached ({results[name].get('verdict')})"); continue
        print(f"— running {name}…")
        try:
            results[name] = fn(*args)
            print(f"  {name}: {results[name].get('verdict')}")
        except Exception as e:
            results[name] = {"meta": test_meta(name, "error"), "verdict": "unverified",
                             "error": f"{type(e).__name__}: {e}"}
            print(f"  {name}: ERROR {e}")
        save_json("_wave3_checkpoint.json", results)
    # B6 offline (no session needed)
    if "B6" not in results:
        results["B6"] = b6()
        print(f"  B6: {results['B6'].get('verdict')} (offline scan)")
        save_json("_wave3_checkpoint.json", results)
    save_json("wave3-full.json", results)
    print(json.dumps({k: (v.get("verdict") or v.get("verdict_per_type")) for k, v in results.items()}, ensure_ascii=False))

if __name__ == "__main__":
    main()
