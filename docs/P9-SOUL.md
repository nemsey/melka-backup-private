# P9-SOUL — سند روح فاز ۹: ارزیابی سیاست + حاکمیت

**پرونده:** P6537 · **منبع قانون:** ملکا-شورا-۱۴۰۵-۰۲۷ §۴ · **دروازه:** P9-D

## فلسفه
حاکمیت بدون ارزیابی، استبداد است. ارزیابی بدون حاکمیت، هرج‌ومرج است. سیستم قوانین خودش را ارزیابی می‌کند.

## پوسته
- قراردادها: `PolicyEvaluation` (اثربخشی/پایداری/پایبندی/هزینه/اثرات جانبی + حکم keep/adjust/retire)، `GovernancePolicy`/`GovernanceRule` — `src/core/intelligence/contracts-p7-p11.ts`
- `PolicyEvaluationEngineImpl`: قواعد حکم عین سند — effectiveness ≥۰٫۷ ∧ compliance ≥۰٫۹ → keep · effectiveness <۰٫۵ ∨ compliance <۰٫۷ → adjust · effectiveness <۰٫۳ → retire
- `GovernanceEngineImpl`: **۱۵ قاعدهٔ حاکمیت** GOV-DATA-001..005 (۵) + GOV-MODEL-001..003 (۳) + GOV-ACCESS-001..004 (۴) + GOV-DECISION-001..002 (۲) + GOV-REPAIR-001 (۱) با سه حالت enforcement (strict/warn/audit-only)

## روح (رفتار اثبات‌شده)
| سنجه | مقدار واقعی | شاهد |
|---|---|---|
| سیاست ارزیابی‌شده | ۵ (هر یک با حکم + دلیل) | `download/p6537/p9-policies.json` |
| احکام صادرشده | keep + adjust + retire (هر سه) | همان شاهد |
| قواعد حاکمیت برقرار | ۱۵/۱۵ روی زمینهٔ واقعی امروز | همان شاهد |
| نقض بحرانی | صفر | همان شاهد |
| تست | ۵۲ | `tests/p6537-p9-core.test.ts` |

## ارزیابی ۹۰ روزه
سیستم در هر چرخه، ۵ سیاست واقعی (سیاست یادگیری حلقه + ایمنی + حاکمیت + Tier ۰۲۵ + سایهٔ ۰۲۷) را ارزیابی می‌کند؛ سن آخرین ارزیابی = صفر روز (به‌روز). سیاست‌های بی‌اثر (effectiveness <۰٫۳) با حکم retire بازنشسته می‌شوند — منابع آزاد می‌شود.
