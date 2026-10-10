
---
---

# پیوست ۲ — کاتالوگ کامل تست‌ها (۷۸ فایل)

> هر پروژهٔ تحویل تست شاهد خودش را با همان نام پرونده حمل می‌کند — الگوی «تست = سند اجرایی». اجرا: `bun test tests/` (پایگاه تست مجزا + کلید آزمایشی از `package.json:14`).

| گروه | فایل‌ها | قلمرو |
|---|---|---|
| هستهٔ ایجنت | `agent`, `analyzers`, `phase2-base-agent`, `phase2-agents` | BaseLearningAgent، ایزوله‌سازی، تحلیل‌گرهای خالص |
| ایجنت‌های هوشمند | `divar-agent.intelligent`, `request-agent.intelligent` | رفتار یادگیری چندمرحله‌ای |
| فاز ۱ | `phase1-datasource`, `phase1-domain-move`, `phase1-kpicard`, `phase1-layer-boundaries`, `phase1-regression`, `phase1-step-report`, `phase1-use-tile-data` | لایه‌ها، مرزبندی، KPI، DTO |
| فاز ۲ | `phase2-logger`, `phase2-policy-meta`, `phase2-repositories`, `phase2-routes`, `phase2-sync` | رجیستری‌ها، BFF، sync |
| فاز ۳ | `phase3-skeleton` | قراردادهای ۱۱ موتور (interface خالص) |
| فاز ۴ | `phase4-engines` | بدنهٔ Context/Memory |
| فاز ۵ | `phase5-retrieval` | بازیابی هیبریدی |
| فاز ۶ | `phase6-features`, `phase6-prediction`, `phase6-visibility` | Feature/Prediction/نمایش |
| فاز ۶٫۵ | `phase65-arm-connection`, `phase65-b3-coverage10k`, `phase65-b3-three-layer`, `phase65-bulk-import`, `phase65-normalize`, `phase65-scope-audit`, `phase65-sync-bugfix` | اتصال ARM، bulk، نرمال‌سازی، ConsultantScope |
| فاز ۷-۹ | `phase7-outcome-safety-action`, `phase8-evaluation-learning-decision`, `phase9-wiring-brain-daemon` | پیامد/ایمنی/اقدام، ارزیابی-یادگیری-تصمیم، سیم‌کشی مغز |
| رجیستری/کاشی | `tile-registry`, `management-dashboard`, `new-tiles`, `new-tiles-2`, `listing`, `request`, `divar`, `melk-api`, `crypto`, `format` | هر کاشی/ماژول |
| معماری و رنگ P6530 | `p6530-architecture-guards`, `p6530-color-system`, `p6530-m1-arm-listing`, `p6530-m2-arm-request`, `p6530-m3-transactions`, `p6530-m4-experts`, `p6530-settings-order` | گاردهای معماری + نظام رنگ + چهار کاشی M |
| مغز P6537 | `p6537-p7-core` … `p6537-p11-core`, `p6537-integration` | پهنه‌های P7-P11 (تصمیم/ارزیابی/سیاست/تشخیص/ترمیم) |
| پرونده‌های تحویل | `p6504i-owner-role`, `p6509-owner-unlimited`, `p6511-merge-resume`, `p6512-cross-sync`, `p6519-deploy-freshness`, `p6527-mobile-list-performance`, `p6545-step1-infra`, `p6545-step2-tiles`, `p6545-step3-brain`, `p6546-six-steps`, `p6547-six-steps`, `p6549-coverage-columns`, `p6549-luxury-law` | هر پروندهٔ تحویل، تست شاهد خودش |
| حادثه‌ها (رگرسیون) | `hotfix01-secrets` … `hotfix06-prod-logs` | درس‌آموختهٔ هر حادثه |
| پلتفرم | `platform-env-fallback`, `night2-sync-summary` | env جایگزین، خلاصهٔ شبانه |

---

# پیوست ۳ — کاتالوگ اسناد `docs/` (۲۸ سند)

