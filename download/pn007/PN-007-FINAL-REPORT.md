# گزارش نهایی — PN-007 (فاز ۰.۵: بازتولیدپذیری)
**ملکا-شورا-ن۰۰۷-۱۴۰۵ · تاریخ: ۱۴۰۵/۰۷/۱۶ (2026-10-06)**

╔═══════════════════════════════════════════════════════════════════════╗
║  گزارش — PN-007 · فاز ۰.۵ (بازتولیدپذیری Build و Deploy)              ║
╠═══════════════════════════════════════════════════════════════════════╣
║  🔗 preview:   https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/  [✓ 200] ║
║  🔗 publish:   https://c1vdh8442240-d.space-z.ai/      [✗ 500 — سند و پایش آماده: PUBLISH-TROUBLESHOOTING.md] ║
║  🏷 BUILD_ID:  1bc66fa-20261006-0950 — بیلد آزمون بازیابی از همین SHA «از صفر» بازتولید شد ✓ ║
║  🌡 آزمون کلیدی: هر Build قابل بازتولید — ۲ بیلد متوالی از صفر: ۱۰۰٪ فیلدهای قابل‌مقایسه یکسان ✓ ║
║  🧬 آزمون بازیابی: clone از بستهٔ بقا → install → build → start → ورود مالک OWNER — کل مسیر ۵۰ ثانیه (سقف ۳۰۰) ✓ ║
║  ✅ CI محلی:  ۸ گام PASS (fingerprint · tsc×۲ · lint · تست×۲ یکسان ۱۸۳۶/۱۲/۱ · ۳ audit · بودجهٔ کارایی · build · verify) ║
║  📦 بستهٔ بقا: chainIndex=۸ — ساختار استاندارد ن۰۰۷ (git/ db/ env/ docs/ + FINGERPRINT + CHAIN) ✓ ║
║  🛡 گارد تازه: audit-reproducibility.sh — ۶ بررسی — روی HEAD نهایی: ۶/۶ سبز ✓ ║
║  🔐 auto_execute: false ✓ (قفل ابدی) · 🖥 حالت سرو: production (RSS ~۱۵۶-۳۰۰MB) ║
╚═══════════════════════════════════════════════════════════════════════╝

---

## BLOCK 0 — حفاظت و وارسی ✓

**سه‌گانه (بند ۰.۱):** محلی `a074507` (= ۵۰d۷۴۰۳ اعلامی جلسه + یک کامیت خودکارِ فقط لاگ بیلد) · آینهٔ GitHub `survival/code-pn001` = `50d7403` دقیقاً منطبق بر HEAD اعلامی ✓ · بستهٔ بقا chainIndex=۷ (HEAD داخلی f4bae3a — الگوی مستند: بسته در نقطهٔ کد، گزارش پس از آن) — **سه‌گانه سازگار ✓**

**بکاپ پیش از تغییر (بند ۰.۲):** `backups/pre-pn007-2026-10-06T08-43-38.db` — VACUUM INTO گرم، ۱۸۸MB، MD5 `e79a3782609eeb2ed588648834508971` ✓

**Baseline (بند ۰.۳):** `download/pn007/baseline.json` — سرور production (RSS ۳۱۱MB در آغاز) · BUILD_ID=HEAD ✓ · آگهی ۱۴٬۴۰۹ · درخواست ۲۰٬۷۴۸ · گراف ۶۸٬۰۶۰ گره/۷۱٬۳۵۱ یال · هشدار ۳۵۶ · هش کدمستر SET · نسخه‌ها: Bun 1.3.14 / Node 24.21 / Prisma 6.19.2 / Next 16.1.3 — **معیار پذیرش (سه‌گانه+بکاپ+baseline) کامل ✓**

## BLOCK 1 — Fingerprint نسخه (Version Identity) ✓ — قلب فاز

**طراحی (۱.۱):** قرارداد `VersionFingerprint` با ۱۸ فیلد مصوب + ۳ متادیتا: گیت (SHA کامل/کوتاه/شاخه/زمان کامیت) + Runtime (Bun/Node/Prisma/Next) + Build (buildId/builtAt/mode/sourceMaps) + Env (اثر انگشت SHA-256 از «نام» کلیدها — هرگز مقادیر) + Lockfile (bun.lock + package.json) + DB (schema.prisma + شمار migration).

