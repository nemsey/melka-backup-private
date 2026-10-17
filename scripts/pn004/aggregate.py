#!/usr/bin/env python3
"""
PN-004 Phase 0-A — تجمیع خروجی‌های نهایی
خواندن scripts/pn004/results/*.json → ساخت:
  download/pn004/baseline.json         (جدول ۱ + ۲ + ۳)
  download/pn004/platform-capacity.json (جدول ۴ + سنجه‌های هدف ۲)
صفر تغییر سورس — فقط خواندن نتایج و نوشتن خروجی تشخیصی.
"""
import json, glob, os

R = "/home/z/my-project/scripts/pn004/results"
OUT = "/home/z/my-project/download/pn004"
GIT_HEAD = "a7d99bbe823fbcf4f7150b1b60237b9e4d4c8f98"
BUILD_ID = "a7d99bb-20261005-1916"
MEAS_TS = "2026-10-05T18:52–19:26 UTC (۱۴۰۵/۰۷/۱۵ ~۲۲:۲۲–۲۲:۵۶ تهران)"

def load(name):
    p = f"{R}/{name}.json"
    return json.load(open(p)) if os.path.exists(p) else None

def g(d, k, default=None):
    return d.get(k, default) if d else default

# ---------- جدول ۱ — ۱۲ سناریو ----------
A = load("A-idle"); A2 = load("A2-pre-stop")
B = load("B-login"); C = load("C-dashboard-cold"); D = load("D-onetile-api")
Drepo = load("DE-repo-probe")
E_files = ["E-listings", "E-requests", "E-crm-transactions", "E-crm-experts", "E-coverage", "E-market-index"]
E = [load(n) for n in E_files]
F = load("F-agent-api"); Ftest = load("F-agent-init")
G = load("G-small-sync-v2") or load("G-small-sync")
H = load("H-large-sync-10k-v2") or load("H-large-sync-10k-write")
Hnorm = load("H-large-sync")
Icold = load("I-build"); Iwarm = load("I-build-warm")
Jhealth = load("J-prod-health"); Jhome = load("J-prod-home"); Jlist = load("J-prod-listings")
Jpar = load("J-prod-concurrent"); Jparapi = load("J-prod-concurrent-api")
Lhome = load("L-concurrent-home"); Lapi = load("L-concurrent-api")
Z = load("Z-final-sys")

table1 = []

def row(sc, label, rss, heap, cpu, proc, db, ms, result, extra=None):
    r = {"scenario": sc, "label": label, "srv_rss_mb": rss, "heap_mb": heap,
         "cpu_pct_capacity": cpu, "proc_count": proc, "db_openers": db,
         "time_ms": ms, "result": result}
    if extra:
        r["details"] = extra
    table1.append(r)

row("A", "Idle (سیستم بی‌کار — حالت یافت‌شده)",
    g(A, "next_server_rss_before_mb"), "N/A*", g(A, "loadavg", "").split()[0] + " loadavg",
    g(A, "proc_count"), g(A, "db_openers"), 0, "✓ سنجه ثبت شد",
    {"mem_available_mb": g(A, "mem_available_before_mb"), "oom": "خیر",
     "note": "سرور dev از بوت ۱۸:۰۲ تا ۱۸:۵۲ (۴۵ دقیقه) از ~۲GB به ۲.۸۸GB رسیده بود"})
row("B", "Login (ورود مالک با کد مستر)",
    g(B, "next_server_rss_before_mb"), "N/A*", "~۰", 15, g(B, "db_openers_after"),
    g(B, "wall_ms"), "✗ HTTP 503 — PRECONDITION_FAILED",
    {"error": "کد مدیر روی سرور تنظیم نشده است", "root_cause": "زنجیرهٔ سه‌لایهٔ کد مستر شکسته: .env.local حذف شده (بازنشانی محیط) + هش AppMeta.masterCodeHash غایب (پایگاه بازسازی‌شده ۲۶MB در برابر ۵۳MB دورهٔ PN-003)",
     "health_witness": "masterAuth=none", "exit_code": "—"})
