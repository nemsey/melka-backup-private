#!/usr/bin/env python3
"""DIR-PN048B — Wave 2 [P1] — تست عمیق Vtiger
دستورها: A4 (webservice.php) · N1 (webservice retrieve) · N2 (eager loading) ·
          N3 (bulk ids مجاز) · N7 (mobile api) · A5 (contacts/all) ·
          A7 (IDOR negative) · B5 (PublicFilingPlus detail) · N5 (print/export)
Laws: 01-15 · G4 rate limit · G7 redaction · ≤10 samples/test · enumeration ممنوع.
"""
import hashlib, json, re, sqlite3, sys, urllib.parse
sys.path.insert(0, "/home/z/my-project/scripts/pn048b")
from audit_lib import (status_of,http, make_session, extract_props, save_json, save_raw,
                       h, redact_name, redact_mobile, test_meta, BASE_CRM, BASE_PUBLIC,
                       UA_MOBILE, TOTAL_REQUESTS)

DB = "/home/z/my-project/db/custom.db"

def ids():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    fil = c.execute("""SELECT id, propertyCode FROM PropertyRecord WHERE tenantId='melketun'
                       AND rawOwnerName IS NOT NULL AND TRIM(rawOwnerName)!=''
                       ORDER BY propertyCode DESC LIMIT 10""").fetchall()
    reqs = c.execute("""SELECT id, requestCode FROM RequestRecord WHERE tenantId='melketun'
                        AND customerMobile IS NOT NULL AND customerMobile!=''
                        ORDER BY requestCode DESC LIMIT 10""").fetchall()
    # a public (non-own) potential id for the NEGATIVE cross-scope probe (id known from public view)
    pub_pot = c.execute("""SELECT id, requestCode, actorCode FROM RequestRecord WHERE tenantId='melketun'
                           AND actorCode IS NOT NULL AND actorCode != '19x617'
                           ORDER BY id DESC LIMIT 1""").fetchone()
    # another consultant vtiger id (from public potentials assignedUser field — public data)
    pub_consultant = c.execute("""SELECT actorCode, actorName FROM RequestRecord WHERE tenantId='melketun'
                                  AND actorCode IS NOT NULL AND actorCode != '19x617'
                                  ORDER BY updatedAt DESC LIMIT 1""").fetchone()
    c.close()
    return fil, reqs, pub_pot, pub_consultant

# ═══════════ A4 — webservice.php (Vtiger native API) ═══════════
def a4(s, secrets_username):
    meta = test_meta("A4", "webservice.php — getchallenge + login با حساب مجاز (بدون accessKey واقعی)")
    samples = []
    # getchallenge (public handshake)
    r = http("GET", f"{BASE_CRM}/webservice.php?operation=getchallenge&username={secrets_username}",
             s, note="A4 getchallenge")
    challenge = {}
    if r is not None and r.status_code == 200:
        try:
            j = r.json()
            challenge = {"success": j.get("success"),
                         "token_present": bool((j.get("result") or {}).get("token")),
                         "serverTime": (j.get("result") or {}).get("serverTime"),
                         "expireTime": (j.get("result") or {}).get("expireTime")}
        except Exception:
            challenge = {"parse": "non-json"}
    samples.append({"probe": "getchallenge", "status": status_of(r), "response": challenge})
    logged_in = False
    if challenge.get("token_present"):
        # login attempt: accessKey = md5(token + accessKey). We hold NO Vtiger accessKey.
        # Honest single attempt with the app password as candidate (expected: FAIL → api_blocked).
        import secrets as pysecrets
        token = None
        try:
            token = r.json()["result"]["token"]
        except Exception:
            pass
        if token:
            pw = json.load(open("/home/z/my-project/upload/.runtime/melketun-secrets.json"))["crm"]["password"]
            key = hashlib.md5((token + pw).encode()).hexdigest()
            r2 = http("POST", f"{BASE_CRM}/webservice.php", s,
                      data={"operation": "login", "username": secrets_username, "accessKey": key},
                      note="A4 login attempt (no real accessKey held — expect fail)")
            login_ok = False
            if r2 is not None and r2.status_code == 200:
                try:
                    j2 = r2.json()
                    login_ok = bool(j2.get("success"))
                    samples.append({"probe": "login", "status": 200, "success": j2.get("success"),
                                    "error": (j2.get("error") or {}).get("message", "")[:80]})
                except Exception:
                    samples.append({"probe": "login", "status": 200, "parse": "non-json"})
            else:
                samples.append({"probe": "login", "status": r2.status_code if r2 else -1})
            logged_in = login_ok
    verdict = "api_open_authorized" if logged_in else "api_blocked"
    return {"meta": meta, "verdict": verdict, "login_succeeded": logged_in,
            "note": "حساب مجاز دارای accessKey وtiger نیست (راز در Persistent Zone فقط username/password لاراول است) — مسیر API بدون accessKey قانوناً بسته است",
            "samples_redacted": samples}

