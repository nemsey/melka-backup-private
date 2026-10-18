#!/usr/bin/env bash
# ============================================================================
# PN-041 — گارد audit-db-fortress.sh (فاز ۶ · جلسهٔ ۰۶۷ · به‌روزشده PN-041-R · جلسهٔ ۰۶۸)
# قلعهٔ داده — قرارداد کامل ده بند (شورا-ن۰۶۷ · بخش ۴-ج):
#   ۱) db/custom.db (زندهٔ محلی WAL) موجود است + upload/.data/custom.db کپی پایدار
#   ۲) upload/.data/rolling/ حداقل ۱ نسخه دارد
#   ۳) DATABASE_URL به db/custom.db (زندهٔ محلی) اشاره می‌کند — شورا-ن۰۶۸
#   ۴) Job rolling-backup در Worker ثبت شده
#   ۵) Job sacred-backup در Worker ثبت شده (مقصد پایدار)
#   ۶) recover-all.sh موجود و اجرایی است
#   ۷) db-fortress-guard.sh موجود و اجرایی است
#   ۸) Workflow .github/workflows/db-backup.yml موجود است
#   ۹) Boot Guard به db-fortress-guard.sh متصل است (dev-entry ۱-د) + watchdog محلی-اول
#   ۱۰) زندهٔ محلی WAL است (شورا-ن۰۶۸ — معیار جایگزین «قلعه جدیدتر از قدیمی»)
# + شاهدهای تکمیلی: مقصد sacred پایدار · شیر دیسک · WAL محلی · زنجیرهٔ ۵ لایه
# هر ردیف = شاهد ساختاری مستند (فایل/محتوا) — صفر ادعای بدون شاهد.
# خروجی: download/pn041/guards-db-fortress.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn041/guards-db-fortress.json

python3 - "$OUT" <<'PYEOF'
import json, os, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

def sh(cmd):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        return r.stdout.strip(), (r.returncode == 0)
    except Exception:
        return "", False

def read(path):
    try:
        with open(path, encoding="utf8") as f:
            return f.read()
    except Exception:
        return ""

def stat_mtime(path):
    try:
        return os.path.getmtime(path)
    except Exception:
        return 0

def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        violations.append(f"{name}: {detail}")

# ── ۱) زندهٔ محلی + کپی پایدار قلعه ──
fortress = "upload/.data/custom.db"
live = "db/custom.db"
check("۱-زندهٔ-محلی-موجود", os.path.isfile(live) and os.path.getsize(live) > 4096,
      f"{live} ({os.path.getsize(live) if os.path.isfile(live) else 0} bytes)")
hdr_ok, _ = sh(f"head -c 15 {live} 2>/dev/null")
check("۱-زندهٔ-محلی-سرآیند-sqlite", hdr_ok == "SQLite format 3", "پروب ارزان سرآیند")
check("۱-کپی-پایدار-قلعه-موجود", os.path.isfile(fortress) and os.path.getsize(fortress) > 4096,
      f"{fortress} کپی هم‌روز پایدار")

# ── ۲) چرخشی حداقل ۱ نسخه ──
rolling = [f for f in (os.listdir("upload/.data/rolling") if os.path.isdir("upload/.data/rolling") else [])
           if f.startswith("live-") and f.endswith(".db")]
check("۲-چرخشی-حداقل-یک-نسخه", len(rolling) >= 1, f"rolling: {len(rolling)} فایل live-*")

# ── ۳) DATABASE_URL به زندهٔ محلی (شورا-ن۰۶۸) ──
envp = read("env.platform.json")
check("۳-env-مسیر-زندهٔ-محلی", "db/custom.db" in envp and "connection_limit=1" in envp, "env.platform.json → DATABASE_URL")
dotenv = read(".env")
check("۳-env-dot-زندهٔ-محلی", "db/custom.db" in dotenv, ".env (هدف Prisma CLI)")