row("C", "Dashboard (خانه GET /)",
    g(C, "next_server_rss_before_mb"), "N/A*", "~۰", 15, 3,
    g(C, "wall_ms"), "✓ HTTP 200 · 25.6KB", {"warm": True})
row("D", "One Tile (یک کاشی)",
    g(D, "next_server_rss_before_mb"), "N/A*", "~۰", 15, 3,
    g(D, "wall_ms"), "△ HTTP 401 (نگهبان نشست — پیامد شکست B) + سنجهٔ مخزنی کامل",
    {"repo_probe_one_tile": {"wall_ms": 20, "heap_used_mb": 3.5, "rss_mb": 80.9,
                             "note": "listings در پایگاه فعلی ۰ ردیف است (دادهٔ آگهی از دست رفته) — برای درخواست‌ها ۲۹ms"},
     "repo_payload": "listings=0 rows (DB empty), requests=192.9KB"})
row("E", "Multi Tile (چند کاشی — ۶ مسیر)",
    max((g(x, "srv_rss_peak_mb") or 0) for x in E if x), "N/A*", "~۰-۵٪", 15, 3,
    sum((g(x, "wall_ms") or 0) for x in E if x), "△ ۶× HTTP 401 + کامپایل تنبل مسیرها در dev (۱۷-۸۸۰ms اولین ضربه)",
    {"endpoints": ["listings", "requests", "crm/transactions", "crm/experts", "coverage", "market-index"],
     "repo_probe_multi": {"total_wall_ms": 67, "heap_mb": 3.9,
                           "tiles": ["M1 آگهی 20ms", "M2 درخواست 29ms", "M3 معاملات 6ms", "M4 کارشناسان 10ms", "گراف 1ms", "هشدار فرصت 1ms"]}})
row("F", "Agent Init (راه‌اندازی ایجنت)",
    g(Ftest, "srv_rss_peak_mb"), "N/A*", g(Ftest, "system_cpu_pct_avg"), 16, 3,
    g(Ftest, "wall_ms"), "△ HTTP 401 + پروکسی تست ایجنت: سبز",
    {"test_proxy": "bun test tests/agent.test.ts — exit 0", "tree_rss_peak_mb": g(Ftest, "tree_rss_peak_mb")})
row("G", "Small Sync (~۱۰۰ رکورد — پروکسی: خط لولهٔ Bulk با ۱٬۰۰۰ رکورد)",
    g(G, "srv_rss_peak_mb"), "N/A*", g(G, "system_cpu_pct_avg"), 16, 4,
    g(G, "wall_ms"), "✓ exit 0 — ۱٬۰۰۰ رکورد، checkpoint/resume واقعی روی test.db",
    {"tree_rss_peak_mb": g(G, "tree_rss_peak_mb"), "free_min_mb": g(G, "free_min_mb"),
     "note": "نزدیک‌ترین اجرای بدون تغییر سورس/داده به سناریوی ۱۰۰ رکورد"})
row("H", "Large Sync (۱۰٬۰۰۰ رکورد)",
    g(H, "srv_rss_peak_mb"), "N/A*", g(H, "system_cpu_pct_avg"), 16, 4,
    g(H, "wall_ms"), "✓ exit 0 — ۱۰٬۰۰۰ upsert واقعی + خواندن کامل + پاک‌سازی روی test.db",
    {"tree_rss_peak_mb": g(H, "tree_rss_peak_mb"), "free_min_mb": g(H, "free_min_mb"),
     "records_per_sec": 2391, "payload_mb": 5.6,
     "normalize_21k": {"wall_ms": 441, "rows": 21000, "fields": 50742, "note": "پایپ‌لاین نرمال‌سازی B.3 خالص CPU"}})
