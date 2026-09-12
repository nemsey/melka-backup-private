# راهنمای Build و اجرا — وب، اندروید و تبلت

**مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی**

---

## ۱) اجرا روی وب (توسعه)

```bash
bun install
bun run db:push      # ساخت پایگاه SQLite
bun run dev          # http://localhost:3000
bun run lint         # کیفیت کد
bun run test         # ۶۵ تست (پایگاه تست جدا)
```

## ۲) اجرای تولید (وب/PWA)

```bash
bun run build        # خروجی standalone
bun run start        # اجرای سرور تولید
```

PWA به‌صورت خودکار فعال می‌شود (Service Worker فقط در production ثبت می‌شود):
- **اندروید/کروم**: منوی ⋮ ← «Add to Home screen / نصب برنامه»
- **iOS/Safari**: Share ← «Add to Home Screen»
- **دسکتاپ**: آیکون نصب در نوار آدرس

## ۳) بسته‌بندی بومی اندروید با Capacitor (توصیه‌شده)

### پیش‌نیازها
- Node.js ≥ 18 و Android Studio (با SDK 34+) و JDK 17
- دستگاه/شبیه‌نده اندروید برای تست

### گام‌ها

```bash
# ۱) نصب Capacitor
bun add -d @capacitor/cli
bun add @capacitor/core @capacitor/android

# ۲) ساخت خروجی وب (پیش از sync)
bun run build

# ۳) مقداردهی اندروید (فقط بار اول)
bunx cap add android

# ۴) همگام‌سازی وب با پروژه اندروید
bunx cap sync android

# ۵) باز کردن در Android Studio
bunx cap open android
```

`capacitor.config.ts` آماده در ریشه پروژه:

```ts
// appId را پیش از انتشار استور تغییر دهید
appId: "ir.melketabriz.dashboard",
appName: "داشبورد ملک تبریز",
webDir: "public",       // برای SPA استاتیک
server: { androidScheme: "https" }  // WebCrypto/IndexedDB فعال بماند
```

> **نکته مهم (server.url)**: این پیکربندی حالت «وب استاتیک + API خارجی» است. اگر می‌خواهید Next.js سرور کامل (مسیرهای /api) داشته باشید، دو گزینه دارید:
> ۱. استقرار وب روی هاست (مثلاً سرور اختصاصی ملک تبریز) و قرار دادن `server.url` بر آن آدرس — توصیه‌شده، چون BFF امنیتی و rate-limit دارد؛
> ۲. استاتیک کامل با backend جدا (نیازمند تغییر `lib/client/api.ts` به آدرس مطلق بک‌اند).

### Build APK

از Android Studio: `Build ← Generate Signed Bundle / APK` یا خط فرمان:

```bash
cd android
./gradlew assembleRelease   # خروجی: android/app/build/outputs/apk/release/
./gradlew bundleRelease     # AAB برای استور
```

### ارتقا به ذخیره‌سازی Keystore (اندروید)

در وب، توکن با AES-GCM کلید دستگاه (IndexedDB) محافظت می‌شود — این پیاده‌سازی فعلی است. برای سطح بالاتر در بسته اندروید:

```bash
bun add @capacitor/preferences
```

و جایگزینی پیاده‌سازی `src/lib/auth/secure-storage.ts` با Preferences (که روی Android Keystore نگاشت می‌شود) — قرارداد توابع (`secureSave/secureLoad/secureClear`) تغییر نمی‌کند؛ فقط بدنه دو تابع اول را با API پلاگین جایگزین کنید (حدود ۲۰ خط).

## ۴) جایگزین سبک‌تر: TWA (Trusted Web Activity)

اگر نصب APK هدف اصلی است و وب روی دامنه HTTPS عمومی (مثلاً داشبورد دامنه ملک تبریز) است:

1. از [PWABuilder](https://www.pwabuilder.com/) آدرس سایت را بدهید.
2. پکیج اندروید TWA بسازید (بدون کد بومی، امضای دیجیتال با دامنه از طریق assetlinks.json).
3. مزیت: به‌روزرسانی خودکار با انتشار وب — بدون انتشار مجدد استور.

## ۵) تبلت

- چیدمان واکنش‌گرا: شبکه کاشی ۲/۳ ستونه در md/lg، نمودارها هم‌عرض، جدول با اسکرول افقی.
- هدف‌های لمسی ≥ ۴۴px و `touch-action: manipulation` برای کلیدها.
- در تبلت اندروید، همان APK/تثبیت PWA کار می‌کند؛ جهت‌گیری آزاد (`orientation: any`).

## ۶) چک‌لیست پیش از انتشار تولید

- [ ] `MASTER_ACCESS_CODE` به کد جدید ۸ رقمی تغییر کند (الزامی).
- [ ] مقادیر `.env` تولید (MASTER_ACCESS_CODE و MELK_TOKEN_KEY جدید) تنظیم شوند.
- [ ] `SESSION_TTL_HOURS` مطابق سیاست امنیتی تنظیم شود.
- [ ] HTTPS فعال (برای WebCrypto) — روی http ساده، ذخیره‌سازی امن به fallback می‌رسد.
- [ ] بک‌اپ دوره‌ای `db/custom.db` (حافظه ایجنت‌ها و بازخوردها).
- [ ] تست کامل فلوی ورود/ریست روی دستگاه واقعی اندروید.