| سند | موضوع |
|---|---|
| `ARCHITECTURE.md` | معماری کامل و لایه‌های تخصصی (مرجع اصلی فصل ۳) |
| `API-INTEGRATION.md` | قرارداد کامل API سامانه‌های ملک تبریز |
| `ARM-PM-RECONNAISSANCE.md` | شناسایی اولیهٔ ساختار دو سامانه |
| `BUILD-ANDROID.md` | بسته‌بندی Capacitor اندروید |
| `INTELLIGENCE-CORE-SOUL.md` | روح و فلسفهٔ هستهٔ هوشمندی |
| `METADATA-CONTRACT.md` | قرارداد متادیتا |
| `P7-SOUL.md` … `P11-SOUL.md` | روح پهنه‌های P7 تا P11 (تصمیم تا ترمیم) |
| `P6537-CLOSURE.md` | بستنج پروندهٔ P6537 |
| `P6546-ENDPOINT-MAP.md` | نقشهٔ کامل endpoint های کشف‌شده |
| `PHASE-3-DESIGN.md` … `PHASE-6.5-DESIGN.md` | طراحی هر فاز ساخت |
| `PREDICTION-BASELINE.md`, `PREDICTION-CONTRACT.md` | خط پایه و قرارداد پیش‌بینی |
| `RECON-NIGHT1-RUNBOOK.md` | رونمای شناسایی شب اول |
| `RECOVERY-POLICY.md` | سیاست رسمی بازیابی (پیوست ۱ این سند) |
| `TODO_P1-05.md` | کارهای باقی‌ماندهٔ فاز ۱ |
| `decision-preview-publish.md` (+v2), `diagnosis-preview-publish-stale.md` (+v2), `publish-permanent-fix-p6526.md` | تشخیص و تصمیم مسائل انتشار |

---

# پیوست ۴ — واژه‌نامهٔ بازسازی (فارسی ↔ شناسهٔ کد)

> برای آنکه تسک تازه هیچ‌گاه بین «نام فارسی» و «identifier» سرگردان نشود.

| فارسی | شناسه | جا |
|---|---|---|
| ملکا | Melka (نام محصول) | `public/manifest.json` |
| سامانهٔ آرم (مدیریت آگهی و درخواست) | ARM | `src/lib/melk-api/endpoints.ts → arm` |
| سامانهٔ پرسنلی | PM | `endpoints.ts → pm` |
| سامانهٔ مالی (حسابداری) | ACC | `endpoints.ts → acc` |
| سامانهٔ گفت‌وگو | GAP | `endpoints.ts → gap` |
| سامانهٔ عمومی | melkPublic | `endpoints.ts → melkPublic` |
| کاشی | Tile | `src/core/tiles/tile-contract.ts` |
| ظرف داشبورد مدیریتی | management-dashboard (container) | `tile-registry.ts → listChildren` |
| ایجنت یادگیرنده | BaseLearningAgent | `src/core/agent/base-agent.ts` |
| بینش | InsightCard | `base-agent.ts` |
| دامنهٔ بینش | insightDomains | تعریف هر کاشی |
| سیاست نسخه‌دار | AgentPolicyVersion | `prisma/schema.prisma` |
| حافظهٔ ایجنت | AgentMemory | همان |
| تختهٔ سیاه | Blackboard | `src/lib/intelligence/blackboard.ts` |
| حلقهٔ سرنوشت | core-cycle / outcome-loop | `src/lib/intelligence/` |
| دیمن مغز | intelligence daemon | `lib/intelligence/daemon.ts` |
| دیمن کاتالوگ/پایدارساز | catalog daemon | `lib/melk-api/catalog-daemon.ts` |
| نقطهٔ ازسرگیری | checkpoint (SyncCheckpoint) | `prisma/schema.prisma` |
| نامهٔ مرده | SyncDeadLetter | همان |
| غنی‌سازی | enrichment (tx-enrichment/expert-enrichment) | `src/lib/melk-api/` |
| فایل مناطق | AreasFileCell | `tiles/arm-request/` |
| شعبه | branch (branches.ts) | `src/lib/branches.ts` |
| دامنهٔ دسترسی | accessScope / ConsultantScope | `src/lib/access/scope.ts` |
| خودتشخیصی | P10 (p10-core) | `src/core/intelligence/p10-core.ts` |
| خودترمیمی | P11 (p11-core) | `src/core/intelligence/p11-core.ts` |
| مهر نسخه / شاهد بیلد | build witness | `src/lib/build-witness.ts` |
| گارد تازگی | verify-deploy-freshness.sh | `scripts/` |
| بستهٔ بقا | survival package | `upload/.survival/` |
| زنجیرهٔ هش بسته‌ها | CHAIN.txt (chainIndex) | هر بستهٔ بقا |
| قانون دادهٔ مقدس | Data Sacredness Law | فصل ۲۵٫۳ |
| قانون تثبیت ۲٫۰ | Stabilization Law 2.0 (۰۳۵-A) | فصل ۲۵٫۲ |
| قانون ظاهر فاخر | Luxury Law (۰۳۵-B) | فصل ۹ |
| وضعیت‌های آگهی | LISTING_STATES | `src/lib/listing-status.ts` |
| وضعیت‌های درخواست | REQUEST_STATES | `src/lib/request-status.ts` |
| تقویم هجری شمسی | jalali | `src/lib/jalali.ts` |
| فارسی‌سازی اعداد | faNumber/faPrice | `src/lib/format.ts` |
| رندر پنجره‌ای | virtual window (TableBodyVirtual) | `src/lib/virtual-window.ts` |
| یکسان‌سازی ورودی | normalize-input | `src/lib/normalize-input.ts` |
| پالت ۱۳×۵ | palette13 | `src/lib/palette13.json` |
| کارگر شتاب‌دهنده | accelerate worker (m2-worker) | `scripts/p6549/` |
| بازگشت سیاست | policy rollback | `/api/agent/[tileId]/policy` |