row("I", "Build (بیلد کامل production)",
    g(Icold, "srv_rss_peak_mb"), "N/A*", g(Iwarm, "system_cpu_pct_avg"), 14, 3,
    g(Icold, "wall_ms"), "✓ exit 0 — Turbopack + TypeScript + standalone",
    {"cold_wall_ms": g(Icold, "wall_ms"), "warm_wall_ms": g(Iwarm, "wall_ms"),
     "cold_tree_rss_peak_mb": g(Icold, "tree_rss_peak_mb"), "warm_tree_rss_peak_mb": g(Iwarm, "tree_rss_peak_mb"),
     "free_min_mb_during": g(Iwarm, "free_min_mb"),
     "note": "تلاش اول شکست خورد — خطای تایپ در اسکریپت تشخیصی خود PN-004؛ بیلد Next همهٔ فایل‌های TS پروژه (شامل scripts/) را تایپ‌چک می‌کند"})
row("J", "Prod Start (استارت production)",
    None, "N/A*", "~۰-۱۰٪ (پیک راه‌اندازی ۷۱٪)", 12, 3, 1090, "✓ بوت ۱.۱ ثانیه · Ready در ۱۳۸ms",
    {"rss_after_boot_mb": 145, "rss_after_requests_mb": 158, "rss_after_20min_mb": 201,
     "home_ms": g(Jhome, "wall_ms"), "health_ms": g(Jhealth, "wall_ms"),
     "concurrent5_home_ms": g(Jpar, "wall_ms"), "concurrent5_api_ms": g(Jparapi, "wall_ms"),
     "version": "a7d99bb-20261005-1857 · env=production"})
row("K", "Restart (تعویض prod→dev)",
    g(Z, "next_server_rss_before_mb"), "N/A*", "~۵۰٪ (بوت)", 16, 2, 4180 + 9165, "✓ dev بوت ۴.۲s + کامپایل صفحهٔ اول ۹.۲s",
    {"dev_rss_after_boot_mb": 1881, "dev_rss_after_10min_mb": g(Z, "next_server_rss_before_mb"),
     "restart_path": "double-fork → init (مسیر بقا در برابر پاک‌سازی نشست ابزار)",
     "preview_after": "200 OK در ۰.۱۲۶s (لینک این نشست)"})
row("L", "Concurrent (۵ درخواست موازی)",
    g(Lhome, "srv_rss_peak_mb"), "N/A*", "~۱۰٪", 15, 3,
    g(Lhome, "wall_ms"), "✓ ۵×GET / هم‌زمان · prod: ۱۵ms برای همان بار",
    {"home_wall_ms": g(Lhome, "wall_ms"), "api_wall_ms": g(Lapi, "wall_ms"),
     "prod_home_wall_ms": g(Jpar, "wall_ms"), "oom": "خیر"})

# ---------- جدول ۲ — تفکیک Idle ----------
mi = g(A, "meminfo_kb", {}) or {}
procs = g(A, "processes", []) or []
by_comm = {}
for p in procs:
    by_comm.setdefault(p["comm"], []).append(p)

def rss_of(comm_prefix):
    return round(sum(p["rss_mb"] for c, lst in by_comm.items() if c.startswith(comm_prefix) for p in lst), 0)

user_sum = round(sum(p["rss_mb"] for p in procs), 0)
kernel_mb = round((mi.get("Slab", 0) + mi.get("KernelStack", 0) + mi.get("PageTables", 0)) / 1024, 0)