**پیاده‌سازی (۱.۲):**
- `src/lib/version-fingerprint.ts` — تنها مرجع محاسبه (صفر وابستگی خارج از node استاندارد — هم باندل Next، هم اجرای مستقیم bun)
- `scripts/fingerprint.ts` — CLI چهارحالته: چاپ / `--write-next` (postbuild) / `--verify` / `--out`
- **postbuild خودکار**: هر `bun run build` اثر انگشت را در `.next/fingerprint.json` + رونوشت standalone می‌نویسد (۴ بیلد واقعی این جلسه شاهدند)
- `GET /api/version` گسترش یافت: کلید `fingerprint` + `fingerprintSource` (baked|api-live) — **قرارداد ۷ کلیدی قبلی دست‌نخورده** (تست P6519-C سبز ماند)

**آزمون بازتولیدپذیری (۱.۳):** دو اجرا — بیلد ۱ → `rm -rf .next` → بیلد ۲ از صفر → مقایسه فیلد‌به‌فیلد:
- اجرای نخست: ۱۹/۱۹ فیلد قابل‌مقایسه یکسان (۱۰۰٪ ≥ آستانهٔ ۹۵٪) — حتی BUILD_ID هر دو بیلد یکی شد
- اجرای پایانی (پس از اصلاح buildMode=postbuild): ۱۸/۱۸ یکسان — exempt فقط فیلدهای زمانی (buildId/builtAt/computedAt)
- شاهد: `fingerprint-proof.json` + `fingerprint-1.json` + `fingerprint-2.json` — **معیار پذیرش ✓**

## BLOCK 2 — بستهٔ بقای قابل بازتولید ✓ (با چهار ریشه‌یابی واقعی)

**ساختار استاندارد (۲.۱):** `upload/.survival/PN-007-20261006/` — MANIFEST.json (۱۲+ فایل با MD5) · FINGERPRINT.json · CHAIN.json (لنگر به MANIFEST بستهٔ ۷) · HEAD · README.md (راهنمای ۵ گام) · git/repo.bundle (همهٔ شاخه‌ها) · db/custom.db + md5 (اسنپ‌شات سازگار VACUUM) · env/.env.example + KEYS.md (۲۰ کلید — فقط نام، صفر راز) · build/STANDALONE-NOTE.md · docs/PHASE-NOTES.md + RECOVERY-POLICY.md · screens/ (۴ شاهد PNG)

**آزمون بازیابی کامل (۲.۲) — نتیجهٔ نهایی PASS در ۵۰ ثانیه (سقف ۳۰۰):**

| گام | زمان | شاهد |
|---|---|---|
| پوشهٔ تازه + clone از repo.bundle | ۳s | HEAD=۱bc66fa (آخرین کامیت کد) |
| کپی DB + وارسی MD5 | ۴s | تطبیق ✓ |
| bun install (postinstall: prisma generate) | ۹s | ۹۳۲ پکیج از کش |
| bun run build از صفر | ۴۸s | postbuild: fingerprint.json نوشته شد |
| بوت سرور production روی ۳۹۹۹ | ۴۹s | health ok ✓ |
| ورود مالک | ۵۰s | **OWNER** ✓ · رد کد تستی → ۴۰۱ ✓ |
| اثر انگشت بیلدِ بازگردانده ↔ بسته | ۵۰s | **۱۷/۱۷ فیلد یکسان (۱۰۰٪)** ✓ |

**مهر فوتر زندهٔ اپ بازگردانده:** «نسخهٔ زندهٔ سامانه: 1bc66fa-20261006-0950 (تولید)» — همان SHA و همان دقیقهٔ بیلد clone ✓

**چهار ریشه‌یابی که آزمون کشف و رفع کرد (شواهد در restore-test.json و تاریخچهٔ کامیت‌ها):**
1. **نبود prisma generate در clone تازه** → postinstall به package.json اضافه شد (هر clone تازه از این پس بدون اقدام دستی بیلد می‌شود)
2. **آلودگی متقابل postbuild**: مسیر هاردکد رونوشت standalone → بیلدِ clone اثر انگشت خود را در پروژهٔ اصلی می‌نوشت → مسیر نسبت به محل اسکریپت حل شد
3. **دو خط DATABASE_URL متضاد در .env** (الحاق به example): bun اولین را برمی‌گزیند → سرور آزمون به DB اصلی وصل می‌شد (شاهد: RATE_LIMITED با وجود پاک‌سازی) → جایگزینی خط + گارد تک‌خطی
4. **سرور آزمون کهنه زنده ماند** (الگوی pkill به cmdline نمی‌خورد): پورت ۳۹۹۹ اشغال، بیلد تازه EADDRINUSE و پاسخ‌ها از سرور کهنه → گارد پیش-بوت پورت + کشتن مطمئن با پورت + تشخیص EADDRINUSE

