#!/usr/bin/env bash
# ============================================================================
# PN-042 — گارد audit-resurrect-ultimate.sh (جلسهٔ ۰۷۰ · بند ۳.۳)
# دکترین رستاخیز نهایی — قرارداد یازده بند:
#   ۱) فایل رستاخیز در ریشهٔ مخزن + اجرایی
#   ۲) منطق هفت‌گامی در متن (fetch → reset → داده → نصب/بیلد → دیمن → تأیید)
#   ۳) زنجیرهٔ بازیابی داده: db/custom.db → upload/.data → rolling → .survival
#   ۴) remote origin = گیت‌هاب (melka-backup-private)
#   ۵) حضور در گیت‌هاب: raw URL پاسخ می‌دهد + sha256 منطبق با نسخهٔ محلی
#   ۶) صفر ارجاع به سازوکارهای منسوخ در مسیرهای فعال
#      (recover-all · github-supreme-guard · db-fortress-guard)
#   ۷) reset-guard بدون واگذاری به سپرِ منسوخ
#   ۸) dev-entry: راهنمای رستاخیز (curl) — بدون قلاب بازیابی خودکار
#   ۹) workflow forbid-rollback.yml + منطق ترمیم خودکار
#  ۱۰) اکشن github-shield: دستور بازیابی = curl رستاخیز
#  ۱۱) قرارداد /api/version (drift) دست‌نخورده — انتقال از گارد سپرِ منسوخ
# هر ردیف = شاهد ساختاری مستند (فایل/محتوا) — صفر ادعای بدون شاهد.
# خروجی: download/pn042/guards-resurrect-ultimate.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn042/guards-resurrect-ultimate.json

python3 - "$OUT" <<'PYEOF'
import hashlib, json, os, subprocess, sys, time

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

def sh(cmd, timeout=60):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), (r.returncode == 0)
    except Exception:
        return "", False

def sh_bytes(cmd, timeout=45):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, timeout=timeout)
        return r.stdout, (r.returncode == 0)
    except Exception:
        return b"", False

def read(path):
    try:
        with open(path, encoding="utf8") as f:
            return f.read()
    except Exception:
        return ""

def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()

def sha256_file(path):
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except Exception:
        return ""

def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        violations.append(f"{name}: {detail}")

# ── ۱) فایل رستاخیز در ریشه ──
RU = "resurrect-ultimate.sh"
check("۱-فایل-در-ریشه-موجود-اجرا", os.path.isfile(RU) and os.access(RU, os.X_OK), RU)
ru_src = read(RU)

# ── ۲) منطق هفت‌گامی ──
for marker, label in [
    ("git fetch", "fetch از گیت‌هاب"),
    ("git reset --hard", "reset سخت به main"),
    ("upload/.data/custom.db", "لایهٔ قلعهٔ داده"),
    ("upload/.survival", "لایهٔ بستهٔ بقا"),
    ("bun install", "نصب وابستگی‌ها"),
    ("bun run build", "بیلد production"),
    ("scripts/start-prod.sh", "راه‌اندازی دیمن"),
    ("RESURRECTION COMPLETE", "پیام موفقیت نهایی"),
    ("قانون ۱۱", "سروِ نجات‌بخش در شکست"),
]:
    check(f"۲-{label}", marker in ru_src, f"marker: {marker!r} یافت نشد")

# ── ۳) زنجیرهٔ بازیابی داده (شورا-ن۰۶۸ + دادهٔ مقدس) ──
for marker, label in [
    ("db/custom.db", "اولویت زندهٔ محلی"),
    ("upload/.data/rolling", "لایهٔ چرخشی"),
    ("SQLite format 3", "پروب سرآیند sqlite"),
    (".broken-", "مهر نسخهٔ معیوب (حذف نمی‌شود)"),
    (".stale-", "مهر نسخهٔ عقب‌مانده"),
    ("صفر مداخله", "دادهٔ مقدس لمس نمی‌شود"),
]:
    check(f"۳-{label}", marker in ru_src, f"marker: {marker!r} یافت نشد")

# ── ۴) remote origin = گیت‌هاب ──
origin_url, ok_origin = sh("git remote get-url origin")
check("۴-remote-origin-گیت‌هاب", ok_origin and "github.com" in origin_url and "melka-backup-private" in origin_url,
      origin_url[:50].replace(os.sep, "/") if ok_origin else "remote origin غایب")

# ── ۵) حضور در گیت‌هاب (raw · مخزن خصوصی = احراز توکن — اصلاح PN-042-A/شورا-ن۰۷۹) ──
# کشف PN-042-A: مخزن private است؛ raw بدون توکن ۴۰۴ می‌دهد → fetch احرازشده با توکن ریموت
# استخراج توکن بدون sed (تفکیک رشته در پایتون — مصون از لایه‌های escape)
raw_url = "https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh"
origin_url2, _ = sh("git remote get-url origin")
gh_token = ""
if "@" in origin_url2:
    cred = origin_url2.split("https://", 1)[-1].split("@", 1)[0]
    if ":" in cred:
        gh_token = cred.split(":", 1)[1].strip()
