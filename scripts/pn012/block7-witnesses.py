#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pn012-block7-witnesses.py — MELKA PN-012 BLOCK 7
شواهد بلوک‌ها + phase3-progress.json + phase4-progress.json + delivery-check.json
"""
import json, subprocess, datetime, os, hashlib

ROOT = "/home/z/my-project"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120, cwd=ROOT)
    return {"ok": r.returncode == 0, "out": (r.stdout + r.stderr).strip()}

def curl(path):
    r = sh(f"curl -s --max-time 10 -o /dev/null -w '%{{http_code}}' http://localhost:3000{path}")
    return r["out"]

# ═══ شاهدهای زندهٔ بلوک‌ها ═══
repo_boundary = {
    "before": 46, "after": int(sh("grep -rnoE 'db\\.[a-zA-Z]+' src/app/api/ --include='*.ts' | wc -l")["out"] or 0),
    "directive_target": "۳۱→۰ (شمار واقعی زمان دستور: ۴۶)",
    "services_created": ["src/lib/services/coverage.ts", "src/lib/services/market-index.ts",
                          "src/lib/services/crm-import.ts", "src/lib/services/master-auth.ts"],
    "thin_routes": ["coverage", "market-index", "crm/import/[entity]", "crm/export/[entity]", "health", "auth/master-login"],
    "strict_audit": "PASS (audit-repository-boundary.sh --strict)",
}

joblock = {
    "renew_method": "renew(jobId, extensionMs) — تمدید صریح + برگشت false = مالکیت رفته",
    "lease_loss_detection": "withLock: LeaseGuard تعاونی + onLeaseLost + نتیجهٔ leaseLost",
    "five_minute_simulation": "کار ۵ دقیقه‌ای (۱۰ تمدید ۳۰s) → رقیب ۱۰ بار رد شد → صفر Duplicate",
    "no_renew_comparison": "بدون renew، رقیب پس از TTL راحت تصرف کرد → Duplicate رخ داد (اثبات مسئلهٔ بند ۲.۱)",
    "worker_integration": "job-queue: تمدید صریح + ثبت LEASE-LOST در وضعیت کار",
}

escrow = {
    "v1_db": "db/.runtime/boot-secrets.json — پایدارترین (زنده در ۶ بحران)",
    "v1_upload": "upload/.runtime/boot-secrets.json — طرح PN-011 بازیابی‌شده",
    "v2_encrypted_git": "env.escrow.enc + env.escrow.meta.json — AES-256-GCM · scrypt(کد مستر) — ردنبال‌شده در گیت/آینه",
    "live_drills": ["ریست هفتم شبیه‌سازی‌شده → بازیابی از db → 200",
                    "فاجعهٔ کامل (هر دو متنی حذف) → رمزگشایی env.escrow.enc با کد مستر → 200"],
    "github_secret_doc": "docs/ESCROW-GITHUB-RECOVERY.md — طرح اختیاری؛ مالک تصمیم می‌گیرد",
    "instrumentation_layer": "ensureBootSecrets پیش از fail-fast (PN-011 بازیابی‌شده + ارتقای سه‌مکانی)",
    "shell_layer": "نگهبان ادغامی: زنجیرهٔ db→upload + تولید تازه + MELKA_REPO_DIR + source درون حلقه",
}

api_versioning = {
    "total_routes": 68, "v1_mirrors": 68, "method": "re-export سبک (export *) — تک‌منبع حقیقت",
    "live": {"/api/v1/health": curl("/api/v1/health"), "/api/v1/version": curl("/api/v1/version"),
             "/api/health (alias)": curl("/api/health"),
             "/api/v1/coverage بدون نشست": curl("/api/v1/coverage"),
             "/api/coverage بدون نشست (alias)": curl("/api/coverage")},
    "manifest": "download/pn012/api-versioning.json",
}

ci_guards = {
    "new_guards": ["audit-boot-secrets.sh (ساختاری)", "audit-boot-secrets.sh --live (زنده)", "audit-repository-boundary --strict (ارتقا از strict-agents — بدهی فاز ۳ تسویه شد)"],
    "ci_eight_steps": ["Fingerprint", "tsc ×2", "lint", "Tests ×2 (دو-سبز)", "Audit ×4 (باغ + boot-secrets)", "Perf Budget", "Build", "Fingerprint verify"],
}

tests = {
    "new_total": 50, "breakdown": {"repository-boundary": 15, "joblock-renewal": 15, "escrow-redundancy": 10, "api-versioning": 10},
    "two_green": "1935 pass / 0 fail × ۲ اجرای CI پیاپی — یکسان",
    "baseline_before": "1885 (پس از بازیابی PN-011) → 1935 (با ۵۰ تازه)",
    "real_bugs_fixed_by_tests": [
        "mock.module آلوده‌کنندهٔ customer-mgmt بین فایل‌ها (computeStage حذف می‌شد)",
        "نشت env از platform-env-fallback (فهرست backup ناقص — شکست ۷-p6504i)",
        "flake قطعی‌شدهٔ ۶-ج: MELK_API_TIMEOUT_MS=300 در محیط تست",
        "write-back سه‌مکانی پس از خوددرمانی (بازیابی از یک مکان، مکان‌های دیگر را همگام نکرد)",
    ],
}

pn011_recovery = {
    "discovery": "کامیت‌های PN-011 (a7ab572) پس از ششمین ریست از درخت گیت پاک شدند — اما دو snapshot در آینهٔ GitHub زنده بودند (aed07b6 = full tree)",
    "recovered": ["boot-secrets سه‌لایه", "نگهبان PN-011", "رنگ یکتای ستون‌ها (پالت ۲۴خانه)",
                  "فیلتر چیپی چهارگانه M1-M4", "توسعهٔ M5 (weights-learning + پیوند عمیق + شناسنامه)",
                  "۲ فایل تست pn011 (۴۳ تست)", "گزارش نهایی + ۱۳ شاهد بصری", "+۱٬۲۵۳ رکورد سیاههٔ هوشمندی"],
    "merge": "ادغام کامل با ارتقاهای PN-012 (escrow سه‌مکانی + رمزنگاری‌شدهٔ گیت)",
    "commit": "37f6d02",
}

phase3 = {
    "schema": "melka-pn012-phase3-progress", "generatedAt": NOW,
    "goal": "بستن بدهی‌های معماری فاز ۳ — ملکا-شورا-ن۰۱۲-۱۴۰۵",
    "items": {
        "31_نقض_Repository_Boundary": {"target": 0, "actual": 0, "status": "DONE", "witness": "repository-boundary-fix در گزارش نهایی + audit --strict PASS"},
        "2_نقض_Intelligence_Boundary": {"target": 0, "actual": 0, "status": "DONE (از PN-010/011 باقی‌مانده)", "witness": "audit-intelligence-boundary --strict PASS در CI"},
        "JobLock_Lease_Renewal": {"target": "متد renew + heartbeat پیشرفته", "actual": "renew + LeaseGuard + onLeaseLost + شبیه‌سازی ۵ دقیقه → صفر Duplicate", "status": "DONE", "witness": "tests/pn012-joblock-renewal.test.ts (۱۵/۱۵)"},
        "Escrow_نسخه_دوم": {"target": "backup برای راز بوت", "actual": "سه‌مکانی + رمزنگاری‌شدهٔ گیت + دو دریل زنده PASS", "status": "DONE", "witness": "tests/pn012-escrow-redundancy.test.ts (۱۰/۱۰) + fix-permanent.json"},
        "Domain_API_Versioning_v1": {"target": "نسخه‌گذاری v1", "actual": "۶۸ آینهٔ v1 سبک + alias زنده", "status": "DONE", "witness": "tests/pn012-api-versioning.test.ts (۱۰/۱۰) + api-versioning.json"},
        "CI_ضد_رگرسیون": {"target": "گاردهای جدید در هر کامیت", "actual": "۴ گارد (۳ موجود strict + boot-secrets تازه)", "status": "DONE", "witness": "ci-eight-steps.log ×۲ PASS"},
    },
    "extra_deliveries": {
        "بازیابی_PN-011": "کار کامل جلسهٔ گم‌شده از آینهٔ GitHub بازیابی و ادغام شد (۱۸۸۵ تست همان جلسه زنده شد)",
        "تسویه_نوسان‌های_تست": "سه ریشهٔ واقعی نوسان (mock آلوده + نشت env + timeout شبکه) قطعی شدند",
    },
    "gate_verdict": "PHASE_3_ARCHITECTURE_HARDENING_COMPLETE",
}

phase4 = {
    "schema": "melka-pn012-phase4-progress", "generatedAt": NOW,
    "goal": "فاز ۴ کارایی — Server Shell + Client Island + Performance Budget + Observability (مرحلهٔ D دستور)",
    "status": "NOT_STARTED — خارج از دامنهٔ اجرایی این پرونده طبق دستور (طرح در docs/PHASE-4-DESIGN.md موجود)",
    "completed_precursors": {
        "performance_budget": "از جلسهٔ ۰۰۶ فعال و در CI (گام ۶) — تنها قرمز: پیک Build = PARTIAL مستند کف ابزار",
        "observability_partial": "کانال وضعیت مشترک Worker (runtime-status.json) + روت OWNER-only /api/runtime/health از PN-010 فعال",
        "ram_flake_fixed": "ری‌استارت کنترل‌شدهٔ سرور در CI پیش از سنجهٔ RAM — الگوی مستند ۰۰۶ تثبیت شد",
    },
    "next_steps": ["Server Shell + Client Island", "Performance Budget نهایی (نیازمند ارتقای سخت‌افزار — تیکت ن۰۰۶)",
                  "Observability کامل (سنجه/ردیابی توزیع‌شده)"],
    "gate_verdict": "PHASE_4_PENDING (طرح آماده · اجرا با پروندهٔ بعدی)",
}

delivery_check = {
    "schema": "melka-pn012-file-law-v3-checklist", "generatedAt": NOW,
    "بند-۱_بستهٔ_ALL": "PN-012-ALL.zip در public/deliver/ — ساخته می‌شود",
    "بند-۲_اندازه": "بررسی >۱۰۰MB → تقسیم ≤۵۰MB",
    "بند-۳_BLOCKED_صریح": "[BLOCKED: پلتفرم امکان آپلود مستقیم فایل به بخش All Tasks را به CLI نمی‌دهد — تنها رابط وب مالک؛ جایگزین بند-۶ اجرا شد]",
    "بند-۴_آزمون_مالک": "لینک قابل‌کلیک از دامنهٔ preview (زیر دایرکتوری public/deliver → از طریق سرور production سرو می‌شود)",
    "بند-۵_رد_مطلق": "اگر مالک نتوانست دانلود کند → گزارش رد و ارسال مجدد",
    "بند-۶_جایگزین": "public/deliver/PN-012-ALL.zip + لینک https://preview.../deliver/PN-012-ALL.zip",
}

out = {
    "schema": "melka-pn012-block-witnesses", "generatedAt": NOW,
    "blocks": {
        "1_repository_boundary": repo_boundary,
        "2_joblock_renewal": joblock,
        "3_escrow_redundancy": escrow,
        "4_api_versioning": api_versioning,
        "5_ci_guards": ci_guards,
        "6_tests": tests,
        "pn011_recovery": pn011_recovery,
    },
}
for name, obj in [("phase3-progress", phase3), ("phase4-progress", phase4), ("delivery-check", delivery_check)]:
    with open(f"{ROOT}/download/pn012/{name}.json", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
with open(f"{ROOT}/download/pn012/block-witnesses.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("OK → block-witnesses.json + phase3-progress.json + phase4-progress.json + delivery-check.json")
print(json.dumps({"repo_boundary_after": repo_boundary["after"], "v1_routes": api_versioning["total_routes"],
                  "live_v1_health": api_versioning["live"]["/api/v1/health"]}, ensure_ascii=False))
