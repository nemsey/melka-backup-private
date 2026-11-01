#!/usr/bin/env bash
# ============================================================================
# PN-041-R — گارد audit-auth-resilience.sh (شورا-ن۰۶۸ · فاز ۵)
# ---------------------------------------------------------------------------
# ۱۸ بند داوری رفع ۳ باگ ورود + ۵ دلیل قطعی رله + بهینه‌سازی SQLite:
#   الف) باگ ۱ ورود مستر — ۵ بند (واکنش زنده + پراگما + env)
#   ب) باگ ۲ تایم‌اوت ۹۰ث — ۳ بند (تطبیقی ۲۰/۱۵۰ + پیام صادقانه)
#   ج) باگ ۳ کد نصب — ۲ بند (شاهد زنده + خطای شفاف DB_BUSY)
#   د) ۵ دلیل رله — ۶ بند (MIUI/Long-Poll/فیوز/مهلت/ALT_URL/خوددرمانی)
#   هـ) معماری DB — ۲ بند (WAL محلی + زیرپروسه بکاپ)
# هر ردیف = شاهد ساختاری/زنده — صفر ادعای بدون شاهد.
# خروجی: download/pn041-r/guards-auth-resilience.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn041-r/guards-auth-resilience.json
mkdir -p download/pn041-r

python3 - "$OUT" <<'PYEOF'
import json, os, subprocess, sys, time

out_path = sys.argv[1]
violations = []
checks = []

def sh(cmd, timeout=30):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip(), (r.returncode == 0)
    except Exception:
        return "", False

def read(p):
    try:
        with open(p, encoding="utf8") as f:
            return f.read()
    except Exception:
        return ""

def check(name, ok, detail=""):
    checks.append({"check": name, "ok": bool(ok), "detail": detail})
    if not ok:
        violations.append(f"{name}: {detail}")

# ═══ الف) باگ ۱ — ورود کد مستر ═══
envp = json.loads(read("env.platform.json"))
master = envp.get("MASTER_ACCESS_CODE", "")
t0 = time.time()
login_out, login_ok = sh(
    f'''curl -s -m 20 -X POST http://localhost:3000/api/auth/master-login -H "Content-Type: application/json" -d '{{"masterCode": "{master}"}}' -o /tmp/pn041r-g-login.json -w "%{{http_code}}"''',
)
login_ms = int((time.time() - t0) * 1000)
body = read("/tmp/pn041r-g-login.json")
check("ف-۱-ورود-مستر-زنده", login_out == "200" and '"ok":true' in body.replace(" ", ""),
      f"HTTP {login_out} · {login_ms}ms (پیش از رفع: UNKNOWN/۵۰۰۰ms)")
check("ف-۲-ورود-مستر-سریع", login_ms < 3000, f"{login_ms}ms < ۳۰۰۰ms (شورا: <۳۰ث · واقعی: sub-second)")

src_db_opt = read("src/lib/db-optimize.ts")
check("ف-۳-پراگماهای-بوت", all(m in src_db_opt for m in
      ["busy_timeout=10000", "cache_size=-20000", "mmap_size=268435456", "synchronous=NORMAL", "wal_autocheckpoint=1000"]),
      "پنج پراگمای مصوب شورا-ن۰۶۸ (بند ۴.۱-۴.۳)")
check("ف-۴-پراگما-در-بوت", "optimizeSqliteOnBoot" in read("src/instrumentation.ts"),
      "instrumentation.register → sqlite-optimize-boot")
check("ف-۵-env-اتصال", "connection_limit=1&socket_timeout=30" in envp.get("DATABASE_URL", ""),
      "DATABASE_URL زندهٔ محلی + پارامترهای اتصال")

# ═══ ب) باگ ۲ — تایم‌اوت ۹۰ث → تطبیقی ═══
api_src = read("src/lib/client/api.ts")
check("ب-۱-مهلت-سبک-۲۰ث", "LIGHT_TIMEOUT_MS = 20_000" in api_src, "سبک (ورود) ۲۰ث")
check("ب-۲-مهلت-سنگین-۱۵۰ث", "HEAVY_TIMEOUT_MS = 150_000" in api_src, "سنگین (فهرست‌ها) ۱۵۰ث")
check("ب-۳-پیام-صادقانه", "رلهٔ گوشی خاموش یا بی‌پاسخ است" in api_src,
      "شکست سریع با راهنمای رله (نه ۹۰ث سکوت)")