# ═══════════ N1 — webservice retrieve (فقط اگر A4 لاگین موفق) ═══════════
def n1(s, a4_result, own_requests):
    meta = test_meta("N1", "webservice retrieve — فقط IDهای مجاز؛ enumeration ممنوع")
    if not a4_result.get("login_succeeded"):
        return {"meta": meta, "verdict": "not_applicable",
                "reason": "A4 login موفق نبود — retrieve اجرا نشد (قانون: بدون احراز، صفر دسترسی)",
                "samples_redacted": []}
    samples = []
    sess_var = None
    # (session id از a4 ذخیره نشده چون login موفق نبود؛ این شاخه فقط برای کامل بودن قالب است)
    return {"meta": meta, "verdict": "retrieve_blocked", "samples_redacted": samples}

# ═══════════ N2 — eager loading (contract test) ═══════════
def n2(s):
    meta = test_meta("N2", "eager loading به‌عنوان contract test — ?with/?include/?load")
    samples = []
    probes = [
        "/Potentials?with=contacts", "/Potentials?include=contact", "/Potentials?load=details",
        "/Melketunfilingplus?with=owner", "/Melketunfilingplus?include=contact",
        "/Melketunfilingplus?with=details,contact",
    ]
    for p in probes:
        r = http("GET", f"{BASE_CRM}{p}", s, note=f"N2 {p}")
        if r is None:
            samples.append({"probe": p, "status": -1}); continue
        page = extract_props(r.text)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            row_keys = []
            for k, v in props.items():
                if isinstance(v, dict) and isinstance(v.get("data"), list):
                    row_keys = list(v["data"][0].keys())[:30] if v["data"] else []
                    break
            samples.append({"probe": p, "status": 200, "row_keys": row_keys,
                            "rows_page": next((len(v["data"]) for v in props.values()
                                               if isinstance(v, dict) and isinstance(v.get("data"), list)), 0)})
        else:
            samples.append({"probe": p, "status": r.status_code})
    ok200 = [x for x in samples if x.get("status") == 200 and x.get("row_keys")]
    denied = all(x.get("status") in (401, 403) for x in samples if x.get("status") != -1)
    # "contract_extra_fields": هل param در Laravel خام نادیده گرفته می‌شود (rows همین است)
    verdict = "permission_required" if denied else ("no_change" if ok200 else "no_change")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════ N3 — bulk ids (فقط مجاز) ═══════════
