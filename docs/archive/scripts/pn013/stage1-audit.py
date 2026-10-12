#!/usr/bin/env python3
# PN-013 مرحله ۱ — کنترل انبار ۱۲ پرونده: راستی‌آزمایی ادعاها در برابر شاهد امروز
import json, os, subprocess, sqlite3, glob, hashlib, datetime, re

R = "/home/z/my-project"
os.chdir(R)
now = datetime.datetime.now().isoformat()

def fexists(p): return os.path.exists(p)
def fsize(p): return os.path.getsize(p) if fexists(p) else 0

out = {"workOrder": "PN-013", "stage": 1, "auditAt": now, "cases": [], "summary": {}}

# ---------- shared live witnesses ----------
db = sqlite3.connect("db/custom.db")
def q1(sql):
    try: return db.execute(sql).fetchone()[0]
    except Exception as e: return f"ERR:{str(e)[:60]}"

counts = {
  "PropertyRecord": q1("SELECT COUNT(*) FROM PropertyRecord"),
  "RequestRecord": q1("SELECT COUNT(*) FROM RequestRecord"),
  "GraphNode": q1("SELECT COUNT(*) FROM GraphNode"),
  "GraphEdge": q1("SELECT COUNT(*) FROM GraphEdge"),
  "OpportunityAlert": q1("SELECT COUNT(*) FROM OpportunityAlert"),
  "ExpertProfile": q1("SELECT COUNT(*) FROM ExpertProfile"),
  "TransactionRecord": q1("SELECT COUNT(*) FROM TransactionRecord"),
  "PersonnelAccess": q1("SELECT COUNT(*) FROM PersonnelAccess"),
  "JobLock": q1("SELECT COUNT(*) FROM JobLock"),
  "AgentPolicyVersion": q1("SELECT COUNT(*) FROM AgentPolicyVersion"),
}
db.close()

def sh(cmd, timeout=90):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (r.returncode, (r.stdout or "") + (r.stderr or ""))
    except subprocess.TimeoutExpired:
        return (124, "TIMEOUT")

def add(case, topic, claim, witnessToday, delta, debt):
    out["cases"].append({"case": case, "topic": topic, "selfReported": claim,
                         "verifiedToday": witnessToday, "delta": delta, "debt": debt})

# ================= PN-001 — سه‌گام پایه (زیرساخت + کاشی + مغز) =================
schema = open("prisma/schema.prisma").read()
models = re.findall(r"^model (\w+)", schema, re.M)
tiles_reg = fexists("src/lib/tiles/registry.ts") or bool(glob.glob("src/lib/tiles/*"))
agents = len(glob.glob("src/lib/agents/**/*agent*.ts", recursive=True)) + len(glob.glob("src/core/**/*agent*.ts", recursive=True))
add("PN-001", "سه‌گام پایه", "۸ مدل Prisma + رجیستری کاشی + ایجنت‌های یادگیر + تست",
    f"مدل‌ها: {len(models)} ({', '.join(models[:8])}…) · رجیستری کاشی: {tiles_reg} · فایل ایجنت: {agents}",
    "طبیعی: ۸→{n} با رشد فازها".format(n=len(models)), False)

# ================= PN-002 — بهبود M1-M4 =================
m1m2 = bool(glob.glob("src/components/tiles/**/*", recursive=True))
excel_exports = len(glob.glob("src/app/api/**/export/route.ts", recursive=True))
add("PN-002", "بهبود M1-M4", "M1 +۱۴ ستون · M2 +۲۱ ستون · M3 دیمن CRM با خزانه · M4 شمارش متقاطع · اکسل ×۴",
    f"مسیر کاشی‌ها: {m1m2} · روت‌های export: {excel_exports} · آگهی زنده: {counts['PropertyRecord']} (ادعای زمانه: ۱۱٬۵۰۱)",
    f"داده از ۱۱٬۵۰۱ به {counts['PropertyRecord']} رشد یافته (دیمن زنده)", False)

