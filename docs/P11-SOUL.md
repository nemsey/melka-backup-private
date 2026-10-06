# P11-SOUL — سند روح فاز ۱۱: خودترمیمی کنترل‌شده

**پرونده:** P6537 · **منبع قانون:** ملکا-شورا-۱۴۰۵-۰۲۷ §۶ · **دروازه:** P11-D

## فلسفه
خودترمیمی بدون نظارت، خودویرانگری است. سیستم پیشنهاد می‌دهد، شورا تأیید می‌کند، ترمیم ایمن اجرا، نتیجه بازبینی.

## پوسته
- قراردادها: `RepairProposal` (**قفل نوعی** `requiresCouncilApproval: true`)، `RepairAction` (۷ نوع: reindex/recalibrate/retrain/prune_sessions/restore_backup/update_threshold/custom)، `RiskAssessment`، `RepairAuditLog` (before/after/outcome)
- `SelfRepairEngineImpl`: هر fail در P10 → پیشنهاد؛ هر warn سه‌بار متوالی → پیشنهاد؛ اولویت critical>high>medium>low + assessRisk + estimateImpact
- `RepairApprovalGateImpl`: سه شرط تأیید (مشکل واقعی با شاهد P10 + راه‌حل ایمن risk≤medium + Tier کافی) — approve/reject با ثبت تصمیم
- `RepairExecutorImpl`: حداکثر ۱ ترمیم در ۲۴ ساعت + بکاپ خودکار پیش از اجرا + خودتشخیصی پس از اجرا + **rollback خودکار در نتیجهٔ منفی + اطلاع به شورا**

## روح (رفتار اثبات‌شده)
| سنجه | مقدار واقعی | شاهد |
|---|---|---|
| پیشنهاد ترمیم از مشکلات واقعی P10 | ۳ پیشنهاد pending (recalibrate برای کالیبراسیون ۰٫۵۵۵ + retrain برای رانش ۰٫۱۳۹ + کنش داده برای کهنگی ۸۷ ساعت) | `download/p6537/p11-repairs.json` |
| دروازهٔ تأیید | فعال — بررسی سه‌شرطی هر پیشنهاد | همان شاهد |
| اجرا | **صفر** (قفل شورا — همه pending) | همان شاهد |
| Executor با rollback تست‌شده | بله (تست ۳-۶: نتیجهٔ منفی → rollback خودکار) | `tests/p6537-p11-core.test.ts` |
| تست | ۵۱ | همان فایل |

## قفل ابدی
`requiresCouncilApproval: true` در سطح نوع + سقف نرخ ۲۴ ساعته + بکاپ خودکار + بازگشت خودکار. حتی مالک اگر بخواهد باز کند، شورا توصیه می‌کند بسته بماند (سند ۰۲۷ — یادداشت دبیر، نکته ۳).
