# سند طراحی PHASE 5 — موتور بازیابی ترکیبی (Retrieval + RAG Engine)

**نسخه:** 1.0 · **اصل حاکم:** Preserve → Refactor → Harden → Upgrade Intelligence
**شعار فاز:** «حافظه ساخته شد. الان مهارت جستجو در آن را می‌سازیم.»

---

## ۱. هدف و دامنه

تبدیل موتور بازیابی از «قرارداد» به «بدنه واقعی» با سه قابلیت کلیدی:

1. **فیلتر متادیتا** — محدودسازی دامنه پیش از جستجو (قرارداد: `docs/METADATA-CONTRACT.md`)
2. **جستجوی ترکیبی** — BM25 فارسی + Vector با ادغام RRF
3. **ارجاع (Citation)** — هر بخش زمینه‌ای که از حافظه می‌آید، ردی قابل‌بازگشت دارد

خارج از دامنه (ممنوع): Feature قابل‌مشاهده · Migration · تغییر قرارداد v1 · مصرف اجباری در ایجنت‌ها.

## ۲. معماری و جریان وابستگی

```
MemoryEngine (PHASE 4 — بدنه موجود)
↓ استفاده می‌کند
VectorIndex (PHASE 4 — نمایه برداری موجود)
↓
retrieval/metadata.ts        ← قرارداد MemoryMetadata/MetadataFilter + حل‌کننده (P5-02)
retrieval/keyword-search.ts  ← BM25 سبک + نرمال‌سازی فارسی + نمایه معکوس در-حافظه (P5-03)
retrieval/hybrid-retriever.ts← RRF: ادغام رتبه‌های vector + keyword + فیلتر پیش از خروجی (P5-04)
retrieval/reranker.ts        ← رتبه‌بندی مجدد heuristic آفلاین (P5-05)
retrieval/citation-builder.ts← ساخت Citation با مرزهای موقعیت (P5-06)
retrieval/retrieval-engine.ts← RetrievalEngineImpl — بدنه قرارداد v1 روی پشته بالا (P5-07)
↓
ContextEngineImpl.assembleWithCitations (P5-06 — متد افزودنی؛ assemble دست‌نخورده)
↓
BaseIntelligentAgent.assembleCitations (P5-07 — متد افزودنی protected؛ duck-typing)
```

جهت import ها یک‌سویه و بی‌چرخه: `context-engine → retrieval/citation-builder` (ارزشی) و `retrieval → memory/*` (موجود). **بدون چرخه** — هیچ فایلی در retrieval از context import نمی‌کند. مرز ممیزی (`--strict`) در تمام فایل‌ها برقرار: صفر Prisma / صفر `@/lib/db` / صفر fetch / صفر React.

## ۳. تصمیم‌های طراحی (و انحرافات صادقانه از پیش‌نویس دستور)

### ۳-۱. برخوردن از تصادم نام با قرارداد v1

پیش‌نویس دستور برای `HybridRetriever.retrieve` خروجی `RetrievalResult[]` نوشته؛ اما `RetrievalResult` در قرارداد v1 (`engines/retrieval.ts`) معنای ثابت دارد (`{snippets, hitCount, method}`). برای آن‌که قرارداد v1 ذره‌ای تغییر نکند و کد مبهم نشود:

- نتیجه per-item جدید: **`RetrievedItem`** `{ record, score, sources, vectorRank, keywordRank }`
- پرسش ترکیبی جدید: **`HybridQuery`** `{ text, embedding?, filter? }`
- قرارداد v1 با نام خودش دست‌نخورده می‌ماند و `RetrievalEngineImpl` آن را **روی** پشته جدید پیاده می‌کند (`method: "HYBRID"` — مقدار مجاز از PHASE 3).

### ۳-۲. گسترش WorkingContext با وراثت، نه تغییر

`WorkingContext` فیلد اجباری `citations` نمی‌گیرد (این کار شکل JSON خروجی `assemble` موجود را عوض می‌کرد و با «اثبات بایت‌به‌بایت رفتار عین قبلی» ناسازگار بود). به‌جای آن:

```typescript
export interface WorkingContextWithCitations extends WorkingContext {
  citations: Citation[];
}
```

`assemble` عیناً دست‌نخورده (خروجی بایت‌به‌بایت PHASE 4)؛ `assembleWithCitations` نوع گسترش‌یافته برمی‌گرداند.

### ۳-۳. queryWithFilter به‌عنوان «قابلیت اختیاری»

طبق استاندارد اجباری فاز (قاعده طلایی P4-06): متد `queryWithFilter?` **اختیاری** روی درگاه `MemoryStore` + پیاده‌سازی در هر دو فروشگاه + مسیر جایگزین duck-typing در مصرف‌کننده. هر پیاده‌سازی ثالث بدون این متد همچنان معتبر است.

