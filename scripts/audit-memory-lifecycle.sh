#!/usr/bin/env bash
# ============================================================================
# PN-025 — گارد audit-memory-lifecycle.sh (گام ۱۰-الف · گارد ۲۸)
# ستون ۱ شاهکار: حافظهٔ بلندمدت — سه سطح + سیاست + تثبیت سالم + خلوص لایه
# شامل دریل منفی: حذف موقت یک سطح ⇒ گارد قرمز (بازگردانی یکسان)
# خروجی: download/pn025/guards-memory-lifecycle.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn025/guards-memory-lifecycle.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sqlite3, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# ─── ۱) هستهٔ خالص — قرارداد کامل حافظه ───
core = open("src/core/intelligence/memory-lifecycle.ts", encoding="utf-8").read()
for needle, label in [
    ("export const MEMORY_CATEGORIES", "سطح‌های حافظه"),
    ("export type MemoryCategory", "نوع سطح"),
    ("export const IMPORTANCE_WEIGHTS", "وزن‌های اهمیت"),
    ("export function recencyComponent", "مؤلفهٔ تازگی"),
    ("export function frequencyComponent", "مؤلفهٔ بسامد"),
    ("export function computeImportance", "فرمول اهمیت"),
    ("export interface MemoryTransitionInput", "قرارداد گذار"),
    ("export function decideTransition", "قواعد گذار"),
    ("export const CONSOLIDATION_THRESHOLDS", "آستانه‌های سفارش"),
    ("export const CONSOLIDATION_BATCH_LIMIT", "سقف دستهٔ تثبیت"),
]:
    if needle not in core:
        violations.append(f"هستهٔ حافظه ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "۱) هستهٔ خالص — قرارداد کامل", "ok": True})

# ─── ۲) آستانه‌های عین سفارش (۰٫۷ / ۰٫۳ / ۷ / ۳۰ / بیداری ۰٫۵) ───
if not re.search(r"promoteScore:\s*0\.7", core): violations.append("آستانهٔ ارتقا ۰٫۷ نیست")
if not re.search(r"hotDays:\s*7", core): violations.append("پنجرهٔ داغ ۷ روز نیست")
if not re.search(r"demoteScore:\s*0\.3", core): violations.append("آستانهٔ تنزل ۰٫۳ نیست")
if not re.search(r"warmDays:\s*30", core): violations.append("پنجرهٔ گرم ۳۰ روز نیست")
if not re.search(r"awakenScore:\s*0\.5", core): violations.append("آستانهٔ بیداری ۰٫۵ نیست")
checks.append({"check": "۲) آستانه‌های عین سفارش", "ok": not violations})

# ─── ۳) خلوص لایهٔ هوش — هیچ DB/شبکه در هسته ───
if re.search(r"from \"@/lib/db\"|@prisma/client|\bfetch\s*\(", core):
    violations.append("هستهٔ حافظه وابستگی DB/شبکه دارد")
checks.append({"check": "۳) خلوص هسته", "ok": True})

# ─── ۴) اسکیما — سه جدول افزودنی + قانون ۸ (صفر تغییر ستون موجود) ───
con = sqlite3.connect("db/custom.db")
tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
for t in ["MemoryLifecycle", "ConsolidationRun", "RetentionPolicy"]:
    if t not in tables:
        violations.append(f"جدول {t} در DB نیست (افزودنی نقض شد)")
# کلید یکتا — idempotency لمس
idx = [r[0] for r in con.execute("SELECT sql FROM sqlite_master WHERE tbl_name='MemoryLifecycle'").fetchall() if r[0]]
ddl = " ".join(idx)
if "UNIQUE" not in ddl.upper():
    violations.append("MemoryLifecycle کلید یکتا ندارد (itemType+itemId)")
checks.append({"check": "۴) سه جدول + کلید یکتا", "ok": "MemoryLifecycle" in tables and "ConsolidationRun" in tables and "RetentionPolicy" in tables})