table2 = [
    {"process": "next-server (v16.1.3) — حالت dev (Turbopack+HMR+Prisma+دیمن‌های درون‌فرایندی)", "rss_mb": rss_of("next-server"), "role": "وب‌سرور اپ", "necessary": "ضروری اما در حالت اشتباه — معادل production آن ~۱۵۸-۲۰۱MB است"},
    {"process": "node .next/dev/build/postcss.js", "rss_mb": rss_of("node /home/z/my-project/.next"), "role": "کامپایلر CSS حالت dev", "necessary": "غیرضروری — فقط dev"},
    {"process": "python main.py (/app/.venv — رانتایم ایجنت پلتفرم ZAI)", "rss_mb": rss_of("/app/.venv/bin/python"), "role": "زیرساخت پلتفرم (ابزار GLM)", "necessary": "ضروری پلتفرم — خارج از کنترل اپ"},
    {"process": "node next dev (لانچر)", "rss_mb": rss_of("node /home/z/my-project/node_modules"), "role": "لانچر dev", "necessary": "غیرضروری — فقط dev"},
    {"process": "caddy (درگاه معکوس :81→:3000)", "rss_mb": rss_of("caddy"), "role": "روتر عمومی preview/publish", "necessary": "✅ ضروری"},
    {"process": "uv run main.py", "rss_mb": rss_of("uv run"), "role": "راه‌انداز رانتایم پلتفرم", "necessary": "ضروری پلتفرم"},
    {"process": "کرنل (Slab+Stack+PageTables)", "rss_mb": kernel_mb, "role": "سیستم", "necessary": "✅ ضروری"},
    {"process": "buff/cache (فایل‌های پیمایش‌شده)", "rss_mb": round((mi.get("Buffers", 0) + mi.get("Cached", 0)) / 1024, 0), "role": "کش دیسک", "necessary": "بازپس‌گیرنی"},
    {"process": "جمع پروسه‌های کاربر", "rss_mb": user_sum, "role": "—", "necessary": "—"},
]
table2.append({"process": "TOTAL (MemTotal)", "rss_mb": round(mi.get("MemTotal", 0) / 1024, 0),
               "role": "کل", "necessary": "MemAvailable لحظهٔ اندازه‌گیری: " + str(g(A, "mem_available_before_mb")) + "MB"})

