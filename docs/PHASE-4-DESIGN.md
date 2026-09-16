# PHASE 4 — سند طراحی: بدنه موتورهای Context و Memory

> نسخه ۱٫۰ — تاریخ: ۱۴۰۵/۰۶/۲۵ (۲۰۲۶-۰۹-۱۶)
> مبتنی بر: PHASE-3-DESIGN.md v1.1 · دستور یکپارچه شورای راهبری (رفع خطا + اجرای PHASE 4)
> خط پایه گیت: `pre-phase4-baseline` · بکاپ DB: `db/custom.backup-pre-phase4.db`

---

## ۰. قوانین طلایی فاز (ناقابل‌مذاکره)

1. **صفر تغییر UI** — فقط لایه هوشمندی.
2. **صفر Migration** — ذخیره‌سازی فقط در حافظه یا فایل؛ هیچ جدول/ستون جدیدی در Prisma.
3. **خروجی بایت‌به‌بایت یکسان** — حالت «بدون موتور» باید دقیقاً مثل PHASE 3 بماند؛ حالت «با موتور واقعی» هم نباید هیچ تغییری در خروجی ایجنت‌ها بدهد (موتورها در PHASE 4 «قابل‌تزریق و آماده»اند، نه «مصرف‌شده در مسیر خروجی»).
4. **ممیزی مرز**: `audit-intelligence-boundary.sh --strict` باید PASS بماند (پنج صفر حاکمیتی).
5. **قانون دو-سبز پیاپی**: هر گام کامیت‌شده دو بار پیاپی تست سبز بدهد.
6. **تست جدید ≥ ۲۰** برای PHASE 4 (مجموع هدف: ≥ ۵۷۷).
7. **قانون H**: هیچ قابلیتی «آماده» اعلام نمی‌شود مگر بدنه‌اش ساخته و با تست اثبات شود؛ هر ادعا با شواهد.

## ۱. جایگاه در معماری

```
BaseLearningAgent (PHASE 2 — دست‌نخورده)
        ▲
BaseIntelligentAgent (PHASE 3 اسکلت → PHASE 4: دو متد افزودنی observe/assembleContext)
        ▲
RequestAgent · DivarAgent (مهاجرت‌یافته PHASE 3 — دست‌نخورده)

لایه هوشمندی (src/core/intelligence):
  engines/*.ts            ← ۱۱ قرارداد خالص PHASE 3 — «صفر diff» در PHASE 4
  engine-deps.ts          ← ظرف تزریق + Placeholder — «صفر diff» در PHASE 4
  memory/                 ← جدید PHASE 4: بدنه موتور حافظه
    memory-store.ts       ← درگاه ذخیره‌سازی قابل‌تعویض (In-Memory / FileSystem)
    vector-index.ts       ← جستجوی شباهت برداری (کسینوسی، قطعی، آفلاین)
    memory-engine.ts      ← بدنه MemoryEngine (قرارداد v1 + قابلیت‌های افزودنی)
    index.ts              ← صادرات
  context/
    context-engine.ts     ← بدنه ContextEngine (قرارداد v1 + assemble افزودنی)
    index.ts              ← صادرات
  index.ts                ← صادرات واحد (افزودنی)
```

## ۲. اصل وفاداری به قرارداد (Contract Fidelity)

قراردادهای PHASE 3 (`contractVersion: 1`) **حداقلِ** امضای موتورها هستند و نباید تغییر کنند:

- `MemoryEngine`: `append(MemoryAppend)` و `query(MemoryQuery)` — دقیقاً همین دو متد، با همین انواع.
- `ContextEngine`: `buildContext(ContextQuery): AgentContext` — خروجی **دقیقاً** سه فیلد `{tileId, generatedAt, purpose}`.

قابلیت‌های غنی‌تر PHASE 4 (جستجوی برداری، ادغام، مونتاژ زمینه با بودجه توکن) به‌صورت **متدهای افزودنی روی کلاس‌های پیاده‌سازی** اضافه می‌شوند — نه روی interface. به این ترتیب نسخه قرارداد ۱ دست‌نخورده می‌ماند و جایگزینی موتورها هرگز شکل خروجی قراردادی را عوض نمی‌کند. الگو: `ContextAssembler` به‌عنوان «قرارداد قابلیت اختیاری» جدا از قرارداد پایه.

