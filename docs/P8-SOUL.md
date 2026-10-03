# P8-SOUL — سند روح فاز ۸: موتور تصمیم

**پرونده:** P6537 · **منبع قانون:** ملکا-شورا-۱۴۰۵-۰۲۷ §۳ · **دروازه:** P8-D

## فلسفه
تصمیم بدون امنیت، فاجعه است. موتور تصمیم باید واقعاً به مالک کمک کند.

## پوسته
- قراردادها: `DecisionRecord` (با **قفل نوعی** `requiresApproval: true` و `autoExecute: false`)، `DecisionAlternative`، `ActionPlan`/`ActionStep` (قفل نوعی)، `SafetyPolicy`/`SafetyRule` — `src/core/intelligence/contracts-p7-p11.ts`
- `DecisionEngineImpl`: چهار ناحیهٔ احتمال (۰-۲۵ منتظر / ۲۵-۵۰ بررسی / ۵۰-۷۵ اقدام / ۷۵-۱۰۰ فوری) + سه قاعدهٔ دامنه (قیمت >۲۰٪ زیر میانگین → تعدیل · کارشناس ۹۰٪+ → تخصیص · >۹۰ روز بازار → تعدیل) + رتبه‌بندی گزینه‌ها با دلیل رد + توضیح فارسی
- `ActionPlannerEngineImpl`: پنج الگوی گام (تماس مستقیم / بازدید / تعدیل قیمت / تخصیص کارشناس / انتظار هوشمند) + simulate + estimateImpact + rollbackPlan برای تعدیل قیمت
- `SafetyEngineImpl`: هفت قاعدهٔ سخت SAF-001..007 (بدون prediction / confidence<۰٫۳ / بدون rationale / مالی خودکار / تماس بدون تأیید / تغییر داده بدون audit / LLM در production)

## روح (رفتار اثبات‌شده)
| سنجه | مقدار واقعی | شاهد |
|---|---|---|
| تصمیم واقعی روی پیش‌بینی واقعی | ۱۰ (از ۳۸۴ پیش‌بینی ARM) | `download/p6537/p8-decisions.json` |
| هر تصمیم: prediction + rationale + confidence + alternatives | ۱۰/۱۰ | همان شاهد |
| صفر auto_execute | ۱۰/۱۰ (قفل نوعی + SAF-004) | همان شاهد + تست |
| Safety زنده | ۷ قاعده × ۱۰ تصمیم = ۷۰ بررسی، همه pass | همان شاهد |
| طرح اقدام | ۱۰ طرح با گام‌های owner/consultant/system | همان شاهد |
| تست | ۷۳ | `tests/p6537-p8-core.test.ts` |

## تست زندهٔ بستن دروازه (P8-D شرط ۴)
تصمیم خصمانه (بدون prediction + confidence ۰٫۱ + بدون دلیل) در تست ۴-۴ توسط Safety مسدود شد: `blockedBy = [SAF-001, SAF-002, SAF-003]` — شاهد: اجرای تست سبز ×۲.

## قفل‌ها
`buildDecisionRecord` قفل نوعی را در سطح ساخت اعمال می‌کند؛ SAF-004 حتی با پرچم `financialAuto: true` مسدود می‌کند (تست ۳-۸).