### ۳-۴. «پیش‌از-جستجو» روی نمایه در-حافظه

هر دو نمایه (معکوس کلیدواژه‌ای و برداری) کل فروشگاه را در حافظه دارند؛ فیلتر متادیتا ابتدا «مجموعه نامزدها» را می‌سازد، جستجوها با عمق کامل اجرا و نتایج به نامزدها بریده می‌شود، سپس RRF. این با پیش‌فیلتر واقعی روی همان نمایه‌ها **هم‌ارز نتیجه** است (ترتیب نسبی بازماندگان حفظ می‌شود) و از تغییر امضای `KeywordSearch`/`VectorIndex` خودداری می‌کند.

### ۳-۵. BM25 فارسی — راهبرد «دو-شکل» (split + compound)

چالش: «ولیعصر» (چسبیده) باید «ولی عصر» (جدا) را پیدا کند و «ائل‌گلی» (ZWNJ) باید با «ائلگلی» (بی‌نیم‌فاصله) هم‌توکن شود.

- **نرمال‌سازی:** ارقام فارسی/عربی → لاتین · ی/ک عربی → فارسی · حذف اعراب و علائم سجاوندی · کوچک‌سازی لاتین · ZWNJ → فاصله (شکل جدا) · حفظ پیشوندهای بر/می/نمی (هیچ پیشوندی حذف نمی‌شود).
- **توکن‌سازی دو-شکل:** از متن نرمال‌شده، توکن‌های اصلی (شکل جدا) + «توکن مرکب» (الحاق هر جفت توکن مجاور — بازسازی شکل چسبیده) تولید می‌شود. «ولی عصر» → `[ولی، عصر، ولیعصر]`؛ «ائل‌گلی» → `[ائل، گلی، ائلگلی]`. پرسش هم همین‌طور → تطبیق چسبیده/جدا دوطرفه برقرار است.
- **آمار سند:** طول سند فقط با توکن‌های اصلی محاسبه می‌شود (توکن‌های مرکب فقط در postings حضور دارند تا |D| و avgdl واقعی بمانند).
- **BM25:** `IDF(t) = ln(1 + (N − df + 0.5)/(df + 0.5))` (همیشه مثبت) و `score = Σ IDF · tf·(k1+1) / (tf + k1·(1 − b + b·|D|/avgdl))` با `k1=1.5`، `b=0.75`.
- **stopword فارسی:** فهرست کوچک محافظه‌کار (و، در، به، از، که، این، آن، را، با، است، بود، برای، تا، یا) — بر/می/نمی عمداً حذف نمی‌شوند (قاعده حفظ پیشوندها).

### ۳-۶. RRF وزن‌دار

`score(d) = w_v · 1/(k + rank_v(d)) + w_k · 1/(k + rank_k(d))` با `k=60`، `w_v = w_k = 0.5` (پیش‌فرض).

- وزن بردار ۰ ⇔ فقط رتبه کلیدواژه‌ای (هم‌ترتیب KeywordSearch) · وزن کلیدواژه ۰ ⇔ فقط برداری.
- مرتب‌سازی نهایی: امتیاز ادغام نزولی؛ تساوی → ترتیب درج پایدار (اولویت نامزد زودتر در فهرست نامزدها).
- سند حاضر فقط در یک لیست → فقط همان سهم را می‌گیرد (پیوستن طبیعی RRF بدون جریمه).

### ۳-۷. Reranker — heuristic آفلاین (صفر LLM)

`final = 0.4·base + 0.2·recency + 0.2·importance + 0.1·confidence + 0.1·domainMatch`

- `base` = امتیاز ادغام نرمال‌شده به بیشینه همین مجموعه نتایج (نسبی-به-پرسش؛ سنداً ثبت می‌شود).
- `recency = exp(−سن‌ساعت / timeDecayHours)` با `timeDecayHours = 168` (یک هفته).
- `importance`/`confidence` از متادیتای حل‌شده (پیش‌فرض 0.5 برای رکوردهای قدیمی).
- `domainMatch` = 1 اگر `query.domain` بر `metadata.domain` منطبق باشد، وگرنه 0.
- وزن‌ها و decay همگی قابل‌تنظیم؛ مجموع وزن‌های پیش‌فرض = 1.

### ۳-۸. Citation و موقعیت در زمینه

```typescript
export interface Citation {
  memoryId: string;
  agentId: string;                       // از متادیتای حل‌شده — نبود = ""
  source: string;                        // منبع حل‌شده — پیش‌فرض "external"
  snippet: string;                       // ۱۰۰ نویسه اول متن
  relevanceScore: number;                // امتیاز نهایی (ادغام/رتبه‌بندی‌شده)
  positionInContext: [number, number];   // [start, endExclusive) در contextText
}
```

