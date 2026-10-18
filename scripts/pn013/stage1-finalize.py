#!/usr/bin/env python3
# PN-013 مرحله ۱ — گزارش نهایی کنترل انبار ۱۲ پرونده (نسخهٔ کامل با یافته‌های زنده)
import json, datetime

now = "2026-10-07T12:45:00Z"

cases = [
 {
  "case": "PN-001", "topic": "سه‌گام پایه (زیرساخت + کاشی + مغز)",
  "selfReported": "۸ مدل Prisma + رجیستری کاشی (TileRegistry) + ایجنت‌های یادگیر با حافظهٔ الحاقی + ۶۵ تست اولیه",
  "verifiedToday": "مدل‌های schema: ۴۴ (رشد طبیعی ۸→۴۴ در ۶ فاز) · tile-registry.ts زنده · bootstrap ثبت کاشی‌ها · ایجنت‌ها زنده (AgentMemory=176، AgentPolicyVersion=8)",
  "delta": "رشد سازنده — نه کاهش", "debt": False
 },
 {
  "case": "PN-002", "topic": "بهبود M1-M4 + اکسل ×۴",
  "selfReported": "M1 +۱۴ ستون (۱۰۰٪ پر) · M2 +۲۱ ستون · M3 دیمن CRM با خزانه · M4 شمارش متقاطع · اکسل خروجی ×۴",
  "verifiedToday": "PropertyRecord=۲۷,۶۸۲ (ادعا: ۱۱,۵۰۱ → رشد ۱۴۰٪ توسط دیمن‌های زنده) · روت‌های export فعال · RequestRecord=۲۵,۴۸۹",
  "delta": "داده رشد یافته؛ ساختار برقرار", "debt": False
 },
 {
  "case": "PN-003", "topic": "دادهٔ واقعی + گارد ورود مالک",
  "selfReported": "گارد ۱۲تایی کد مستر (tests/pn003-master-code.test.ts) · ایمپورت اکسل ×۴ · گراف ۳۶,۶۵۰ گره · هشدار ۵۳ · حلقهٔ سرنوشت ۳۸۶ پیش‌بینی",
  "verifiedToday": "تست گارد موجود و سبز (در ۱۹۳۵ امروز) · ۴ روت import · گراف امروز ۱۱۲,۹۹۹ گره/۱۲۸,۴۴۴ یال · OpportunityAlert=۹۷۷",
  "delta": "گراف ۳۶,۶۵۰→۱۱۲,۹۹۹ (۳.۱×) · هشدار ۵۳→۹۷۷ — رشد دیمنی", "debt": False
 },
 {
  "case": "PN-004", "topic": "فاز ۰-A تشخیص (صفر تغییر سورس)",
  "selfReported": "۱۲ سناریو A-L · ۳۸ فایل JSON نتایج · baseline.json + platform-capacity.json · صفر تغییر سورس",
  "verifiedToday": "۳۶ فایل JSON در scripts/pn004/results/ · download/pn004/{baseline,platform-capacity,recommendations} موجود · بدون بستهٔ بقا (مطابق قرارداد تشخیص‌محور)",
  "delta": "۳۸→۳۶ فایل نتیجه (۲ فایل موقت پاک‌سازی شده — غیربحرانی)", "debt": False
 },
 {
  "case": "PN-005", "topic": "بازیابی + تثبیت production",
  "selfReported": "۹ گام بازیابی · گراف ۴۸,۷۴۸ · recovery-guard خوددرمان · start.sh رسمی · تست ۱۸۱۹/۲۹ ×۲",
  "verifiedToday": "scripts/pn005c/recovery-guard.sh موجود · start.sh موجود · گراف ۱۱۲,۹۹۹ · تست امروز ۱۹۳۵/۰ (رشد)",
  "delta": "همهٔ سازوکارها زنده — بهبود مستمر", "debt": False
 },
 {
  "case": "PN-006", "topic": "فاز ۰-B بهینه‌سازی",
  "selfReported": "دروازهٔ بوت dev-entry.sh · بودجهٔ perf-budget.sh · پیک Build PARTIAL (کف ابزار — تیکت 4c/8GB) · ۲۱/۲۹ رفع",
  "verifiedToday": "dev-entry.sh + perf-budget.sh موجود و فعال · پیک Build همچنان PARTIAL مستند",
  "delta": "پیک Build (هدف 1.5GB) کماکان محقق نشده — سقف ابزار فعلی", "debt": True, "debtId": "D1",
  "note": "بدهی سمت مالک: تیکت ارتقای سخت‌افزار 4c/8GB ارسال نشده"
 },
 {
  "case": "PN-007", "topic": "فاز ۰.۵ بازتولیدپذیری",
  "selfReported": "fingerprint ۱۸+۳ فیلد · بستهٔ استاندارد ن۰۰۷ · بازیابی آزموده ۵۰s · CI هشت‌گامی · audit-reproducibility ۶/۶",
  "verifiedToday": "version-fingerprint.ts + ci.sh + audit-reproducibility.sh موجود · اجرای امروز گارد: ۴ سبز · ۰ هشدار · ۲ قرمز (BUILD_ID سرور 5ad0c25 ≠ HEAD 145a739)",
  "delta": "۲ قرمز تازه — ریشه: دو کامیت مستندسازی پس از آخرین بیلد", "debt": True, "debtId": "D7",
  "note": "بستن خودکار در دروازهٔ پایانی PN-013 (مرحلهٔ ۷) با بیلد تازه روی HEAD جدید"
 },
 {
  "case": "PN-008", "topic": "فاز ۱ امنیت + کارشناسان",
  "selfReported": "چرخش ۱۲۱ راز · Trusted Proxy · ماتریس ۶۴ روت · PersonnelAccess سه‌سطحی · ExpertProfile ۱۴۳ ردیف · WAL",
  "verifiedToday": "client-ip.ts زنده · ExpertProfile=۱۴۳ عین ادعا · PersonnelAccess زنده با ۰ رکورد پیکربندی‌شده (پیش‌فرض none — مالک هنوز پرسنل تعریف نکرده) · کلیدها سه‌مکانی consistent",
  "delta": "دقیق — همهٔ ادعاها زنده", "debt": False
 },
 {
  "case": "PN-009", "topic": "احیای سرویس + UI redesign",
  "selfReported": "Semantic Color Registry یگانه · چهار ماژول M1-M4 بازطراحی · ۱۷۹۲/۰ صفر شکست (رکورد)",
  "verifiedToday": "src/lib/value-colors.ts (رجیستری معنایی + قانون ۱۲) + palette13.json · تست امروز ۱۹۳۵/۰",
  "delta": "رکورد شکسته مجدد در PN-012 (۱۹۳۵)", "debt": False
 },
 {
  "case": "PN-010", "topic": "فاز ۲ Runtime",
  "selfReported": "JobLock+ضربان · Supervisor سبک · مهاجرت ۶ دیمن به Worker · چرخش بکاپ ۳نسلی · ۱۸۴۲/۰ ×۲ · chainIndex=11",
  "verifiedToday": "joblock.ts با heartbeat روی renew · supervisor.ts · Worker زنده (PID 1896) · watchdog زنده (PID 22236) · JobLock=۲ ردیف · runtime-status.json زنده",
  "delta": "دقیق", "debt": False
 },
 {
  "case": "PN-011", "topic": "رفع دائمی ۵۰۰ + رنگ یکتا + M5",
  "selfReported": "escrow سه‌لایه + خوددرمانی نگهبان · پالت ۲۴ خانه · weights-learning · پیوند عمیق M5→M1/M2 · ۱۸۸۵/۰ · chainIndex=12",
  "verifiedToday": "value-colors.ts لایهٔ دوم (خانه‌های ۱۲-۲۳ = ۲۴ خانه) ✓ · weights-learning زنده ✓ · escrow زنده و consistent (ارتقای سه‌مکانی در PN-012) ✓ · دریل بوت سرد مستند ✓",
  "delta": "دقیق — با ارتقای بعدی PN-012", "debt": False
 },
 {
  "case": "PN-012", "topic": "بحران ۶ + فاز ۳ معماری",
  "selfReported": "escrow سه‌مکانی+رمزی · renew(jobId,ms) · ۴۶→۰ مرز مخزن · /api/v1 ×۶۸ آینه · audit-boot-secrets · ۱۹۳۵/۰ ×۲ · قانون فایل v3 (۴ قطعه + SHA256) · chainIndex=13",
  "verifiedToday": "escrow-manager status: consistent ✓ · renew در joblock.ts:152 ✓ · مرز مخزن --strict: PASS ✓ · v1=۶۸=legacy=۶۸ دقیق ✓ · گارد boot-secrets ساختاری+زنده: PASS ✓ · تست رسمی: ۱۹۳۵/۰ ✓ · لینک‌های deliver: هر ۷ فایل ۲۰۰ (شامل ۴ قطعه ۵۰MB) ✓ · زنجیرهٔ بقا ۱→۱۳ سالم ✓",
  "delta": "همهٔ ادعاها تأیید — یک استثنا: اجرای برهنهٔ `bun test` (بدون env شکست‌سریع) تست ۶-ج را timeout می‌کند", "debt": True, "debtId": "D5",
  "note": "بدهی فرایندی: preload-guard DATABASE_URL و MELK_TOKEN_KEY را تزریق می‌کند اما MELK_API_TIMEOUT_MS نه — بستن در مرحلهٔ ۳"
 }
]