# ---------- جدول ۳ — رتبه‌بندی ریشه‌ای ----------
table3 = [
    {"rank": 1,
     "cause": "سرو در حالت development (next dev) به‌جای production — کامپایل درون‌حافظه‌ای Turbopack، کش ماژول‌ها، HMR و نگه‌داری سورس‌مپ‌ها",
     "evidence": "RSS سرور dev = ۲٬۸۷۸-۲٬۹۶۱MB در برابر سرور production همان اپ = ۱۴۵-۲۰۱MB (سناریو J)؛ /api/version: env=development؛ package.json scripts.dev روی :3000؛ آزادسازی ۲.۴۳GB با توقف dev (۴۷۶MB→۳.۵GB available)",
     "consumption_mb": 2700, "confidence": "۹۵٪",
     "solution": "فاز ۰-B: انتقال سرو به مسیر production (بیلد موجود شد: standalone · بوت ۱.۱s) — dev فقط برای توسعه",
     "risk": "کم — تغییر فرایند استخراج (بیلد برای هر انتشار)؛ رفتار کامپایل تنبل dev از دست می‌رود (پیش‌گرم لازم)"},
    {"rank": 2,
     "cause": "دیمن‌های درون‌فرایندی (کاتالوگ هر ۱ دقیقه، CRM هر ۵ دقیقه، حلقهٔ هوشمندی) — رشد تدریجی RSS با زمان کار",
     "evidence": "رشد ۲GB(بوت)→۲.۹GB (۴۵ دقیقه) در dev؛ رشد ۱۴۵→۲۰۱MB در ۲۰ دقیقه prod؛ سی‌و‌سه درخواست داخلی GET در لاگ prod (خوانش آمار ایجنت)",
     "consumption_mb": 500, "confidence": "۷۵٪",
     "solution": "فاز ۰-B: پایش رشد RSS دیمن‌ها در prod + تنظیم بازه‌ها در صورت لزوم؛ ظرفیت رشد: ۲GB→۲.۹GB در ۴۵ دقیقه dev",
     "risk": "کم — کند شدن همگامی با بازهٔ بزرگ‌تر"},
    {"rank": 3,
     "cause": "نبود Swap + سقف سخت cgroup (۴GiB فیزیکی ~۳.۹GiB) — هر افزایش هم‌زمانی به OOM می‌رسد",
     "evidence": "SwapTotal=۰؛ آزمون تخصیص: OOM-kill در ۳.۵۱GB (شاهد کرنل: Killed process 4442 anon-rss:3,681,252kB)؛ G/H: free تا ۲۵۰MB سقوط",
     "consumption_mb": 0, "confidence": "۱۰۰٪ (شاهد مستقیم)",
     "solution": "درخواست ارتقای پلتفرم (سناریو B: ۴ هسته/۸GB) یا مدیریت زمان‌بندی (بیلد و dev هرگز هم‌زمان نباشند: ۲.۲+۲.۹GB > ۴GB)",
     "risk": "متوسط — تا ارتقا، هر بیلد باید در حالت سرو prod انجام شود (۲.۲GB پیک بیلد + ۰.۲GB prod = امن)"},
    {"rank": 4,
     "cause": "پشتهٔ زیرساخت پلتفرم (رانتایم ایجنت python ~۱۲۱-۱۴۱MB + caddy ~۲۳-۴۳MB + uv) — غیرقابل حذف از سمت اپ",
     "evidence": "ps در همهٔ سناریوها؛ خارج از مالکیت کد ملکا",
     "consumption_mb": 170, "confidence": "۹۰٪",
     "solution": "— (ثابت پلتفرم؛ در بودجه‌بندی ظرفیت لحاظ شد)",
     "risk": "—"},
    {"rank": 5,
     "cause": "هم‌آمیزی اسکریپت‌های پروژه در تایپ‌چک بیلد — هر فایل TS در scripts/ می‌تواند بیلد production را بشکند",
     "evidence": "شکست تلاش اول بیلد فقط به‌خاطر خطای تایپ در scripts/pn004/large-sync-probe.ts (رفع شد)؛ tsc کل پروژه را چک می‌کند",
     "consumption_mb": 0, "confidence": "۱۰۰٪ (بازتولید شد)",
     "solution": "فاز ۰-B: مستثنی‌سازی امن scripts/ از تایپ‌چک بیلد (tsconfig include) یا انتقال ابزارها به tsconfig مستقل",
     "risk": "کم — با تست tsc کنترل شود"},
]

baseline = {
    "document": "ملکا-شورا-ن۰۰۴-الف-۱۴۰۵ — فاز ۰-A · هدف ۱: تشخیص مصرف",
    "build_id": BUILD_ID, "git_head": GIT_HEAD,
    "measured_at": MEAS_TS,
    "methodology": {
        "probe": "scripts/pn004/probe.py — نمونه‌برداری /proc هر ۰.۲۵s (RSS/CPU/درخت پروسه) + dmesg OOM + cgroup",
        "server_mode_during_A_to_L": "development (next dev روی :3000) — همان حالت سرو رسمی محیط",
        "cpu_metric_note": "CPU به‌صورت ٪ ظرفیت کل (۱۰۰٪ = هر ۲ هسته) — پس از اصلاح باگ دوبارشماری /proc/stat (idle+guest)",
        "heap_note": "* Heap برای سرور در حال اجرا بدون تغییر سورس قابل اندازه‌گیری نیست (نبود endpoint درون‌فرایندی) — برای فرایندهای تشخیصی اندازه‌گیری شد",
    },
    "table1_scenarios": table1,
    "table2_idle_breakdown": table2,
    "table3_root_cause_ranking": table3,
    "critical_incidental_findings": {
        "master_login_broken": "سناریو B: HTTP 503 — زنجیرهٔ سه‌لایهٔ کد مستر (env/.env.local + هش DB + رد مقدار تستی) پس از بازنشانی محیط شکسته: .env.local غایب، .env فقط DATABASE_URL، AppMeta.masterCodeHash=null؛ health: masterAuth=none",
        "database_degraded": "پایگاه جاری (26MB) در برابر پشتیبان PN-003 (56MB): آگهی ۰ (قبلاً ۱۱٬۵۰۱) · گراف ۰ گره (قبلاً ۳۶٬۶۵۰) · هشدار فرصت ۰ (قبلاً ۵۳) · درخواست ۵٬۶۵۰ · معاملات ۷۶۴ · کارشناسان ۲۹۳ — داده سالم در upload/dataset-backups/pn003-2026-10-05T1458.db محفوظ است",
        "reset_root_cause": "بوت محیط ۱۸:۰۲ امروز: بازیابی repo.tar (ذخیرهٔ ۱۶:۳۰ امروز — خودش نسخهٔ تخریب‌شده را داشته) + اجرای bun run db:push طبق /start.sh؛ .env از نو با فقط DATABASE_URL نوشته شد",
        "publish_url_status": "لینک publish اعلامی مالک (c1vdh8442240-d) → HTTP 500 — نیازمند publish مجدد از پنل مالک (همان وضعیت PN-003)",
        "old_preview_url_status": "لینک preview اعلامی مالک (preview-chat-a8de3bf8…) → HTTP 502 — متعلق به نشست قدیمی؛ لینک زندهٔ این نشست: preview-chat-35e0018b… → 200",
    },
}

