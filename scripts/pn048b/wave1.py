#!/usr/bin/env python3
"""DIR-PN048B — Wave 1 [P0] — برد فوری
دستورها: T3 (public-site origin) · A1 (potential-edit) · A2 (filing-edit) ·
          A3 (listview params) · A6 (search scope) · B4 (GetFromVTiger) · N4 (format=json)
Laws: 01-15 · Guardians: G4 (rate limit) · G7 (redaction gate) · max 10 samples/test.
Every artifact carries: role / purpose / allowed_fields / redaction_level.
"""
import json, re, sqlite3, sys, urllib.parse, pathlib
sys.path.insert(0, "/home/z/my-project/scripts/pn048b")
from audit_lib import (status_of,http, make_session, extract_props, save_json, save_raw,
                       h, redact_name, redact_mobile, test_meta, BASE_CRM, BASE_PUBLIC,
                       UA_MOBILE, REQ_LOG, TOTAL_REQUESTS)

DB = "/home/z/my-project/db/custom.db"

def own_ids():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    fil = c.execute("""SELECT id, propertyCode, publicUrl, rawOwnerName, ownerMobile
                        FROM PropertyRecord WHERE tenantId='melketun'
                        AND rawOwnerName IS NOT NULL AND TRIM(rawOwnerName)!=''
                        ORDER BY propertyCode DESC LIMIT 10""").fetchall()
    req = c.execute("""SELECT id, requestCode, customerName, customerMobile
                       FROM RequestRecord WHERE tenantId='melketun'
                       AND customerMobile IS NOT NULL AND customerMobile!=''
                       ORDER BY requestCode DESC LIMIT 10""").fetchall()
    # non-own filings WITH publicUrl (for T3 comparison across agents)
    nonown = c.execute("""SELECT propertyCode, publicUrl, ownerName
                          FROM PropertyRecord WHERE tenantId='melketun'
                          AND (rawOwnerName IS NULL OR TRIM(rawOwnerName)='')
                          AND publicUrl IS NOT NULL AND publicUrl!=''
                          AND ownerName IS NOT NULL AND TRIM(ownerName)!=''
                          ORDER BY propertyCode DESC LIMIT 2""").fetchall()
    c.close()
    return fil, req, nonown

# ═══════════════════ T3 — public site owner origin ═══════════════════
def t3(s, own_filings, nonown):
    meta = test_meta("T3", "منشأ owner.mobile در سایت عمومی — ۵ نمونهٔ مجاز (صفحات عمومی)")
    samples = []
    # 3 own + 2 non-own
    picked = [(f[1], f[2], f[3], f[4], "own") for f in own_filings[:3] if f[2]]
    picked += [(n[0], n[1], None, None, "non_own") for n in nonown[:2]]
    for code, purl, true_owner_name, true_owner_mobile, kind in picked:
        url = BASE_PUBLIC + urllib.parse.quote(purl, safe="/-")
        r = http("GET", url, s, note=f"T3 public page {code}")
        if r is None or r.status_code != 200:
            samples.append({"code": code, "kind": kind, "status": status_of(r),
                            "verdict_sample": "fetch_failed"})
            continue
        html = r.text
        save_raw(f"t3-{code}.html", html)
        # extract embedded owner object from SSR payload (&quot;-escaped JSON)
        m = re.search(r'&quot;owner&quot;:\{(.*?)\},&quot;code&quot;', html)
        owner = {}
        if m:
            blob = m.group(1)
            for k in ("name", "mobile", "id"):
                km = re.search(rf'&quot;{k}&quot;:([^,&]+)', blob)
                if km: owner[k] = km.group(1).strip('"')
        page_name_hash = h(owner.get("name"))
        page_mobile_hash = h(re.sub(r"\D", "", owner.get("mobile") or ""))
        truth_name_hash = h(true_owner_name)
        truth_mobile_hash = h(re.sub(r"\D", "", true_owner_mobile or ""))
        # is the page's "owner" actually the real property owner or the agent?
        if kind == "own" and truth_name_hash:
            origin = "owner" if page_name_hash == truth_name_hash else (
                     "realtor" if owner.get("name") else "unknown")
        elif kind == "own" and truth_mobile_hash:
            origin = "owner" if page_mobile_hash == truth_mobile_hash else (
                     "realtor" if owner.get("mobile") else "unknown")
        else:
            # non-own: compare page owner name to DB ownerName (= resolved expert/agency name)
            origin = "realtor_likely" if owner.get("name") else "unknown"
        samples.append({
            "code": code, "kind": kind, "http": 200,
            "public_owner_name": redact_name(owner.get("name")),
            "public_owner_mobile": redact_mobile(owner.get("mobile")),
            "public_owner_siteid": owner.get("id"),
            "truth_owner_name_hash": truth_name_hash,
            "truth_owner_mobile_hash": truth_mobile_hash,
            "match_owner_name": (page_name_hash == truth_name_hash) if truth_name_hash else None,
            "match_owner_mobile": (page_mobile_hash == truth_mobile_hash) if truth_mobile_hash else None,
            "origin_sample": origin,
        })
    verdict = "realtor"  # refined below
    own_s = [x for x in samples if x.get("kind") == "own" and "match_owner_name" in x]
    if own_s:
        m_all = [x["match_owner_name"] for x in own_s if x["match_owner_name"] is not None]
        if m_all and all(m_all): verdict = "owner"
        elif m_all and not any(m_all): verdict = "realtor"
        else: verdict = "mixed"
    else:
        verdict = "unknown"
    return {"meta": meta, "verdict": verdict,
            "finding": "«مالک» در سایت عمومی = کارشناس مسئول آگهی است (نمای agent)، نه مالک واقعی ملک — شاهد: نمونهٔ own با rawOwnerName معلوم" if verdict == "realtor" else "",
            "samples_redacted": samples}

