
---
---

# بخش چهارم — داده و اتصال

---

# فصل ۱۸ — اسکیمای Prisma

> **مرجع:** `prisma/schema.prisma` — ۱۳۹۴ خط، ۳۹ مدل، ۹ بخش موضوعی. **بدون enum** (همهٔ وضعیت‌ها رشتهٔ مستند با کامنت — تصمیم طراحی برای سازگاری additive با دادهٔ منبع). **بدون migrations/** — اسکیما با `prisma db push` اعمال می‌شود (پروژه از day-one push-محور بوده؛ مهاجرت به migrate در PHASE 12 همراه PostgreSQL).
> **قاعدهٔ تغییر اسکیما:** فقط افزودنی · پیش از هر تغییر `VACUUM INTO backups/pre-*.db` · صفر حذف ستون/جدول (قانون دادهٔ مقدس).

## ۱۸٫۱ — نقشهٔ ۹ بخش اسکیما

| بخش (خط شروع) | مدل‌ها | نقش |
|---|---|---|
| امنیت و احراز هویت (۱۳) | `Session`, `OtpAttempt`, `AuditLog` | نشست/OTP/حسابرسی |
| داده‌های CRM (۷۹) | `SyncState`, `SyncDeadLetter`, `TransactionRecord`, `ExpertRecord`, `InteractionRecord`, `VisitRecord`, `SupplyDemandRecord`, `LookupLog` | کش/همگام‌سازی سامانه ARM |
| فایل‌یابی از دیوار (۳۳۶) | `DivarConnection`, `DivarSetting`, `DivarAd`, `DivarRejectLog`, `MarketPriceStat`, `DivarScanLog` | پرووایدر ثانویهٔ دیوار |
| قراردادها و اسناد (۵۰۴) | `ContractRecord` | صورت‌وضعیت‌های ARM |
| رجیستری‌های P6.5 (۵۷۳) | `PropertyRecord`, `CustomerRecord`, `RefListCache`, `PriceIndexHistory`, `CommissionCalcLog`, `ListingRecord` | آمادگی داده/کاتالوگ/آگهی ملکا |
| کش فهرست‌های مرجع (۶۵۷) | `RefListCache` (اشتراکی) | user-characters/jobs/roles/seriousness |
| شاخص قیمت روز مناطق (۶۷۰) | `PriceIndexHistory` | configs/current-prices |
| مالی و کمیسیون (۶۹۷) | `CommissionCalcLog` | محاسبات ACC |
| کاشی آگهی ملکا (۷۲۰) | `ListingRecord`, `InstagramConnection`, `InstagramPostLog` | آگهی داخلی + انتشار |
| اتصال چندسامانه‌ای (۸۶۸) | `PmConnection`, `GapConnection`, `ArmConnection` | توکن‌های رمزنگاری‌شدهٔ سه سامانه |
| زیرساخت Bulk (۹۳۳) | `SyncCheckpoint`, `TransactionEnrichment`, `PmPersonnelRecord`, `SpecialPropertyRecord`, `RequestRecord`, `RequestEventRecord` | برش‌های checkpointدار + غنی‌سازی |
| لایهٔ ایجنت هوشمند (۱۰۸۰) | `AgentMemory`, `AgentFeedback`, `AgentPolicyVersion`, `AppMeta`, `SyncJobState` | append-only ایجنت + شاهد بیلد + وضعیت کار |
| گراف‌ها (۱۳۳۲) | `GraphNode`, `GraphEdge`, `OpportunityAlert` | سه گراف + هشدار فرصت |

## ۱۸٫۲ — توضیح مدل‌های کلیدی

| مدل | کلید/یگانگی | نکات ساختاری |
|---|---|---|
| `Session` | `tokenHash @unique` | توکن نشست فقط هش SHA-256؛ `armTokenEnc/armRefreshTokenEnc` رمز AES-256-GCM؛ `accessScope` (OWNER/BRANCH/CONSULTANT)؛ `archivedAt` آرشیو به‌جای حذف |
| `OtpAttempt` | — | محدودسازی نرخ (۳ پیامک/۱۰ دقیقه، ۵ تأیید/۱۵ دقیقه) |
| `AuditLog` | — | ثبت کامل رخدادهای امنیتی/داده‌ای با actor |
| `SyncState` | `id: "singleton"` | وضعیت هر منبع + `lastSuccessAt/lastError` |
| `SyncDeadLetter` | — | رکوردهای شکست‌خوردهٔ incremental برای بازپردازش |
| `TransactionRecord` | کد یکتای معامله | عین «گزارش تطابق معاملات» ARM |
| `PropertyRecord` | کد آگهی | کاتالوگ آگهی ARM + غنی‌سازی owner/details (فیلدهای ownerMobile/address/areaName/…) |
| `RequestRecord` | کد درخواست | کاتالوگ درخواست ARM + متقاضی + مناطق + فوریت/جدیت |
| `PmPersonnelRecord` | کد پرسنلی | رجیستری PM: استخدام/شعبه/نقش/تماس/آدرس (contactInfo.address) |
| `ContractRecord` | — | صورت‌وضعیت + خریداران/فروشندگان/حق‌السهم JSON |
| `TransactionEnrichment` | — | غنی‌سازی per-transaction (tx-info/حق‌السهم) با state |
| `SyncCheckpoint` | (source,kind) یگانه | نقطهٔ ازسرگیری برش‌ها (صفحه/بازه) — قلب ادامهٔ قطع‌شده‌ها |
| `AgentMemory/AgentFeedback` | (tileId,…) | append-only؛ `termVector` برای RAG |
| `AgentPolicyVersion` | (tileId,version) | وزن دسته‌ها + rationale + نسخه‌های کامل برای Rollback |
| `GraphNode/GraphEdge` | (graph,nodeType,refId)/(graph,src,dst,type) | سه گراف additive-only |
| `AppMeta` | singleton | شاهد بیلد در DB (buildId/gitSha/builtAt) |
| `SyncJobState` | singleton | وضعیت دیمن کاتالوگ (ticks/lastError/extractionBatchId) |
| `OpportunityAlert` | — | هشدار فرصت از matching/listener |
| `ArmConnection/PmConnection/GapConnection` | singleton×۳ | توکن هر سامانه جدا، رمزنگاری‌شده، با expiry + refresh |

## ۱۸٫۳ — روابط کلیدی

- `PropertyRecord` ↔ `TransactionRecord` از طریق کد ملک (منطقی، نه FK — دادهٔ منبع ناهمگن است).
- `PmPersonnelRecord.code` ↔ `ExpertRecord.personnelCode` ↔ `Session.personnelCode` — هویت پرسنلی مشترک سه سامانه.
- `GraphNode.refId` به رکوردهای چهار جدول اصلی اشاره می‌کند (refId قواعد در فصل ۱۶).
- `AgentMemory/Feedback/PolicyVersion` همگی با `tileId` به کاشی قفل‌اند.

## ۱۸٫۴ — متن کامل `prisma/schema.prisma`

```prisma
{{FILE:prisma/schema.prisma}}
```

## ۱۸٫۵ — DTOهای خالص لایهٔ Repository (متن کامل)

> عین `src/core/repositories/interfaces/dto.ts` (۸۳۰ خط) — آینهٔ ساختاری رکوردهای سامانه‌های واقعی؛ تنها منبع مجاز type برای ایجنت‌ها و تحلیل‌گرها:

```ts
{{FILE:src/core/repositories/interfaces/dto.ts}}
```
