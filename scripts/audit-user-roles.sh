#!/usr/bin/env bash
# ============================================================================
# PN-016 — گارد audit-user-roles.sh
# تأیید اعتبار نقش هر کاربر رجیستری User (طبق بند ۵.۲.۴ شورا-ن۰۲۰)
# خروجی: download/pn016/guards-roles.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn016/guards-roles.json

python3 - "$OUT" <<'PYEOF'
import json, os, sqlite3, sys
from datetime import datetime, timezone

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

VALID_ROLES = {"OWNER", "MANAGER", "EXPERT", "VIEWER", "GUEST"}
ENV_OWNER_CODES = "410031320"
env_owner = {c.strip() for c in ENV_OWNER_CODES.split(",") if c.strip()}

violations = []
checks = []

con = sqlite3.connect("db/custom.db")
con.row_factory = sqlite3.Row

# ۱) هر کاربر نقش معتبر دارد
rows = con.execute("SELECT id, personnelCode, mobile, fullName, role, isActive FROM User").fetchall()
for r in rows:
    if r["role"] not in VALID_ROLES:
        violations.append(f"نقش نامعتبر: user={r['id']} role={r['role']!r}")
    # ۲) قانون هویت دوگانهٔ مالک: کد مالک env همیشه OWNER
    if r["personnelCode"] and r["personnelCode"] in env_owner and r["role"] != "OWNER":
        violations.append(f"کد مالک env با نقش غیر OWNER: {r['personnelCode']} → {r['role']}")
    # ۳) کاربر یا personnelCode دارد یا mobile (نه هیچ‌کدام)
    if not r["personnelCode"] and not r["mobile"]:
        violations.append(f"کاربر بدون شناسه (نه کد، نه موبایل): {r['id']}")
    # ۴) GUEST فقط با موبایل (نه کد پرسنلی)
    if r["role"] == "GUEST" and not r["mobile"]:
        violations.append(f"GUEST بدون موبایل: {r['id']}")
checks.append({"check": "نقش معتبر + قانون مالک + شناسهٔ یکتا", "users": len(rows)})

# ۵) یکتایی کد پرسنلی/موبایل (UNIQUE در اسکیما — دوباره‌رستی)
dup_code = con.execute("SELECT personnelCode, count(*) c FROM User WHERE personnelCode IS NOT NULL GROUP BY personnelCode HAVING c > 1").fetchall()
for d in dup_code:
    violations.append(f"کد پرسنلی تکراری: {d['personnelCode']} ×{d['c']}")
dup_mobile = con.execute("SELECT mobile, count(*) c FROM User WHERE mobile IS NOT NULL GROUP BY mobile HAVING c > 1").fetchall()
for d in dup_mobile:
    violations.append(f"موبایل تکراری: {d['mobile']} ×{d['c']}")
checks.append({"check": "یکتایی شناسه‌ها", "duplicateCodes": len(dup_code), "duplicateMobiles": len(dup_mobile)})

# ۶) هر کد مالک env حتماً رکورد User با OWNER دارد (تضمین رجیستری)
for code in env_owner:
    row = con.execute("SELECT role, isActive FROM User WHERE personnelCode = ?", (code,)).fetchone()
    if not row:
        violations.append(f"کد مالک env بدون رکورد User: {code}")
    elif row["role"] != "OWNER" or not row["isActive"]:
        violations.append(f"کد مالک env رکورد نامعتبر: {code} role={row['role']} active={row['isActive']}")
checks.append({"check": "رجیستری مالک env", "codes": sorted(env_owner)})

# ۷) نشست‌های OWNER واقعی — هر Session با role=OWNER یا کد مالک است یا شبه‌هویت مدیر
owner_sessions = con.execute("SELECT personnelCode, role FROM Session WHERE role='OWNER' AND revoked=0").fetchall()
for s in owner_sessions:
    if s["personnelCode"] not in env_owner and s["personnelCode"] != "OWNER" and not s["personnelCode"].startswith("0000"):
        violations.append(f"نشست OWNER با کد غیرمجاز: {s['personnelCode']}")
checks.append({"check": "نشست‌های OWNER زنده", "count": len(owner_sessions)})

report = {
    "task": "PN-016 — گارد audit-user-roles",
    "at": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
    "totalUsers": len(rows),
    "violations": violations,
    "verdict": "PASS" if not violations else f"FAIL ({len(violations)})",
}
json.dump(report, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"کاربران: {len(rows)} | نقض: {len(violations)} | {report['verdict']}")
for v in violations[:10]:
    print(f"  ✗ {v}")
sys.exit(0 if not violations else 1)
PYEOF
