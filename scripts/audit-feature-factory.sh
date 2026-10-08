#!/usr/bin/env bash
# ============================================================================
# PN-022-A — گارد audit-feature-factory.sh (گام ۵-ص)
# مولد کاشی سالم است: تولید آزمایشی در tmp + همهٔ بدنه‌ها TILE_SKELETON +
# صفر overwrite + عدم نشت رجیستری + گواه witness تازه
# خروجی: download/pn022/guards-feature-factory.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn022/guards-feature-factory.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, subprocess, sys, tempfile, shutil

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

GEN = "scripts/feature-factory/tile-new.ts"

# ─── ۱) مولد موجود + صادرات قابل‌تست ───
src = open(GEN, encoding="utf-8").read()
for needle, label in [
    ("export function generateTile", "تابع مولد قابل‌واردات"),
    ("export function isValidTileName", "اعتبارسنجی نام"),
    ("export function kebabToPascal", "تبدیل نام"),
    ("TILE_SKELETON", "بدنه‌های fail-loud"),
    ("صفر overwrite", "قید عدم‌بازنویسی"),
]:
    if needle not in src:
        violations.append(f"مولد ناقص: {label}")
checks.append({"check": "ساختار مولد", "ok": all(n in src for n in ["export function generateTile", "TILE_SKELETON"])} )

# ─── ۲) تولید آزمایشی زنده در tmp ───
tmp = tempfile.mkdtemp(prefix="tile-factory-guard-")
try:
    r = subprocess.run(["bun", "run", "tile:new", f"--name=guard-probe", f"--target={tmp}"],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        violations.append(f"تولید آزمایشی شکست خورد: {(r.stderr or r.stdout).strip()[:200]}")
    else:
        expected = [
            "src/core/tiles/tiles/guard-probe/index.ts",
            "src/core/tiles/tiles/guard-probe/GuardProbePage.tsx",
            "src/core/agent/guard-probe-agent.ts",
            "src/core/repositories/interfaces/guard-probe.repository.ts",
            "src/app/api/guard-probe/route.ts",
            "tests/pn022-tile-guard-probe.test.ts",
        ]
        for rel in expected:
            if not os.path.exists(os.path.join(tmp, rel)):
                violations.append(f"فایل تولیدنشده: {rel}")
        # بدنه‌های منطق fail-loud
        agent_src = open(os.path.join(tmp, "src/core/agent/guard-probe-agent.ts"), encoding="utf-8").read()
        repo_src = open(os.path.join(tmp, "src/core/repositories/interfaces/guard-probe.repository.ts"), encoding="utf-8").read()
        route_src = open(os.path.join(tmp, "src/app/api/guard-probe/route.ts"), encoding="utf-8").read()
        tile_src = open(os.path.join(tmp, "src/core/tiles/tiles/guard-probe/index.ts"), encoding="utf-8").read()
        if "TILE_SKELETON" not in agent_src:
            violations.append("ایجنت تولیدی fail-loud نیست")
        if "TILE_SKELETON" not in repo_src:
            violations.append("مخزن تولیدی fail-loud نیست")
        if "TILE_SKELETON" not in route_src and "501" not in route_src:
            violations.append("روت تولیدی fail-loud نیست")
        if "tileRegistry.register" in tile_src:
            violations.append("نشست رجیستری در اسکلت بدون --register")
        checks.append({"check": "تولید آزمایشی", "files": len(expected), "failLoud": True, "noRegistryLeak": "tileRegistry.register" not in tile_src})

        # ─── ۳) صفر overwrite: اجرای مجدد روی همان نام = خطا ───
        r2 = subprocess.run(["bun", "run", "tile:new", f"--name=guard-probe", f"--target={tmp}"],
                            capture_output=True, text=True, timeout=120)
        if r2.returncode == 0:
            violations.append("اجرای مجدد روی نام موجود باید خطا بدهد (صفر overwrite)")
        else:
            checks.append({"check": "صفر overwrite", "ok": True})

        # ─── ۴) نام نامعتبر رد می‌شود ───
        for bad in ["BadName", "x", "has_underscore", "1starts-with-digit"]:
            r3 = subprocess.run(["bun", "run", "tile:new", f"--name={bad}", f"--target={tmp}"],
                                capture_output=True, text=True, timeout=60)
            if r3.returncode == 0:
                violations.append(f"نام نامعتبر پذیرفته شد: {bad!r}")
        checks.append({"check": "رد نام نامعتبر", "ok": True})
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# ─── ۵) گواه رسمی witness تازه ───
witness = "download/pn022/feature-factory.json"
if not os.path.exists(witness):
    violations.append("گواه feature-factory.json یافت نشد")
else:
    try:
        d = json.load(open(witness, encoding="utf-8"))
        if not d.get("ok") or d.get("totalLines", 0) < 100 or len(d.get("files", [])) < 6:
            violations.append("گواه feature-factory.json ناقص است")
        checks.append({"check": "گواه رسمی", "files": len(d.get("files", [])), "totalLines": d.get("totalLines")})
    except Exception as e:
        violations.append(f"خواندن گواه: {e}")

# ─── ۶) دستور tile:new در package.json ───
pkg = json.load(open("package.json", encoding="utf-8"))
if "tile:new" not in pkg.get("scripts", {}):
    violations.append("دستور tile:new در package.json ثبت نشده")
checks.append({"check": "دستور tile:new", "ok": "tile:new" in pkg.get("scripts", {})})

result = {
    "workOrder": "PN-022-A/مرحلهٔ۵ — گارد feature-factory (گام ۵-ص)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — کارخانهٔ کاشی سالم" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