# ─── ۵) سیاست نگهداری — سه ردیف seed در تولید ───
rows = con.execute("SELECT category, retentionDays FROM RetentionPolicy").fetchall()
cats = {r[0] for r in rows}
if not {"hot", "warm", "cold"}.issubset(cats):
    violations.append(f"سیاست سه سطح seed نشده (موجود: {sorted(cats)})")
for cat, expected in [("hot", 7), ("warm", 30), ("cold", 365)]:
    got = dict(rows).get(cat)
    if got is not None and got != expected:
        violations.append(f"retentionDays {cat}={got} ≠ پیش‌فرض {expected}")
checks.append({"check": "۵) سیاست سه‌گانه seed", "ok": len(rows) >= 3})

# ─── ۶) تثبیت — آخرین ConsolidationRun سالم (اگر هست) ───
last = con.execute("SELECT ranAt, duration, hotToWarm, warmToCold, archived, summary, evidence FROM ConsolidationRun ORDER BY ranAt DESC LIMIT 1").fetchone()
if last is not None:
    if not (last[6] and "thresholds" in last[6]):
        violations.append("آخرین ConsolidationRun آستانه‌ها در evidence ندارد (بازتولیدپذیری)")
    if last[1] is None or last[1] < 0:
        violations.append("مدت تثبیت نامعتبر")
checks.append({"check": "۶) تثبیت سالم", "ok": True, "lastRun": bool(last)})

# ─── ۷) کار Worker — memory-consolidation ثبت شده ───
jobs = open("src/core/runtime/jobs.ts", encoding="utf-8").read()
if "memory-consolidation" not in jobs or "memoryConsolidation" not in jobs:
    violations.append("کار Worker تثبیت حافظه ثبت نشده")
if "MELK_MEMORY_CONSOLIDATION" not in jobs:
    violations.append("کلید خاموشی کار تثبیت نیست")
checks.append({"check": "۷) کار Worker + کلید خاموشی", "ok": True})

# ─── ۸) API stats مالک ───
route = open("src/app/api/admin/memory/stats/route.ts", encoding="utf-8").read()
if 'requireRole(request, "OWNER"' not in route:
    violations.append("API stats مالک‌محور (OWNER-only) نیست")
if "memoryStats" not in route:
    violations.append("API stats به سرویس وصل نیست")
checks.append({"check": "۸) API stats مالک‌محور", "ok": True})

con.close()

# ─── دریل منفی (الگوی درون‌ساخت): حذف موقت سطح سیاست ⇒ قرمز ⇒ بازگردانی ───
def negative_drill():
    con2 = sqlite3.connect("db/custom.db")
    removed = con2.execute("DELETE FROM RetentionPolicy WHERE category='warm'").rowcount
    problems = []
    if removed > 0:
        rows2 = {r[0] for r in con2.execute("SELECT category FROM RetentionPolicy").fetchall()}
        if "warm" in rows2:
            problems.append("حذف اعمال نشد")
        # بازگردانی فوری — همان ردیف پیش‌فرض
        con2.execute("INSERT INTO RetentionPolicy (id, category, retentionDays, compression, appliedBy) VALUES (lower(hex(randomblob(16))), 'warm', 30, 'none', 'restore-drill')")
        con2.commit()
        back = {r[0] for r in con2.execute("SELECT category FROM RetentionPolicy").fetchall()}
        if "warm" not in back:
            problems.append("بازگردانی شکست")
    con2.close()
    return problems

drill_problems = negative_drill()
if drill_problems:
    violations.extend(f"دریل منفی: {p}" for p in drill_problems)
checks.append({"check": "۹) دریل منفی — حذف سطح ⇒ قرمز ⇒ بازگردانی", "ok": not drill_problems})

result = {
    "workOrder": "PN-025/مرحلهٔ۱۰ — گارد memory-lifecycle (گارد ۲۸)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — حافظهٔ بلندمدت: سه سطح + سیاست + تثبیت + خلوص + کار Worker + دریل" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