---

# پیوست ۵ — چک‌لیست بازسازی سریع (برای تسک تازه)

۱. `bun install` → سبز.
۲. `.env.example` را به `.env.local` کپی و `MASTER_ACCESS_CODE` + `MELK_TOKEN_KEY` (و در تولید `DATABASE_URL`) مقدار دهید.
۳. `bun run db:generate && bun run db:push` — اسکیمای ۳۹ مدل ساخته می‌شود (بدون داده).
۴. `bunx tsc --noEmit` → صفر خطا · `bun run test` → سبز (پایگاه تست خودکار).
۵. `bun run dev` → ورود با کد مدیر → خانهٔ پنج‌کاشی‌ای.
۶. `bun run build` → BUILD_ID خودکار `<sha>-<date>-<time>`.
۷. اتصال سامانه‌ها: تنظیمات عمومی → اتصال ملک تبریز (ورود با کد پرسنلی واقعی → OTP → توکن در Vault) → دیمن کاتالوگ خودکار داده می‌کشد.
۸. برای جزئیات هر گام: همین سند + `REBUILD-LETTER.md`.

---

# پیوست ۶ — کتابخانه‌های عرضی یکتا (متن کامل)

> پنج فایل کوچک اما «منبع یگانه» — هر تغییر رفتار فارسی/زمانی/پنجره‌ای فقط از همین‌ها:

## پیوست ۶٫۱ — تقویم هجری شمسی (`src/lib/jalali.ts` — ۳۰۲ خط)

```ts
{{FILE:src/lib/jalali.ts}}
```

## پیوست ۶٫۲ — یکسان‌سازی ورودی (`src/lib/normalize-input.ts` — ۷۲ خط)

```ts
{{FILE:src/lib/normalize-input.ts}}
```

## پیوست ۶٫۳ — فارسی‌سازی نمایش (`src/lib/format.ts` — ۱۰۴ خط)

```ts
{{FILE:src/lib/format.ts}}
```

## پیوست ۶٫۴ — ریاضیات رندر پنجره‌ای (`src/lib/virtual-window.ts` — ۱۰۵ خط)

```ts
{{FILE:src/lib/virtual-window.ts}}
```

## پیوست ۶٫۵ — حلقهٔ شعبه (`src/lib/branches.ts` — ۱۱۴ خط)

```ts
{{FILE:src/lib/branches.ts}}
```

## پیوست ۶٫۶ — دامنهٔ دسترسی مشاور (`src/lib/access/scope.ts` — ۱۶۰ خط)

```ts
{{FILE:src/lib/access/scope.ts}}
```