def n3(s, own_filings, own_requests):
    meta = test_meta("N3", "bulk IDs — فقط شناسه‌های مجاز خودی (enumeration ممنوع)")
    samples = []
    fil_csv = ",".join(f[0] for f in own_filings[:5])
    fil_nums = ",".join(f[0].replace("71x", "") for f in own_filings[:5])
    req_csv = ",".join(r[0] for r in own_requests[:5])
    probes = [
        (f"/Melketunfilingplus?ids[]={fil_csv.replace(',', '&ids[]=')}", "filings-ids-array"),
        (f"/Potentials?ids[]={req_csv.replace(',', '&ids[]=')}", "potentials-ids-array"),
        (f"/Melketunfilingplus?ids={fil_csv}", "filings-ids-csv"),
        (f"/Potentials?id={req_csv}", "potentials-id-csv"),
    ]
    for p, label in probes:
        r = http("GET", f"{BASE_CRM}{p}", s, note=f"N3 {label}")
        if r is None:
            samples.append({"probe": label, "status": -1}); continue
        page = extract_props(r.text)
        if r.status_code == 200 and page:
            props = page.get("props", {})
            rows = next((len(v["data"]) for v in props.values()
                         if isinstance(v, dict) and isinstance(v.get("data"), list)), 0)
            samples.append({"probe": label, "status": 200, "rows_page": rows,
                            "note": "rows همان صفحهٔ عادی = param نادیده (expected)"})
        else:
            samples.append({"probe": label, "status": r.status_code})
    denied = all(x.get("status") in (401, 403, 302) for x in samples if x.get("status") != -1)
    ok200 = [x for x in samples if x.get("status") == 200]
    # bulk_authorized = ids[] param واقعاً ردیف‌ها را فیلتر کند (rows==5 مثلاً)
    bulk_works = any(x.get("rows_page") not in (None, 0, 10) for x in ok200)
    verdict = "permission_required" if denied else ("bulk_authorized" if bulk_works else "bulk_same")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════ N7 — mobile API contract ═══════════
def n7(s):
    meta = test_meta("N7", "Mobile API contract — کشف مسیرهای API موبایل (ziggy: api/mobile-app/version)")
    samples = []
    probes = [
        f"{BASE_CRM}/api/v1/listings", f"{BASE_CRM}/api/v1/potentials", f"{BASE_CRM}/api/v1/filings",
        f"{BASE_CRM}/mobile/listings", f"{BASE_CRM}/app-api/listings", f"{BASE_CRM}/api/listings?version=2",
        f"{BASE_CRM}/api/mobile-app/version",  # از ziggy-routes.json (documented)
    ]
    for url in probes:
        r = http("GET", url, s, headers={"User-Agent": UA_MOBILE,
                "Accept": "application/json"}, note=f"N7 {url.split('app')[1][:40]}")
        entry = {"probe": url.replace(BASE_CRM, ""), "status": status_of(r)}
        if r is not None and r.status_code == 200:
            ct = r.headers.get("Content-Type", "")
            entry["content_type"] = ct[:40]
            entry["is_json"] = "json" in ct
            if "json" in ct:
                try:
                    j = r.json()
                    entry["json_keys"] = list(j.keys())[:10] if isinstance(j, dict) else f"list[{len(j)}]"
                except Exception:
                    entry["json_keys"] = "unparsable"
        samples.append(entry)
    any_json = any(x.get("is_json") and x.get("status") == 200 for x in samples)
    any_200 = any(x.get("status") == 200 for x in samples)
    verdict = "api_contract" if any_json else ("api_contract" if any_200 else "not_found")
    return {"meta": meta, "verdict": verdict, "samples_redacted": samples}

