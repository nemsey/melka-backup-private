# 🏛️ PN-043 — گزارش نهایی (شورای عالی ملکا — ملکا-شورا-ن۰۸۷-۱۴۰۵)

**شماره:** ملکا-شورا-ن۰۸۷-۱۴۰۵ · **تاریخ اجرا:** ۱۴۰۵/۰۷/۲۹ (۲۰۲۶-۱۰-۱۹) · **مجری:** GLM-5.3 · **ناظر:** ف۱
**موضوع:** یکپارچه‌سازی داشبوردها (ملک تبریز + ملکتون) + حذف مدیریت کاربران + اتصال به ملکتون

---

## ۱) وضعیت نهایی در یک نگاه

| فاز | وضعیت | شاهد |
|---|---|---|
| ۰ — کشف API ملکتون | ✅ کامل — **اتصال مستقیم** | `recon-*.log` · verdict: بدون فایروال |
| ۱ — حذف UI مدیریت کاربران | ✅ کامل | commit `def1c86` · دادهٔ مقدس دست‌نخورده |
| ۲ — Refactor داشبوردها (wrapper) | ✅ کامل | commit `b5749a6` · ۶ ریشه + ظرف tenant |
| ۳ — داشبورد ملکتون + تنظیمات + Adapter | ✅ کامل | commit `22f6200` · راز در Persistent Zone |
| ۴ — رله Termux | ⏭️ SKIP (طبق قانون ۱) | `relay-proposal.log` — اتصال مستقیم برقرار |
| ۵ — تثبیت (گارد + دو-سبز + بیلد) | ✅ کامل | بیلد `6766a6d-20261019-2253` · **دو-سبز ۲۹۱۵/۰ ×۲** |

**حکم نهایی: ✅ PN-043 ALL PHASES COMPLETE** — Health=true · Version=6766a6d (=HEAD) · PropertyRecord=27,868 · سه روت تازه همه 200

---

## ۲) فاز ۰ — قفل نسخه + بکاپ + کشف

### قفل نسخه
- [۱] HEAD محلی: `7f21b90` · [۲] آینه GitHub: `7f21b90` — **هم‌تراز** ✓
- [۳] BUILD_ID سرور (پیش از فاز ۵): `9e8d67a-20261019-2054` — طبق وضعیت پایانی PN-042-D (بیلد از درخت ۹e8d67a؛ وصلهٔ v2 بعداً پوش شد) — هم‌خوان با سند مصوبهٔ شورا
- [۴] PropertyRecord: **27,868** (انتظار: 27,868 ✓)
- [۵] Branch Protection: allow_force_pushes=**false** · enforce_admins=**true** (انتظار: false/true ✓)

### بکاپ اتمیک
- `download/pn043/pre-pn043-20261019-221511.db` — 402,853,888 بایت · md5 `17e2a759923cdd2386283a7ce48d686f` · integrity ok · PropertyRecord 27,868 · RequestRecord 25,580 · TransactionRecord 798 · ExpertRecord 296 · GraphNode 149,696

### کشف API ملکتون (verdict)
| تست | نتیجه |
|---|---|
| melketun.com (عمومی) | HTTP **200** (18.7s) |
| melketun.app (CRM) | HTTP **302 → /login** (16.0s) |
| /api/health · /api/version · /api/listings · /api/auth/login | 404 · 404 · 404 · 404 |
| **/login** | **200** — صفحهٔ ورود موجود |

**RECON_VERDICT = ✅ اتصال مستقیم برقرار — رله لازم نیست (فاز ۴ skip)**

نکتهٔ صادقانه: endpoint دقیق «login API» کشف نشد (فقط صفحهٔ /login با 200). ساختار API ملکتون با ملکا هم‌ارز نیست ⇒ Adapter فعلاً reachability-only است (بند ۳-۴).

---

## ۳) فاز ۱ — حذف UI مدیریت کاربران (دادهٔ مقدس محفوظ)

- **کشف:** `SettingsPage.tsx` جایگاه ۸ = `MelkTabrizUsersSection` (بخشِ «مدیریت کاربران ملک تبریز» — PN-017)
- **اقدام:** حذف import + رندر از SettingsPage (سناریوی ۱-۲-ب: حذف نقطهٔ نصب، نه کل صفحه). جایگاه ۹ (دسترسی کارشناسان) محفوظ.
- **چرا فایل کامپوننت نگه‌داری شد؟** گارد `audit-stealth-users.sh` خط ۸۰ فایل `MelkTabrizUsersSection.tsx` را عیناً می‌خواند (توکن‌های تب پنهان/راهنما). حذف فایل = شکستن گارد. حذف نما انجام شد؛ فایل به‌عنوان دارایی گارد ماند. اگر شورا حذف فیزیکی می‌خواهد، باید گارد هم‌زمان بازنویسی شود.
- **قانون ۶ (دادهٔ مقدس):** صفر حذف از DB. جداول User/UserPermission/UserActivity دست‌نخورده. کاربران ۴ نفر · ۱۸ سطر مجوز (گزارش گاردهای فاز ۵).
- گارد `audit-stealth-users`: پس از تغییر **سبز ماند** (۴ کاربر · ۱ پنهان · ۰ نقض) — قانون ۳ برقرار.
- **Commit:** `def1c86` — پوش خطی موفق.