# ── ۴+۵) کارهای Worker ──
jobs_src = read("src/core/runtime/jobs.ts")
check("۴-کار-rolling-backup", 'rollingBackup: "rolling-backup"' in jobs_src and "runRollingBackup" in jobs_src,
      "WORKER_JOB_IDS.rollingBackup + runRollingBackup")
check("۵-کار-sacred-backup-پایدار", 'sacredBackup: "sacred-backup"' in jobs_src and 'upload/.data/sacred' in jobs_src,
      "WORKER_JOB_IDS.sacredBackup + مقصد upload/.data/sacred")
check("۵-شیر-دیسک-چرخشی", "freeDiskBytes" in jobs_src and "disk-low" in jobs_src, "شیر دیسک (پرش با شاهد)")

# ── ۶+۷) اسکریپت‌های بازیابی ──
ra = "scripts/recovery/recover-all.sh"
dfg = "scripts/recovery/db-fortress-guard.sh"
check("۶-recover-all-موجود-اجرا", os.path.isfile(ra) and os.access(ra, os.X_OK), ra)
check("۷-db-fortress-guard-موجود-اجرا", os.path.isfile(dfg) and os.access(dfg, os.X_OK), dfg)
dfg_src = read(dfg)
check("۷-زنجیره-پنج-لایه", all(m in dfg_src for m in ["rolling", "survival", "github", "VACUUM", "sacred-data-guard"]),
      "rolling→sacred→pre-stop→survival→cloud + گارد مقدس")

# ── ۸) Workflow ابری ──
wf = read(".github/workflows/db-backup.yml")
check("۸-workflow-ابری", bool(wf) and "cron: '0 3 * * *'" in wf and "db-export" in wf and "MIN_RECORDS" in wf,
      ".github/workflows/db-backup.yml")

# ── ۹) Boot Guard متصل ──
de = read("scripts/pn006/dev-entry.sh")
check("۹-boot-guard-متصل", "db-fortress-guard.sh" in de and "recover" in de, "dev-entry بند ۱-د")
wd = read("scripts/prod-watchdog.sh")
check("۹-watchdog-اولویت-محلی", "db/custom.db" in wd and 'DATABASE_URL="$LIVE_DB_URL"' in wd,
      "prod-watchdog اولویت دیسک محلی (شورا-ن۰۶۸)")

# ── ۱۰) زندهٔ محلی WAL (شورا-ن۰۶۸) ──
mode_out, mode_ok = sh("bun -e 'const {Database}=require(\"bun:sqlite\"); const db=new Database(\"/home/z/my-project/db/custom.db\",{readonly:true}); const m=db.query(\"PRAGMA journal_mode\").get(); console.log(JSON.stringify(m)); db.close();' 2>/dev/null")
check("۱۰-زندهٔ-محلی-wal", '"wal"' in mode_out.lower(), f"journal_mode={mode_out[:40]}")

# ── شاهدهای تکمیلی ──
probe_out, probe_ok = sh(f"bun scripts/pn041/db-probe.ts {fortress} 2>/dev/null")
check("ت-۱-قلعه-سلامت-کامل", probe_ok, probe_out[:120] if probe_out else "probe ناکام")
manifest = read("upload/.runtime/rolling-backups.json")
check("ت-۲-مانیفست-چرخشی", "PropertyRecord" in manifest, "upload/.runtime/rolling-backups.json")
ex_route = os.path.isfile("src/app/api/admin/db-export/route.ts")
check("ت-۳-روت-برون‌بری", ex_route and "verifyOwnerBearerToken" in read("src/app/api/admin/db-export/route.ts"),
      "/api/admin/db-export + احراز Bearer")

summary = {
    "guard": "audit-db-fortress (PN-041 · شورا-ن۰۶۷)",
    "checks": checks,
    "violations": violations,
    "pass": len(checks) - len(violations),
    "fail": len(violations),
    "total": len(checks),
}
with open(out_path, "w", encoding="utf8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"guards-db-fortress: {summary['pass']}/{summary['total']} " + ("✅ PASS" if not violations else "❌ FAIL"))
for v in violations:
    print(f"  ✗ {v}")
sys.exit(1 if violations else 0)
PYEOF