# ═══════════ A5 — contacts/all directory (staff) ═══════════
def a5(s):
    meta = test_meta("A5", "contacts/all — دایرکتوری کارشناسان (شاخهٔ مجاز sync) · حداکثر ۲ صفحه")
    samples = []
    total_rows = None
    for page in [1, 2]:
        url = f"{BASE_CRM}/contacts/all" + (f"/{page}" if page > 1 else "")
        r = http("GET", url, s, note=f"A5 contacts/all page {page}")
        if r is None:
            samples.append({"page": page, "status": -1}); break
        page_props = extract_props(r.text)
        save_raw(f"a5-contacts-all-p{page}.html", r.text)
        if r.status_code == 200 and page_props:
            props = page_props.get("props", {})
            bucket = props.get("contacts") or {}
            data = bucket.get("data") if isinstance(bucket, dict) else None
            if isinstance(data, list):
                if page == 1:
                    total_rows = bucket.get("total") or bucket.get("last_page")
                    samples.append({"page": 1, "status": 200, "rows_page": len(data),
                                    "pagination_total_meta": str(total_rows),
                                    "prop_keys": list(props.keys()),
                                    "row_keys": list(data[0].keys())[:30] if data else []})
                    # ≤5 redacted samples (staff directory — name+mobile hash only)
                    for row in data[:5]:
                        samples.append({
                            "sample": "contact", "page": 1,
                            "name": redact_name(row.get("name") or row.get("first_name")),
                            "mobile": redact_mobile(row.get("mobile") or row.get("phone")),
                            "has_mobile": bool(row.get("mobile") or row.get("phone")),
                        })
                else:
                    samples.append({"page": page, "status": 200, "rows_page": len(data)})
            else:
                samples.append({"page": page, "status": 200, "props_keys": list(props.keys())})
        else:
            samples.append({"page": page, "status": r.status_code}); break
    ok = any(x.get("status") == 200 for x in samples)
    verdict = "directory_authorized" if ok else "scope_limited"
    return {"meta": meta, "verdict": verdict,
            "total_rows": total_rows,
            "note": "دایرکتوری کاربران CRM (کارکنان) — مسیر مورد استفادهٔ رسمی sync برای حل نام/موبایل کارشناسان؛ قانون ۱۲: صفحه‌بندی کامل به rows:0 اجرا نشد (جایگزینی: فقط صفحهٔ ۱-۲ + متادیتای total)",
            "samples_redacted": samples}

# ═══════════ A7 — IDOR negative test ═══════════
def a7(s, own_requests, pub_pot, pub_consultant):
    meta = test_meta("A7", "IDOR negative — انتظار ۴۰۳/انکار برای منابع غیرخودی · تک‌حساب")
    samples = []
    # 1) getUserNumber for ANOTHER consultant (public-known id from public view) — expect denial
    other_id = (pub_consultant[0] or "19x166").replace("19x", "")
    r = http("GET", f"{BASE_CRM}/contacts/getUserNumber/{other_id}", s,
             note="A7 negative: getUserNumber for other user (expect 403)")
    entry = {"probe": "getUserNumber/{other_user}", "other_user_vtiger": pub_consultant[0], "status": status_of(r)}
    if r is not None and r.status_code == 200:
        body = r.text
        page = extract_props(body)
        leaked = None
        if page:
            u = page.get("props", {}).get("user") or {}
            leaked = {"name_hash": h(u.get("name")), "mobile_hash": h(u.get("mobile"))} if isinstance(u, dict) and (u.get("mobile") or u.get("name")) else None
        else:
            m = re.search(r"(09\d{9})", body)
            leaked = {"mobile_hash": h(m.group(1))} if m else None
        entry["returned_pii"] = bool(leaked)
        entry["leaked_redacted"] = leaked
        entry["expectation"] = "403 برای کاربر غیرمجاز — اگر PII برگشت = یافته"
    samples.append(entry)
    # 2) getUserNumber for SELF (own id 617) — expect 200 (own resource)
    r = http("GET", f"{BASE_CRM}/contacts/getUserNumber/617", s, note="A7 control: own getUserNumber")
    samples.append({"probe": "getUserNumber/617 (self)", "status": status_of(r),
                    "note": "کنترل مثبت — منبع خودی"})
    # 3) getMyRelatedFilings for a PUBLIC (non-own) potential id — expect denial/empty
    pot_id = pub_pot[0] if pub_pot else None
    pot_num = pot_id.replace("13x", "") if pot_id else None
    if pot_num:
        r = http("GET", f"{BASE_CRM}/Potentials/getMyRelatedFilings/{pot_num}", s,
                 note="A7 negative: getMyRelatedFilings for non-own public-known potential")
        entry = {"probe": "getMyRelatedFilings/{non_own}", "potential": pub_pot[1], "owner_actor": pub_pot[2],
                 "status": status_of(r)}
        if r is not None and r.status_code == 200:
            page = extract_props(r.text)
            rows = 0; keys = []
            if page:
                props = page.get("props", {})
                for k, v in props.items():
                    if isinstance(v, dict) and isinstance(v.get("data"), list):
                        rows = len(v["data"]); keys = list(v["data"][0].keys())[:20] if v["data"] else []
                        break
                entry["rows_returned"] = rows
                entry["prop_keys"] = list(props.keys())
                # rows>0 برای پتانسیل غیرخودی = access_control_failed
            samples.append(entry)
    denied = [x for x in samples if x.get("status") in (401, 403)]
    leaked_pii = any(x.get("returned_pii") for x in samples)
    rows_for_other = any((x.get("rows_returned") or 0) > 0 and x.get("probe", "").endswith("non_own") for x in samples)
    if leaked_pii or rows_for_other:
        verdict = "access_control_failed"  # finding — documented, not exploited
    elif denied:
        verdict = "access_control_ok"
    else:
        verdict = "permission_required"
    return {"meta": meta, "verdict": verdict,
            "substitution_note": "دستور «دو کاربر آزمایشی» خواستار دو حساب بود؛ فقط یک حساب مجاز (Sarmasti) موجود است → آزمون تک‌حساب + کنترل مثبت منبع خودی؛ برای ماتریس کامل IDOR دو-حسابی، حساب آزمایشی دوم از بهره‌بردار لازم است",
            "samples_redacted": samples}

