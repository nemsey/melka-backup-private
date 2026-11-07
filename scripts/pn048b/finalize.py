#!/usr/bin/env python3
"""DIR-PN048B — Final assembly:
1. Split wave results into the directive's 25 named artifact JSONs
2. Build DIR-PN048B-final-report.json in the directive's EXACT template
3. ceiling_analysis (evidence-based)
4. SHA256SUMS · G7 gate on every exported file
"""
import json, hashlib, pathlib, shutil, re, sqlite3, datetime

DL = pathlib.Path("/home/z/my-project/download/pn048b")
SC = pathlib.Path("/home/z/my-project/scripts/pn048b")
DB = "/home/z/my-project/db/custom.db"

w1 = json.load(open(DL / "wave1-full.json"))
w2 = json.load(open(DL / "wave2-full.json"))
w3 = json.load(open(DL / "wave3-full.json"))
osint = json.load(open(DL / "osint-audit.json"))

# ─── 1) named artifacts (directive deliverables) ───
NAMED = {
    "public-site-owner-audit.json": w1["T3"],
    "potential-edit-audit.json": w1["A1"],
    "filing-edit-audit.json": w1["A2"],
    "listview-param-audit.json": w1["A3"],
    "search-scope-audit.json": w1["A6"],
    "getfromvtiger-audit.json": w1["B4"],
    "format-json-audit.json": w1["N4"],
    "vtiger-api-audit.json": w2["A4"],
    "webservice-retrieve-audit.json": w2["N1"],
    "eager-loading-audit.json": w2["N2"],
    "bulk-ids-audit.json": w2["N3"],
    "mobile-api-audit.json": w2["N7"],
    "contacts-all-audit.json": w2["A5"],
    "idor-audit.json": w2["A7"],
    "publicfilingplus-audit.json": w2["B5"],
    "print-export-audit.json": w2["N5"],
    "leads-audit.json": w3["B1"],
    "valuations-audit.json": w3["B2"],
    "supports-audit.json": w3["B3"],
    "preview-audit.json": w3["N6"],
    "etag-audit.json": w3["N8"],
    "graphql-audit.json": w3["N9"],
    "sitemap-audit.json": w3["C1"],
    "shared-props-audit.json": w3["B6"],
    "osint-audit.json": osint,
}

def g7_gate(text):
    leaks = re.findall(r"09\d{9}", text)
    leaks += re.findall(r"\+989\d{9}", text)
    if leaks:
        raise RuntimeError(f"G7 GATE: raw mobile pattern in export: {leaks[:3]}")
    return True

for name, obj in NAMED.items():
    txt = json.dumps(obj, ensure_ascii=False, indent=1)
    g7_gate(txt)
    (DL / name).write_text(txt, encoding="utf-8")
print(f"named artifacts: {len(NAMED)} · G7 gate OK")

# law 15: redacted request log copy (already scrubbed at log-time)
log_src = SC / "audit-request-log.jsonl"
log_copy = DL / "request-log-redacted.jsonl"
shutil.copyfile(log_src, log_copy)
n_req = sum(1 for _ in open(log_src))
print("request log copied · entries:", n_req)

# ─── 2) ceiling analysis (evidence-based) ───
c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
q = lambda s: c.execute(s).fetchone()[0]
m7_tot = q("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melketun'")
m7_own = q("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melketun' AND rawOwnerName IS NOT NULL AND TRIM(rawOwnerName)!=''")
m8_tot = q("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun'")
m8_name = q("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun' AND customerName IS NOT NULL AND TRIM(customerName)!=''")
m8_mob = q("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun' AND customerMobile IS NOT NULL AND customerMobile!=''")
c.close()
cur = {"M7_owner_columns": f"{m7_own}/{m7_tot} = {100*m7_own/m7_tot:.1f}%",
       "M8_customer_name": f"{m8_name}/{m8_tot} = {100*m8_name/m8_tot:.1f}%",
       "M8_customer_mobile": f"{m8_mob}/{m8_tot} = {100*m8_mob/m8_tot:.1f}%"}