body, ok_raw = sh_bytes(f"curl -fsS -m 40 -H 'Authorization: token {gh_token}' '{raw_url}?nocache={int(time.time())}'")
check("۵-حضور-در-گیت‌هاب-احرازشده", ok_raw and len(body) > 500 and len(gh_token) > 10,
      f"raw با توکن پاسخ نداد (token-len={len(gh_token)} · body={len(body)} بایت)")
if ok_raw and body:
    local_sha = sha256_file(RU)
    remote_sha = sha256_bytes(body)
    check("۵-هم‌شانی-sha256-محلی-گیت", local_sha == remote_sha and local_sha != "",
          f"local={local_sha[:16]}… remote={remote_sha[:16]}…")

# ── ۶) صفر ارجاع به منسوخ‌ها در مسیرهای فعال ──
active_paths = ("scripts/*.sh scripts/*.py scripts/*.ts "
                "scripts/recovery scripts/mirror scripts/runtime scripts/feature-factory scripts/pg-migrate "
                "scripts/pn006/dev-entry.sh scripts/pn008 scripts/pn012 "
                "src tests .github package.json")
raw_hits, _ = sh(f"grep -rlE --exclude='audit-resurrect-ultimate.sh' 'recover-all|github-supreme-guard|db-fortress-guard' {active_paths} 2>/dev/null || true")
# ارجاع «فعال» = اشاره‌ای که منسوخ‌نگاری (منسوخ) یا ادعای منفی (not.toContain) نیست
violating = []
for f in [x for x in raw_hits.split("\n") if x.strip()]:
    lines_out, _ = sh(f"grep -nE 'recover-all|github-supreme-guard|db-fortress-guard' '{f}' 2>/dev/null")
    bad = [ln for ln in lines_out.split("\n") if ln and "منسوخ" not in ln and "not.toContain" not in ln]
    if bad:
        violating.append(f)
check("۶-صفر-ارجاع-فعال-منسوخ", not violating, f"بقایای فعال: {', '.join(violating)}")

# ── ۷) reset-guard بدون واگذاری به سپر منسوخ ──
rg_src = read("scripts/recovery/reset-guard.sh")
check("۷-reset-guard-بدون-واگذاری-منسوخ", "github-supreme-guard" not in rg_src,
      "ارجاع به سپر منسوخ در reset-guard باقی است")

# ── ۸) dev-entry: راهنمای رستاخیز + بدون قلاب خودکار ──
de = read("scripts/pn006/dev-entry.sh")
check("۸-dev-entry-راهنمای-رستاخیز", "resurrect-ultimate.sh" in de and "curl -fsSL" in de,
      "راهنمای curl رستاخیز در بوت چاپ نمی‌شود")
check("۸-dev-entry-بدون-قلاب-منسوخ", "github-supreme-guard" not in de and "db-fortress-guard" not in de,
      "قلاب بازیابی خودکار منسوخ در dev-entry باقی است")

# ── ۹) workflow forbid-rollback ──
fr = read(".github/workflows/forbid-rollback.yml")
for marker, label in [
    ("merge-base --is-ancestor", "داوری اجداد (جهت push)"),
    ("git push --force", "ترمیم خودکار بازگشت"),
    ("contents: write", "مجوز نوشتن"),
    ("push:", "قلاب روی push به main"),
]:
    check(f"۹-{label}", marker in fr, f"marker: {marker!r} یافت نشد")

# ── ۱۰) اکشن shield: دستور بازیابی = curl رستاخیز ──
action = read(".github/workflows/github-shield-alert.yml")
check("۱۰-اکشن-نام-پایدار", "github-shield-version-drift" in action, "نام اکشن تغییر کرده است")
check("۱۰-اکشن-داوری-drift", "drift.match" in action, "اکشن کلید drift را داور نمی‌کند")
check("۱۰-اکشن-issue-فوری", "gh issue create" in action, "ایجاد Issue در مغایرت نیست")
check("۱۰-اکشن-دستور-رستاخیز", "resurrect-ultimate.sh" in action and "github-supreme-guard" not in action,
      "دستور بازیابی اکشن باید curl رستاخیز باشد")

# ── ۱۱) قرارداد /api/version (انتقال از گارد سپرِ منسوخ) ──
version_route = read("src/app/api/version/route.ts")
check("۱۱-کلید-drift-در-روت", "computeDrift" in version_route and "drift," in version_route, "کلید drift در پاسخ نیست")
check("۱۱-مغایرت-head-build", "match" in version_route and "buildSha" in version_route, "قرارداد match/buildSha غایب")
check("۱۱-قرارداد-پایدار", "buildId" in version_route and "fingerprint" in version_route, "کلیدهای قبلی تغییر کرده‌اند!")

summary = {
    "guard": "audit-resurrect-ultimate (PN-042 · جلسهٔ ۰۷۰ · بند ۳.۳)",
    "checks": checks,
    "violations": violations,
    "pass": len(checks) - len(violations),
    "fail": len(violations),
    "total": len(checks),
}
with open(out_path, "w", encoding="utf8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"guards-resurrect-ultimate: {summary['pass']}/{summary['total']} " + ("✅ PASS" if not violations else "❌ FAIL"))
for v in violations:
    print(f"  ✗ {v}")
sys.exit(1 if violations else 0)
PYEOF
