import type { NextConfig } from "next";
import { execSync } from "child_process";
import { lstatSync } from "fs";
import { resolve } from "path";

/* =============================================================================
 * DIR-STATIC-500-001 — گارد بیلد مخربِ درجا (قانون تثبیت و بقا)
 * -----------------------------------------------------------------------------
 * حادثهٔ 2026-11-20 ساعت ۰۹:۴۷: عامل محیطی `next build` را درجا در my-project
 * اجرا کرد؛ خروجی از مسیر سیم‌لینک .next (→ melka-store/next) روی درختِ زندهٔ
 * سرور جابه‌جا/بازنویسی شد → CWD سرور (standalone) حذف شد → همهٔ چانک‌های
 * ایستا ۵۰۰ شدند → «Application error: a client-side exception» برای همهٔ
 * بازدیدکنندگان (SSR از حافظه زنده ماند و فریب‌دهنده بود).
 * قانون: در توپولوژی فروشگاه (.next سیم‌لینک)، بیلد تولیدی فقط از مسیر رسمی
 * scripts/ws-build-daemon.py مجاز است (بیلد در فضای کاری بیرونی + جابه‌جایی
 * اتمیک + ری‌استارت). این گارد در نقطهٔ بارگذاری پیکربندی اجرا می‌شود و
 * همهٔ مسیرهای بیلد (next build / bun run build / هر فراخوانی دیگر) را
 * پیش از هرگونه تخریب می‌بندد. فرار اضطراری مالک: MELKA_ALLOW_INPLACE_BUILD=1
 * ========================================================================== */
function inplaceBuildGuard(): void {
  if (process.env.MELKA_ALLOW_INPLACE_BUILD === "1") return;
  // محیط تست فقط پیکربندی را «بارگذاری» می‌کند (تست‌های P6519-A) — بیلد نمی‌شود؛
  // گارد مخصوص بیلد است، نه import. (NODE_ENV=test فقط از اسکریپت تست می‌آید)
  if (process.env.NODE_ENV === "test") return;
  let cwd = "";
  let nextIsSymlink = false;
  try {
    cwd = process.cwd();
    nextIsSymlink = lstatSync(".next").isSymbolicLink();
  } catch {
    return; // .next وجود ندارد → نخستین بیلد درجا؛ مخرب نیست
  }
  if (resolve(cwd) === "/home/z/my-project" && nextIsSymlink) {
    throw new Error(
      "[inplace-build-guard] بیلد درجا ممنوع: .next سیم‌لینک فروشگاه melka-store است و سرور زنده از همان درخت سرو می‌کند " +
        "(ریشهٔ حادثهٔ ۵۰۰ چانک‌های 2026-11-20). مسیر رسمی: python3 scripts/ws-build-daemon.py — " +
        "فرار اضطراری مالک: MELKA_ALLOW_INPLACE_BUILD=1",
    );
  }
}
inplaceBuildGuard();

/* =============================================================================
 * P6519 — شاهد زندهٔ نسخه (BLOCK B دستور شورا: رفع دائمی لینک‌های کهنه)
 * -----------------------------------------------------------------------------
 * BUILD_ID از این پس «خودکار، یکتا و قابل‌ردیابی» است:
 *   "<gitSha8>-<yyyymmdd>-<hhmm>"   مثال: 459939e-20260924-0712
 * یعنی هر بیلد به کامیت گیت و زمان بیلد گره می‌خورد — صفر اقدام دستی.
 * همان مقدار + builtAt + gitSha از طریق env در باندل (سرور + کلاینت) پخته
 * می‌شود تا /api/version، متاتگ HTML و فوتر داشبورد همیشه نسخهٔ «همان بیلد»
 * را نشان دهند. مستندات: docs/decision-preview-publish.md (بند ۳-۱)
 * ========================================================================== */