## ۳. اجزا و مسئولیت‌ها

### ۳-۱. MemoryStore (درگاه ذخیره‌سازی) — `memory/memory-store.ts`

| نماد | نقش |
|---|---|
| `MemoryRecord` | رکورد داخلی ذخیره‌سازی: `MemoryEntry` + `embedding` (بردار نرمال‌شده) |
| `MemoryStore` | درگاه: `save` / `findById` / `query` / `deleteById` / `clear` |
| `InMemoryStore` | پیش‌فرض — Map در حافظه؛ صفر وابستگی |
| `FileSystemStore` | اختیاری — JSONL الحاقی (append-only) با بارگذاری تنبل؛ مسیر قابل‌تزریق |

نکته مرزی: «append-only» **خط‌مشی موتور** است نه محدودیت درگاه؛ `deleteById/clear` فقط برای تست/چرخه عمر نگهداری‌اند و `MemoryEngineImpl` هرگز آن‌ها را صدا نمی‌زند.

### ۳-۲. VectorIndex — `memory/vector-index.ts`

- `embedText(text, dims=64)`: تعبیه قطعی آفلاین با «حاشیه‌نویسی هش» (hashing trick): توکن‌سازی (فاصله/ZWNJ/نقطه‌گذاری فارسی) → hش FNV-1a → سطل → تجمع → نرمال L2. صفر شبکه، صفر وابستگی، قابل‌تعویض در فازهای بعد (تابع تعبیه تزریقی).
- `cosineSimilarity(a, b)`: ضرب داخلی روی بردارهای نرمال؛ مقادیر صفر → ۰ (بدون NaN).
- `VectorIndex`: `add` / `remove` / `search(query, topK)` / `size` / `clear` — مرتب‌سازی نزولی پایدار (تساوی امتیاز → ترتیب درج).

کیفیت تعبیه در PHASE 4 هدف نیست (هیچ مسیر خروجی آن را مصرف نمی‌کند)؛ قطعیت و تعویض‌پذیری هدف است.

### ۳-۳. MemoryEngineImpl — `memory/memory-engine.ts`

- `append(MemoryAppend)`: **عصب استخراج** — استخراج `text` از payload (فیلد `text` رشته‌ای یا سریال‌سازی پایدار JSON)، قطع‌کردن `sentiment` به علامت (+1/-1/0)، تولید `id` (crypto.randomUUID) و `createdAt` (ISO)، محاسبه embedding، ذخیره در Store + نمایه برداری.
- `query(MemoryQuery)`: فیلتر tileId/layer/kinds/since + مرتب‌سازی جدیدترین‌اول + take.
- افزودنی‌ها: `retrieveSimilar(tileId, text, topK)` (جستجوی برداری محدود به همان tileId)، `consolidate(tileId, {threshold, minGroup})` (گروه‌بندی ورودی‌های مشابه، درج یک رکورد «ادغام‌شده» با `mergedIds` در payload — اصل‌ها طبق append-only نگه داشته می‌شوند، خروجی = گزارش)، `stats()`، `reindex()`.

### ۳-۴. ContextEngineImpl — `context/context-engine.ts`

- `buildContext(ContextQuery)`: **عین Placeholder** — خروجی دقیقاً `{tileId, generatedAt, purpose}` با همان قطعیت `asOf`. این هم‌ارزی شکل، تضمین می‌کند تعویض موتور زمینه هیچ اثری بر مصرف‌کنندگان قراردادی نداشته باشد.
- افزودنی `assemble(query, {text, signals, topK})`: **بدنه مونتاژ** برای فازهای بعد — بازیابی حافظه مرتبط (در صورت تزریق MemoryEngine)، ادغام سیگنال‌های زنده، اتصال با جداکننده استاندارد، برش تا «بودجه توکن» (پیش‌فرض ۲۰۴۸ توکن، تخمین ۴ نویسه/توکن). خروجی `WorkingContext` سریال‌پذیر: `{base, memories, signals, contextText, tokenEstimate, budgetTokens, truncated}`.