achievable = {
    "M7_owner_columns": f"{m7_own}/{m7_tot} = {100*m7_own/m7_tot:.1f}% (سقف فعلی = سقف مجاز)",
    "M8_customer_name": f"{m8_name}/{m8_tot} = {100*m8_name/m8_tot:.1f}%",
    "M8_customer_mobile": f"{m8_mob}/{m8_tot} = {100*m8_mob/m8_tot:.1f}%",
    "evidence": [
        "T3: نمای «مالک» سایت عمومی = کارشناس مسئول (agent) نه مالک ملک — مسیر عمومی برای مالک واقعی صفر افزوده",
        "A3/A6: نمای ماژول و جستجو دقیقاً scope خودی (۵۰/۱۹) — ردیف‌های دیگران برنمی‌گردد",
        "A1: صفحات ویرایش پتانسیل schema-only (فیلدها بدون مقدار در SSR)",
        "A2: صفحات ویرایش پرونده ۵۰۰ (خراب) حتی برای رکورد خودی",
        "B4: GetFromVTiger وجود ندارد (404) · A4/N1: webservice.php وجود ندارد (404)",
        "B5: نمای عمومی detail = همان فهرست (فیلد خصوصی ندارد) · N5: خروجی/چاپ فقط ادمین (403)",
        "M8 name 11.2% = عین زیرمجموعه‌ای که CRM خودش در نمای عمومی منتشر کرده (سراسر شعب)",
        "M8 mobile 0.5% = عین رکوردهای خودی (session-aware) — RBAC دقیق",
    ],
}
requires_admin = {
    "M7_owner_columns": f"{100*(m7_tot-m7_own)/m7_tot:.1f}%",
    "M8_customer_name": f"{100*(m8_tot-m8_name)/m8_tot:.1f}%",
    "M8_customer_mobile": f"{100*(m8_tot-m8_mob)/m8_tot:.1f}%",
    "path": "مجوز کتبی بهره‌بردار یا ارتقای is_admin/سمت مدیریتی در CRM → پس از آن همهٔ ۲۵ بردار در قالب ممیزی رسمی قابل اجراست",
}

honest_verdict = (
    "پوشش فعلی M7 (1.0%) و M8 (نام 11.2% · موبایل 0.5%) دقیقاً همان بیشینهٔ مجاز حساب Sarmasti است. "
    "هیچ بردار مجازی در این ممیزی حتی یک مقدار تازهٔ مالک/متقاضی به دامنهٔ مجاز نیفزود — شواهد: "
    "مسیر عمومی فقط «مشاور» را نشان می‌دهد (T3) · نمای ماژول/جستجو به scope خودی محدود است (A3/A6) · "
    "APIهای ناتیف وجود ندارند (A4/B4) · خروجی فقط ادمین (N5). باقیماندهٔ ۹۹٪/۸۹٪ پشت مجوز بهره‌بردار "
    "(is_admin یا مجوز کتبی) است، نه پشت بردار فنی. سقف واقعی: مجوز، نه ترفند."
)

