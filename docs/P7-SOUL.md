# P7-SOUL — سند روح فاز ۷: یادگیری از نتیجه

**پرونده:** P6537 · **منبع قانون:** ملکا-شورا-۱۴۰۵-۰۲۷ §۲ · **دروازه:** P7-D

## فلسفه
یادگیری بدون نتیجه، ادعا است. مدل باید واقعاً از نتیجهٔ واقعی، به‌طور قابل اندازه‌گیری بهتر شود.

## پوسته (آنچه ساخته شد)
- قراردادهای عین سند: `OutcomeRecord`، `EvaluationReport`، `LearningPolicy`، `DriftReport`، `ShadowEvaluation` — `src/core/intelligence/contracts-p7-p11.ts`
- سه موتور: `OutcomeEngineImpl` (collectOutcomes / findPendingPredictions / linkOutcome / getCoverage)، `EvaluationEngineImpl` (Brier / LogLoss / Accuracy / Calibration-10 / ECE / Lift / compareModels)، `LearningEngineImpl` (learnFromOutcomes Tier-aware / updateWeights / proposePolicyUpdate / rollback)
- Shadow Evaluation Framework با چهار شرط ارتقا (بهبود ≥۰٫۰۲ + ۵۰ نمونه + ۷ روز + تأیید شورا)
- DriftDetector سه‌گانه (performance / data / concept)
- نظام Tier پنج‌لایه (جلسه ۰۲۵): Tier 0-1 صفر یادگیری، Tier 2 دسته، Tier 3 وزن، Tier 4 کامل — `autoExecute` در هیچ Tier مجاز نیست

## روح (رفتار اثبات‌شده روی دادهٔ واقعی)
| سنجه | مقدار واقعی | شاهد |
|---|---|---|
| پیامد واقعی پیوندشده | ۳۸۴ (۱۹۲ معامله + ۱۹۲ انتشار) | `intelligence-data/outcomes.jsonl` |
| پوشش حلقه | ۱۰۰٪ | `download/p6537/p7-evaluation.json` |
| Brier واقعی | ۰٫۲۲۵۵ | همان شاهد |
| Lift نسبت به نرخ پایه | +۹٫۷۸٪ | همان شاهد |
| حکم | ABOVE_BASELINE / better | همان شاهد |
| Shadow | سبز — بدون ارتقا (نیازمند شورا) | همان شاهد |
| Drift | نیمهٔ اول ↔ دوم با کنش monitor | همان شاهد |
| Tier از دادهٔ واقعی | ۳ (۳۸۴ پیامد، ۲ دورهٔ متمایز) | همان شاهد |
| تست ×۲ پیاپی | ۹۷ + کل مجموعه | `tests/p6537-p7-core.test.ts` |

## صداقت ریاضی (اعلام محدودیت)
Brier = ۰٫۲۲۵۵ از هدف Tier 3 (≤۰٫۲۰) فاصله دارد — صادقانه در DIAG-MODEL-001 گزارش و به P11 به‌عنوان پیشنهاد retrain با تأیید شورا ارجاع شد. سطل کالیبراسیون ۰٫۴-۰٫۶ (پیش‌بینی ۰٫۴۹ / مشاهدهٔ ۱٫۰) مشکل واقعی است و پیشنهاد recalibrate برای آن ثبت شده است.

## قفل‌ها
صفر auto_execute در تمام مسیرهای P7؛ هر به‌روزرسانی مدل در PolicyChangeLog ثبت می‌شود؛ ارتقا از سایه بدون تأیید شورا ناممکن است (تست ۲-۲۸).