# ═══════════════════ A1 — potential edit (own 10 ids) ═══════════════════
def a1(s, own_requests):
    meta = test_meta("A1", "potential-edit — props بازرسی برای ۱۰ شناسهٔ مجاز خودی")
    samples = []
    for i, (rid, code, cname, cmobile) in enumerate(own_requests[:9]):
        num = rid.replace("13x", "")
        url = f"{BASE_CRM}/potential/edit/{num}"
        r = http("GET", url, s, note=f"A1 own request {code}")
        if r is None:
            samples.append({"code": code, "status": -1}); continue
        html = r.text
        save_raw(f"a1-{code}.html", html)
        page = extract_props(html)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            blob = json.dumps(props, ensure_ascii=False)
            has_customer_name = "customerName" in blob or "contact_name" in blob
            has_customer_mobile = "mobile" in blob.lower() or "phone" in blob.lower()
            # collect top-level prop keys + presence flags only
            keys = list(props.keys())
            rec = props.get("record") or props.get("data") or props.get("potential")
            rec_keys = list(rec.keys())[:40] if isinstance(rec, dict) else []
            samples.append({"code": code, "status": 200, "component": page.get("component"),
                            "prop_keys": keys, "record_keys": rec_keys,
                            "customer_name_field_present": has_customer_name,
                            "mobile_like_field_present": has_customer_mobile})
        else:
            samples.append({"code": code, "status": r.status_code})
    # 1 literal-path probe (directive's form) on first id
    rid0 = own_requests[0][0]
    r = http("GET", f"{BASE_CRM}/Potentials/{rid0}/edit", s, note="A1 literal path probe")
    samples.append({"code": own_requests[0][1], "status": status_of(r),
                    "path": "/Potentials/{id}/edit", "verdict_sample": "literal_path"})
    ok200 = [x for x in samples if x.get("status") == 200]
    if ok200:
        verdict = "values_present_redacted" if any(x.get("record_keys") for x in ok200) else "schema_only"
    elif all(x.get("status") in (401, 403) for x in samples if x.get("status") != -1):
        verdict = "permission_required"
    else:
        verdict = "schema_only" if any(x.get("status") == 200 for x in samples) else "permission_required"
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════════════ A2 — filing edit (own 10 ids) ═══════════════════
def a2(s, own_filings):
    meta = test_meta("A2", "filing-edit — بازرسی ownerName/ownerMobile/address با redaction · تفکیک ۴۰۳ از ۵۰۰")
    samples = []
    for i, (fid, code, purl, oname, omobile) in enumerate(own_filings[:8]):
        num = fid.replace("71x", "")
        r = http("GET", f"{BASE_CRM}/filing/edit/{num}", s, note=f"A2 own filing {code}")
        if r is None:
            samples.append({"code": code, "status": -1}); continue
        html = r.text
        save_raw(f"a2-{code}.html", html)
        page = extract_props(html)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            blob = json.dumps(props, ensure_ascii=False)
            keys = list(props.keys())
            rec = None
            for k in ("record", "filing", "data"):
                if isinstance(props.get(k), dict): rec = props[k]; break
            rec_keys = list(rec.keys())[:50] if isinstance(rec, dict) else []
            # field-level presence for PII fields (names hashed if present in values)
            vals = {}
            if isinstance(rec, dict):
                for fk in ("owner_name", "ownerName", "ownerName", "name"):
                    if fk in rec and rec[fk]: vals["owner_name_present"] = True
                for fk in ("owner_phone", "owner_phone", "ownerMobile", "phone"):
                    if fk in rec and rec[fk]: vals["owner_mobile_present"] = True
                for fk in ("address", "address"):
                    if fk in rec and rec[fk]: vals["address_present"] = True
            samples.append({"code": code, "status": 200, "component": page.get("component"),
                            "prop_keys": keys, "record_keys": rec_keys, **vals})
        else:
            samples.append({"code": code, "status": r.status_code,
                            "status_class": "403_forbidden" if r.status_code == 403 else
                                            ("500_server_error" if r.status_code >= 500 else f"other_{r.status_code}")})
    # literal path probes (directive's two forms) — samples 9 & 10
    f0 = own_filings[0]
    r = http("GET", f"{BASE_CRM}/Melketunfilingplus/{f0[0]}/edit", s, note="A2 literal path 1")
    samples.append({"code": f0[1], "status": status_of(r), "path": "/Melketunfilingplus/{id}/edit"})
    r = http("GET", f"{BASE_CRM}/Melketunfilingplus/edit/{f0[0].replace('71x','')}", s, note="A2 literal path 2")
    samples.append({"code": f0[1], "status": status_of(r), "path": "/Melketunfilingplus/edit/{id}"})
    ok200 = [x for x in samples if x.get("status") == 200]
    err500 = [x for x in samples if x.get("status", 0) >= 500]
    p403 = [x for x in samples if x.get("status") == 403]
    if ok200 and any(x.get("record_keys") for x in ok200):
        verdict = "values_present_redacted"
    elif err500 and not ok200:
        verdict = "error_500"
    elif p403 and not ok200:
        verdict = "permission_required"
    elif ok200:
        verdict = "schema_only"
    else:
        verdict = "permission_required"
    return {"meta": meta, "verdict": verdict,
            "breakdown": {"200": len(ok200), "403": len(p403), "5xx": len(err500)},
            "samples_redacted": samples}

