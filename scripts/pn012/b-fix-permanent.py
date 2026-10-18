#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pn012-b-fix-permanent.py — MELKA PN-012-B
شاهد رفع قطعی ۵۰۰ (بحران ششم) — راه‌حل ۱ + ۲ + ۳ ترکیبی طبق دستور شورا
"""
import json, subprocess, datetime, hashlib, os

ROOT = "/home/z/my-project"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30, cwd=ROOT)
    return {"ok": r.returncode == 0, "out": (r.stdout + r.stderr).strip()}

def curl(path, method="GET", data=None):
    d = f" -d '{data}'" if data else ""
    r = sh(f"curl -s --max-time 8 -o /dev/null -w '%{{http_code}}' -X {method}{d} http://localhost:3000{path}")
    return r["out"]

escrow_status = json.loads(sh("bun scripts/pn012/escrow-manager.ts status")["out"])

d = {
    "schema": "melka-pn012-b-fix-permanent", "doc": "ملکا-شورا-ن۰۱۲-۱۴۰۵ · بخش ۶ مرحله B", "generatedAt": NOW,
    "diagnosis_basis": "download/pn012/diagnosis.json — ریشه: escrow یتیم (کد خوانندهٔ PN-011 هرگز کامیت نشد; پلتفرم MELK_TOKEN_KEY را از .env.local پاک کرد)",
    "solution_design": {
        "راه‌حل-۱ شورا (انتقال escrow به db/.runtime)": "اجرا شد — db/ در هر ۶ بحران زنده ماند → مکان اول escrow",
        "راه‌حل-۱ بند-ب شورا (سند env رمزنگاری‌شده در مخزن گیت با کلید مشتق از کد مستر)": "اجرا شد — env.escrow.enc (AES-256-GCM · scrypt N=32768,r=8 از کد مستر · salt تصادفی) — زنده در نابودی کامل کانتینر از طریق گیت/آینه",
        "راه‌حل-۳ شورا (نوشتن همزمان در ۳ محل)": "اجرا شد — db/.runtime + upload/.runtime + env.escrow.enc (triple-redundant)",
        "راه‌حل-۲ شورا (systemd/crontab/قلاب بوت)": "قلاب بوت چندمسیره اجرا شد — در هر ۳ مسیر بوت: dev-entry.sh (مسیر پلتفرم) + prod-watchdog.sh (هر اسپاون) + start.sh (بوت رسمی). systemd در کانتینر در دسترس نیست — قلاب بوت پوشش کامل می‌دهد",
        "راه‌حل-۴ شورا (سقف — انتقال پلتفرم)": "مستند در توصیه: تا وقتی ریست‌ها تکرار شوند triple-escrow هر ریست را به وقفهٔ < بوت کانتینر (~۱ دقیقه) تبدیل می‌کند — تصمیم ماندن/انتقال با مالک (سند ن۰۰۴-ف)",
    },
    "components": {
        "scripts/pn012/escrow-manager.ts": "مدیر escrow یگانه — ۴ فرمان restore/status/verify/encrypt · صفر وابستگی به node_modules · idempotent · هرگز مقدار موجود .env.local را بازنویسی نمی‌کند",
        "scripts/prod-watchdog.sh": "قلاب escrow داخل حلقه + source دوبارهٔ .env.local پیش از هر اسپاون",
        "scripts/pn006/dev-entry.sh": "قلاب escrow پس از recovery-guard (مسیر بوت پلتفرم: bun run dev)",
        "start.sh": "قلاب escrow (بوت رسمی)",
        ".gitignore": "db/.runtime/ اضافه شد (قانون راز-در-گیت-ممنوع)؛ env.escrow.enc عمداً track می‌شود (رمزنگاری‌شده)",
    },
    "restore_chain": [".env.local (env واقعی — اولویت مطلق)", "db/.runtime/boot-secrets.json", "upload/.runtime/boot-secrets.json", "env.escrow.enc (رمزگشایی با کد مستری که پلتفرم در .env.local حفظ می‌کند)", "هیچ‌کدام → fail-fast امنیتی می‌ماند (رفتار صحیح SEC-1/SEC-2)"],
    "live_drills": {
        "آزمون-۱ (ریست هفتم شبیه‌سازی‌شده)": {
            "سناریو": "حذف MELK_TOKEN_KEY از .env.local + حذف env.platform.json — دقیقاً الگوی پلتفرم",
            "نتیجه": "بوت کامل از مسیر پلتفرم (bun run dev) → بازیابی خودکار از db/.runtime → HTTP 200",
            "شاهد_log": "[escrow] RESTORED — منبع: db/.runtime/boot-secrets.json · کلیدهای اعمالی: MELK_TOKEN_KEY, env.platform.json(rebuild)",
        },
        "آزمون-۲ (فاجعهٔ کامل — فقط نسخهٔ رمزنگاری‌شده)": {
            "سناریو": "حذف «هر دو» escrow متنی + حذف کلید از .env.local + حذف env.platform.json — تنها بازمانده: env.escrow.enc رمزنگاری‌شده در گیت",
            "نتیجه": "بوت از مسیر پلتفرم → رمزگشایی env.escrow.enc با کد مستر (80211186 که پلتفرم در .env.local حفظ می‌کند) → بازیابی کامل → بازتولید هر ۳ مکان escrow → HTTP 200",
            "شاهد_log": "[escrow] RESTORED — منبع: env.escrow.enc (رمزگشایی با کد مستر) · کلیدهای اعمالی: MELK_TOKEN_KEY, env.platform.json(rebuild)",
        },
        "نکتهٔ فرایندی": "در آزمون-۲ کشف شد: نگهبانِ در حال اجرا پس از پچ، نسخهٔ قدیمی حلقه را در حافظه دارد → ری‌استارت زنجیره لازم است؛ همچنین الگوی double-fork برای بقای دیمن در محیط ابزار لازم است — هر دو در مستندات ثبت شدند",
    },
    "current_live_state": {
        "health": curl("/api/health"),
        "home": curl("/"),
        "master_login_OWNER": curl("/api/auth/master-login", "POST", '{"masterCode":"80211186"}'),
        "wrong_code_rejected": curl("/api/auth/master-login", "POST", '{"masterCode":"11111111"}'),
        "worker_alive": sh("ps -eo cmd | grep -c '[w]orker.ts'")["out"],
        "watchdog_alive": sh("ps -eo cmd | grep -c '[p]rod-watchdog'")["out"],
        "escrow_consistent": escrow_status.get("consistent"),
        "keyFp16": escrow_status.get("envLocalKeyFp"),
    },
    "security_notes": [
        "fail-fast امنیتی PN-008 دست‌نخورده ماند — escrow فقط «کلید غایب» را پر می‌کند، هرگز مقدار موجود را بازنویسی نمی‌کند",
        "env.escrow.enc با scrypt سختِ حافظه (N=32768, r=8 — هر حدس ~۱۰۰ms و ۳۲MB RAM) از کد مستر ۸رقمی مشتق می‌شود — بروت‌فورس کامل ≈ ۱۰۰+ روز تک‌هسته‌ای؛ برای مخزن خصوصی قابل‌قبول؛ در صورت تمایل مالک: کد مستر بلندتر = امنیت نمایی",
        "راز plaintext هرگز وارد گیت/بستهٔ بقا نمی‌شود (درس PN-007) — فقط نسخهٔ رمزنگاری‌شده track می‌شود",
        "MASTER_ACCESS_CODE پلتفرم در .env.local همیشه حفظ می‌شود (شاهد ۶ بحران) → رمزگشایی لایهٔ ۳ در بوت خودکار ممکن است",
    ],
    "phase4_note": "مرحله D (فاز ۴ کارایی: Server Shell + Client Island + Performance Budget + Observability) — طرح در docs/PHASE-4-DESIGN.md موجود؛ اجرای آن خارج از دامنهٔ این پرونده است (progress در phase4-progress.json)",
}

with open(f"{ROOT}/download/pn012/fix-permanent.json", "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print("OK → download/pn012/fix-permanent.json")
print(json.dumps(d["current_live_state"], ensure_ascii=False, indent=1))