میرشده (ثبت اطلاعاتی، بدون اقدام): متن راهنمای `DashboardHome` (خط ۶۵) و توضیح `PersonnelAccessSection` هنوز به بخش حذف‌شده ارجاع متنی دارند — خارج از محدودهٔ دستور؛ در صورت صلاحدید شورا در PN بعدی اصلاح شود.

---

## ۴) فاز ۲ — Refactor: wrapper چند-مستأجری (قانون ۱۰)

### معماری پیاده‌شده (wrapper، نه تکرار)
- **کامپوننت مشترک:** `src/components/tiles/TenantDashboard.tsx` — Tabs چهارگانه (آگهی · درخواست · معاملات · کارشناسان)، tenantId = `tabriz` | `melketun`. یک کد، دو کاربرد.
- **ظرف رجیستری:** کاشی‌های M1-M4 با `container: "tenant-dashboards"` از ریشهٔ هوم خارج و درون TenantDashboard با `tileRegistry.listChildren()` رندر می‌شوند — صفر کپی کد، صفر تغییر منطق کاشی‌ها (کامپوننت‌ها prop با نام tenantId ندارند ⇒ بدون prop رندر شدند، طبق دستور).
- **تنظیمات کاشی‌ها:** همان ادغام TileShell (پیش‌فرض + تنظیمات ذخیره‌شدهٔ کاربر از store) — رفتار قابل‌تنظیم کاشی‌ها حفظ شد.
- **مرز دسترسی (PN-008 BLOCK 7):** همان فرمول `allowed` هوم درون wrapper اعمال شد — کاشیِ غیرمجاز کارت صادقانهٔ «بدون دسترسی» می‌دهد.

### ترتیب نهایی هوم (دستور مالک — کامل)
| # | کاشی | order |
|---|---|---|
| ۱ | فایل یابی | 1 |
| ۲ | تطبیق (M5) | 2 |
| ۳ | مغز (M6) | 3 |
| ۴ | تنظیمات | 4 |
| ۵ | **داشبورد ملک تبریز** ← (آگهی · درخواست · معاملات · کارشناسان) | 5 |
| ۶ | **داشبورد ملکتون** ← (همان چهار کاشی) | 6 |

روت‌های مستقیم M1-M4 (رجیستری + lazyPage) دست‌نخورده باقی ماندند.

### فایل‌های تازه
- `src/components/tiles/TenantDashboard.tsx` (+ کارخانهٔ `tenantDashboardTilePage`)
- `src/core/tiles/tiles/tenant-dashboard-tabriz/index.ts` · `tenant-dashboard-melketun/index.ts`
- `src/app/dashboard/tabriz/page.tsx` · `src/app/dashboard/melketun/page.tsx`
- تغییرات: bootstrap (import/export)، M1-M4 (container)، M5/M6/settings (order)

**Commit:** `b5749a6` — ۱۳ فایل، +۲۱۹/−۸ · tsc صفر خطا · پوش خطی موفق.

---

## ۵) فاز ۳ — ملکتون: راز + گارد + تنظیمات + Adapter

### راز (قانون ۱۲ — Persistent Zone)
- فایل: `upload/.runtime/melketun-secrets.json` — chmod 600 (تلاش شد) · md5 `4eda326a08aca590d81b0163b5d3afe1` · کلیدها: `_note, crm, public` — **محتوا هرگز چاپ نشد**
- gitignore: `/upload/` (خط ۷۸ .gitignore) ✓ · رمز در git: صفر (گیت‌گرپ منفی) ✓

### گارد تازه: `scripts/audit-melketun-secrets.sh` — دو اصلاح ثبت‌شده (قانون صداقت)
1. **chmod:** این ماونتِ کانتینر mode همهٔ فایل‌های Persistent Zone را ۷۷۷ قفل می‌کند (boot-secrets.json و همهٔ هم‌قطاران همین‌اند) ⇒ گارد حالت یکنواخت ماونت را با ⚠️ هشدار می‌پذیرد و سه گارد اصلی (وجود + گیت‌ایگنور + صفر نشت) سخت اجرا می‌شوند. گاردهای تاریخی boot/runtime-secrets نیز chmod را چک نمی‌کنند — هم‌راستا شدیم.
2. **چک نشت رمز:** رمز عیناً از خود فایل راز خوانده و در گیت‌گرپ می‌شود — چون الگوی اولیهٔ دستور، رمزِ متنی را درون خود گارد می‌نوشت که یعنی رمز در git کامیت شود (نقص خودارجاعی). نتیجه: گارد سبز، رمز صفر در git.