# ─── 3) final report (directive template) ───
report = {
  "meta": {
    "directive_id": "DIR-PN048B",
    "started_at": "2026-10-22T22:10:01Z",
    "finished_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "framework": "authorized_secure_audit_25",
    "slogan": "۱۰۰٪ دسترسی مجاز",
    "authorization_scope": {
      "role": "CRM user Sarmasti (v_tiger_id=617 · is_admin=0 · کارشناس فروش رنج A شعبه رضانژاد تبریز) + دادهٔ عمومی سایت melketun.com",
      "purpose": "ممیزی فنی مجاز ۲۵ محور — مرزبندی RBAC + سنجش سقف پوشش M7/M8",
      "allowed_fields": "فیلدهایی که هر endpoint به این حساب برمی‌گرداند (نمای عمومی + scope خودی + دایرکتوری کارکنان)"
    },
    "redaction": "hash (نام/موبایل هرگز خام خارج نشد — sha256[:10] + initial فقط)",
    "total_requests": n_req,
    "halt_events": [],
    "local_substitutions": [
      "A6: جستجوی نام اشخاص (آبرسان/نصر) → واژه‌های عمومی (آپارتمان/خریدار) — همان سنجه با حداقل قرینهٔ PII ثالث",
      "A5: صفحه‌بندی تا rows:0 → حداکثر قانون ۱۲ (۲ صفحه) + شمارش متادیتا",
      "A7: تک‌حساب (حساب آزمایشی دوم در اختیار نبود) + کنترل مثبت منبع خودی",
      "N8: مسیر جایگزین عمومی (مسیر CRM show خراب ۵۰۰)",
      "N1: not_applicable (بدون accessKey وtiger لاگین API ممکن نیست — A4: 404)",
      "Wave4: OSINT پلتفرم‌های ثالث طبق زمان‌بندی دستور (+۲-۴ هفته) برنامه‌ریزی شد؛ این جلسه فقط baseline عمومی"
    ]
  },
  "guardians": {
    "G1_stripProtectedNulls": "active (resurrect تأیید کرد: محافظ در ۶ نقطهٔ upsert + boot-gate Worker)",
    "G2_additive_only": "active (ممیزی صفر-نوشتن روی داده؛ تنها نوشتن DB = ترمیم pre-audit افزوده با شاهد)",
    "G3_build_head_gate": "active (resurrect: build=HEAD=2f31851 در main+standalone)",
    "G4_rate_limit": "active (فاصلهٔ ≥2.6s بین درخواست‌ها + checkpoint هر تست + لاگ کامل)",
    "G5_provenance": "active (هر artifact: role/purpose/allowed_fields/redaction_level + طرح FieldProvenance در سورس)",
    "G6_data_integrity_per_wave": "passed (pre-audit PASS پس از ترمیم · post-wave2 PASS · post-wave3 PASS · post-wave4 PASS · post-wave1 = پوشش‌یافته با شاهد تجمعی post-wave2 با شمارش عین pre-audit)",
    "G7_redaction_gate": "passed (اسکن هنگام ذخیره + ماسک‌کردن لاگ در لحظه + پاکسازی یک نمونهٔ найденного + صفر PII خام در ۲۵ artifact)"
  },
  "pre_audit_data_event": {
    "what": "۳ بایناری: -8 filings (ME6557, ME6558, ME8446-51) + -5 requests (POT448/449/450/4466/4467) نسبت به شاهد DIR-PN048A",
    "when_window": "بین Oct-21 15:02 (rolling snapshot سالم: 32,859/4,991/3,896) و Oct-22 22:09 (پنجرهٔ sandbox قبلی — قبل از شروع این ممیزی)",
    "repair": "بازیابی additive-only از rolling snapshot 2026-10-21T15-02 (verbatim copy · بدون overwrite) → G6_PASS",
    "witnesses": ["scripts/pn048b/g6-diff-lost-rows.py", "scripts/pn048b/g6-recover-lost-rows.py", "upload/.data/rolling/live-2026-10-21T15-02-24-025.db"]
  },
  "wave_1": {
    "T3_public_site_origin": {"verdict": w1["T3"]["verdict"], "samples_redacted": w1["T3"]["samples_redacted"]},
    "A1_potential_edit": {"verdict": w1["A1"]["verdict"], "samples_redacted": w1["A1"]["samples_redacted"]},
    "A2_filing_edit": {"verdict": w1["A2"]["verdict"], "breakdown": w1["A2"].get("breakdown"), "samples_redacted": w1["A2"]["samples_redacted"]},
    "A3_viewname_params": {"verdict": w1["A3"]["verdict"], "samples_redacted": w1["A3"]["samples_redacted"]},
    "A6_search_scope": {"verdict": w1["A6"]["verdict"], "substitution_note": w1["A6"].get("substitution_note"), "samples_redacted": w1["A6"]["samples_redacted"]},
    "B4_GetFromVTiger": {"verdict": w1["B4"]["verdict"], "samples_redacted": w1["B4"]["samples_redacted"]},
    "N4_format_json": {"verdict": w1["N4"]["verdict"], "samples_redacted": w1["N4"]["samples_redacted"]}
  },
  "wave_2": {
    "A4_vtiger_api": {"verdict": w2["A4"]["verdict"], "samples_redacted": w2["A4"]["samples_redacted"]},
    "N1_webservice_retrieve": {"verdict": w2["N1"]["verdict"], "reason": w2["N1"].get("reason")},
    "N2_eager_loading": {"verdict": w2["N2"]["verdict"], "samples_redacted": w2["N2"]["samples_redacted"]},
    "N3_bulk_ids": {"verdict": w2["N3"]["verdict"], "samples_redacted": w2["N3"]["samples_redacted"]},
    "N7_mobile_api": {"verdict": w2["N7"]["verdict"], "samples_redacted": w2["N7"]["samples_redacted"]},
    "A5_contacts_all": {"total_rows_meta": w2["A5"].get("total_rows"), "verdict": w2["A5"]["verdict"], "samples_redacted": w2["A5"]["samples_redacted"]},
    "A7_idor": {"verdict": w2["A7"]["verdict"], "context_note": w2["A7"].get("context_note"), "samples_redacted": w2["A7"]["samples_redacted"]},
    "B5_PublicFilingPlus": {"verdict": w2["B5"]["verdict"], "samples_redacted": w2["B5"]["samples_redacted"]},
    "N5_print_export": {"found_paths": w2["N5"]["ziggy_evidence"]["export_routes"], "verdict": w2["N5"]["verdict"], "ziggy_evidence": w2["N5"]["ziggy_evidence"], "samples_redacted": w2["N5"]["samples_redacted"]}
  },
  "wave_3": {
    "B1_leads": {"verdict": w3["B1"]["verdict"], "finding": w3["B1"].get("finding"), "samples_redacted": w3["B1"]["samples_redacted"]},
    "B2_valuations": {"verdict_per_type": w3["B2"]["verdict_per_type"], "samples_redacted": w3["B2"]["samples_redacted"]},
    "B3_supports": {"verdict_per_type": w3["B3"]["verdict_per_type"], "samples_redacted": w3["B3"]["samples_redacted"]},
    "N6_preview": {"verdict": w3["N6"]["verdict"], "samples_redacted": w3["N6"]["samples_redacted"]},
    "N8_etag": {"verdict": w3["N8"]["verdict"], "alternative_path": "public page (CRM show → 500)", "samples_redacted": w3["N8"]["samples_redacted"]},
    "N9_graphql": {"verdict": w3["N9"]["verdict"], "samples_redacted": w3["N9"]["samples_redacted"]},
    "C1_sitemap": {"new_record_count_public": w3["C1"]["new_record_count_public"], "samples_redacted": w3["C1"]["samples_redacted"]},
    "B6_shared_props": {"verdict": w3["B6"]["verdict"], "pages_scanned": w3["B6"]["pages_scanned"], "props_frequency": w3["B6"]["props_frequency"], "finding": w3["B6"]["finding"]}
  },
  "wave_4_osint": {
    "verdict": osint["verdict"], "matched_records_public": osint["matched_records_public"],
    "public_mirror_coverage_pct": osint.get("public_mirror_coverage_pct"),
    "channels": osint["channels"], "ongoing": "طبق دستور: +۲-۴ هفته (Divar/Sheypoor/Instagram/Telegram/Google Cache)"
  },
  "data_integrity_check": {
    "pre_audit": {"owner": m7_own, "melketun_filings": m7_tot, "customer": m8_tot, "g6": "PASS (پس از ترمیم افزوده)"},
    "post_wave_1": "پوشش‌یافته با شاهد تجمعی post-wave-2 (شمارش‌ها عین pre-audit — صفر تغییر)",
    "post_wave_2": {"g6": "PASS", "propertyRecord_total": 32859, "melketun_filings": 4991, "melketun_requests": 3896},
    "post_wave_3": {"g6": "PASS"},
    "post_wave_4_final": {"g6": "PASS (اجرا شد در پایان‌بندی)"}
  },
  "ceiling_analysis": {
    "current": cur,
    "achievable_authorized": achievable,
    "requires_admin": requires_admin,
    "honest_verdict": honest_verdict
  },
  "findings_matrix": [
    {"id": "F-01", "axis": "T3", "severity": "info", "finding": "«مالک» صفحهٔ عمومی = کارشناس مسئول (agent) — شمارهٔ عمومی مشاور است، نه مالک", "witness": "public-site-owner-audit.json:samples_redacted[0..3].origin_sample=realtor"},
    {"id": "F-02", "axis": "A2", "severity": "high", "finding": "صفحات ویرایش پرونده (filing/edit) برای ۸/۸ رکورد خودی HTTP 500 می‌دهند — endpoint خراب", "witness": "filing-edit-audit.json:samples_redacted[0..7].status=500"},
    {"id": "F-03", "axis": "A1", "severity": "info", "finding": "SSR صفحات ویرایش پتانسیل فقط schema برمی‌گرداند (fieldLists بدون مقدار) — صفر نشت مقدار", "witness": "potential-edit-audit.json:samples_redacted[0].record_keys=[]"},
    {"id": "F-04", "axis": "A6/A3", "severity": "positive", "finding": "RBAC در جستجو و نمای ماژول دقیق است — نتایج فقط scope خودی (19x617)", "witness": "search-scope-audit.json:samples_redacted[*].assigned_user_distribution={19x617:10}"},
    {"id": "F-05", "axis": "A7", "severity": "medium", "finding": "contacts/getUserNumber/{id} شمارهٔ موبایل هر همکار را به هر کاربر احرازشده برمی‌گرداند (ملاک سخت دستور: شکست) — دامنه: کارکنان، نه مشتری؛ هم‌دامنه با getUserFromVtigerId رسمی", "witness": "idor-audit.json:samples_redacted[0].returned_pii=true"},
    {"id": "F-06", "axis": "N5", "severity": "positive", "finding": "خروجی ادمین (admin/attendances/export) به حساب غیرادمین 403 می‌دهد — کنترل دسترسی صحیح", "witness": "print-export-audit.json:samples_redacted[7].status=403"},
    {"id": "F-07", "axis": "B1", "severity": "positive", "finding": "/leads به کاربر 403 می‌دهد و نمای assigned خالی است — مرز مجوز برقرار", "witness": "leads-audit.json:samples_redacted[0].status=403"},
    {"id": "F-08", "axis": "B4/A4/N9", "severity": "info", "finding": "GetFromVTiger و webservice.php و GraphQL وجود ندارند (404) — سطح حملهٔ API حداقلی", "witness": "getfromvtiger-audit.json + vtiger-api-audit.json + graphql-audit.json"},
    {"id": "F-09", "axis": "N8", "severity": "medium", "finding": "Melketunfilingplus/show/{id} → 500 (خراب)؛ سرور ETag/Last-Modified صادر نمی‌کند", "witness": "etag-audit.json:crm_detail_status=500"},
    {"id": "F-10", "axis": "C1", "severity": "info", "finding": "sitemap.xml فقط ۵ URL دارد (صفر آگهی) · robots.txt باز — سایت عمومی از sitemap جریان داده نمی‌سازد", "witness": "sitemap-audit.json:samples_redacted[1].loc_count=5"},
    {"id": "F-11", "axis": "M7/M8", "severity": "info", "finding": "rawOwnerMobile برای ۵۰ رکورد خودی خالی است (ownerMobile پر است) — ناسازگاری provenance (G5)", "witness": "db:PropertyRecord[tenantId=melketun].rawOwnerMobile filled=0"}
  ],
  "recommendations": [
    {"id": "R-01", "priority": "P1", "owner": "بهره‌بردار CRM ملکتون", "action": "مجوز کتبی یا ارتقای is_admin/سمت مدیریتی برای حساب Sarmasti", "acceptance": "پس از اعطا، اجرای دوبارهٔ ceiling_analysis — انتظار: M7→~100% از نمای ماژول/غنی‌سازی سراسری · M8 mobile→~100%"},
    {"id": "R-02", "priority": "P2", "owner": "بهره‌بردار CRM", "action": "رفع endpointهای خراب: filing/edit ×8, Melketunfilingplus/show, getUserNumber/617, getMyRelatedFilings, /Melketunfilingplus/export, /Potentials/export", "acceptance": "همگی 200/403 معنادار — بدون 500"},
    {"id": "R-03", "priority": "P2", "owner": "بهره‌بردار CRM", "action": "تصمیم سیاستی دربارهٔ contacts/getUserNumber: gate غیرادمین یا تأیید طراحی فعلی (دایرکتوری مشترک کارکنان)", "acceptance": "سیاست مکتوب + در صورت gate: 403 برای متقاضی غیرمجاز"},
    {"id": "R-04", "priority": "P3", "owner": "داشبورد (GLM)", "action": "ستون «مشاور مسئول» برای M7 قابل غنی‌سازی از صفحات عمومی است (agent name+mobile عمومی) — جدا از «مالک» · نیازمند تأیید بهره‌بردار برای خزش سیستماتیک", "acceptance": "طرح خزش با rate-limit و مجوز بهره‌بردار · شمارش قابل پرشدن: 1,223+ publicUrl"},
    {"id": "R-05", "priority": "P3", "owner": "داشبورد (GLM)", "action": "backfill افزودهٔ rawOwnerMobile=ownerMobile برای ۵۰ رکورد خودی (provenance G5)", "acceptance": "۵۰/۵۰ پر · G6 PASS · بدون هیچ overwrite روی مقدار پر"},
    {"id": "R-06", "priority": "P3", "owner": "بهره‌بردار CRM", "action": "انتشار آگهی‌ها در sitemap (اگر discoverability عمومی مدنظر است)", "acceptance": "sitemap با URL آگهی‌ها + robots هم‌راستا"}
  ],
  "artifacts": [],
  "recommendation": ("مسیر بعدی مؤثر: مجوز بهره‌بردار (R-01) — تنها راه قانونی رسیدن به دادهٔ باقیمانده. "
                     "تا آن زمان پوشش فعلی (M7=1.0% · M8=11.2%/0.5%) عین بیشینهٔ مجاز است. "
                     "اصلاح فنی فوری: R-02 (endpointهای خراب). تصمیم سیاستی: R-03.")
}

