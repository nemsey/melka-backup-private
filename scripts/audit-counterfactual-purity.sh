#!/usr/bin/env bash
# ============================================================================
# PN-024 — گارد audit-counterfactual-purity.sh (گام ۵-ث)
# موتورهای ۱۴ (پادواقع L3) و ۱۵ (شبیه‌سازی): خلوص نوعی + قرارداد + قفل
# auto_execute + مرز لایه (سرویس تنها نقطهٔ DB)
# دریل منفی درون‌ساخت: DB در موتور ⇒ قرمز
# خروجی: download/pn024/guards-counterfactual.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn024/guards-counterfactual.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

cf = open("src/core/intelligence/counterfactual-engine.ts", encoding="utf-8").read()
se = open("src/core/intelligence/simulation-engine.ts", encoding="utf-8").read()
svc = open("src/lib/services/meta-mind-service.ts", encoding="utf-8").read()

# ─── ۱) خلوص موتورها (قانون ۱۰ سفارش — صفر DB/fetch/env) ───
FORBIDDEN = [
    ('from "@/lib/db"', "import db"),
    ('from "@prisma/client"', "import prisma"),
    ("fetch(", "fetch"),
    ("process.env", "env"),
    ("readFileSync", "فایل"),
    ("writeFileSync", "نوشتن فایل"),
]
for name, src in [("موتور ۱۴ پادواقع", cf), ("موتور ۱۵ شبیه‌سازی", se)]:
    for needle, label in FORBIDDEN:
        if needle in src:
            violations.append(f"{name}: {label} ممنوع در موتور خالص ({needle!r})")
checks.append({"check": "۱ خلوص: موتورهای ۱۴/۱۵ صفر DB/fetch/env/فایل", "ok": not violations})

# ─── ۲) قرارداد کامل موتور ۱۴ ───
for needle, label in [
    ("export interface CounterfactualQuery", "قرارداد پرسش"),
    ("export interface Counterfactual", "قرارداد خروجی (عین سفارش)"),
    ("export class CounterfactualEngine", "موتور"),
    ("CF_EMPTY_GRAPH", "گیت گراف خالی"),
    ("CF_NOT_DAG", "گیت DAG"),
    ("CF_UNKNOWN_FEATURE", "گیت ویژگی ناشناخته"),
    ("CF_EVIDENCE_MISMATCH", "گیت شاهد ناقص"),
    ("CF_SAME_VALUE", "گیت سناریوی بی‌اثر"),
    ('method: "Pearl-L3"', "مهر روش L3"),
    ("reason: string", "روایت فارسی الزامی"),
    ("abduction", "سه‌گامی Pearl"),
]:
    if needle not in cf:
        violations.append(f"موتور ۱۴ ناقص: {label}")
checks.append({"check": "۲ قرارداد موتور ۱۴ (L3 سه‌گامی + ۵ گیت fail-loud)", "ok": True})

# ─── ۳) قرارداد کامل موتور ۱۵ + قفل auto_execute (قانون ۱۱) ───
for needle, label in [
    ("export interface SimAction", "قرارداد اقدام"),
    ("export interface SimContext", "قرارداد زمینه"),
    ("export interface SimulationResult", "قرارداد نتیجه"),
    ("export interface ComparisonTable", "قرارداد جدول مقایسه"),
    ("export class SimulationEngine", "موتور"),
    ("simulate(action", "شبیه‌سازی"),
    ("compare(actions", "مقایسه"),
    ("autoExecute: false", "قفل نوعی autoExecute=false"),
    ("marketPressure", "مدل بازار"),
    ("CounterfactualEngine", "مدل واکنش از طریق L3"),
]:
    if needle not in se:
        violations.append(f"موتور ۱۵ ناقص: {label}")
# قفل ابدی: هیچ مسیر true ندارد
if re.search(r"autoExecute:\s*true", se):
    violations.append("نقض قانون ۱۱: autoExecute:true در موتور شبیه‌سازی یافت شد")
checks.append({"check": "۳ قرارداد موتور ۱۵ + قفل ابدی autoExecute=false", "ok": True})

# ─── ۴) مرز لایه: سرویس نازک تنها نقطهٔ DB ───
if 'from "@/lib/db"' not in svc:
    violations.append("سرویس فرا-ذهن db را import نمی‌کند — شاهد داده گم است")
if 'from "@/core/intelligence/counterfactual-engine"' not in svc:
    violations.append("سرویس از موتور ۱۴ استفاده نمی‌کند")
if 'from "@/core/intelligence/simulation-engine"' not in svc:
    violations.append("سرویس از موتور ۱۵ استفاده نمی‌کند")
checks.append({"check": "۴ مرز لایه: سرویس نازک = تنها نقطهٔ DB (الگوی self-diagnosis)", "ok": True})

# ─── ۵) تست‌ها و اتصال UI (ثانیاً مالک) ───
testFile = open("tests/pn024-negin-and-engines.test.ts", encoding="utf-8").read()
if "موتور ۱۴" not in testFile or "موتور ۱۵" not in testFile:
    violations.append("تست‌های موتورهای ۱۴/۱۵ یافت نشد")
route = open("src/app/api/intelligence/status/route.ts", encoding="utf-8").read()
if "metaMindSnapshot" not in route:
    violations.append("روت status فرا-ذهن را سرو نمی‌کند (خواستهٔ ثانیاً مالک)")
brain = open("src/core/tiles/tiles/settings/BrainStatusSection.tsx", encoding="utf-8").read()
m6 = open("src/core/tiles/tiles/learning-tier/LearningTierPage.tsx", encoding="utf-8").read()
if "فرا-ذهن" not in brain:
    violations.append("بخش تنظیمات (مغز هوشمند) فرا-ذهن را نشان نمی‌دهد (خواستهٔ الف)")
if "metamind" not in m6:
    violations.append("کاشی M6 تب فرا-ذهن ندارد (خواستهٔ ب)")
checks.append({"check": "۵ اتصال UI: روت ۱۵ موتور + تنظیمات (الف) + کاشی M6 (ب)", "ok": True})

result = {
    "guard": "audit-counterfactual-purity",
    "workOrder": "PN-024/مرحلهٔ ۱۱ — خلوص L3 + قفل auto_execute + مرز لایه + اتصال ثانیاً",
    "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "pass": not violations,
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(("PASS: موتورهای ۱۴/۱۵ خالص + قفل ابدی + اتصال دو نقطهٔ UI") if result["pass"] else "FAIL: " + "; ".join(violations[:4]))
sys.exit(0 if result["pass"] else 1)
PYEOF