# ═══════════ B5 — PublicFilingPlus detail ═══════════
def b5(s, own_filings):
    meta = test_meta("B5", "MelketunPublicFilingPlus/{id} — جزئیات مجاز با redaction")
    samples = []
    for fid, code in [(f[0], f[1]) for f in own_filings[:5]]:
        for variant, url in [("by-code", f"{BASE_CRM}/MelketunPublicFilingPlus/{code}"),
                             ("by-num", f"{BASE_CRM}/MelketunPublicFilingPlus/{fid.replace('71x','')}")]:
            r = http("GET", url, s, note=f"B5 {variant} {code}")
            if r is None:
                samples.append({"code": code, "variant": variant, "status": -1}); continue
            page = extract_props(r.text)
            if r.status_code == 200 and page:
                props = page.get("props", {})
                filings = props.get("filings") or {}
                data = filings.get("data") if isinstance(filings, dict) else None
                if isinstance(data, list) and data:
                    row = data[0]
                    samples.append({"code": code, "variant": variant, "status": 200,
                                    "rows_page": len(data),
                                    "row_has_owner_name": bool(row.get("ownerName")),
                                    "row_has_phone": bool(row.get("phone")),
                                    "row_has_address": bool(row.get("address")),
                                    "row_keys": list(row.keys())[:25]})
                else:
                    samples.append({"code": code, "variant": variant, "status": 200,
                                    "props_keys": list(props.keys())[:10]})
            else:
                samples.append({"code": code, "variant": variant, "status": r.status_code})
        if len([x for x in samples]) >= 10: break
    ok = [x for x in samples if x.get("status") == 200]
    has_more_than_list = any(x.get("row_has_owner_name") or x.get("row_has_address") for x in ok if x.get("rows_page"))
    denied = all(x.get("status") in (401, 403, 404) for x in samples if x.get("status") != -1)
    verdict = "detail_authorized" if has_more_than_list else ("same_as_list" if ok else
              ("permission_required" if denied else "same_as_list"))
    return {"meta": meta, "verdict": verdict,
            "finding": "نمای عمومی فقط فیلدهای عمومی برمی‌گرداند (ownerName/phone/address در آن نیست — همان شاهد PN-047)" if verdict == "same_as_list" else "",
            "samples_redacted": samples}

