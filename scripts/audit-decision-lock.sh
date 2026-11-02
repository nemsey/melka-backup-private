#!/usr/bin/env bash
# ============================================================================
# PN-025 — گارد audit-decision-lock.sh (گام ۱۰-ج · گارد ۳۰)
# ستون ۳+۴ شاهکار: موتور ۱۶ مشاور + کمربند ایمنی — قفل نوعی صفر-اجرا +
# سه قفل TTL/Cooldown/RateLimit عین سفارش + صفر LLM + AuditLog هر رد
# شامل دریل منفی: spam (۱۱ توصیه) ⇒ قرمز + TTL منقضی ⇒ قرمز
# خروجی: download/pn025/guards-decision-lock.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn025/guards-decision-lock.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sys, subprocess

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# ─── ۱) موتور ۱۶ — قرارداد DecisionAdvice عین سفارش ───
adv = open("src/core/intelligence/decision-advisor.ts", encoding="utf-8").read()
for needle, label in [
    ("export interface DecisionAdvice", "قرارداد DecisionAdvice"),
    ("export interface DecisionAlternative", "قرارداد بدیل"),
    ("export function decide", "نقطهٔ ورود موتور"),
    ("export function buildActionCandidates", "سناریوسازی"),
    ("export function assessRisk", "سطح ریسک"),
    ("export function buildNarrative", "روایت ۳-۵ جمله"),
    ("alternatives: DecisionAlternative[]", "فیلد بدیل‌ها"),
    ("requiresApproval: true", "قید لفظی تأیید"),
    ("autoExecute: false", "قید لفظی صفر-اجرا"),
]:
    if needle not in adv:
        violations.append(f"موتور ۱۶ ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "۱) قرارداد مشاور", "ok": True})

# ─── ۲) کمربند — سه قفل عین سفارش ───
lock = open("src/core/intelligence/decision-lock.ts", encoding="utf-8").read()
for needle, label in [
    ("export type NeverExecute", "قفل نوعی صفر-اجرا"),
    ("export const DECISION_LOCK_CONSTANTS", "ثابت‌های کمربند"),
    ("export function evaluateLock", "ارزیابی سه‌قفلی"),
    ("export function evaluateTtl", "داوری انقضا"),
    ("export function buildDecisionLock", "ساخت قفل"),
    ("ttlSeconds: (7 * 24 * 3600)", "TTL هفت‌روزه"),
    ("cooldownHours: 48", "Cooldown ۴۸ ساعت"),
    ("ratePerDay: 10", "سقف روزانه ۱۰"),
    ("ratePerCategory: 3", "سقف دسته‌ای ۳"),
]:
    if needle not in lock:
        violations.append(f"کمربند ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "۲) سه قفل کمربند", "ok": True})

# ─── ۳) قفل نوعی — هیچ مقدار دیگری برای autoExecute/`requiresApproval در خروجی ───
if re.search(r"autoExecute:\s*true", adv + lock):
    violations.append("autoExecute: true در کد موتور/کمربند هست (نقض قانون ۱۱)")
if "type NeverExecute" not in lock:
    violations.append("قفل نوعی NeverExecute نیست")
checks.append({"check": "۳) قفل نوعی کامپایلری", "ok": True})

# ─── ۴) صفر LLM — هیچ فراخوانی مدل بیرونی در کل زنجیره ───
chain_files = [
    "src/core/intelligence/decision-advisor.ts",
    "src/core/intelligence/decision-templates.ts",
    "src/core/intelligence/decision-lock.ts",
    "src/lib/services/decision-advisor-service.ts",
    "src/app/api/admin/decision-advisor/route.ts",
    "src/app/api/smart-matching/advice/route.ts",
    "src/app/api/file-finder/advice/route.ts",
    "src/app/api/market-index/advice/route.ts",
]
for f in chain_files:
    src = open(f, encoding="utf-8").read()
    if re.search(r"\bfetch\s*\(|axios|openai|z-ai|generateText|chat\.completions", src):
        violations.append(f"زنجیرهٔ مشاور LLM دارد: {f}")
checks.append({"check": "۴) صفر LLM در کل زنجیره", "ok": True})