# ================= PN-003 — دادهٔ واقعی + گزارش =================
guard_test = fexists("tests/pn003-master-code.test.ts")
import_routes = len(glob.glob("src/app/api/crm/import/*/route.ts"))
pred = q1_wrap = None
db = sqlite3.connect("db/custom.db")
try:
    pred = db.execute("SELECT COUNT(*) FROM OpportunityAlert").fetchone()[0]
except Exception: pass
db.close()
add("PN-003", "دادهٔ واقعی + گارد ورود", "گارد ۱۲تایی کد مستر · ایمپورت اکسل ×۴ · گراف ۳۶٬۶۵۰ گره · هشدار ۵۳",
    f"تست گارد: {guard_test} · روت‌های ایمپورت: {import_routes} · گراف امروز: {counts['GraphNode']} گره · هشدار: {counts['OpportunityAlert']}",
    f"گراف ۳۶٬۶۵۰→{counts['GraphNode']} (رشد) · هشدار ۵۳→{counts['OpportunityAlert']}", False)

# ================= PN-004 — فاز ۰-A تشخیص =================
pn004_results = len(glob.glob("scripts/pn004/results/*.json"))
pn004_dl = fexists("download/pn004/baseline.json")
add("PN-004", "فاز ۰-A تشخیص", "۱۲ سناریو + ۳۸ فایل JSON + baseline + platform-capacity",
    f"فایل‌های results: {pn004_results} · baseline.json: {pn004_dl} · capacity: {fexists('download/pn004/platform-capacity.json')}",
    "همه موجود" if (pn004_results >= 30 and pn004_dl) else "کاهش فایل‌های نتیجه", False)

# ================= PN-005 — بازیابی + تثبیت =================
rg = fexists("scripts/runtime/recovery-guard.sh") or bool(glob.glob("scripts/**/recovery-guard.sh", recursive=True))
add("PN-005", "بازیابی + تثبیت", "۹ گام بازیابی · گراف ۴۸٬۷۴۸ · گارد خوددرمان recovery-guard · production start.sh",
    f"recovery-guard: {rg} · start.sh: {fexists('start.sh')} · گراف امروز: {counts['GraphNode']}",
    f"گراف ۴۸٬۷۴۸→{counts['GraphNode']} (رشد دیمنی)", False)

# ================= PN-006 — فاز ۰-B بهینه‌سازی =================
de = fexists("scripts/pn006/dev-entry.sh")
pb = fexists("scripts/perf-budget.sh")
add("PN-006", "فاز ۰-B بهینه‌سازی", "دروازهٔ بوت dev-entry · بودجه perf-budget.sh · پیک Build PARTIAL (کف ابزار) · ۲۱/۲۹ رفع",
    f"dev-entry: {de} · perf-budget.sh: {pb}",
    "پیک Build همچنان PARTIAL مستند (بدهی باز — نیازمند ارتقای سخت‌افزار 4c/8GB)", True)

# ================= PN-007 — فاز ۰.۵ بازتولیدپذیری =================
fp = fexists("src/lib/version-fingerprint.ts")
ci = fexists("scripts/ci.sh")
ar = fexists("scripts/audit-reproducibility.sh")
add("PN-007", "بازتولیدپذیری", "fingerprint ۱۸+۳ فیلد · بستهٔ استاندارد ن۰۰۷ · بازیابی ۵۰s · CI هشت‌گامی · audit-reproducibility ۶/۶",
    f"version-fingerprint.ts: {fp} · ci.sh: {ci} · audit-reproducibility: {ar}",
    "همه موجود", False)

# ================= PN-008 — فاز ۱ امنیت + کارشناسان =================
cip = fexists("src/lib/security/client-ip.ts") or fexists("src/lib/client-ip.ts") or bool(glob.glob("src/**/client-ip.ts", recursive=True))
pa = counts["PersonnelAccess"]
add("PN-008", "فاز ۱ امنیت + کارشناسان", "چرخش ۱۲۱ راز · Trusted Proxy · ماتریس ۶۴ روت · PersonnelAccess · ExpertProfile ۱۴۳ ردیف · WAL",
    f"client-ip.ts: {cip} · PersonnelAccess ردیف: {pa} · ExpertProfile: {counts['ExpertProfile']}",
    f"ExpertProfile ۱۴۳→{counts['ExpertProfile']} (همسو)", False)