# ═══ ج) باگ ۳ — کد نصب ═══
enroll_out, enroll_ok = sh(
    '''curl -s -m 20 -X POST http://localhost:3000/api/admin/relay/enroll -H "Content-Type: application/json" -H "Authorization: Bearer $(python3 -c "import json; print(json.load(open('/tmp/pn041r-g-login.json'))['token'])" 2>/dev/null)" -d '{"label":"guard-check"}' -o /tmp/pn041r-g-enroll.json -w "%{http_code}"''',
)
enroll_body = read("/tmp/pn041r-g-enroll.json")
check("ج-۱-کد-نصب-زنده", enroll_out == "200" and '"ok":true' in enroll_body.replace(" ", ""),
      f"HTTP {enroll_out} (پیش از رفع: خطای خاموش)")
check("ج-۲-خطای-شفاف-DB", "DB_BUSY" in read("src/app/api/admin/relay/enroll/route.ts"),
      "خطای قفل DB → 503 DB_BUSY با پیام روشن (نه UNKNOWN)")

# ═══ د) ۵ دلیل قطعی رله ═══
script_src = read("src/lib/melk-api/relay-script.ts")
poll_src = read("src/app/api/mobile-relay/poll/route.ts")
breaker_src = read("src/lib/melk-api/circuit-breaker.ts")
jobs_src = read("src/core/runtime/jobs.ts")

check("د-۱-MIUI-wakelock-راهنما", os.path.isfile("src/core/tiles/tiles/settings/MiuiWakeLockGuide.tsx")
      and "termux-wake-lock" in script_src, "WakeLock اسکریپت + راهنمای تصویری UI")
check("د-۲-Long-Polling-۱۰۰ث", "POLL_MAX_WAIT_S = 100" in poll_src and 'wait\\\\":100' in script_src,
      "سرور ۱۰۰ث + اسکریپت wait:100 (~۸۶۰ درخواست/روز · قبلاً ۳۴۵۶)")
check("د-۳-فیوز-مستثنی-رله", "shouldBypassCircuit" in breaker_src and "/api/mobile-relay/" in breaker_src,
      "روت‌های رله مستثنی + نثبت شکست عصرِ قطع + auto-reset رلهٔ وصل")
check("د-۴-مهلت-curl-پارامتری", 'timeout_s="\\${MELKA_CURL_TIMEOUT:-35}"' in script_src
      and "MELKA_CURL_TIMEOUT=110 signed_curl" in script_src, "poll=۱۱۰ · سایر=۳۵")
check("د-۵-ALT-URL-پایدار", envp.get("MELK_RELAY_ALT_URL") == "https://c1vdh8442240-d.space-z.ai"
      and "ALT_SERVER_URL" in script_src, "URL publish پایدار + سوئیچ خودکار + Boot Guard")
check("د-۶-خوددرمانی-DB", "db-health-probe" in jobs_src and "process.exit(75)" in jobs_src,
      "۳ شکست پیاپی = ری‌استارت نگهبان (۵ث) — کار Worker ۲۱")

# ═══ هـ) معماری DB (شورا-ن۰۶۸) ═══
mode_out, _ = sh('''bun -e 'const {Database}=require("bun:sqlite"); const db=new Database("/home/z/my-project/db/custom.db",{readonly:true}); const m=db.query("PRAGMA journal_mode").get(); console.log(JSON.stringify(m)); db.close();' 2>/dev/null''')
check("ه-۱-WAL-محلی", '"wal"' in mode_out.lower(), f"journal_mode={mode_out[:40]}")
check("ه-۲-بکاپ-زیرپروسه", "runVacuumSubprocess" in jobs_src and "vacuum-copy.ts" in jobs_src,
      "اتصال یگانه هرگز بلاک نمی‌شود (فاز ۴)")

summary = {
    "guard": "audit-auth-resilience (PN-041-R · شورا-ن۰۶۸)",
    "checks": checks,
    "violations": violations,
    "pass": len(checks) - len(violations),
    "fail": len(violations),
    "total": len(checks),
}
with open(out_path, "w", encoding="utf8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)
print(f"guards-auth-resilience: {summary['pass']}/{summary['total']} " + ("✅ PASS" if not violations else "❌ FAIL"))
for v in violations:
    print(f"  ✗ {v}")
sys.exit(1 if violations else 0)
PYEOF
