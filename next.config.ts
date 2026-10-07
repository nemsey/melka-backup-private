import type { NextConfig } from "next";
import { execSync } from "child_process";

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
      "./backups/**",
      "./db/**",
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