# ---------- platform-capacity.json ----------
cpu1 = load("CPU-1w-fixed"); cpu2 = load("CPU-2w-fixed"); cpu4 = load("CPU-4w-fixed")

platform = {
    "document": "ملکا-شورا-ن۰۰۴-الف-۱۴۰۵ — فاز ۰-A · هدف ۲: سقف ظرفیت پلتفرم",
    "build_id": BUILD_ID,
    "measured_at": MEAS_TS,
    "cpu": {
        "physical_cores_visible": 2, "logical_cores": 2,
        "model": "Intel(R) Xeon(R) Processor", "base_freq_mhz": 3200,
        "turbo_freq": "در /proc/cpuinfo گزارش نشده (cpu MHz ثابت 3200)",
        "sockets": 1, "threads_per_core": 1,
        "cgroup_cpu_quota_us": -1, "cgroup_cpu_period_us": 100000,
        "cpuset": "0-1",
        "max_usable": "۲ هستهٔ منطقی — سهم کامل",
        "load_tests": {
            "1_worker_30s": {"total_pct": g(cpu1, "cpu_total_pct_avg"), "workers_pct": g(cpu1, "cpu_workers_pct_avg"), "other_pct": g(cpu1, "cpu_other_pct_avg"), "verdict": "یک کارگر ~۹۸٪ یک هسته را می‌گیرد"},
            "2_workers_30s": {"total_pct": g(cpu2, "cpu_total_pct_avg"), "workers_pct": g(cpu2, "cpu_workers_pct_avg"), "other_pct": g(cpu2, "cpu_other_pct_avg"), "verdict": "اشباع کامل ۲ هسته"},
            "4_workers_30s": {"total_pct": g(cpu4, "cpu_total_pct_avg"), "workers_pct": g(cpu4, "cpu_workers_pct_avg"), "other_pct": g(cpu4, "cpu_other_pct_avg"), "verdict": "۴ کارگر همان ۲ کارگر — سقف ۲ هسته به‌طور تجربی اثبات شد (۴هسته نداریم؛ 'چرا فقط ۲' = تأمین ماشین مجازی، نه محدودیت نرم‌افزاری: quota=-1، cpuset=0-1)"},
        },
        "answer_why_only_2": "پلتفرم جعبهٔ مجازی را با ۲ vCPU تأمین کرده (cpuset=0-1، سهمیهٔ cgroup نامحدود). هستهٔ فیزیکی میزبان بیشتر است اما به کانتینر اختصاص نیافته. آزمون ۴ کارگر: صفر بهرهٔ اضافه.",
    },
    "ram": {
        "system_total_gb": 3.9, "cgroup_limit_gb": 4.0, "swap_gb": 0,
        "measured_available_mb_idle_dev": g(A, "mem_available_before_mb"),
        "measured_available_idle_prod": 3500,
        "allocation_probe": {
            "method": "تخصیص تدریجی ۲۵۰-۵۰۰MB با لمس هر صفحه (commit واقعی) تا شکست",
            "result": "OOM-Kill کرنل در تخصیص ~۳.۵GB",
            "kernel_witness": "Out of memory: Killed process 4442 (python3) total-vm:4234448kB anon-rss:3681252kB — constraint=CONSTRAINT_NONE (global_oom)",
            "max_allocatable_to_app_gb": 3.5, "confidence": "۹۵٪",
        },
        "top_consumers": {"dev_server": "1.9-2.9GB", "prod_server": "0.15-0.2GB", "build_peak": "2.2GB", "platform_stack": "~0.2GB"},
    },
    "disk": {
        "total_gb": 9.9, "used_gb_at_start": 2.0, "free_gb": 7.4,
        "after_builds": {".next_gb": 0.935, "node_modules_gb": 1.3, "db_mb": 28, "intelligence_data_mb": 5.4},
        "our_share": "کل ۹.۹GB متعلق به همین کانتینر (rootfs) — سهم ما = همهٔ آن",
    },
    "process_limits": {
        "ulimit_open_files": 1024, "ulimit_max_processes": 100000, "ulimit_stack_kb": 8192,
        "kernel_pid_max": 32768, "fs_file_max": 100000, "threads_max": 925,
        "note": "باز بودن فایل ۱۰۲۴ برای سرور با اتصال‌های موازی زیاد کافی نیست — در فاز ۰-B بررسی شود",
    },
    "network": {
        "external_ip": "47.57.242.119 (خروجی) / eth0 داخلی 21.0.12.71/32",
        "download_mbps": 447, "upload_mbps": 36,
        "latency_local_ms": 14, "latency_external_http_ms": 85,
        "tcp_connect_external_ms": 7, "tls_handshake_ms": 27,
        "method": "Cloudflare speed endpoints · 25MB دانلود · 5MB آپلود · ۳ نمونه",
    },
    "platform_limits": {
        "config_files": ["env.platform.json (ریشهٔ پروژه — متغیرهای غیرسری: DATABASE_URL، MELK_SYNC_MODE؛ مقادیر تستی عمومی برای کد مستر و کلید توکن طبق قانون راز-در-گیت-ممنوع)", "/tmp/my-project/env.platform.json (کپی پلتفرم)"],
        "env_limit_vars": "هیچ متغیر محیطی limit/quota/max فعالی یافت نشد",
        "max_execution": "ابزار Bash: ۱۰ دقیقه (۶۰۰s) هر فراخوانی — timeout سخت",
        "process_lifetime": "پردازش‌های پس‌زمینه در پایان هر فراخوانی ابزار کشته می‌شوند (مگر از مسیر init/double-fork) — کشف و مستند شد",
        "max_build_size": "محدودیت صریح یافت نشد؛ دیسک ۷.۴GB آزاد",
        "db_connections": "SQLite (فایل‌محور) — شمارش FD باز: ۲-۳ — سقف عملی: باز شدن فایل",
        "logs": "dev.log/server.log بدون چرخش (rotation) — رشد پیوسته",
    },
    "table4_capacity": {
        "resource": ["CPU هسته", "RAM", "Disk", "Network دانلود", "Network آپلود", "Processes", "DB Connections"],
        "min": ["۲ (فعلی)", "۳.۹GB فعلی", "۹.۹GB", "—", "—", "۱۶ فعال", "۲-۳"],
        "max": ["۴-۸ (قابل درخواست)", "۸-۱۶GB (قابل درخواست)", "۲۰-۵۰GB (قابل درخواست)", "۴۴۷Mbps اندازه‌گیری‌شده", "۳۶Mbps اندازه‌گیری‌شده", "۹۲۵ threads-max کرنل", "بر اساس FD"],
        "our_share": ["۲ (۱۰۰٪ فعلی)", "۳.۵GB قابل تخصیص تجربی", "۹.۹GB (کامل)", "بدون سهمیهٔ مشخص", "بدون سهمیهٔ مشخص", "۱۶", "۲-۳"],
        "confidence": ["۱۰۰٪", "۹۵٪", "۱۰۰٪", "۹۰٪", "۹۰٪", "۱۰۰٪", "۱۰۰٪"],
    },
    "allocation_scenarios": {
        "A_conservative": {"cpu": "۲ هسته", "ram": "۴GB (وضعیت فعلی)",
                           "outcome": "فقط با سرو production پایدار: prod 0.2GB + بیلد 2.2GB + پلتفرم 0.2GB + حاشیهٔ 1.3GB — OK؛ dev+بیلد هم‌زمان = OOM تضمینی؛ همگامی بزرگ (H) تا آستانهٔ ۲۵۰MB آزاد پیش می‌رود"},
        "B_balanced": {"cpu": "۴ هسته", "ram": "۸GB",
                      "outcome": "بهترین تعادل: بیلد ~۲ برابر سریع‌تر (CPU-bound ۸۱٪)، dev+بیلد هم‌زمان ممکن (5.1GB مجموع)، رشد گراف/مغز/همگامی با حاشیهٔ امن — پیشنهاد GLM"},
        "C_maximum": {"cpu": "۸ هسته", "ram": "۱۶GB",
                      "outcome": "حداکثر سرعت برای گراف ۳۶هزارگره، مغز ۱۱موتوری، همگامی‌های موازی و چند کاربر هم‌زمان — ریسک هزینه/تأمین پلتفرم"},
        "glm_recommendation": "سناریو B (۴ هسته / ۸GB) — دلیل: بیلد CPU-bound است (۸۱٪ ظرفیت ۲ هسته)، سرور production فقط ۰.۲GB مصرف می‌کند، پس گلوگاه اصلی تعداد هسته است نه RAM؛ ۸GB برای همهٔ ترکیب‌های سنجه‌شده + رشد دادهٔ بازیابی‌شده (۵۳MB→دادهٔ کامل) کفایت می‌کند",
    },
    "phase_0b_max_requestable": {
        "cpu": "۴-۸ vCPU (اندازه‌گیری‌شده: بیلد با ۲ هسته CPU-bound)",
        "ram": "۸-۱۶GB (اثبات نیاز: بیلد 2.2GB + dev 2.9GB + پلتفرم 0.4GB > 4GB فعلی)",
        "disk": "۲۰GB+ (DB فعلی 28MB؛ دادهٔ کامل 56MB؛ .next 935MB؛ node_modules 1.3GB؛ لاگ‌ها بدون چرخش)",
        "network": "کفایت می‌کند (۴۴۷/۳۶Mbps) — برای همگامی ARM خارجی کافی",
    },
}

os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/baseline.json", "w") as f:
    json.dump(baseline, f, ensure_ascii=False, indent=1)
with open(f"{OUT}/platform-capacity.json", "w") as f:
    json.dump(platform, f, ensure_ascii=False, indent=1)

print("OK — نوشته شد:")
print(f"  {OUT}/baseline.json  ({os.path.getsize(f'{OUT}/baseline.json')//1024}KB)")
print(f"  {OUT}/platform-capacity.json  ({os.path.getsize(f'{OUT}/platform-capacity.json')//1024}KB)")
print(f"جدول ۱: {len(table1)} سناریو · جدول ۲: {len(table2)} ردیف · جدول ۳: {len(table3)} ریشه")
