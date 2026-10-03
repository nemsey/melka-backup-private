# PHASE 2 COMPLETION REPORT — Repository / Data Boundary
## داشبورد چندعامله ملک تبریز — گزارش تکمیل فاز ۲ برای شورای راهبری

> مالک: سید نعمت‌اله سیدی | اجرا: Super Z (GLM-5.3) | مبنای دستور: مصوبه PHASE 2 (۸ گام + بندهای E/G)
> شعار فاز: «لایه‌ها مرتب شدند. الان انبار مشترک ساخته می‌شود.» — **انبار ساخته شد.**

---

## ۱) جدول وضعیت ۸ گام

| گام | عنوان | وضعیت | شماره کامیت | شاهد کلیدی |
|---|---|---|---|---|
| P2-00 | آماده‌سازی | ✅ بسته | `1180489` | بکاپ + تگ `pre-phase2-baseline` + خط پایه صادقانه: ایجنت **۴۷** (تطابق کامل)، روت **۶۹** (برآورد ~۲۰ خوش‌بینانه بود — گزارش شد) |
| P2-01 | ۱۲ Repository | ✅ بسته | `cdbf775` | ۱۲ interface + ۲۴ DTO + ۱۲ پیاده‌سازی Prisma (کلاینت تزریقی) + کارخانه + upsertBatch آماده P2-04؛ ۱۷ تست روی `db/test-repository.db` |
| P2-02-A | ایجنت‌های تک‌جدولی | ✅ بسته | `d0e7637` | ۵ ایجنت (۴۷→۴۲)؛ analyzers با DTO خالص؛ ۱۲ تست stub صفر-DB |
| P2-02-B | ایجنت‌های چندجدولی | ✅ بسته | `8826c80` | ۶ ایجنت (۴۲→۲۶)؛ **E.2 اجرا شد**: تعرفه/شاخص فقط-کش — مسیر رندر بینش هرگز HTTP زنده نمی‌زند؛ ۱۳ تست |
| P2-02-C | ایجنت فایل‌یابی | ✅ بسته | `269c057` + `db88ffd` | divar-agent (۲۶→۲۱)؛ diff دامنه بایت‌به‌بایت؛ ۳ باگ تستِ جلسه‌قطع‌شده اصلاح شد؛ خروجی عین قبل |
| P2-02-D | ایجنت پایه | ✅ بسته | `6b15baf` | BaseLearningAgent زنده، فقط بدنه متدها (۲۱+۲→۰)؛ **agent.test.ts صفر خط دیف، ۱۲/۱۲ سبز**؛ ۱۸ تست stub |
| P2-03 | روت‌ها | ✅ بسته | `80e1229` + `064cacb` | **۶۹→۰ در ۲۴ فایل**؛ RequestRepository سیزدهم؛ ۳۳ مقایسه قبل/بعد یکسان؛ ۱۱ تست integration پنج روت کلیدی |
| P2-04 | همگام‌سازی افزایشی | ✅ بسته | `b9d0367` | Flag `MELK_SYNC_MODE` (پیش‌فرض legacy)؛ SyncState نوساز + SyncDeadLetter؛ ۹ تست دو-حالته |
| P2-05 | Logger ساختاریافته | ✅ بسته | `4276634` | نقطه یگانه خروجی + پاک‌ساز + proxy.ts (قرارداد Next 16) + اسکنر `audit-log-safety.sh`؛ ۱۱ تست |
| P2-06 | متادیتای سیاست | ✅ بسته | `2306be2` + `a7a83de` | ۹ ستون فقط-افزودنی؛ active دو‌راهه سالم؛ backfill سه پایگاه؛ ۶ تست |
| P2-07 | رگرسیون نهایی | ✅ بسته | `c845bce` | ۱۰۰۰-نمونه عددی: **صفر تفاوت**؛ بصری چهارلایه ۳ صفحه: **۹/۹ بایت‌به‌بایت + صفر پیکسل + VLM** |

**توجه:** P2-02 به چهار زیرگام A/B/C/D تجزیه شد (طبق خود دستور) — جمع ۸ گام اصلی + خرجه‌سازی، همگی بسته.

---

## ۲) خلاصه diff

```
git diff pre-phase2-baseline..HEAD --stat
132 files changed, 17,897 insertions(+), 604 deletions(-)
— از آنِ src/:  77 files, +3,998 / −604
— باقی: تست‌های جدید (۷ فایل phase2-*)، اسکریپت‌های گارد/راستی‌آزمایی،
  مستندات E.6، شواهد بصری phase2-visual، artifact های build/test
کامیت‌های فاز: ۱۴ (هر گام مستقل + رفع‌های صادقانه)
```

- **صفر Feature**، **صفر Migration مخرب** (دو `db push` فقط-افزودنی با بکاپ پیش از هرکدام)
- BaseLearningAgent **حذف نشد** — قرارداد سازنده/متدها عین قبل (گواهی: `git diff tests/agent.test.ts` = صفر خط)
- ۱۹ کامیت قابل بازگشت مستقل؛ هر گام rollback خودکار (بکاپ DB + تگ)

