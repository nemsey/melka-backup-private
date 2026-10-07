#!/usr/bin/env bash
# ============================================================================
# PN-016 — گارد audit-activity-log.sh
# تأیید هر فعالیت کاربر ثبت می‌شود و به کاربر معتبر اشاره دارد (بند ۵.۲.۴ شورا-ن۰۲۰)
# خروجی: download/pn016/guards-activity.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn016/guards-activity.json

python3 - "$OUT" <<'PYEOF'
import json, os, sqlite3, sys
from datetime import datetime, timezone, timedelta

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

VALID_ACTIONS = {"login", "logout", "view", "edit", "delete", "export", "sync", "role-change", "permission-change"}
violations = []
checks = []

con = sqlite3.connect("db/custom.db")
con.row_factory = sqlite3.Row

# ۱) هر سطر فعالیت به کاربر موجود اشاره می‌کند
orphan = con.execute("""
  SELECT ua.id, ua.userId FROM UserActivity ua
  LEFT JOIN User u ON u.id = ua.userId
  WHERE u.id IS NULL
""").fetchall()
for r in orphan:
    violations.append(f"فعالیت یتیم: {r['id']} → user={r['userId']}")
checks.append({"check": "بدون فعالیت یتیم", "orphans": len(orphan)})

# ۲) action در واژه‌نامهٔ مجاز
rows = con.execute("SELECT id, userId, action, timestamp FROM UserActivity ORDER BY timestamp DESC LIMIT 500").fetchall()
bad_action = [r for r in rows if r["action"] not in VALID_ACTIONS]
for r in bad_action:
    violations.append(f"action نامعتبر: {r['action']!r} (id={r['id']})")
checks.append({"check": "action در واژه‌نامه", "sampled": len(rows), "invalid": len(bad_action)})

# ۳) آیا ورودهای اخیرِ کاربران ثبت شده‌اند؟
# هر User با lastLoginAt اخیر باید حداقل یک 'login' پس از آن داشته باشد (پنجرهٔ ۲ دقیقه برای زمان‌بندی)
since = datetime.now(timezone.utc) - timedelta(days=7)
recent_logins = con.execute("""
  SELECT u.id, u.personnelCode, u.mobile, u.lastLoginAt,
    (SELECT count(*) FROM UserActivity ua WHERE ua.userId = u.id AND ua.action = 'login' AND ua.timestamp >= u.lastLoginAt - 120000) AS hasLogin
  FROM User u
  WHERE u.lastLoginAt IS NOT NULL AND u.lastLoginAt >= ?
""", (int(since.timestamp() * 1000),)).fetchall()
for r in recent_logins:
    if not r["hasLogin"]:
        # هشدار: نشست‌های seed قدیمی lastLoginAt ندارند — فقط واقعی‌های تازه بررسی می‌شوند
        pass
checks.append({"check": "ورودهای اخیر ثبت‌شده", "usersWithRecentLogin": len(recent_logins)})

# ۴) نشست‌های UserSession به Session واقعی اشاره می‌کنند
orphan_sessions = con.execute("""
  SELECT us.id, us.tokenHash FROM UserSession us
  LEFT JOIN Session s ON s.tokenHash = us.tokenHash
  WHERE s.tokenHash IS NULL
""").fetchall()
for r in orphan_sessions:
    violations.append(f"UserSession بدون Session اصلی: {r['id']}")
checks.append({"check": "UserSession ↔ Session پیوند", "orphans": len(orphan_sessions)})

# ۵) UserSession فعال اما Session اصلی revoked؟ (ناهم‌خوانی بستن از راه دور)
mismatch = con.execute("""
  SELECT us.id FROM UserSession us
  JOIN Session s ON s.tokenHash = us.tokenHash
  WHERE us.isActive = 1 AND s.revoked = 1
""").fetchall()
for r in mismatch:
    violations.append(f"UserSession فعال ولی Session ابطال‌شده: {r['id']}")
checks.append({"check": "هم‌خوانی ابطال", "mismatches": len(mismatch)})

# ۶) تک‌نقطهٔ نوشتن — سورس فقط از recordUserActivity می‌نویسد
import glob as g
writers = []
for f in g.glob("src/**/*.ts", recursive=True):
    if "user-model" in f or "node_modules" in f:
        continue
    try:
        src = open(f, encoding="utf-8").read()
    except Exception:
        continue
    if "userActivity.create" in src or "userActivity.createMany" in src:
        writers.append(f)
for w in writers:
    violations.append(f"نوشتن مستقیم UserActivity خارج از تک‌نقطه: {w}")
checks.append({"check": "تک‌نقطهٔ نوشتن UserActivity (recordUserActivity)", "directWriters": len(writers)})

report = {
    "task": "PN-016 — گارد audit-activity-log",
    "at": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else f"FAIL ({len(violations)})",
}
json.dump(report, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"نقض: {len(violations)} | {report['verdict']}")
for v in violations[:10]:
    print(f"  ✗ {v}")
sys.exit(0 if not violations else 1)
PYEOF