- `assembleWithCitations` حین مونتاژ، آفست هر بخش (خاطره/سیگنال) را می‌شمارد؛ فقط ارجاع‌هایی که **کاملاً** داخل متن نهایی (پس از برش بودجه) می‌گنجند نگه داشته می‌شوند.
- تست صحت موقعیت: `contextText.slice(start, end)` باید عین متن همان بخش باشد.

### ۳-۹. اتصال به BaseIntelligentAgent — همان الگوی P4-06

متد افزودنی protected:

```typescript
protected async assembleCitations(purpose, options?): Promise<{ context: string; citations: Citation[] } | null>
```

بدون ContextEngineِ دارای قابلیت `assembleWithCitations` → `null`. صفر تغییر در سازنده/فیلد/امضاهای موجود؛ هیچ ایجنتی مجبور به مصرف نیست؛ هیچ مسیر خروجی آن را صدا نمی‌زند.

## ۴. پیکربندی اثبات P5-08 (الگوی P4-07، وضعیت تازه در هر پیکربندی)

| پیکربندی | سیم‌کشی | انتظار خروجی |
|---|---|---|
| A | `RequestAgent()` — بدون موتور (PHASE 3) | مرجع |
| B | بدنه‌های PHASE 4 (Context+Memory واقعی + ۱۲ خاطره) — «فقط VectorSearch» | بایت‌به‌بایت = A |
| C | B + `RetrievalEngineImpl` (Hybrid بدون Reranker) تزریق در `engines.retrieval` + فراخوانی واقعی پیش از خروجی | بایت‌به‌بایت = A |
| D | C + Reranker + Citation؛ فراخوانی `assembleCitations` (زیرکلاس نمونه‌مند) + اثبات تولید ارجاع | بایت‌به‌بایت = A |

گاردها: ۱۷ فایل مسیر خروجی عیناً با `pre-phase5-baseline` · سیم‌کشی زنده (ارجاع‌ها واقعاً تولید شوند) · خروجی = `learningStats + renderInsights` (stats-first، عین P2-07).

## ۵. پوشش تست (هدف ≥۲۰؛ مجموع ≥۶۱۳)

| بلوک | تعداد | نمونه |
|---|---|---|
| MetadataFilter | ۵ | agentId / tileId / area / بازه زمانی / minConfidence |
| BM25 | ۵ | ولیعصر⇔ولی عصر · ZWNJ ائل‌گلی · رتبه‌بندی · stopword · بازه امتیاز |
| HybridRetriever | ۵ | وزن ۰=کلیدواژه · وزن ۱=برداری · تطبیق ترکیبی · اثر فیلتر |_
| Reranker | ۳ | تازگی · اهمیت · وزن سفارشی |
| Citation | ۴ | پر شدن درست · موقعیت · بدون حافظه=[] · snippet |
| اتصال ایجنت | ۲ | null بدون قابلیت · ارجاع با موتور کامل |

## ۶. معیار موفقیت فاز

سنجه ← هدف: بدنه‌دار شدن موتور سوم (Retrieval) · BM25 فارسی با ZWNJ اثبات‌شده · HybridRetriever با RRF اثبات‌شده · Reranker heuristic · Citation در ContextEngine · MetadataFilter · ≥۲۰ تست جدید · مجموع ≥۶۱۳ · صفر fail دو-سبز · صفر تفاوت بصری · صفر تفاوت بایت‌به‌بایت خروجی بینش · صفر Migration · صفر تغییر اجباری ایجنت · GATE-F ✅

## ۷. نقشه خطر و مسیر جایگزین (تعهد عدم توقف)

| مانع | راه جایگزین |
|---|---|
| BM25 فارسی ضعیف | تنظیم k1/b + مقایسه با Vector روی داده نمونه؛ انتخاب بر اساس داده |
| موقعیت Citation غلط | مقایسه مستقیم با `slice()` و رفع ریشه |
| Hybrid ضعیف‌تر از تک‌روش | تحلیل وزن RRF و k؛ تنظیم داده‌محور |
| شکست گارد ۱۷ فایل | ریشه‌یابی همان گام + بازگشت جزئی |
| دو-سبز نشدن | ریشه آلودگی مشترک (درس P2-06) |
| تأخیر تأیید مالک (D5) | PHASE 6 در «آماده شروع» می‌ماند — بدون پیش‌روی |

## ۸. قانون عدم خودفریبی (بخش H دستور)

ممنوع بدون شاهد: «RAG واقعی» تا اثبات Hybrid+Citation · «جستجوی معنایی» برای TF/Cosine · «بازیابی حرفه‌ای» بدون Golden Dataset. اظهارات مجاز: «MetadataFilter با ۵ فیلد مختلف پیاده شد» · «BM25 فارسی با پشتیبانی ZWNJ اثبات شد» · «Hybrid با RRF — ترکیبی ≥ هر یک از دو روش» · «Citation در ContextEngine — N ارجاع در M بینش».