---

## ۳) خروجی کامل audit-repository-boundary.sh (سه صفر حاکمیتی)

```
$ bash scripts/audit-repository-boundary.sh --strict
db.<model>.* call sites in agents (src/core/agent):  0  (baseline 47)
db.<model>.* call sites in routes (src/app/api):     0  (baseline 69)
db.$transaction in agents:                           0  (baseline 2)
agent files importing @prisma/client:                0
agent files importing @/lib/db:                      0
interfaces/ files importing @prisma/client:          0
interfaces/ files importing @/lib/db:                0
PASS: مرز Repository در حالت --strict رعایت شد.
```

افزودنی P2-05:
```
$ bash scripts/audit-log-safety.sh
console.* outside src/lib/logger/:            0
defensive sanitizer in logger:                1
sensitive keys / raw mobiles in log calls:    0
PASS: امنیت لاگ رعایت شد.   ← در regression-guard (E.7) فعال
```

---

## ۴) خروجی تست نهایی

```
$ bun run test        (DATABASE_URL=db/test.db ایزوله — E.3)
 522 pass
 0 fail
 1,993 expect() calls
Ran 522 tests across 32 files. [5.82s]

$ bunx tsc --noEmit   → صفر خطا (کل پروژه، ignoreBuildErrors خاموش از P1-04)
$ bun run build       → ✓ Compiled successfully (شامل proxy.ts قرارداد Next 16)
$ bash scripts/regression-guard.sh → GUARD PASS (تست + مرز + لاگ)
```

- شمارش: ۴۲۱ (ابتدای فاز) → **۵۲۲** (+۱۰۱ تست جدید؛ هدف ≥۳۰ / کل ≥۴۵۱ ✓✓)
- دو اجرای پیاپی کامل سبز (اثبات نبود آلودگی ترتیب تست‌ها)
- فایل‌های تست جدید فاز: `phase2-repositories` (۱۷) `phase2-agents` (۲۹) `phase2-base-agent` (۱۸) `phase2-routes` (۱۱) `phase2-sync` (۹) `phase2-logger` (۱۱) `phase2-policy-meta` (۶)

---

## ۵) سند مهاجرت P2-06

📄 `download/MIGRATION-P2-06.md` — نکات کلیدی:
- ۹ ستون فقط-افزودنی (modelVersion، featureVersion، trainingWindow، evaluationWindow، metricsJson، createdBy، approvedBy، status، rollbackTarget) — همه nullable/default
- `active` Boolean **حذف نشد** — دو‌راهه تا PHASE 9؛ منطق یادگیری PHASE 2 فقط active را می‌خواند (اثبات سطح سورس در تست)
- **یافته صادقانه**: `db push` با DEFAULT 'active' همه ردیف‌ها را فعال علامت زد؛ backfill اصلاحی idempotent بر هر سه پایگاه (تولید: ۲۰ ردیف → ۱۳ active + ۷ retired، ناهماهنگی=۰)
- شاهد بکاپ/بازیابی: `db/custom.backup-pre-p206.db` + مسیر بازگشت سه‌مرحله‌ای مستند

---

## ۶) سند همگام‌سازی افزایشی P2-04 (با مثال)

📄 `download/SYNC-INCREMENTAL-P2-04.md` — نمونه جریان:

```
legacy (پیش‌فرض — رفتار تولید تغییر نکرد):
  deleteMany×6 + createMany اتمیک — عین PHASE 1

incremental (MELK_SYNC_MODE=incremental):
  runId=UUID → syncRunId
  برای هر خانواده: upsertBatch(کلید طبیعی) → جاروی محوشده‌ها (به‌جز نامه مرده باز)
    → cursor = {runId, done[], detail[]} پس از هر خانواده
  شکست ردیف منفرد → SyncDeadLetter(attempts+1) — ۳+ پیاپی = مرده
  موفقیت بعدی → resolvedAt

مثال تست: ردیف خراب "p204-tx-bad" با تاریخ نامعتبر:
  اجرا ۱: attempts=1، باز | اجرا ۲: attempts=2 | اجرا ۳: attempts=3 (مرده)
  اجرا ۴ با داده سالم: resolvedAt=الان، ردیف ثبت، جارو محافظت شد ✓
```

---

## ۷) سند رویدادهای Logger P2-05

📄 `download/LOGGER-EVENTS-P2-05.md` — رویدادهای الزامی پیاده‌شده:
ورود/خروج (هر دو مسیر OTP+مدیر) | شکست OTP (RATE_LIMITED مستثنا طبق HOTFIX-04/B2) | همگام‌سازی آغاز/پایان/شکست با mode+duration | فراخوانی ایجنت (مرکزی در BaseLearningAgent — هر ۱۲ ایجنت خودکار) | روت: آغاز برای هر `/api/*` از طریق `src/proxy.ts` + پوشش کامل `withRouteLog` | چرخش کلید بوت | همگام‌سازی پس‌زمینه