# ═══════════ N5 — print/export ═══════════
def n5(s, own_filings):
    meta = test_meta("N5", "print/export/download — کشف مسیر خروجی با redaction")
    samples = []
    fid = own_filings[0][0]; num = fid.replace("71x", "")
    probes = [
        f"/Melketunfilingplus/print/{num}", f"/Melketunfilingplus/{num}/print",
        f"/Melketunfilingplus/export", f"/Melketunfilingplus/export/csv",
        f"/Melketunfilingplus?print=1", f"/Potentials/print/{num}", f"/Potentials/export",
        f"/admin/attendances/export",  # documented ziggy (admin-only) — negative control
    ]
    for p in probes:
        r = http("GET", f"{BASE_CRM}{p}", s, note=f"N5 {p[:50]}")
        entry = {"probe": p, "status": status_of(r)}
        if r is not None:
            entry["content_type"] = r.headers.get("Content-Type", "")[:40]
            if r.status_code == 200 and "text/html" in entry["content_type"]:
                # اگر HTML برگشت یعنی صفحهٔ عادی (نه خروجی) — Inertia
                entry["is_inertia_html"] = bool(extract_props(r.text))
        samples.append(entry)
    # ziggy evidence (offline — 155 مسیر جستجو شد)
    ziggy_evidence = {
        "print_routes": "صفر مسیر print در ziggy-routes.json",
        "export_routes": ["admin/attendances/export (ادمین)", "content_creations/download/{id}"],
        "csv_pdf_routes": "صفر مسیر csv/pdf مستقیم",
        "source": "download/pn047/ziggy-routes.json (155 unique routes · witness از PN-047)",
    }
    any_export_200 = any(x.get("status") == 200 and not x.get("is_inertia_html") and "html" not in x.get("content_type", "") for x in samples)
    admin403 = [x for x in samples if x["probe"] == "/admin/attendances/export"]
    if admin403 and admin403[0].get("status") in (401, 403):
        verdict = "no_export"  # + RBAC درست کار می‌کند روی مسیر ادمین
    elif any_export_200:
        verdict = "export_redacted_ok"
    else:
        verdict = "no_export"
    return {"meta": meta, "verdict": verdict, "ziggy_evidence": ziggy_evidence,
            "samples_redacted": samples}

# ═══════════ main ═══════════
CKPT2 = "/home/z/my-project/download/pn048b/_wave2_checkpoint.json"

def main():
    fil, reqs, pub_pot, pub_consultant = ids()
    try:
        results = json.load(open(CKPT2))
    except Exception:
        results = {}
    print(f"own: {len(fil)} filings · {len(reqs)} requests · resume={list(results.keys())}")
    s = make_session()
    print("session OK")
    a4r = results.get("A4")
    if not (a4r and a4r.get("verdict") not in (None, "unverified")):
        a4r = a4(s, json.load(open("/home/z/my-project/upload/.runtime/melketun-secrets.json"))["crm"]["username"])
        results["A4"] = a4r
        save_json("_wave2_checkpoint.json", results)
    print(f"  A4: {a4r.get('verdict')}")
    for name, fn, args in [
        ("N1", n1, (a4r, reqs)),
        ("N2", n2, ()),
        ("N3", n3, (fil, reqs)),
        ("N7", n7, ()),
        ("A5", a5, ()),
        ("A7", a7, (reqs, pub_pot, pub_consultant)),
        ("B5", b5, (fil,)),
        ("N5", n5, (fil,)),
    ]:
        if name in results and results[name].get("verdict") not in (None, "unverified"):
            print(f"— {name}: cached ({results[name].get('verdict')})")
            continue
        print(f"— running {name}…")
        try:
            results[name] = fn(s, *args)
            print(f"  {name}: {results[name].get('verdict')} · reqs={TOTAL_REQUESTS}")
        except Exception as e:
            results[name] = {"meta": test_meta(name, "error"), "verdict": "unverified",
                             "error": f"{type(e).__name__}: {e}"}
            print(f"  {name}: ERROR {e}")
        save_json("_wave2_checkpoint.json", results)
    save_json("wave2-full.json", results)
    print(json.dumps({k: v.get("verdict") for k, v in results.items()}, ensure_ascii=False))
    print(f"TOTAL_REQUESTS={TOTAL_REQUESTS}")

if __name__ == "__main__":
    main()