# ═══════════════════ A3 — listview params ═══════════════════
def a3(s):
    meta = test_meta("A3", "پارامترهای Vtiger — کشف محدودیت صفحه‌بندی (نه دور زدن scope)")
    samples = []
    def probe(path, label):
        url = f"{BASE_CRM}{path}"
        r = http("GET", url, s, note=f"A3 {label}")
        if r is None:
            samples.append({"probe": label, "status": -1}); return None
        html = r.text
        save_raw(f"a3-{label.replace('?','_').replace('&','_').replace('=','-')[:60]}.html", html)
        page = extract_props(html)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            rows = 0; total = None; first_row_keys = []
            for k, v in props.items():
                if isinstance(v, dict) and isinstance(v.get("data"), list):
                    rows = len(v["data"]); total = v.get("total") or v.get("last_page")
                    if v["data"]: first_row_keys = list(v["data"][0].keys())[:30]
                    break
            samples.append({"probe": label, "status": 200, "rows_page": rows,
                            "pagination_meta": str(total), "row_keys": first_row_keys,
                            "component": page.get("component")})
            return rows
        samples.append({"probe": label, "status": r.status_code,
                        "redirect_to": r.headers.get("Location", "")[:60] if r.status_code in (301,302,303) else None})
        return None
    # baseline + params on /Melketunfilingplus (6)
    b1 = probe("/Melketunfilingplus", "filing-baseline")
    probe("/Melketunfilingplus?viewname=All", "filing-viewname-All")
    b2 = probe("/Melketunfilingplus?pageSize=100", "filing-pageSize-100")
    probe("/Melketunfilingplus?filter=all", "filing-filter-all")
    probe("/Melketunfilingplus?scope=all", "filing-scope-all")
    probe("/Melketunfilingplus?status=all", "filing-status-all")
    # baseline + params on /Potentials (4)
    b3 = probe("/Potentials", "pot-baseline")
    probe("/Potentials?viewname=All", "pot-viewname-All")
    b4 = probe("/Potentials?pageSize=100", "pot-pageSize-100")
    probe("/Potentials?search=&q=", "pot-search-empty")
    rows_diff = any(s_.get("rows_page") and b1 and s_["rows_page"] != b1 for s_ in samples[1:6] if s_.get("rows_page"))
    if b1 is None and b3 is None and all(x.get("status") in (301, 302, 303, 401, 403) for x in samples if "status" in x):
        verdict = "permission_required"
    elif b2 and b1 and b2 > b1:
        verdict = "pagination_expandable"
    elif b4 and b3 and b4 > b3:
        verdict = "pagination_expandable"
    elif rows_diff:
        verdict = "pagination_expandable"
    else:
        verdict = "no_change"
    return {"meta": meta, "verdict": verdict,
            "note": "هدف: کشف محدودیت صفحه‌بندی در دامنهٔ مجاز، نه دور زدن scope",
            "samples_redacted": samples}