(نکتهٔ صادقانه: سه اجرای نخست آزمون — پیش از اصلاحات — FAIL/آلوده بودند؛ لاگ شانفه‌ها همه حفظ و مستند شد. نرخ‌سنج ورود DB-backed است (OtpAttempt) و وضعیتش در snapshot می‌آید — در «نسخهٔ آزمون» پاک می‌شود (همان نقش test-db).)

**سازگاری گاردهای بازیابی:** recovery-guard.sh و auto-recovery.sh هر دو چیدمان تخت قدیمی و db/ استاندارد جدید را می‌شناسند (تغییر با تست syntax ✓).

## BLOCK 3 — CI محلی ✓ (روی HEAD کد: PASS — ۸ گام)

`scripts/ci.sh` + `bun run ci` — ترتیب مصوب شورا: ۱) Fingerprint ۲) tsc×۲ (app+scripts) ۳) lint ۴) **تست×۲ با مقایسهٔ دو-سبز** ۵) سه audit باغ ۶) بودجهٔ کارایی ۷) build ۸) fingerprint verify.

**نتیجهٔ اجرای کامل:** ۱۸۳۶ سبز / ۱۲ شکست مستند / ۱ خطای مبنا — دو اجرا **بایت‌به‌بایت یکسان** ✓ · tsc صفر · lint صفر خطا (۲ هشدار مبنا) · build ✓ · verify ۱۰۰٪ — **✅ CI PASS**

**دو تصمیم مستند (الگوی Blocker→Alternative→Decision→Continue):**
- audit-repository کامل `--strict` هدف فاز ۳ است (روت‌ها ۴۷ فراخوانی db.* — هدف ۰) → تا فاز ۳: `--strict-agents` (سبز) + **قرقرهٔ ضدبازگشت ≤ ۴۷** — هر افزایش = قرمز CI
- پیک Build = PARTIAL پذیرفته‌شدهٔ جلسهٔ ۰۰۶ (کف ابزار) → CI فقط قرمزهای غیرمستند را رد می‌کند

**سه باگ واقعی که CI کشف و رفع کرد:**
1. **نوسان تست ۲-۱۱** (P11: تصمیم ثبت و بازخوانی) — same class as ۳-۱۴/۳-۱۵: `firstProposal()` دوبار صدا زده می‌شد و id زمان‌محور می‌ساخت → اصلاح تست (یک‌بار ساخت، بازمصرف) — **۸/۸ اجرا زیر بار سبز**
2. **باگ گارد مرز هوشمندی**: `import type` را نقض می‌شمرد (سند گارد می‌گوید «ارزشی») → اصلاح grep — دو فایلِ فقط‌تایپی دیگر نقض نیستند
3. **آلودگی سنجهٔ Initial JS توسط کش Service Worker**: ۱۰۳۸KB (رقابت زمانی SW) در برابر ۲۹۰KB واقعی — با `service_workers="block"` + فیلتر فقط-JS قطعی شد — عدد همان ۲۹۰KB جلسهٔ ۰۰۶ ✓

## BLOCK 4 — گارد بازتولیدپذیری ✓ (۶ بررسی)

`scripts/audit-reproducibility.sh [--strict]`:
۱) BUILD_ID سرور = HEAD ✓ ۲) Fingerprint سرور = کد (gitSha+lockfile+schema+package.json, source=baked) ✓ ۳) lockfile بی‌تغییر از آخرین بسته ✓ ۴) schema.prisma بی‌تغییر (بدون migration) ✓ ۵) بستهٔ بقا ≤ ۷ روز ✓ ۶) زنجیرهٔ هش سالم (md5sum -c هر بسته + لنگر CHAIN) ✓ — **روی HEAD پایانی: ۶/۶ سبز — VERDICT: REPRODUCIBLE**