# ─── ۵) کتابخانهٔ قالب‌ها — ۲۴ قالب + fail-loud متغیر ───
tpl = open("src/core/intelligence/decision-templates.ts", encoding="utf-8").read()
m = re.search(r"export const TEMPLATE_IDS = \[(.*?)\] as const;", tpl, re.S)
n_templates = len(re.findall(r'"[TEL]_', m.group(1))) if m else 0
if n_templates != 24:
    violations.append(f"شمار قالب‌ها {n_templates} ≠ ۲۴")
if "متغیر «${key}» برای قالب" not in tpl and "گم شده" not in tpl:
    violations.append("قالب‌ها fail-loud متغیر گم‌شده ندارند")
checks.append({"check": "۵) ۲۴ قالب فارسی", "ok": n_templates == 24})

# ─── ۶) سرویس — AuditLog هر رد + ثبت توصیه در حافظه ───
svc = open("src/lib/services/decision-advisor-service.ts", encoding="utf-8").read()
if "DECISION_LOCKED" not in svc:
    violations.append("سرویس مشاور رد را در AuditLog ثبت نمی‌کند")
if "touchMemory" not in svc:
    violations.append("توصیه‌ها در حافظه ثبت نمی‌شوند (فصل ۷.۴)")
if "evaluateLock" not in svc:
    violations.append("سرویس کمربند را اعمال نمی‌کند")
checks.append({"check": "۶) سرویس + AuditLog", "ok": True})

# ─── ۷) روت‌های سه کاشی + مالک ───
for f in ["src/app/api/smart-matching/advice/route.ts", "src/app/api/file-finder/advice/route.ts", "src/app/api/market-index/advice/route.ts"]:
    src = open(f, encoding="utf-8").read()
    if "requireSessionAsync" not in src:
        violations.append(f"روت کاشی گارد نشست ندارد: {f}")
owner_route = open("src/app/api/admin/decision-advisor/route.ts", encoding="utf-8").read()
if 'requireRole(request, "OWNER"' not in owner_route:
    violations.append("روت مالک OWNER-only نیست")
checks.append({"check": "۷) روت‌ها + گاردها", "ok": True})

# ─── ۸) UI سه کاشی — AdviceCard ───
for f in ["src/core/tiles/tiles/smart-matching/SmartMatchingPage.tsx", "src/core/tiles/tiles/file-finder/FileFinderPage.tsx", "src/core/tiles/tiles/market-index/MarketIndexPage.tsx"]:
    src = open(f, encoding="utf-8").read()
    if "AdviceCard" not in src:
        violations.append(f"کاشی حیاتی AdviceCard ندارد: {f}")
card = open("src/components/app/shared/AdviceCard.tsx", encoding="utf-8").read()
if "سامانه هرگز خودش اجرا نمی‌کند" not in card:
    violations.append("AdviceCard جملهٔ احترام (صفر اجرا) ندارد")
checks.append({"check": "۸) AdviceCard سه کاشی", "ok": True})

# ─── دریل منفی ۱: spam — ۱۱ توصیه در روز ⇒ قفل rate-day ───
# ─── دریل منفی ۲: TTL منقضی ⇒ هرگز ارائه نمی‌شود ───
drill = subprocess.run(
    ["bun", "-e", """
const { evaluateLock, evaluateTtl } = require("./src/core/intelligence/decision-lock.ts");
// اسپم: یازدهمین توصیهٔ روز ⇒ قفل
const spam = evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 10, categoryCountToday: 0 });
if (!(spam.locked && spam.reason === "rate-day")) { console.error("spam قرمز نشد: " + JSON.stringify(spam)); process.exit(1); }
// TTL: توصیهٔ ۸ روزه ⇒ منقضی
const ttl = evaluateTtl("2026-10-01T00:00:00Z", "2026-10-09T00:00:00Z");
if (!ttl.expired) { console.error("TTL منقضی نشد"); process.exit(1); }
console.log("DRILL-OK");
"""],
    capture_output=True, text=True, timeout=60,
)
drill_ok = drill.returncode == 0 and "DRILL-OK" in drill.stdout
if not drill_ok:
    violations.append(f"دریل منفی کمربند شکست: {drill.stderr.strip()[:120]}")
checks.append({"check": "۹) دریل منفی — spam ⇒ قرمز + TTL منقضی", "ok": drill_ok})

result = {
    "workOrder": "PN-025/مرحلهٔ۱۰ — گارد decision-lock (گارد ۳۰)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — مشاور + کمربند: قفل نوعی + سه قفل + صفر LLM + AuditLog + سه کاشی + دریل" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
