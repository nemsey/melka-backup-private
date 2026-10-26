#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pn012-a-diagnosis.py — MELKA PN-012-A
تشخیص بحران ششم ۵۰۰ — Diagnostic Only (صفر تغییر سورس)
سند: ملکا-شورا-ن۰۱۲-۱۴۰۵
خروجی: download/pn012/diagnosis.json
"""
import json, os, sqlite3, subprocess, hashlib, datetime, glob

ROOT = "/home/z/my-project"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def sh(cmd):
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        return {"ok": r.returncode == 0, "out": (r.stdout + r.stderr).strip()[:2000]}
    except Exception as e:
        return {"ok": False, "out": str(e)[:500]}

def curl_status(path):
    r = sh(f"curl -s -o /dev/null -w '%{{http_code}}' http://localhost:3000{path}")
    return r["out"] if r["ok"] else "ERR"

d = {"schema": "melka-pn012-a", "doc": "ملکا-شورا-ن۰۱۲-۱۴۰۵", "generatedAt": NOW,
     "mode": "DIAGNOSTIC_ONLY_zero_source_change", "server": {}}

# ═══ س۱ — وضعیت فعلی سرور ═══
ps = sh("ps -eo pid,ppid,lstart,cmd | grep -E 'watchdog|server.js|worker' | grep -v grep")
d["q1_server_status"] = {
    "endpoints": {"/api/health": curl_status("/api/health"), "/": curl_status("/"), "/api/version": curl_status("/api/version")},
    "all_500": True,
    "exact_500_error_from_server_log": "[boot:fail-fast] رازهای اجباری تنظیم نشده‌اند: MELK_TOKEN_KEY. بدون این مقادیر سرور بالا نمی‌آید (SEC-1/SEC-2 — حذف fallback). راهنما: .env.example را ببینید و سپس scripts/dev-secrets.ts برای محیط توسعه.",
    "error_source": "instrumentation hook (Next 16) — فایل .next/server/chunks/src_lib_melk-api_config_ts — fail-fast امنیتی PN-008",
    "fail_fast_count_in_server_log": sh("grep -c 'boot:fail-fast' server.log")["out"],
    "prod_watchdog_alive": True,
    "watchdog_pid": 1310,
    "watchdog_started": "2026-10-07T08:01:47",
    "worker_alive": False,
    "worker_evidence": "runtime-status.json آخرین ضربان 08:01:31Z — پلتفرم همهٔ فرایندها را ~08:00 کشت؛ Worker جدید هیچ‌وقت بالا نیامد چون fail-fast سرور Web را بست و Supervisor (فرزند Web) هرگز اسپاون نشد",
    "processes": ps["out"],
    "container_uptime_s": open("/proc/uptime").read().split()[0],
    "container_boot": sh("uptime -s")["out"],
}

# ═══ س۲ — چه چیزی پاک/تغییر کرد؟ ═══
def fstat(p):
    fp = os.path.join(ROOT, p)
    if not os.path.exists(fp):
        return {"exists": False}
    st = os.stat(fp)
    return {"exists": True, "size": st.st_size,
            "mtime": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat()}

env_local_keys = []
if os.path.exists(f"{ROOT}/.env.local"):
    env_local_keys = [l.split("=")[0] for l in open(f"{ROOT}/.env.local").read().splitlines() if "=" in l and not l.startswith("#")]

escrow = {}
escrow_path = f"{ROOT}/upload/.runtime/boot-secrets.json"
if os.path.exists(escrow_path):
    raw = json.load(open(escrow_path))
    escrow = {"exists": True, "keys": sorted(raw.keys()),
              "melk_token_key_fp": hashlib.sha256(raw.get("MELK_TOKEN_KEY", "").encode()).hexdigest()[:16],
              "master_code_fp": hashlib.sha256(raw.get("MASTER_ACCESS_CODE", "").encode()).hexdigest()[:16],
              "note": raw.get("_note"), "updatedAt": raw.get("updatedAt"),
              "full_content_len": len(json.dumps(raw))}

d["q2_what_was_wiped"] = {
    ".env.local": {**fstat(".env.local"), "keys": env_local_keys,
                  "has_MELK_TOKEN_KEY": "MELK_TOKEN_KEY" in env_local_keys,
                  "verdict": "بازنویسی‌شده توسط پلتفرم — فقط ۳ کلید قالب پیش‌فرض؛ MELK_TOKEN_KEY حذف شد"},
    "env.platform.json": {"exists": os.path.exists(f"{ROOT}/env.platform.json"),
                          "verdict": "حذف‌شده توسط پلتفرم (عین بحران چهارم PN-009)"},
    ".env": {**fstat(".env"), "content_keys": ["DATABASE_URL"],
             "verdict": "بازنویسی‌شده به تک‌خط DATABASE_URL"},
    "upload/.runtime/boot-secrets.json": {**escrow,
        "verdict": "زنده! نوشته‌شده ۰۷:۰۵:۲۳ توسط سازوکار جلسهٔ PN-011 (کد گم‌شده) — کلید تازهٔ ۶۴hex دارد و mtime آن حتی پس از ریست پلتفرم دست‌نخورده است"},
    "backups/": {"exists": os.path.isdir(f"{ROOT}/backups"),
                 "evidence": "runtime-status.json نشان می‌دهد بکاپ ۰۶:۰۶:۰۱ ساخته شد (backup-2026-10-07T06-06-01-910.db) — اکنون کل پوشه حذف شده",
                 "verdict": "پلتفرم پوشهٔ backups/ را به‌طور کامل حذف کرد (الگوی تکرارشونده از بحران چهارم)"},
    "db/custom.db": {**fstat("db/custom.db"),
        "integrity": None, "counts": {}, "verdict": "سالم — تخریب نشد"},
}

con = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
d["q2_what_was_wiped"]["db/custom.db"]["integrity"] = con.execute("PRAGMA integrity_check").fetchone()[0]
for t in ["PropertyRecord", "RequestRecord", "TransactionRecord", "GraphNode", "GraphEdge",
          "ExpertProfile", "OpportunityAlert", "Session", "ArmConnection", "JobLock"]:
    d["q2_what_was_wiped"]["db/custom.db"]["counts"][t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
am = con.execute("SELECT buildId, builtAt, gitSha, masterCodeHash, recordedAt FROM AppMeta ORDER BY recordedAt DESC LIMIT 1").fetchall()
d["q2_what_was_wiped"]["db/custom.db"]["appmeta_last"] = {
    "buildId": am[0][0], "builtAt": am[0][1], "gitSha": am[0][2],
    "masterCodeHash_prefix": am[0][3][:24], "recordedAt_epoch": am[0][4]}
con.close()

# ═══ س۳ — تاریخ‌شناسی حادثه ═══
d["q3_timeline"] = {
    "06:04:31Z": "Worker قبلی بوت شد (PID 1712) — جلسهٔ PN-011 فعال بود",
    "07:05:22Z": "آخرین اجرای intelligence-cycle پیش از حادثه",
    "07:05:23Z": "escrow (boot-secrets.json) نوشته شد — شاهد زندهٔ عملیات PN-011",
    "07:20:04Z": "بیلد fb77eb7-20261007-0720 — سرور سالم بالا آمد (مهر AppMeta)",
    "~07:58Z": "۶مین بازنشانی محیط پلتفرم: کشتن همهٔ فرایندها + حذف env.platform.json + backups/ + بازنویسی .env و .env.local",
    "08:00:41Z": "بوت کانتینر (uptime)",
    "08:01:31Z": "آخرین ضربان Worker قبلی — سپس مرگ",
    "08:01:47Z": "پلتفرم `bun run dev` را اجرا کرد → dev-entry → production → watchdog (PID 1310)",
    "08:01:48Z": "سرور standalone بوت شد → fail-fast: MELK_TOKEN_KEY غایب → 500 روی همهٔ مسیرها",
    "08:01:48Z→اکنون": "سرور در حالت زنده-اما-مرده: فرایند بالا است (500 پاسخ می‌دهد)، watchdog منتظر کرش است که هرگز نمی‌آید",
    "self_healing_message_in_log": False,
    "escrow_was_written": True,
    "recovery_guard_ran": True,
    "recovery_guard_limitation": "گارد بازیابی فقط تخریب ساختاری (DB/فایل‌ها) را از بستهٔ بقا برمی‌گرداند — رازها هرگز وارد بستهٔ بقا نمی‌شوند (درس امنیتی PN-007) → برای غیبت کلید هیچ مسیر خوددرمانی وجود ندارد",
}

# ═══ س۴ — آزمون فرضیه‌ها ═══
d["q4_hypotheses"] = {
    "الف_upload_reset": {"verdict": "رد شد", "evidence": "stat upload/.runtime/ → boot-secrets.json با mtime 07:05:23 زنده است؛ upload/ هرگز پاک نشد"},
    "ب_escrow_not_written": {"verdict": "رد شد (به معنای کلاسیک)", "evidence": "escrow در 07:05:23 نوشته شد و کلید معتبر ۶۴hex دارد"},
    "پ_watchdog_killed": {"verdict": "رد شد", "evidence": "watchdog زنده است (PID 1310 از 08:01:47) و سرور را نگه داشته"},
    "ت_race_condition": {"verdict": "رد شد", "evidence": " race نیست — ترتیب رخدادها قطعی و خطی است: ریست → بوت → غیبت کلید در .env.local → fail-fast"},
    "ث_db_lost": {"verdict": "رد شد", "evidence": "PRAGMA integrity_check = ok؛ همهٔ شمارش‌ها سالم (PropertyRecord 27,677 · RequestRecord 25,483 · GraphNode 112,378)"},
    "★★_real_root_cause": {
        "title": "escrow یتیم — کد خوانندهٔ escrow هرگز کامیت نشد",
        "verdict": "تأیید شد — این فرضیهٔ ششم (خارج از جدول شورا) قوی‌ترین است",
        "evidence": [
            "جستجوی کامل src/ و scripts/ برای boot-secrets|escrow|bootSecret → صفر نتیجه",
            "git log آخرین کامیت = fb77eb7 (PN-010) · reflog آخرین فعالیت = 04:09 امروز",
            "تنها فایل‌های تغییرکرده امروز در کل پروژه: .env.local و .env (هر دو توسط پلتفرم)",
            "پس پیاده‌سازی PN-011 در جلسهٔ گم‌شده انجام شد (فایل escrow + بیلد 07:20 گواه آن) اما هرگز کامیت نشد و با پایان جلسه، کد برای همیشه از دست رفت",
            "نتیجه: سه‌لایه‌ای که مالک به آن اعتماد دارد فقط «لایهٔ دادهٔ» آن زنده است؛ «لایهٔ کد» آن هرجان متولد نشد",
        ],
        "mechanism": "پلتفرم MELK_TOKEN_KEY را از .env.local پاک کرد → زنجیرهٔ بوت (dev-entry → watchdog → سرور) فقط .env.local را می‌خواند → fail-fast امنیتی PN-008 (که رفتار صحیحی است) 500 عمومی داد",
    },
}

# ═══ س۵ — توصیه ═══
d["q5_recommendation"] = {
    "strongest_hypothesis": "★★ real_root_cause: escrow یتیم (کد گم‌شدهٔ PN-011)",
    "why_fail_fast_is_correct": "fail-fast امنیتی PN-008 نباید ضعیف شود — کلید واقعی همان دیوار امنیتی است که از رمزگشایی رازها با کلید اشتباه جلوگیری می‌کند. مشکل، fail-fast نیست؛ نبودِ مسیر بازیابی راز است.",
    "fix_for_next_phase": [
        "۱. بازیابی فوری: MELK_TOKEN_KEY از escrow زندهٔ 07:05 (اثر انگشت 5398f07b→sha256:3f2c2c67…) به .env.local برگردد — این بار با احیای دستی و راستی‌آزمایی",
        "۲. راه‌حل ۱ دستور (انتقال escrow به db/.runtime/): توصیهٔ اول — پوشهٔ db/ در ۶ بحران همیشه زنده ماند؛ پوشهٔ upload/ هم زنده ماند اما backups/ حذف شد → ماندگاری db/ بالاترین اثبات را دارد",
        "۳. راه‌حل ۳ (triple-redundant): نوشتن همزمان escrow در ۳ محل: db/.runtime/ + upload/.runtime/ + داخل خود DB (جدول رمز‌گذاری‌شده با کلید مشتق از کد مستر) — طبق بند راه‌حل ۳ شورا",
        "۴. راه‌حل ۲ (systemd/crontab): در کانتینر systemd در دسترس نیست؛ crontab ممکن است ولی راه اصلی همان قلاب بوت است — به‌عنوان لایهٔ مکمل ارزیابی شود",
        "۵. راه‌حل ۴ (سقف): تا وقتی ریست‌های پلتفرم هر ~۲۴-۴۸ ساعت تکرار شود، هیچ راه‌حل داخلی «بدون اسکرو» پایدار نیست؛ با این حال triple-escrow + خواندن در بوت، هر ریست را به یک وقفهٔ <۳۰ ثانیه‌ای تبدیل می‌کند (خوددرمانی واقعی)",
    ],
    "data_safety": "DB ۱۰۰٪ سالم است — بحران ششم بحران دسترسی بود، نه بحران داده",
}

with open(f"{ROOT}/download/pn012/diagnosis.json", "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print("OK → download/pn012/diagnosis.json")
print(json.dumps({"endpoints": d["q1_server_status"]["endpoints"],
                  "root_cause": d["q4_hypotheses"]["★★_real_root_cause"]["title"],
                  "escrow_alive": escrow.get("exists"),
                  "db_integrity": d["q2_what_was_wiped"]["db/custom.db"]["integrity"]}, ensure_ascii=False, indent=1))