## BLOCK 5 — انتشار Production ✓ (سند + پایش)

- **سند مالک:** `docs/PUBLISH-TROUBLESHOOTING.md` — فارسی ساده، گام‌به‌گام: از پنل Z.AI دوباره Publish کنید؛ اگر دکمه نیست → متن آمادهٔ تیکت پشتیبانی (کپی‌کردنی)
- **پایش خودکار:** `scripts/publish-health.sh` — `status` (فوری) / `watch` (هر ۳۰ دقیقه، ۷ روز) — وضعیت فعلی: PUBLISH_BROKEN_PREVIEW_ALIVE (publish=۵۰۰ · preview=۲۰۰) · به محض بهبود: فایل `PUBLISH-RESTORED.md` ساخته می‌شود (اطلاع مالک) — پایش در پس‌زمینه فعال است
- شاهد وضعیت لحظه‌ای: `download/pn007/publish-status.json`

## BLOCK 6 — آماده‌سازی فاز ۱ (امنیت) ✓ — فقط طرح، بدون اجرا

`download/pn007/phase1-readiness.md` — شش کار با وضعیت/ابزار/گام/زمان (~۸ ساعت): ۱) اسکن Secret (gitleaks) — **دو یافتهٔ قطعی از پیش**: `.env` کامیت‌شده با کد مالک واقعی + `env.platform.json` با MELK_TOKEN_KEY ۲) چرخش کلید (اسکریپت موجود rotate-encryption-key.ts + طرح دوفازه) ۳) SW یکپارچه (✅ قبلاً در ۰۰۶) ۴) Trusted Proxy کانفیگ Caddy (نگاشت شد: :۸۱→:۳۰۰۰ + XFF از remote_host؛ سؤال دورزدن نرخ‌سنج مستند) ۵) audit نقش‌های OWNER/CONSULTANT (طرح اسکریپت) ۶) شش سناریوی ارتقای سطح دسترسی (طرح تست‌ها)

## BLOCK 7 — این گزارش

طبق قالب استاندارد: هدر اجباری + جزئیات هر BLOCK بالا + سه قانون (پایین).

---

## 📜 قانون تثبیت ۲٫۰ (بازتأیید — ۱۲ بند)

الف) آغاز جلسه با وارسی سه‌گانه ✓ (BLOCK 0) · ب) مهر نسخه = HEAD ✓ (بیلد آزمون بازیابی از همان SHA بازتولید شد — قوی‌ترین شاهد ممکن) · ج) بستهٔ بقا chainIndex=۸ ✓ · د) آینه GitHub فقط کد بدون داده ✓ (۵ کامیت این جلسه پوش شد: 33223ac→1bc66fa) · هـ) داده در GLM (بکاپ ۱۸۸MB + بستهٔ بقا ۲۴۰MB) ✓ · و) رازها هرگز در بستهٔ بقا (KEYS.md فقط نام‌ها؛ ارسال کد مالک در آزمون از .env.local خوانده شد) ✓ · ز) دو-سبز پیاپی پیش از کامیت ✓ (۱۸۳۶/۱۲/۱ ×۲ یکسان در CI گام ۴) · ح) صفر ادعای بدون شاهد ✓ · ط) Blocker→Alternative→Decision→Continue — شش مورد مستند: prisma generate → postinstall · مسیر هاردکد → script-relative · دو DATABASE_URL → جایگزینی · سرور کهنه → گارد پورت · strict فاز۳ → قرقره ≤۴۷ · پیک Build → PARTIAL مستند · ی) OWNER دسترسی کامل ✓ · ک) auto_execute false — قفل ابدی ✓ · ل) گزارش صادقانه: هر سه اجرای نخست آزمون بازیابی FAIL/آلوده بودند و مستند شدند ✓

## 📜 قانون لینک

| # | لینک | وضعیت | شاهد |
|---|---|---|---|
| ۱ | preview: `https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai/` | ✓ 200 | /api/health ok · /api/version با fingerprint baked |
| ۲ | publish: `https://c1vdh8442240-d.space-z.ai/` | ✗ 500 | پایش خودکار فعال — سند اقدام مالک آماده |

## 📜 قانون فایل

**فایل‌های دانلودی این گزارش (همه در `download/pn007/`):**

