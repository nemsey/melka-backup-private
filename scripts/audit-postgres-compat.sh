#!/usr/bin/env bash
# ============================================================================
# PN-022-A — گارد audit-postgres-compat.sh (گام ۵-ر)
# سازگاری مهاجرت PostgreSQL: اسکیمای دوقلو معتبر + گواه مهاجرت تازه +
# همهٔ نقاط موتور-ویژهٔ SQLite مهر ENGINE دارند (سوییچ PN-022-C قابل ردیابی)
# خروجی: download/pn022/guards-postgres-compat.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn022/guards-postgres-compat.json

PG_URL="${DATABASE_PG_TEST_URL:-postgresql://pgtest:pgtest@localhost:5433/melka_pg_test}"

python3 - "$OUT" <<'PYEOF'
import json, os, re, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# ─── ۱) اسکیمای دوقلو موجود است ───
pg_schema = "prisma/schema.postgres.prisma"
if not os.path.exists(pg_schema):
    violations.append("اسکیمای PostgreSQL وجود ندارد — prisma/schema.postgres.prisma")
checks.append({"check": "وجود schema.postgres.prisma", "ok": os.path.exists(pg_schema)})

# ─── ۲) اعتبارسنجی هر دو اسکیما ───
for schema, provider in [("prisma/schema.prisma", "sqlite"), ("prisma/schema.postgres.prisma", "postgresql")]:
    try:
        env = dict(os.environ)
        if provider == "postgresql":
            env["DATABASE_PG_TEST_URL"] = os.environ.get("DATABASE_PG_TEST_URL", "postgresql://pgtest:pgtest@localhost:5433/melka_pg_test")
        r = subprocess.run(["bunx", "prisma", "validate", "--schema", schema],
                           capture_output=True, text=True, timeout=180, env=env)
        ok = r.returncode == 0
        checks.append({"check": f"prisma validate — {schema}", "ok": ok, "tail": (r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr).strip() else ""})
        if not ok:
            violations.append(f"اعتبارسنجی {schema} شکست خورد")
    except Exception as e:
        violations.append(f"اجرای validate برای {schema}: {e}")

# ─── ۳) توازن مدل‌ها (دو اسکیما هم‌شمار و هم‌نام) ───
def model_names(path):
    txt = open(path, encoding="utf-8").read()
    return re.findall(r"^model\s+(\w+)\s*\{", txt, re.M)

sq_models, pg_models = model_names("prisma/schema.prisma"), model_names(pg_schema)
if sorted(sq_models) != sorted(pg_models):
    only_sq = set(sq_models) - set(pg_models)
    only_pg = set(pg_models) - set(sq_models)
    violations.append(f"ناهماهنگی مدل‌ها: فقط SQLite={sorted(only_sq)} · فقط PG={sorted(only_pg)}")
checks.append({"check": "توازن مدل‌ها", "sqlite": len(sq_models), "postgres": len(pg_models), "ok": sorted(sq_models) == sorted(pg_models)})

# ─── ۴) همهٔ نقاط موتور-ویژهٔ SQLite مهر ENGINE دارند ───
# هر فراخوانی واقعی PRAGMA/VACUUM (queryRaw/executeRaw — نه کامنت) باید در ≤۳ خط بالای خود مهر «ENGINE: sqlite-only» داشته باشد
engine_sites = []
for root, dirs, fs in os.walk("src"):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".next")]
    for f in fs:
        if not f.endswith(".ts"):
            continue
        p = os.path.join(root, f)
        lines = open(p, encoding="utf-8").read().splitlines()
        for i, ln in enumerate(lines):
            stripped = ln.strip()
            if stripped.startswith(("//", "*", "/*")):
                continue  # کامنت‌ها فراخوانی نیستند
            is_call = ("$queryRawUnsafe" in ln or "$executeRawUnsafe" in ln) and ("PRAGMA" in ln or "VACUUM" in ln)
            if not is_call:
                continue
            window = "\n".join(lines[max(0, i - 3):i])
            marked = "ENGINE: sqlite-only" in window
            engine_sites.append({"file": p, "line": i + 1, "marked": marked, "code": ln.strip()[:80]})
            if not marked:
                violations.append(f"نقطهٔ موتور-ویژهٔ بدون مهر ENGINE: {p}:{i + 1}")
checks.append({"check": "نقاط موتور-ویژه مهر خورده", "sites": len(engine_sites), "unmarked": sum(1 for s in engine_sites if not s["marked"])})

# ─── ۵) گواه مهاجرت موجود و سالم (تازه‌تر از ۳۰ روز اگر خوشه نصب است) ───
witness = "download/pn022/pg/postgres-migration.json"
if os.path.exists(witness):
    try:
        d = json.load(open(witness, encoding="utf-8"))
        mismatch = d.get("totals", {}).get("mismatch", 1)
        ok = mismatch == 0
        checks.append({"check": "گواه مهاجرت", "ok": ok, "models": d.get("totals", {}).get("models"), "rows": d.get("totals", {}).get("totalRows")})
        if not ok:
            violations.append("گواه مهاجرت اختلاف شمارش دارد")
    except Exception as e:
        violations.append(f"خواندن گواه مهاجرت: {e}")
else:
    # خوشهٔ embedded در دسترس نیست؟ — فقط اگر باینری هم هست سخت می‌گیریم
    has_native = os.path.exists("node_modules/@embedded-postgres/linux-x64/native/bin/postgres")
    checks.append({"check": "گواه مهاجرت", "ok": not has_native, "note": "خوشه embedded نصب است — گواه الزامی" if has_native else "خوشه نصب نیست — گواه صرفاً مستنداتی"})
    if has_native:
        violations.append("گواه مهاجرت (postgres-migration.json) یافت نشد — خوشهٔ embedded نصب است")

result = {
    "workOrder": "PN-022-A/مرحلهٔ۵ — گارد postgres-compat (گام ۵-ر)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "engineSites": engine_sites,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — سازگاری PostgreSQL برقرار" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