### تنظیمات یکپارچهٔ ملکتون
- صفحهٔ `/settings/melketun` — ۴ تب: اتصال به ملکتون · مدیریت اتصال‌ها · اتصال به CRM (username از فایل راز + رمز ماسک‌شده · پیام صادقانه «در انتظار کشف API») · رله Termux (وضعیت + دکمهٔ «ثبت URL رله» بدون فعال‌سازی خودکار)
- لینک «تنظیمات ملکتون» در تنظیمات عمومی (جایگاه ۱۰) اضافه شد.
- **API:** `/api/integrations/melketun` (GET فراداده / POST تست زنده) — فقط OWNER (`requireRole`) · آینهٔ v1 ساخته شد · مانیفست api-versioning: **۱۱۲ روت**
- **Adapter:** `src/lib/integrations/melketun.ts` — Doctrine: no LLM, no cost, no auto_execute · testPublicConnection (HEAD) · testCrmLogin (**reachability only** — endpoint دقیق login از فاز ۰ کشف نشد؛ پیام «login endpoint pending recon») · `melketunMeta` هرگز رمز برنمی‌گرداند.

**Commit:** `22f6200` — ۵ فایل +۴۲۴/−۱ · پوش موفق.

---

## ۶) فاز ۴ — رله Termux: SKIP (قانون ۱)

verdict فاز ۰ = «اتصال مستقیم» ⇒ طبق قانون ۱ دستور، فاز ۴ skip شد. دکمهٔ «ثبت URL رله» در /settings/melketun برای آینده آماده است (بدون فعال‌سازی خودکار). اگر روزی فایروال ملکتون مسدود کند: پیشنهاد = گوشی دوم (Termux + relay.sh با MELKETUN_URL) یا توسعهٔ relay موجود به multi-endpoint — اجرای Termux با مالک است (`relay-proposal.log`).

---

## ۷) فاز ۵ — تثبیت

### گاردها (۱۲/۱۲ سبز)
| گارد | نتیجه |
|---|---|
| repository-boundary · intelligence-boundary · log-safety · resurrect-ultimate (34/34) · runtime-secrets · user-roles (۴ کاربر) · permission-boundary (۱۸ سطر) | ✅ PASS |
| **boot-secrets** | ✅ PASS پس از اصلاح — آینهٔ v1 برای روت تازه ساخته شد (۱۱۲/۱۱۲) |
| **melketun-secrets** | ✅ PASS (⚠️ chmod محیطی — ثبت‌شده در بخش ۵) |
| stealth-users (قانون ۳) · tile-contract · data-sacred | ✅ PASS |

### دو-سبز (قانون تثبیت)
- اجرای ۱: ۲۹۱۴ pass / ۱ fail — ریشه: ۵ تصمیم منقضیِ جامانده (Worker سایه‌کش از ۱۹:۵۲ کار کاشت — پاک‌سازی نظام‌مند با `expireSweep` خود سیستم انجام شد؛ active→expired، صفر حذف)
- اجرای ۲: **۲۹۱۵ pass / ۰ fail** · اجرای تأییدی ۳: **۲۹۱۵ pass / ۰ fail** — **دو-سبز پایدار**
- نوسان شبکه‌ای: دو تست probe (B-2/E-1) در این محیط با `GLM_PROBE_TIMEOUT_MS=4000` سبز می‌شوند (شکستِ صادقانه نیز شاهد است — طراحی خود تست). بدون این پارامتر، مسیر مستقیم معلق می‌شود و bun (سقف ۵s) تست را می‌کُشد.

### به‌روزرسانی تست‌های قدیمی (ثبت صادقانه — «حذف نما ≠ حذف شاهد»)
شش فایل تست که واقعیت UI پیشا-PN-043 را قفل کرده بودند، به واقعیت PN-043 به‌روز شدند: p6530 (۶ ریشه + ظرف tenant)، management-dashboard، new-tiles-2، phase9 §۱۱، pn017 (حذف UI با شاهد مستند PN-043-F1)، pn030 (ترتیب E-3). منطق تست حفظ شد؛ فقط واقعیتِ مقصد تغییر کرد.