| # | فایل | نوع | محتوا |
|---|---|---|---|
| ۱ | `PN-007-FINAL-REPORT.md` | MD | همین گزارش نهایی |
| ۲ | `baseline.json` | JSON | BLOCK 0 — سه‌گانه + بکاپ + وضعیت پایه |
| ۳ | `fingerprint-1.json` | JSON | BLOCK 1 — اثر انگشت بیلد ۱ |
| ۴ | `fingerprint-2.json` | JSON | BLOCK 1 — اثر انگشت بیلد ۲ (از صفر) |
| ۵ | `fingerprint-proof.json` | JSON | BLOCK 1 — مقایسهٔ دو بیلد (۱۰۰٪ — PASS) |
| ۶ | `restore-test.json` | JSON | BLOCK 2 — شاهد کامل آزمون بازیابی (PASS · ۵۰s · OWNER) |
| ۷ | `restore-fingerprint-proof.json` | JSON | BLOCK 2 — اثر انگشت بیلدِ بازگردانده ↔ بسته (۱۰۰٪) |
| ۸ | `restore-logs/server.log` | LOG | BLOCK 2 — لاگ بوت سرور بازگردانده |
| ۹ | `restore-logs/build.log` | LOG | BLOCK 2 — لاگ بیلد clone از صفر |
| ۱۰ | `restore-logs/install.log` | LOG | BLOCK 2 — لاگ نصب وابستگی‌ها |
| ۱۱ | `ci-run.log` | LOG | BLOCK 3 — اجرای کامل CI هشت‌گامی (PASS) |
| ۱۲ | `phase1-readiness.md` | MD | BLOCK 6 — آماده‌سازی فاز ۱ (شش کار + دو یافتهٔ امنیتی) |
| ۱۳ | `publish-status.json` | JSON | BLOCK 5 — وضعیت لحظه‌ای publish/preview |
| ۱۴ | `publish-health.log` | LOG | BLOCK 5 — لاگ پایش پیوسته |
| ۱۵ | بستهٔ بقا chainIndex=۸ | DIR | `upload/.survival/PN-007-20261006/` — ساختار استاندارد (git/ db/ env/ docs/ + FINGERPRINT + CHAIN + MANIFEST) + ۴ شاهد PNG در screens/ |
| ۱۶ | اسکریپت‌های تازه | — | `scripts/fingerprint.ts` · `scripts/ci.sh` · `scripts/audit-reproducibility.sh` · `scripts/publish-health.sh` · `scripts/pn007/*` (baseline · build-survival-package · repro-test · restore-test · compare) + `src/lib/version-fingerprint.ts` |

**قید:** صفر ارجاع کلامی — همهٔ شواهد بالا فایل مستقیم‌اند. [BLOCKED: لینک HTTP مستقیم به فایل‌ها از داخل محیط اجرا قابل تولید نیست — مکانیزم دانلود کاربر همان پوشهٔ download/ است]

---

**عوارض صادقانه:** (۱) پیک Build همچنان ~۱٫۹-۲٫۰GB (PARTIAL پذیرفته‌شدهٔ جلسهٔ ۰۰۶ — کف ابزار؛ هدف با ارتقای سخت‌افزار/فاز بعدی) (۲) ۱۲ شکست تست کلاس مستند جلسهٔ ۰۰۶ (۶ مسدود PM قطع + ۵ حالتی + ۱ خطای مبنا) (۳) دو راز کامیت‌شده در گیت (کد مالک + کلید توکن) — فاز ۱ باید بلافاصله چرخش کند (سند آماده) (۴) publish هنوز ۵۰۰ — پایش فعال است اما اقدام با مالک است (۵) سند standalone tar در بستهٔ بقا نیامد (۵۶۷MB > سقف ۲۰MB — بازتولید از bundle در ~۴۰s جایگزین است).

**گام‌های پیشنهادی پس از این گزارش:** ۱) اجرای CI نهایی روی HEAD کامل (`bun run ci`) ۲) بیلد نهایی + ری‌استارت سرو production ۳) گارد ۶بررسی روی حالت نهایی ۴) ارسال بستهٔ بقا chainIndex=۸ به مخزن فیزیکی مالک در اولین فرصت.

**ملکا متوقف نمی‌شود — هر Build، قابل بازتولید. هر Runtime، قابل پیش‌بینی. هر بستهٔ بقا، یک DNA کامل.**