نمونه خط واقعی:
```json
{"ts":"…","level":"info","category":"agent","operation":"render-insights","status":"ok","requestId":"…","traceId":"…","userId":null,"tenantId":"melk-tabriz","agentId":"transactions","tileId":"transactions","duration":57,"errorCode":null,"detail":{"agentName":"ایجنت تحلیل معاملات"}}
```

---

## ۸) رگرسیون بصری چهارلایه — ۳ صفحه کلیدی

روش: build دقیق `pre-phase2-baseline` (worktree، پورت 3001) در برابر build فعلی (پورت 3000) روی **همان پایگاه ایزوله** با کاشت قطعی ۱۰۰۰-نمونه؛ ناوبری وضعیت-محور؛ دیمون double-fork.

| صفحه | ۱) امضای DOM | ۲) متن کامل | ۳) هندسه SVG | ۴) پیکسل | VLM |
|---|---|---|---|---|---|
| معاملات | ✓ یکسان (34,067 نویسه) | ✓ یکسان | ✓ یکسان | ✓ **صفر پیکسل** | — |
| کارشناسان | ✓ یکسان (**318,305 نویسه** — جدول ۲۰۰ ردیفه) | ✓ یکسان (24,163) | ✓ یکسان (120,082) | ✓ **صفر پیکسل** | **NO VISIBLE DIFFERENCE** |
| درخواست ملک | ✓ یکسان | ✓ یکسان | ✓ یکسان | ✓ **صفر پیکسل** | — |

**۹/۹ لایه ساختاری بایت‌به‌بایت یکسان + ۳/۳ صفر پیکسل متفاوت + VLM تأیید.**
شواهد: `download/phase2-visual/p2-{base,final}-*.{dom,text,svg}.txt` + `.png`

---

## ۹) رگرسیون عددی insights — ۱۰۰۰ نمونه

روش: کاشت قطعی (PRNG با seed ثابت — ۱۰۰۰ معامله + ۲۰۰ کارشناس + ۵۰۰ تعامل + ۳۰۰ بازدید + ۳۰ عرضه/تقاضا + ۱۲۰ قرارداد + ۵۰ آگهی دیوار + اسکن/رد/آمار بازار + بازخورد/حافظه هر ۱۲ کاشی) روی `db/test-repository.db`؛ اسکریپت دفع (`scripts/verify-p2-07-insights.ts`) در **هر دو درخت** (baseline worktree + فعلی) با کاشت تازه پیش از هر سمت و پروتکل «آمار پیش از رندر»:

```
ایجنت‌ها: 12/12 — بینش‌ها: 48
✓ صفر تفاوت — همه فیلدهای همه بینش‌ها/آمار ۱۲ ایجنت بایت‌به‌بایت یکسان
```

فیلدهای مقایسه‌شده: عنوان، بدنه، شدت، سنجه‌ها، **وزن نهایی**، **یادگیری‌داری**، **منبع وزن**، نسخه سیاست، خاطره‌های فعال، آمار یادگیری (بازخورد/حافظه/نسخه/رضایت). مسیر RAG (TF-cosine)، آستانه‌های بازبینی سیاست و قید clamp همه در همان داده تمرین دیدند.

---

## ۱۰) قضاوت آمادگی PHASE 3

### ✅ بله — PHASE 3 آماده است

**دلایل:**
1. **هر ۸ گام بسته** با کامیت مستقل + شاهد؛ صفر گام باز
2. **معیارهای موفقیت G همگی برآورده**: ایجنت ۴۷→۰؛ روت ۶۹→۰؛ interfaces صفر Prisma؛ ۱۳ Repository (۱۲ + Request)؛ افزایشی با Flag و تست؛ Logger با تست؛ Policy migration بدون تغییر رفتار؛ تست جدید +۱۰۱ (هدف ≥۳۰)؛ کل ۵۲۲ (هدف ≥۴۵۱)؛ fail=۰؛ ۳ صفحه تفاوت بصری مطلق صفر؛ Feature=۰؛ Migration مخرب=۰؛ BaseLearningAgent زنده
3. **زیرساخت PHASE 3 حاضر**: قرارداد Repository برای موتورهای جدید (Memory/Retrieval/Prediction/Outcome از همین انبار می‌خوانند)؛ DTO خالص برای BaseIntelligentAgent؛ Flag افزایشی برای داده‌های بزرگ‌تر؛ Logger ساختاریافته برای ردیابی موتورها؛ متادیتای سیاست برای نسخه‌بندی مدل (PHASE 6/9)
4. **بدهی فنی صفر جدید**: هر انحراف (برآورد ۲۰ vs واقعی ۶۹؛ آلودگی DEFAULT؛ وابستگی ترتیب تست) همان لحظه مستند و رفع شد

**پیشنهاد آغاز PHASE 3**: BaseIntelligentAgent extends BaseLearningAgent + interfaceهای ۱۱ موتور (فقط قرارداد، پیاده‌سازی در PHASE 4-8) + مهاجرت ایجنت درخواست به‌عنوان نمونه اول — طبق نقشه مصوب.

---

*گزارش برای شورای راهبری — انتظار امضای بستن PHASE 2 و صدور دستور PHASE 3.*
