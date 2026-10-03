# LOGGER-EVENTS-P2-05 — Logger ساختاریافته و فهرست رویدادهای الزامی

> سند اجرایی PHASE 2 / گام P2-05 — طبق بند E.6 دستور راهبری

## ۱) معماری

```
src/lib/logger/index.ts        ← تنها نقطه خروجی لاگ در کل src/
  • خروجی: یک خط JSON در process.stdout (صفر console.*)
  • فیلدهای الزامی هر خط:
    ts, level, category, operation, status,
    requestId, traceId, userId, tenantId (= "melk-tabriz"),
    agentId, tileId, duration, errorCode, detail
  • پاک‌ساز تدافعی (sanitizeDetail):
      - کلید حاوی token/otp/secret/password/authorization/cookie → "[redacted]"
      - شماره موبایل (09xxxxxxxxx / +98…) → "[masked-mobile]"
      - عدد ۱۰-۱۲ رقمی (کد ملی و امثال آن) → "[masked-number]"
      - بازگشتی تا عمق ۴؛ آرایه حداکثر ۵۰ عضو
  • فیلتر سطح: MELK_LOG_LEVEL (پیش‌فرض info؛ debug/warn/error)
  • پوشش‌های رایی: logAuth / logSync / logAgentCall / logRoute
  • withRouteLog(): بسته‌بندی handler روت با آغاز/پایان/مدت واقعی

src/proxy.ts                   ← جانشین Next 16 برای middleware (Node.js runtime)
  • هر فراخوانی /api/* ⇒ یک رویداد «route status=start»
  • درخواست/پاسخ دست‌نخورده (صفر تغییر قرارداد API)

scripts/audit-log-safety.sh    ← گارد ایستا (سه بررسی + پاس/خطا)
  در regression-guard.sh (E.7) فعال است.
```

## ۲) فهرست رویدادهای الزامی (پیاده‌سازی‌شده)

| رویداد | نقطه ثبت | operation | نکته |
|---|---|---|---|
| ورود | `lib/auth/session.createSession` | `login` | userId + role + armSession (بولی) — پوشش هر دو مسیر OTP و مدیر |
| خروج | `lib/auth/session.revokeSession` | `logout` | userId + reason |
| شکست OTP | `api/auth/verify-otp` (مسیر catch) | `otp-failed` | errorCode (OTP_INVALID/…)؛ RATE_LIMITED ثبت نمی‌شود (عین HOTFIX-04/B2 — قفل خود-تمدید نمی‌شود) |
| همگام‌سازی آغاز/پایان/شکست | `lib/melk-api/sync.doSyncFromArm` | `sync-run` | status=start/ok/fail + mode (legacy/incremental) + duration + errorCode + شمارش‌ها |
| فراخوانی ایجنت | `core/agent/base-agent` (renderInsights / submitFeedback) | `render-insights` / `submit-feedback` | مرکزی — همه ۱۲ ایجنت خودکار پوشش داده می‌شوند؛ tileId + agentId + duration |
| روت — آغاز | `src/proxy.ts` | `METHOD /path` | هر درخواست /api/* |
| روت — آغاز/پایان/مدت | `withRouteLog` روی روت‌های کلیدی | `METHOD /path` | health (نمونه اولیه) + رویدادهای دامنه‌ای |
| چرخش کلید بوت | `instrumentation.register` | `key-rotation` | ok/fail + شمارش‌ها |
| همگام‌سازی پس‌زمینه | `instrumentation` (تیک موفق) | `sync-run` | background: true |

## ۳) مصداق خروجی (خط واقعی)

```json
{"ts":"2026-09-16T06:45:57.859Z","level":"info","category":"auth","operation":"login","status":"ok","requestId":"5ee746fa-…","traceId":"5ee746fa-…","userId":"950002","tenantId":"melk-tabriz","agentId":null,"tileId":null,"duration":null,"errorCode":null,"detail":{"role":"CONSULTANT","armSession":false}}
```

## ۴) سیاست داده حساس

- **هرگز** ثبت نمی‌شود: توکن نشست/ARM، کد OTP، شماره موبایل، کد ملی
- پاک‌ساز تدافعی حتی در برابر اشتباه فراخواننده ([redacted]/[masked-*])
- گارد ایستا (`audit-log-safety.sh`):
  ۱) `console.*` خارج از `src/lib/logger/` ⇒ FAIL (شمارش فعلی: **۰**)
  ۲) نبود sanitizeDetail در Logger ⇒ FAIL
  ۳) کلید حساس یا موبایل خام داخل «خودِ فراخوانی لاگ» (تا خاتمه‌گر `});`) ⇒ FAIL
- صادقانه: `withArmToken` در واقعه توسط پاک‌ساز redact می‌شد (شامل "token") ⇒ کلید به `armSession` تغییر کرد — گواه رفتار محافظه‌کارانه پاک‌ساز

## ۵) تصمیم مستند: پوشش «پایان روت» در دو لایه

- proxy فقط خط «آغاز» می‌دهد: پاسخ نهایی handler پایین‌دستی در Next قابل مشاهده نیست (NextResponse.next() فوری برمی‌گردد)
- `withRouteLog` پایان + مدت واقعی می‌دهد؛ اکنون روی health اعمال شده و الگوی استاندارد PHASE 3 برای همه روت‌هاست
- هر رویداد الزامی دیگر (ورود/خروج/OTP/همگام‌سازی/ایجنت) در نقطه دامنه‌ای خود پایان/مدت دارد — پوشش عملی کامل است

## ۶) تغییرات محیطی

- `MELK_LOG_LEVEL` (اختیاری، پیش‌فرض info) — در `.env.example` مستند
- هیچ تغییر رفتاری تولیدی: لاگ‌ها خروجی استاندارد سرور را تکمیل می‌کنند، نه جایگزین؛ پاسخ‌های HTTP دست‌نخورده

## ۷) شواهد

- تست: `tests/phase2-logger.test.ts` — ۱۱ تست سبز (JSON معتبر، فیلدهای الزامی، پاک‌ساز، فیلتر سطح، پوشش‌های رایی، withRouteLog عبور-پاسخ + fail، proxy، login/logout یکپارچه DB، اسکنر مثبت/منفی)
- `bun run test` ⇒ **516/516 سبز**؛ tsc صفر؛ `next build` موفق (پس از مهاجرت middleware→proxy طبق قرارداد Next 16)
- `audit-log-safety.sh` ⇒ PASS؛ در regression-guard فعال