function gitShaShort(): string {
  try {
    return execSync("git rev-parse --short HEAD", { timeout: 5000 })
      .toString()
      .trim()
      .slice(0, 8);
  } catch {
    // محیط بدون git (نباید رخ دهد — .git هم در کانتینر هست هم در repo.tar)
    return "nogit";
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function buildStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`
  );
}

const gitSha = gitShaShort();
const builtAtIso = new Date().toISOString();
const buildId = `${gitSha}-${buildStamp(new Date(builtAtIso))}`;

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: () => buildId,
  /* =============================================================================
   * PN-006 BLOCK 2.2.4 — خاموشی صریح source map های مرورگر در production
   * (پیش‌فرض Next هم false است؛ اینجا صریح شد تا در بازبینی‌های آینده
   *  پیک Build و حجم بستهٔ استقرار قابل اتکا باشد.)
   * ========================================================================== */
  productionBrowserSourceMaps: false,
  /* =============================================================================
   * P6528 — لاغرسازی بستهٔ استقرار (ریشهٔ واقعی «Failed» دامنهٔ publish)
   * -----------------------------------------------------------------------------
   * file-tracing خروجی standalone، فهرست‌های غیرعملیاتی پروژه را هم ردیابی و
   * داخل بسته کپی می‌کرد: backups 188M + db 80M + skills 61M + download 28M +
   * scripts 10M + tool-results 6M … ⇒ بستهٔ 539MB (تار 184MB) از سقف آپلود
   * خط لولهٔ انتشار پلتفرم رد می‌شد و دامنهٔ publish صفحهٔ «Failed» می‌داد.
   * دیتابیس تولید در FC از DATABASE_URL محیط می‌آید (start.sh آن را به
   * file:/app/db/custom.db ست می‌کند و database-runtime-build.sh جداگانه
   * بستهٔ db/ را می‌سازد) — کپی‌های ردیابی‌شدهٔ این فهرست‌ها کاملاً زائدند.
   * env.platform.json عمداً مستثناست (سرور در بوت به آن نیازمند است).
   * ========================================================================== */
  outputFileTracingExcludes: {
    "*": [
      /* PN-053 (سبک‌سازی): .git ردیابی نمی‌شود — ۹۰۲MB کپی زائد در هر بیلد.
       * اثبات زائدبودن: api/version و همهٔ گاردها گیت را از MELKA_REPO_DIR
       * (ریشهٔ اصلی) می‌خوانند، نه از standalone/.git. */
      "./.git/**",
      "./backups/**",
      "./db/**",
      "./node_modules/@embedded-postgres/**",
      "./node_modules/.pg-client/**",
      "./node_modules/embedded-postgres/**",
      "./prisma/db/**",
      "./download/**",
      "./skills/**",
      "./scripts/**",
      "./tool-results/**",
      "./docs/**",
      "./examples/**",
      "./tests/**",
      "./coverage*.json",
      "./baseline*.json",
      "./filter-*.json",
      "./trend-validation.json",
      "./recon-*.jsonl",
      "./dev.log",
      "./server.log",
      "./worklog.md",
      /* PN-014/D2 — ریشهٔ بازگشت «Failed» دامنهٔ publish: بستهٔ استقرار دوباره متورم شد
       * (P6528 دوباره — این بار با فهرست‌های تازه):
       *   · upload/dataset-backups (۳۸۸MB سرد) + اسنپ‌شات tar.gz — .runtime باید بماند
       *     (boot-secrets + runtime-status در زمان اجرا خوانده می‌شوند — مسیر مطلق)
       *   · deliver-store (~۶۰۰MB) — قانون فایل v3 از مسیر /deliver (route) سرو
       *     می‌شود؛ کپی داخل standalone صرفاً تورم بسته بود.
       *   · intelligence-data — هیچ ارجاعی از src/ ندارد (مصرف‌کننده: Worker از
       *     ریشهٔ پروژه با مسیر مطلق) — کپی ردیابی‌شده صرفاً ۲۶MB تورم بود. */
      "./upload/dataset-backups/**",
      "./upload/*.tar.gz",
      "./upload/*.md",
      /* PN-076-ث — ریشهٔ ENOSPC پنجم/ششم (۲۰۲۶-۱۱-۰۸ صبح): upload/.data (قلعه/چرخشی/مقدس)
       * هرگز از standalone خوانده نمی‌شود (سرور/Worker مسیرهای مطلق ریشهٔ ریپو را
       * می‌خوانند؛ اسکریپت بیلد کپی standalone/upload/.data را باری آخر rm می‌کند)
       * اما تراسر بی‌دلیل کل آن را کپی می‌کرد — با رشد لایهٔ مقدس (۹ اسنپ‌شات ×
       * ~۵۰۰MB) کپیِ گذرا دیسک را پر کرد و بیلد را کشت. مستثنا = صفر کپی زائد. */
      "./upload/.data/**",
      "./deliver-store/**",
      "./intelligence-data/**",
    ],
  },
  env: {
    // در زمان build داخل باندل پخته می‌شوند (پروژه output:standalone — .git در
    // بستهٔ استقرار FC نیست، پس این تنها راه رساندن sha به runtime است)
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_BUILT_AT: builtAtIso,
  },
  /* فایل Service Worker و HTML ریشه هرگز کش نشوند تا به‌روزرسانی‌ها بلافاصله اعمال شوند
     (لایه CDN دامنه عمومی، پاسخ‌ها را با کلید مسیر کش می‌کند) */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        // P6519 — endpoint شاهد نسخه هرگز کش نشود (لایهٔ FC مسیرمحور کش می‌کند)
        source: "/api/version",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  typescript: {
    // PHASE 1 / P1-04: تایپ‌چک کامل فعال — صفر خطای tsc در کل پروژه
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