# ═══════════════════ A6 — search scope ═══════════════════
def a6(s):
    meta = test_meta("A6", "search scope — آیا جستجو فقط در دامنهٔ مجاز برمی‌گردد؟")
    samples = []
    substitution_note = ("جستجوی نام اشخاص (آبرسان/نصر) با واژه‌های عمومی (آپارتمان/خریدار) "
                         "جایگزین شد — همان سنجهٔ scope با حداقل قرینهٔ PII ثالث؛ "
                         "منع enumeration و رعایت G7.")
    def search(base_path, kw, label):
        url = f"{BASE_CRM}{base_path.replace('{kw}', urllib.parse.quote(kw))}"
        r = http("GET", url, s, note=f"A6 {label}")
        if r is None:
            samples.append({"probe": label, "status": -1}); return
        page = extract_props(r.text)
        save_raw(f"a6-{label}.html", r.text)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            for k, v in props.items():
                if isinstance(v, dict) and isinstance(v.get("data"), list):
                    rows = v["data"]
                    assigned = {}
                    own_share = 0
                    for row in rows[:10]:
                        au = row.get("assignedUser") or row.get("assigned_user")
                        assigned[str(au)] = assigned.get(str(au), 0) + 1
                        if str(au) == "19x617": own_share += 1
                    samples.append({"probe": label, "status": 200, "rows_page": len(rows),
                                    "assigned_user_distribution": assigned,
                                    "any_own_rows": own_share > 0,
                                    "row_keys": list(rows[0].keys())[:25] if rows else []})
                    return
            samples.append({"probe": label, "status": 200, "rows_page": 0, "props_keys": list(props.keys())})
        else:
            samples.append({"probe": label, "status": r.status_code})
    search("/Melketunfilingplus/search/{kw}/1", "آپارتمان", "filing-search-apartment")
    search("/Melketunfilingplus/search/{kw}/1", "خریدار", "filing-search-kharidar")
    search("/Potentials/search/{kw}/1", "آپارتمان", "pot-search-apartment")
    search("/Potentials/search/{kw}/1", "خریدار", "pot-search-kharidar")
    search("/Melketunfilingplus?search_value=آپارتمان", "آپارتمان", "filing-search-value-param")
    search("/Potentials?q=آپارتمان", "آپارتمان", "pot-q-param")
    # scope verdict: if search results include rows assigned to other users → scope wider than own
    wide = any(s_.get("assigned_user_distribution") and
               any(str(k) not in ("19x617", "None", "null") for k in s_["assigned_user_distribution"])
               for s_ in samples if s_.get("status") == 200)
    all_denied = all(s_.get("status") in (401, 403, 301, 302) for s_ in samples if "status" in s_)
    verdict = "scope_limited" if all_denied else ("scope_authorized" if wide else "scope_limited")
    return {"meta": meta, "verdict": verdict, "substitution_note": substitution_note,
            "verdict_criterion": "نتیجهٔ جستجو شامل ردیف‌های متعلق به کاربران دیگر = scope_authorized (عرض دامنه)؛ فقط خودی/عمومی = scope_limited",
            "samples_redacted": samples}

