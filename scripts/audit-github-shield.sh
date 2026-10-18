#!/usr/bin/env bash
# ============================================================================
# PN-040 — گارد audit-github-shield.sh (گام ۴ · جلسهٔ ۰۶۶)
# سپر دفاعی گیت‌هاب — قرارداد کامل چهار بند:
#   ۴.۱ presence اسکریپت سپر عالی + remote origin
#   ۴.۲ منطق: fetch origin main → checkout -B main → install → build → restart
#   ۴.۳ مرجع reset-guard = GitHub (origin) + واگذاری بازیابی به سپر
#   ۴.۴ روت /api/version با کلید drift (مغایرت HEAD ↔ BUILD_ID)
#   + قلاب بوت dev-entry + GitHub Action اطلاع‌رسانی
# هر ردیف = شاهد ساختاری مستند (فایل/محتوا) — صفر ادعای بدون شاهد.
# خروجی: download/pn040/guards-github-shield.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn040/guards-github-shield.json

python3 - "$OUT" <<'PYEOF'
import json, os, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
    return r.stdout.strip(), (r.returncode == 0)

def read(path):
    try:
        with open(path, encoding="utf8") as f:
            return f.read()
    except Exception:
        return ""

def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        violations.append(f"{name}: {detail}")

# ── ۴.۱: وجود سپر عالی + remote origin ──
supreme = read("scripts/recovery/github-supreme-guard.sh")
check("۴.۱-سپر-عالی-موجود", bool(supreme), "scripts/recovery/github-supreme-guard.sh")
origin_url, ok_origin = sh("git remote get-url origin")
check("۴.۱-remote-origin-گیت‌هاب", ok_origin and "github.com" in origin_url, origin_url[:60] if ok_origin else "remote origin غایب")

# ── ۴.۲: منطق سپر — fetch/reset/install/build/restart/مهر ──
for marker, label in [
    ("git ls-remote", "ls-remote (داوری origin/main)"),
    ("git checkout -q -B main", "checkout -B main"),
    ("bun install", "نصب وابستگی‌ها"),
    ("bun run build", "بیلد production"),
    ("pkill -f \"standalone/server.js\"", "خاتمه سرور برای ری‌استارت نگهبان"),
    ("daemonize-watchdog.py", "دیمن‌سازی نگهبان (درس مرز reap)"),
    ("/api/version", "وارسی مهر زنده"),
    ("sacred-data-guard.ts", "شاهد گارد مقدس پس از بازیابی"),
    ("rate_limited", "نرخ‌حد ۳۰ دقیقه"),
]:
    check(f"۴.۲-{label}", marker in supreme, f"marker: {marker!r} یافت نشد")

# ── ۴.۳: reset-guard → GitHub ──
reset_guard = read("scripts/recovery/reset-guard.sh")
check("۴.۳-مرجع-origin-در-reset-guard", 'remote get-url origin' in reset_guard, "remote_url() به origin ارجاع ندارد")
check("۴.۳-واگذاری-به-سپر", "github-supreme-guard.sh" in reset_guard, "recover به سپر عالی واگذار نشده")

# ── ۴.۴: روت version با drift ──
version_route = read("src/app/api/version/route.ts")
check("۴.۴-کلید-drift-در-روت", "computeDrift" in version_route and "drift," in version_route, "کلید drift در پاسخ نیست")
check("۴.۴-مغایرت-head-build", "match" in version_route and "buildSha" in version_route, "قرارداد match/buildSha غایب")
check("۴.۴-قرارداد-پایدار", "buildId" in version_route and "fingerprint" in version_route, "کلیدهای قبلی تغییر کرده‌اند!")

# ── بوت کانتینر: قلاب در dev-entry ──
dev_entry = read("scripts/pn006/dev-entry.sh")
check("بوت-قلاب-سپر-در-dev-entry", "github-supreme-guard.sh" in dev_entry, "قلاب سپر در بوت نیست")

# ── GitHub Action اطلاع‌رسانی ──
action = read(".github/workflows/github-shield-alert.yml")
check("اکشن-اطلاع‌رسانی-موجود", bool(action) and "github-shield-version-drift" in action, ".github/workflows/github-shield-alert.yml")
check("اکشن-داوری-drift", "drift.match" in action, "اکشن کلید drift را داور نمی‌کند")
check("اکشن-issue-فوری", "gh issue create" in action, "ایجاد Issue در مغایرت نیست")

result = {
    "guard": "audit-github-shield.sh (PN-040/گام-۴)",
    "ok": len(violations) == 0,
    "checksTotal": len(checks),
    "checksPass": sum(1 for c in checks if c["ok"]),
    "violations": violations,
    "checks": checks,
}
with open(out_path, "w", encoding="utf8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(json.dumps({"ok": result["ok"], "pass": f"{result['checksPass']}/{result['checksTotal']}", "violations": violations}, ensure_ascii=False))
sys.exit(0 if result["ok"] else 1)
PYEOF