report = {
  "schema": "melka-pn013-control-report", "generatedAt": now, "council": "ملکا-شورا-ن۰۱۵-۱۴۰۵",
  "method": "مقایسهٔ وضعیت خوداعلامی (worklog زمانهٔ هر پرونده) با شاهد امروز (کد زنده/DB/تست/گارد/لینک)",
  "sources": ["git log --all", "download/pn001..pn012", "upload/.survival/*", "worklog.md", "کد و DB زنده", "اجرای گاردها و تست امروز"],
  "liveTestToday": {"official": "bun run test → 1935 pass / 0 fail / 84233 expect (45.2s)", "bare": "bun test → 1934/1 (۶-ج timeout — بدون env شکست‌سریع)"},
  "guardsToday": {
    "repository-boundary --strict": "PASS", "intelligence-boundary --strict": "PASS",
    "log-safety": "PASS", "boot-secrets ساختاری": "PASS", "boot-secrets --live": "PASS",
    "reproducibility --strict": "4 سبز · 2 قرمز (BUILD_ID≠HEAD و fingerprint≠ — ریشهٔ واحد: ۲ کامیت مستندسازی پس از بیلد)"
  },
  "liveCounts": {"PropertyRecord": 27682, "RequestRecord": 25489, "GraphNode": 112999, "GraphEdge": 128444,
                  "OpportunityAlert": 977, "ExpertProfile": 143, "TransactionRecord": 765, "JobLock": 2},
  "survivalChain": {"packages": 12, "chainIndexes": "1-7 بدون CHAIN.json (استاندارد از ن۰۰۷) · 8..13 سالم و وارسی‌شده", "pn004": "بدون بسته — قرارداد تشخیص‌محور (صفر تغییر سورس)"},
  "deliverLinks": "هر ۷ فایل public/deliver از دامنهٔ preview: 200 (آزمون زنده امروز)",
  "cases": cases,
  "findings": {
    "mismatches": 3,
    "list": [
      "M1 — BUILD_ID سرور (5ad0c25) ≠ HEAD (145a739): دو کامیت مستنداتی پس از آخرین بیلد → گارد بازتولیدپذیری ۲ قرمز (D7)",
      "M2 — `bun test` برهنه: تست ۶-ج با timeout ۳۰s می‌شکند چون MELK_API_TIMEOUT_MS فقط در `bun run test` تزریق می‌شود (D5)",
      "M3 — expected-counts.json هنوز نام جدول مردهٔ PmPersonnelRecord را ارجاع می‌دهد (D6)"
    ],
    "ownerSideDebts": [
      "D1 — پیک Build > 1.5GB: تیکت ارتقای 4c/8GB ارسال نشده (کف ابزار فعلی)",
      "D2 — publish عمومی: چند دوره است منتظر انتشار از پنل مالک (preview سبز)",
      "D3 — کد مستر در تاریخچهٔ گیت (بند ۲.۲ ن۰۰۸): تصمیم الف/ب مالک",
      "D4 — تصمیم LFS برای main (GH001 ن۰۱۰): با مالک"
    ]
  },
  "verdict": "۱۲/۱۲ کنترل شد · ۳ مغایرت یافت شد (همگی قابل بستن در همین PN-013) · ۴ بدهی سمت مالک مستند · هیچ ادعای دروغین یافت نشد — همهٔ خوداعلامی‌ها با شاهد امروز همخوان یا بهتر"
}
json.dump(report, open("download/pn013/control-report.json", "w"), ensure_ascii=False, indent=2)
print("saved → download/pn013/control-report.json")
print("cases:", len(cases), "| mismatches:", report["findings"]["mismatches"], "| owner debts:", len(report["findings"]["ownerSideDebts"]))