# ═══════════════════ B4 — property/GetFromVTiger ═══════════════════
def b4(s, own_filings):
    meta = test_meta("B4", "properties/GetFromVTiger با session مجاز — ?id/?code/?type با شناسه‌های خودی")
    samples = []
    fid = own_filings[0][0]; num = fid.replace("71x", ""); code = own_filings[0][1]
    probes = [
        (f"{BASE_CRM}/property/GetFromVTiger?id={num}", "crm?id=own"),
        (f"{BASE_CRM}/property/GetFromVTiger?code={code}", "crm?code=own"),
        (f"{BASE_CRM}/property/GetFromVTiger?type=listing", "crm?type=listing"),
        (f"{BASE_PUBLIC}/property/GetFromVTiger?id={num}", "public?id=own"),
    ]
    for url, label in probes:
        r = http("GET", url, s, note=f"B4 {label}")
        st = status_of(r)
        entry = {"probe": label, "status": st}
        if r is not None:
            ct = r.headers.get("Content-Type", "")
            entry["content_type"] = ct[:40]
            entry["json_body"] = r.headers.get("Content-Type", "").startswith("application/json")
        samples.append(entry)
    notfound = all(x.get("status") == 404 for x in samples)
    denied = all(x.get("status") in (401, 403, 302) for x in samples if x.get("status") != -1)
    opened = any(x.get("status") == 200 and x.get("json_body") for x in samples)
    verdict = "not_found" if notfound else ("open_with_session" if opened else
             ("permission_required" if denied else "not_found"))
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════════════ N4 — format=json contract ═══════════════════
def n4(s, own_filings, own_requests):
    meta = test_meta("N4", "قرارداد JSON — XHR / ?format=json / Accept روی لیست و جزئیات مجاز")
    samples = []
    fnum = own_filings[0][0].replace("71x", "")
    rnum = own_requests[0][0].replace("13x", "")
    endpoints = [
        ("list-filings", f"{BASE_CRM}/Melketunfilingplus"),
        ("list-potentials", f"{BASE_CRM}/Potentials"),
        ("detail-own-filing", f"{BASE_CRM}/MelketunPublicFilingPlus/{own_filings[0][1]}"),
        ("detail-own-potential", f"{BASE_CRM}/PublicPotentials"),
    ]
    for name, url in endpoints:
        for variant, hdr in [("xhr", {"X-Requested-With": "XMLHttpRequest"}),
                            ("accept-json", {"Accept": "application/json"})]:
            r = http("GET", url + ("?format=json" if variant == "xhr" else ""), s,
                     headers=hdr, note=f"N4 {name} {variant}")
            if r is None:
                samples.append({"endpoint": name, "variant": variant, "status": -1}); continue
            ct = r.headers.get("Content-Type", "")
            is_json = "json" in ct
            page = None
            if not is_json:
                page = extract_props(r.text)
            samples.append({"endpoint": name, "variant": variant, "status": r.status_code,
                            "content_type": ct[:40], "is_json": is_json,
                            "inertia_component": (page or {}).get("component") if page else None})
    json_found = any(x.get("is_json") and x.get("status") == 200 for x in samples)
    denied = all(x.get("status") in (401, 403) for x in samples if x.get("status") != -1)
    verdict = "json_contract" if json_found else ("permission_required" if denied else "inertia_html")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════════════ main (resumable — checkpoint per test) ═══════════════════
CKPT = "/home/z/my-project/download/pn048b/_wave1_checkpoint.json"

def load_ckpt():
    try:
        return json.load(open(CKPT))
    except Exception:
        return {}

def main():
    import os
    fil, reqs, nonown = own_ids()
    results = load_ckpt()
    print(f"own filings: {len(fil)} · own requests: {len(reqs)} · resume={list(results.keys())}")
    s = make_session()
    print("session OK")

    for name, fn, args in [
        ("T3", t3, (fil, nonown)),
        ("A1", a1, (reqs,)),
        ("A2", a2, (fil,)),
        ("A3", a3, ()),
        ("A6", a6, ()),
        ("B4", b4, (fil,)),
        ("N4", n4, (fil, reqs)),
    ]:
        if name in results and results[name].get("verdict") not in (None, "unverified"):
            print(f"— {name}: cached ({results[name].get('verdict')})")
            continue
        print(f"— running {name}…")
        try:
            results[name] = fn(s, *args)
            print(f"  {name}: verdict={results[name].get('verdict')}")
        except Exception as e:
            results[name] = {"meta": test_meta(name, "error"), "verdict": "unverified",
                             "error": f"{type(e).__name__}: {e}"}
            print(f"  {name}: ERROR {e}")
        # checkpoint per test (G4)
        save_json("_wave1_checkpoint.json", results)

    save_json("wave1-full.json", results)
    print(json.dumps({k: v.get("verdict") for k, v in results.items()}, ensure_ascii=False))
    n = sum(1 for _ in open("/home/z/my-project/scripts/pn048b/audit-request-log.jsonl"))
    print(f"TOTAL_REQUESTS(log)={n}")

if __name__ == "__main__":
    main()