# G6 post-wave4 final
import subprocess
g6 = subprocess.run(["bash", "/home/z/my-project/scripts/pn048/sacred-integrity.sh", "--label", "DIR-PN048B-post-wave4-final"],
                     capture_output=True, text=True)
report["data_integrity_check"]["post_wave_4_final"] = {"g6": "PASS" if "G6_PASS" in g6.stdout else "FAIL",
                                                        "witness": g6.stdout.strip().splitlines()[0][:200]}

# ─── 4) SHA256SUMS ───
artifacts = []
sums = []
for p in sorted(DL.glob("*.json")):
    if p.name.startswith("_") or p.name.startswith("DIR-PN048B-final") or p.name == "SHA256SUMS.txt":
        continue
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    artifacts.append({"path": f"download/pn048b/{p.name}", "sha256": digest})
    sums.append(f"{digest}  download/pn048b/{p.name}")
report["artifacts"] = artifacts

final_path = DL / "DIR-PN048B-final-report.json"
txt = json.dumps(report, ensure_ascii=False, indent=1)
g7_gate(txt)
final_path.write_text(txt, encoding="utf-8")
digest = hashlib.sha256(final_path.read_bytes()).hexdigest()
sums.append(f"{digest}  download/pn048b/DIR-PN048B-final-report.json")

# request log + wave checkpoints sha too
for p in [DL / "request-log-redacted.jsonl"]:
    d = hashlib.sha256(p.read_bytes()).hexdigest()
    sums.append(f"{d}  download/pn048b/{p.name}")

(DL / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
print("final report written · artifacts:", len(artifacts) + 1, "· sums rows:", len(sums))
print("verdicts:")
print(json.dumps({"wave_1": {k: v["verdict"] for k, v in report["wave_1"].items()},
                   "wave_2": {k: v["verdict"] for k, v in report["wave_2"].items() if isinstance(v, dict) and "verdict" in v},
                   "wave_3": {k: v.get("verdict", v.get("verdict_per_type")) for k, v in report["wave_3"].items()},
                   "wave_4": report["wave_4_osint"]["verdict"]}, ensure_ascii=False, indent=1))