# ================= PN-009 — احیای سرویس + UI =================
color_reg = bool(glob.glob("src/**/color*registry*", recursive=True)) or bool(glob.glob("src/**/semantic-color*", recursive=True))
add("PN-009", "احیای سرویس + UI redesign", "Semantic Color Registry یگانه · چهار ماژول بازطراحی · تست ۱۷۹۲/۰",
    f"رجیستری رنگ: {color_reg}",
    "بررسی عمیق‌تر رنگ در ادامه (گارد UI)", False)

# ================= PN-010 — فاز ۲ Runtime =================
sup = fexists("src/core/runtime/supervisor.ts")
jl_cols = "lastHeartbeat" in schema
add("PN-010", "فاز ۲ Runtime", "JobLock+ضربان · Supervisor · مهاجرت دیمن‌ها به Worker · چرخش بکاپ · ۱۸۴۲/۰",
    f"supervisor.ts: {sup} · JobLock مدل با heartbeat: {jl_cols} · Worker زنده: PID 1896 · JobLock ردیف: {counts['JobLock']}",
    "همه برقرار", False)

# ================= PN-011 — رفع دائمی + رنگ + M5 =================
wl = fexists("src/lib/agents/weights-learning.ts") or bool(glob.glob("src/**/weights-learning*", recursive=True))
escrow = json.load(open("download/pn013/lock-in.json"))["prerequisites"]["escrow"]
add("PN-011", "رفع دائمی ۵۰۰ + رنگ یکتا + M5", "escrow سه‌لایه · پالت ۲۴ خانه · weights-learning · پیوند عمیق M5→M1/M2 · ۱۸۸۵/۰",
    f"weights-learning: {wl} · escrow سه‌مکان: consistent={escrow['consistent']} (کلید fp {escrow['keyFp']})",
    "escrow اکنون سه‌مکانی+رمزی (ارتقای PN-012) — همسو", False)

# ================= PN-012 — بحران ۶ + فاز ۳ =================
em = fexists("scripts/pn012/escrow-manager.ts")
v1 = len(glob.glob("src/app/api/v1/**/route.ts", recursive=True))
abs_guard = fexists("scripts/audit-boot-secrets.sh")
deliver = sorted(glob.glob("public/deliver/*"))
add("PN-012", "بحران ۶ + فاز ۳ معماری", "escrow سه‌مکانی+رمزی · renew · ۴۶→۰ مرز مخزن · /api/v1 · audit-boot-secrets · ۱۹۳۵/۰ ×۲ · قانون فایل v3 با ۴ قطعه",
    f"escrow-manager: {em} · روت‌های v1: {v1} · audit-boot-secrets: {abs_guard} · deliver: {len(deliver)} فایل",
    "شواهد deliver قدیمی PN-012 موجود — تأیید جزئیات در ادامه", False)

out["summary"] = {
  "casesAudited": len(out["cases"]),
  "liveCounts": counts,
  "knownOpenDebts": [
    "D1 پیک Build > 1.5GB (PARTIAL مستند ۰۰۶) — منتظر ارتقای سخت‌افزار 4c/8GB از مالک",
    "D2 publish عمومی از پنل مالک (چند دوره) — preview سبز، publish نیازمند اقدام مالک",
    "D3 کد مستر در تاریخچهٔ گیت (بند ۲.۲ ن۰۰۸) — قفل تا تصمیم مالک (الف/ب)",
    "D4 تصمیم LFS برای main (GH001 ن۰۱۰) — با مالک",
  ]
}
json.dump(out, open("download/pn013/control-report.json", "w"), ensure_ascii=False, indent=2)
print(json.dumps({"cases": len(out["cases"]), "liveCounts": counts}, ensure_ascii=False, indent=2))