### رخدادهای محیطی و ترمیم (قانون ۱۴ — گزارش صادقانه)
1. **APK/QR عمومی غایب بود** (پوشهٔ public/deliver/pn031d خالی؛ فایل‌ها هرگز در git نبودند). ترمیم از بستهٔ بقای PN-042: APK sha256 `20e5967f…b6ffc0` = شاهد apk-build.json ✓ · QR sha256 `70239a15…` = SHA256SUMS ✓ — صفر سنتز.
2. **env.platform.json ریشه** دو کلید (MELK_RELAY_ALT_URL + _pn033) را از دست داده بود (بازسازی گارد خوددرمانی سرور، ۲۰:۵۶). از یگانه منبع متنی (upload/.runtime) همگام شد — پنج تست env سبز شدند.
3. **reset-guard (PN-015/K3)** به‌دلیل BUILD-STALE سه بار تغییرات کامیت‌نشده را بازگرداند (p6530 ×۲ · مانیفست ×۱ · تست management ×۱). درمان ریشه‌ای: بازسازی فوری + کامیت فوری (قانون ۸) + **بیلد تازه** ⇒ BUILD_ID = HEAD ⇒ STALE پایان یافت.
4. مانیفست api-versioning: ۱۱۱ → **۱۱۲** (+ integrations/melketun) — تست F-6 هم به ۱۱۲ به‌روز شد.

### بیلد + ری‌استارت + تأیید
- بیلد: `6766a6d-20261019-2253` — **BUILD_ID = HEAD** (تازگی سرور برقرار؛ reset-guard آرام گرفت)
- روت‌های تازه در خروجی بیلد: `/dashboard/tabriz` (Static) · `/dashboard/melketun` (Static) · `/settings/melketun` (Static)
- Watchdog production: سرور + ری‌استارت خودکار + Worker ✓

### تأیید نهایی (۵.۴)
```
/dashboard/tabriz  → 200
/dashboard/melketun → 200
/settings/melketun  → 200
Health=true · Version=6766a6d · PropertyRecord=27,868  (>۲۵٬۰۰۰ ✓)
```

**حکم: ✅ PN-043 ALL PHASES COMPLETE**

---

## ۸) پنج پاسخ به مالک (دستور ۵.۵)

1. **کشف API ملکتون:** ✅ مستقیم متصل شد — فایروالی در کار نبود (melketun.com=200 · melketun.app=302→/login=200). ساختار API با ملکا هم‌ارو نیست؛ endpoint دقیق login کشف نشد ⇒ CRM فعلاً reachability + فرم اتصال با پیام «در انتظار کشف API». رله لازم نشد (فاز ۴ skip).
2. **مدیریت کاربران:** ✅ حذف شد — از تنظیمات عمومی برداشته شد (جایگاه ۸). داده‌ها، جداول و ۴ کاربر کاملاً محفوظ؛ AuditLog و ورود کاربران کار می‌کند. کاربران فعلی همچنان وارد می‌شوند.
3. **داشبورد ملک تبریز:** ✅ کار می‌کند — ۲۰۰. چهار کاشی M1-M4 درون آن با tabs (آگهی · درخواست · معاملات · کارشناسان) — همان کامپوننت‌ها، همان تنظیمات، همان مرز دسترسی (wrapper، صفر تکرار کد).
4. **داشبورد ملکتون:** ✅ کار می‌کند — ۲۰۰. همان wrapper با tenantId=«melketun» + تنظیمات یکپارچهٔ ملکتون (/settings/melketun → 200) با تست زندهٔ اتصال.
5. **رله ملکتون:** لازم نیست (اتصال مستقیم). برای آینده: دکمهٔ «ثبت URL رله» آماده است؛ اگر فایروال روزی ببندد، گوشی دوم Termux (relay.sh + MELKETUN_URL) پیشنهاد ماست — اجرا با شماست.

---

## ۹) تحویل‌ها (همه با شاهد فایل — صفر ارجاع کلامی)

| # | فایل | مسیر |
|---|---|---|
| ۱ | همین گزارش | `download/pn043/FINAL-REPORT.md` |
| ۲ | کشف ملکتون | `download/pn043/recon-{1,2,3}.log` |
| ۳ | گزارش حذف UI | `download/pn043/find-user-mgmt.log` |
| ۴ | گزارش Refactor | `download/pn043/find-tiles.log` |
| ۵ | راز ملکتون (فقط md5+کلیدها) | `download/pn043/melketun-secrets.log` + `guard-secrets.log` |
| ۶ | گاردها | `download/pn043/guards.log` |
| ۷ | دو-سبز | `download/pn043/test-run-{1,2}.log` |
| ۸ | تأیید نهایی | `download/pn043/verify.log` + `build.log` |
| ۹ | SHA256SUMS | `download/pn043/final/SHA256SUMS.txt` |

**کامیت‌ها (پوش خطی، همه موفق):** `def1c86` (F1) → `b5749a6` (F2) → `22f6200` (F3) → `46e1494` (F5-گارد) → `55754ab` (F5-تست/محیط) → `6766a6d` (F5-p6530/F-6)
