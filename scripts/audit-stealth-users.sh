#!/usr/bin/env bash
# ============================================================================
# PN-021 — گارد audit-stealth-users.sh (کارشناس فروش پنهان)
# تأیید قواعد دیده‌شدن کاربران + سازوکار پنهان‌سازی مالک (شورا-ن۰۲۵)
# خروجی: download/pn021/guards-stealth.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn021/guards-stealth.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sqlite3, sys
from datetime import datetime, timezone

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

violations = []
checks = []

VALID_VIS = {"VISIBLE", "HIDDEN"}
ENV_OWNER_CODES = "410031320"
env_owner = {c.strip() for c in ENV_OWNER_CODES.split(",") if c.strip()}

# ─── ۱) بررسی زندهٔ DB: قواعد دیده‌شدن ───
con = sqlite3.connect("db/custom.db")
con.row_factory = sqlite3.Row
rows = con.execute("SELECT id, personnelCode, mobile, role, isActive, COALESCE(visibility, 'VISIBLE') AS visibility FROM User").fetchall()
hidden_count = 0
for r in rows:
    # مقدار معتبر (رشتهٔ کنترل‌شده — نه enum آزاد)
    if r["visibility"] not in VALID_VIS:
        violations.append(f"مقدار دیده‌شدن نامعتبر: user={r['id']} visibility={r['visibility']!r}")
    # مالک و مهمان هرگز پنهان نمی‌شوند (قانون نقش)
    if r["visibility"] == "HIDDEN" and r["role"] in ("OWNER", "GUEST"):
        violations.append(f"نقش غیرقابل‌پنهان‌سازی با HIDDEN: user={r['id']} role={r['role']}")
    # قانون هویت دوگانهٔ مالک: کد مالک env هرگز پنهان نیست
    if r["visibility"] == "HIDDEN" and r["personnelCode"] and r["personnelCode"] in env_owner:
        violations.append(f"کاربر مالک env پنهان شده: {r['personnelCode']}")
    if r["visibility"] == "HIDDEN":
        hidden_count += 1
checks.append({"check": "قواعد دیده‌شدن در DB", "users": len(rows), "hidden": hidden_count})

# ─── ۲) سازوکار فیلتر: فهرست پیش‌فرض باید پنهان‌ها را حذف کند (سطح سورس) ───
svc = open("src/lib/services/users-service.ts", encoding="utf-8").read()
if 'where.visibility = "VISIBLE"' not in svc:
    violations.append("listUsers پیش‌فرض فیلتر visibility=VISIBLE ندارد")
if 'opts.visibility === "HIDDEN"' not in svc:
    violations.append("listUsers حالت HIDDEN (تب مخصوص مالک) ندارد")
if '"HIDDEN"' not in svc or "stealth-create" not in svc:
    violations.append("سرویس: رکورد فعالیت stealth-create تعبیه نشده")
if "hidden: number" not in svc and "hidden:" not in svc:
    violations.append("usersOverview: شمار جدا hidden ندارد")
checks.append({"check": "سازوکار فیلتر سرویس", "ok": not violations})

# ─── ۳) روت‌ها: پارامتر visibility + اعتبارسنجی ───
route_list = open("src/app/api/admin/users/route.ts", encoding="utf-8").read()
route_id = open("src/app/api/admin/users/[id]/route.ts", encoding="utf-8").read()
if 'url.searchParams.get("visibility")' not in route_list:
    violations.append("GET /api/admin/users پارامتر visibility را نمی‌خواند")
if "isUserVisibility" not in route_list:
    violations.append("POST /api/admin/users اعتبارسنجی isUserVisibility ندارد")
if "isUserVisibility" not in route_id:
    violations.append("PATCH /api/admin/users/[id] اعتبارسنجی isUserVisibility ندارد")
if 'requireRole(request, "OWNER"' not in route_list or 'requireRole(request, "OWNER"' not in route_id:
    violations.append("روت‌های کاربران باید OWNER-only بمانند")
checks.append({"check": "روت‌ها: پارامتر + اعتبارسنجی + مالک‌محوری"})

# ─── ۴) مدل: تنها منبع مجاز تعریف دیده‌شدن ───
model = open("src/lib/users/user-model.ts", encoding="utf-8").read()
if 'USER_VISIBILITY = ["VISIBLE", "HIDDEN"]' not in model.replace("export const ", "").replace(" as const", "").strip() and "USER_VISIBILITY" not in model:
    violations.append("USER_VISIBILITY در مدل تعریف نشده")
if "visibilityAllowedForRole" not in model:
    violations.append("قواعد نقش visibilityAllowedForRole در مدل نیست")
if 'visibility     String    @default("VISIBLE")' not in open("prisma/schema.prisma", encoding="utf-8").read():
    violations.append("اسکیما: ستون visibility با پیش‌فرض VISIBLE ندارد")
checks.append({"check": "مدل + اسکیما"})

# ─── ۵) UI: تب شاهکار + راهنمای کاربر تعبیه شده ───
ui = open("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx", encoding="utf-8").read()
for token, desc in [
    ('value="stealth"', "تب کارشناس فروش پنهان"),
    ('value="guide"', "تب راهنما"),
    ('data-testid="stealth-add"', "دکمهٔ ساخت پنهان"),
    ('data-testid="stealth-intro"', "کارت معرفی پنهان"),
    ('data-testid="mtb-guide"', "راهنمای ایجاد کاربر"),
    ("راهنمای ایجاد کاربر در سامانه‌های ملک تبریز", "عنوان راهنما"),
    ("همگام‌سازی فقط خواندنی", "صداقت فنی راهنما"),
]:
    if token not in ui:
        violations.append(f"UI بدون {desc}")
checks.append({"check": "UI شاهکار + راهنما"})

# ─── ۶) تست‌ها: سوئیت PN-021 موجود ───
tests_path = "tests/pn021-stealth-experts.test.ts"
if not os.path.exists(tests_path):
    violations.append(f"سوئیت تست {tests_path} یافت نشد")
else:
    t = open(tests_path, encoding="utf-8").read()
    n = len(re.findall(r"\btest\(", t))
    if n < 20:
        violations.append(f"پوشش تست ناکافی: {n} < 20")
    checks.append({"check": "سوئیت تست پنهان", "tests": n})

con.close()

report = {
    "task": "PN-021 — گارد audit-stealth-users (کارشناس فروش پنهان)",
    "at": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
    "totalUsers": len(rows),
    "hiddenUsers": hidden_count,
    "violations": violations,
    "verdict": "PASS" if not violations else f"FAIL ({len(violations)})",
}
json.dump(report, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"کاربران: {len(rows)} | پنهان: {hidden_count} | نقض: {len(violations)} | {report['verdict']}")
for v in violations[:10]:
    print(f"  ✗ {v}")
PYEOF