### ۳-۵. اتصال به BaseIntelligentAgent — `base-intelligent-agent.ts` (تنها فایل مشترک تغییر‌یابنده)

دو متد **افزودنی protected** (بدون تغییر سازنده/فیلدها/مسیرهای خروجی):

- `observe(kind, payload, layer="AGENT")`: در صورت تزریق `engines.memory`، یک رکورد مشاهده ثبت می‌کند (tileId = `this.tileId`). fire-and-forget با بلع خطا — مشاهده هرگز نباید خروجی را بشکند؛ بدون موتور = no-op بی‌صددا.
- `assembleContext(purpose, opts)`: در صورت تزریق موتور زمینهِ دارای قابلیت `assemble` (duck-typing قرارداد `ContextAssembler`)، `WorkingContext` می‌سازد؛ در غیر این صورت `null`.

**قانون حیاتی**: هیچ‌یک از این دو متد در هیچ مسیر خروجی (renderInsights/submitFeedback/rollbackPolicy/learningStats/…) در PHASE 4 فراخوانی نمی‌شوند — فقط برای فازهای بعد و تست‌ها موجودند. اثبات: P4-07.

## ۴. راهبرد اثبات بایت‌به‌بایت (P4-07)

`scripts/verify-p4-07.ts` روی پایگاه ایزوله (الگوی P3-03، seed قطعی p303، ریست کامل کاشی پیش از هر پیکربندی):

- **A)** `RequestAgent()` — بدون موتور (رفتار PHASE 3).
- **B)** `RequestAgent({engines: createDefaultEngineDeps()})` — Placeholder پیش‌فرض.
- **C)** `RequestAgent({engines: {context: ContextEngineImpl با MemoryEngineImpl پرشده، memory: همان موتور}})` — بدنه‌های واقعی PHASE 4 با ۱۲ رکورد حافظه از پیش کاشته‌شده؛ بین دو رندر، `observe()` و `assembleContext()` هم صدا زده می‌شوند (اثبات بی‌اثری حتی هنگام استفاده).

هر سه: dump `learningStats + renderInsights` (JSON کامل) — باید **بایت‌به‌بایت** یکسان باشند؛ در C دو رندر متوالی هم باید یکسان باشند (خود-پایداری). خود-تمیزشونده.

## ۵. تست‌ها (P4-08) — `tests/phase4-engines.test.ts`

حداقل ۲۸ تست در شش گروه: VectorIndex/تعبیه (۸) · InMemoryStore (۴) · FileSystemStore (۳، tmpdir) · MemoryEngineImpl (۶) · ContextEngineImpl (۵) · اتصال BaseIntelligentAgent (۴؛ شامل هم‌ارزی خروجی ایجنت شاهد با سه پیکربندی موتور). همه بدون DB (صفر Prisma).

## ۶. پذیرش فاز

| معیار | آستانه |
|---|---|
| تست جدید | ≥ ۲۰ |
| مجموع تست | ≥ ۵۷۷ و ۰ شکست |
| دو-سبز پیاپی | ۲ اجرای متوالی کامل سبز |
| tsc | ۰ خطا |
| ممیزی مرز `--strict` | PASS (پنج صفر) |
| اثبات P4-07 | سه پیکربندی + دو-رندر — همه بایت‌به‌بایت یکسان |
| diff فایل‌های PHASE 3 | `engines/*.ts` و `engine-deps.ts` و `agent.test.ts` و `base-agent.ts`: صفر تغییر |
| Migration / UI | صفر |

## ۷. خروجی فاز و پل به PHASE 5

تحویل: بدنه‌های واقعی Context+Memory با ذخیره‌سازی قابل‌تعویض و جستجوی برداری — «قابل‌تزریق و اثبات‌شده» اما «هنوز مصرف‌نشده در خروجی». PHASE 5 (موتور Retrieval/Feature) می‌تواند از همین MemoryStore/VectorIndex و `WorkingContext` شروع کند بدون هیچ تغییری در قراردادهای v1.
