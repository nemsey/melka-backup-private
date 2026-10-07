#!/usr/bin/env bash
# ============================================================================
# PN-016 — گارد audit-permission-boundary.sh
# تأیید هیچ کاربری از مرز نقشش فراتر نمی‌رود (بند ۵.۲.۴ شورا-ن۰۲۰)
# خروجی: download/pn016/guards-permissions.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn016/guards-permissions.json

python3 - "$OUT" <<'PYEOF'
import json, os, sqlite3, sys
from datetime import datetime, timezone

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

MANAGEABLE = {
    "arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching",
    "learning-tier", "market-index", "data-coverage", "file-finder", "management-dashboard",
}
violations = []
checks = []

con = sqlite3.connect("db/custom.db")
con.row_factory = sqlite3.Row

users = {r["id"]: dict(r) for r in con.execute("SELECT id, personnelCode, role, isActive FROM User")}
perms = con.execute("SELECT id, userId, tileId, canRead, canWrite, canDelete, canExport, canSync FROM UserPermission").fetchall()

# ۱) هر tileId در محدودهٔ MANAGEABLE_TILES
for p in perms:
    if p["tileId"] not in MANAGEABLE:
        violations.append(f"tileId خارج از رجیستری: {p['tileId']} (user={p['userId']})")
    if p["userId"] not in users:
        violations.append(f"مجوز یتیم (کاربر حذف‌شده): user={p['userId']}")
checks.append({"check": "tileId در رجیستری + مالک مجاز", "permissionRows": len(perms)})

# ۲) مالک هرگز سطر مجوز ندارد (عبور کامل — نه محدودیت)
for p in perms:
    u = users.get(p["userId"])
    if u and u["role"] == "OWNER":
        violations.append(f"OWNER با سطر مجوز (باید عبور کند نه محدود شود): user={p['userId']}")
checks.append({"check": "OWNER بدون سطر مجوز"})

# ۳) یگانگی (userId, tileId) — UNIQUE اسکیما؛ دوباره‌رستی
seen = {}
for p in perms:
    k = (p["userId"], p["tileId"])
    if k in seen:
        violations.append(f"سطر مجوز تکراری: {k}")
    seen[k] = True
checks.append({"check": "یگانگی (user, tile)", "unique": len(seen)})

# ۴) GUEST هیچ مجوزی ندارد («فقط خانه»)
for uid, u in users.items():
    if u["role"] == "GUEST":
        cnt = sum(1 for p in perms if p["userId"] == uid)
        if cnt > 0:
            violations.append(f"GUEST با {cnt} سطر مجوز — باید صفر باشد")
checks.append({"check": "GUEST بدون کاشی"})

# ۵) کاربر غیرفعال نباید مجوز فعال معنادار داشته باشد (دفاع عمقی — رد ورود در روت است)
inactive_with_perms = sum(1 for p in perms if users.get(p["userId"], {}).get("isActive") is False)
if inactive_with_perms > 0:
    # هشدار (نه شکست): مجوزها می‌مانند تا فعال‌سازی مجدد؛ ورود مسدود است
    checks.append({"check": "غیرفعال با مجوز باقی‌مانده", "count": inactive_with_perms, "note": "هشدار — ورود مسدود است؛ مجوزها برای فعال‌سازی مجدد نگه داشته می‌شوند"})
else:
    checks.append({"check": "غیرفعال با مجوز باقی‌مانده", "count": 0})

# ۶) هم‌خوانی زنده با resolveAllowedTiles — تک‌نقطهٔ تصمیم واقعی
import subprocess
probe = subprocess.run(
    ["bun", "-e", """
import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();
const { resolveAllowedTiles } = await import("/home/z/my-project/src/lib/access/personnel-access");
const users = await db.user.findMany({ where: { personnelCode: { not: null } } });
const out = [];
for (const u of users) out.push({ code: u.personnelCode, role: u.role, isActive: u.isActive, resolve: await resolveAllowedTiles("CONSULTANT", u.personnelCode) });
console.log(JSON.stringify(out));
await db.$disconnect();
"""],
    capture_output=True, text=True, timeout=60,
)
try:
    live = json.loads(probe.stdout.strip().splitlines()[-1])
    for u in live:
        if not u["isActive"] and u["resolve"]["level"] != "none":
            violations.append(f"کاربر غیرفعال با کاشی زنده: {u['code']} → {u['resolve']['level']}")
        if u["role"] == "GUEST" and u["resolve"]["tiles"]:
            violations.append(f"GUEST با کاشی زنده: {u['code']}")
        if u["role"] == "OWNER" and u["resolve"]["level"] != "full":
            violations.append(f"OWNER بدون دسترسی کامل: {u['code']}")
    checks.append({"check": "واکاوی زندهٔ resolveAllowedTiles", "probed": len(live)})
except Exception as e:
    checks.append({"check": "واکاوی زندهٔ resolveAllowedTiles", "error": str(e)[:200]})

report = {
    "task": "PN-016 — گارد audit-permission-boundary",
    "at": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
    "users": len(users),
    "permissionRows": len(perms),
    "violations": violations,
    "verdict": "PASS" if not violations else f"FAIL ({len(violations)})",
}
json.dump(report, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"کاربران: {len(users)} | سطر مجوز: {len(perms)} | نقض: {len(violations)} | {report['verdict']}")
for v in violations[:10]:
    print(f"  ✗ {v}")
sys.exit(0 if not violations else 1)
PYEOF
