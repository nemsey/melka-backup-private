#!/usr/bin/env bash
# ============================================================================
# PN-023-A — گارد audit-meta-mind.sh (گام ۵-ض)
# فرا-ذهن فاز ۱۳-الف: دو موتور (۱۲ توجه + ۱۳ علّیت) + دو ساختار (گراف پایدار +
# بودجه) — وجود، قرارداد، خلوص، جدول افزودنی، تست‌ها، اتصال CI
# خروجی: download/pn023a/guards-meta-mind.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn023a/guards-meta-mind.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sqlite3, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# ─── ۱) موتور ۱۲ — توجه: فایل + قرارداد کامل ───
att = open("src/core/intelligence/attention-engine.ts", encoding="utf-8").read()
for needle, label in [
    ("export interface AttentionItem", "قرارداد ورودی"),
    ("export interface AttentionPriority", "قرارداد اولویت"),
    ("export interface AttentionScore", "قرارداد امتیاز (reason الزامی)"),
    ("export class AttentionEngine", "موتور"),
    ("rank(items", "رتبه‌بندی"),
    ("explain(itemId", "روایت دلیل"),
    ("computeFreshness", "مؤلفهٔ تازگی"),
    ("computeAlignment", "مؤلفهٔ تطابق"),
    ("computeCostFactor", "مؤلفهٔ هزینه"),
    ("ATTENTION_DUPLICATE_ITEM", "خطای صریح تکرار"),
    ("ATTENTION_WEIGHTS", "خطای صریح وزن‌ها"),
]:
    if needle not in att:
        violations.append(f"موتور توجه ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "موتور ۱۲ — قرارداد", "ok": not violations})

# ─── ۲) موتور ۱۳ — علّیت: فایل + قرارداد + دو گیت ───
cau = open("src/core/intelligence/causal-engine.ts", encoding="utf-8").read()
for needle, label in [
    ("export interface CausalEdge", "قرارداد یال"),
    ("export interface CausalGraph", "قرارداد گراف"),
    ("export interface CausalEffect", "قرارداد اثر مداخله"),
    ("export class CausalEngine", "موتور"),
    ("buildGraph(data", "L1 — ساخت گراف"),
    ("intervene(graph", "L2 — مداخله"),
    ("findCause(graph", "یافتن علت"),
    ("export function assertDag", "اعتبارسنجی DAG عمومی"),
    ("CAUSAL_CYCLE_DETECTED", "گیت ۱: cycle ⇒ خطای فوری"),
    ("confidenceFloor", "گیت ۲: کف اطمینان"),
    ("MAX_PATHS", "سقف ایمن مسیر"),
]:
    if needle not in cau:
        violations.append(f"موتور علّیت ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "موتور ۱۳ — قرارداد + دو گیت", "ok": all(n in cau for n in ["assertDag", "CAUSAL_CYCLE_DETECTED", "confidenceFloor"])})

# ─── ۳) بودجهٔ توجه ───
bud = open("src/core/intelligence/attention-budget.ts", encoding="utf-8").read()
for needle, label in [
    ("ATTENTION_BUDGETS", "جدول چهار سطح"),
    ("CRITICAL", "سطح بحرانی (۵)"),
    ("clampBudget", "برش سقف"),
    ("levelForCount", "سطح از شمار"),
]:
    if needle not in bud:
        violations.append(f"بودجهٔ توجه ناقص: {label}")
import re as _re
m = _re.search(r"CRITICAL:\s*\{\s*maxItems:\s*(\d+)", bud)
m2 = _re.search(r"DAILY:\s*\{\s*maxItems:\s*(\d+)", bud)
m3 = _re.search(r"WEEKLY:\s*\{\s*maxItems:\s*(\d+)", bud)
m4 = _re.search(r"MONTHLY:\s*\{\s*maxItems:\s*(\d+)", bud)
if not (m and m.group(1) == "5" and m2 and m2.group(1) == "10" and m3 and m3.group(1) == "50" and m4 and m4.group(1) == "500"):
    violations.append(f"سطوح بودجه با سند طراحی نمی‌خواند: {[x and x.group(1) for x in (m, m2, m3, m4)]}")
checks.append({"check": "بودجهٔ توجه — سطوح ۵/۱۰/۵۰/۵۰۰", "ok": not any("بودجهٔ توجه" in v for v in violations)})

# ─── ۴) ماندگاری: سرویس در لایهٔ سرویس (گارد خلوص فاز ۳) + قرارداد ───
store_path = "src/lib/services/causal-graph-store.ts"
if not os.path.exists(store_path):
    violations.append("سرویس ماندگاری گراف در lib/services نیست (گارد خلوص فاز ۳)")
else:
    st = open(store_path, encoding="utf-8").read()
    for needle, label in [
        ("saveGraph", "ذخیرهٔ idempotent"),
        ("loadGraph", "بارگذاری"),
        ("graphStats", "آمار"),
        ("assertDag", "DAG پیش/پس از IO"),
    ]:
        if needle not in st:
            violations.append(f"سرویس گراف ناقص: {label}")
if os.path.exists("src/core/intelligence/causal-graph-store.ts"):
    violations.append("نقض خلوص: causal-graph-store در لایهٔ هوش است (باید lib/services باشد)")
# خلوص موتورها
for f in ["attention-engine.ts", "causal-engine.ts", "attention-budget.ts"]:
    src = open(f"src/core/intelligence/{f}", encoding="utf-8").read()
    if 'from "@/lib/db"' in src or 'from "@prisma/client"' in src:
        violations.append(f"نقض خلوص: {f} درون لایهٔ هوش Prisma/db را import می‌کند")
checks.append({"check": "ماندگاری در لایهٔ سرویس + خلوص موتورها", "ok": not any("خلوص" in v or "سرویس گراف" in v for v in violations)})

# ─── ۵) جدول افزودنی (قانون ۸) ───
schema = open("prisma/schema.prisma", encoding="utf-8").read()
if "model CausalEdgeRecord" not in schema:
    violations.append("مدل CausalEdgeRecord در schema نیست")
pg_schema = open("prisma/schema.postgres.prisma", encoding="utf-8").read()
if "model CausalEdgeRecord" not in pg_schema:
    violations.append("twin schema postgres هم CausalEdgeRecord را ندارد (توازن دوقلوها)")
models = len(_re.findall(r"^model\s+\w+", schema, _re.M))
if models != 69:
    violations.append(f"شمار مدل‌ها {models} ≠ ۶۹ (۵۹ موجود + ۱ علّی PN-023-A + ۳ حافظه PN-025 + ۱ درس‌های رد PN-028 + ۳ لایهٔ احتیاط اتصال PN-029 + ۲ رلهٔ موبایل PN-031 — همه افزودنی)")
try:
    con = sqlite3.connect("db/custom.db")
    t = con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='CausalEdgeRecord'").fetchone()
    if not t:
        violations.append("جدول CausalEdgeRecord در production DB نیست")
    con.close()
except Exception as e:
    violations.append(f"بازکردن production DB: {e}")
checks.append({"check": "جدول افزودنی (قانون ۸) — ۵۹→۶۹ (۱ علّی + ۳ حافظه + ۱ رد PN-028 + ۳ احتیاط اتصال PN-029 + ۲ رلهٔ PN-031)", "models": models, "ok": models == 69})

# ─── ۶) تست‌های فرا-ذهن ≥ ۴۰ در فایل واحد + اتصال CI ───
tfile = "tests/pn023a-attention-causal.test.ts"
if not os.path.exists(tfile):
    violations.append("فایل تست فرا-ذهن نیست")
else:
    tf = open(tfile, encoding="utf-8").read()
    tcount = len(_re.findall(r"^\s*test\(", tf, _re.M))
    if tcount < 40:
        violations.append(f"شمار تست‌های فرا-ذهن {tcount} < ۴۰")
    checks.append({"check": "تست فرا-ذهن", "tests": tcount, "ok": tcount >= 40})
ci = open("scripts/ci.sh", encoding="utf-8").read()
if "audit-meta-mind.sh" not in ci:
    violations.append("گارد meta-mind به CI وصل نیست (قانون ۱۰)")
if "audit-causal-validity.sh" not in ci:
    violations.append("گارد causal-validity به CI وصل نیست (قانون ۱۰)")
checks.append({"check": "اتصال CI (قانون ۱۰)", "ok": "audit-meta-mind.sh" in ci and "audit-causal-validity.sh" in ci})

# ─── ۷) سند طراحی + شواهد ───
doc = "docs/PHASE13-A-ATTENTION-CAUSAL-DESIGN.md"
if not os.path.exists(doc):
    violations.append("سند طراحی فاز ۱۳-الف نیست")
else:
    lines = open(doc, encoding="utf-8").read().count("\n") + 1
    if lines < 600:
        violations.append(f"سند طراحی {lines} < ۶۰۰ خط")
    checks.append({"check": "سند طراحی ≥۶۰۰ خط", "lines": lines, "ok": lines >= 600})
for w in ["attention-engine.json", "causal-engine.json", "graph-budget.json"]:
    if not os.path.exists(f"download/pn023a/{w}"):
        violations.append(f"شاهد {w} نیست")

result = {
    "workOrder": "PN-023-A/مرحلهٔ۶ — گارد meta-mind (گام ۵-ض)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — فرا-ذهن کامل: دو موتور + دو ساختار + خلوص + جدول افزودنی + تست + CI" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
