#!/usr/bin/env bun
/**
 * scripts/fingerprint.ts — CLI اثر انگشت نسخه (ملکا-شورا-ن۰۰۷ · BLOCK 1.2)
 * ---------------------------------------------------------------------------
 * کاربردها:
 *   bun run scripts/fingerprint.ts                 → چاپ JSON اثر انگشت
 *   bun run scripts/fingerprint.ts --write-next     → نوشتن .next/fingerprint.json (postbuild)
 *   bun run scripts/fingerprint.ts --verify         → مقایسه با .next/fingerprint.json (CI گام ۸)
 *   bun run scripts/fingerprint.ts --out <path>     → نوشتن در مسیر دلخواه (بستهٔ بقا)
 *
 * خروجی verify: exit 0 = بازتولیدپذیر ✓ / exit 1 = تفاوت غیرمجاز ✗
 */
import { writeFileSync, mkdirSync, copyFileSync, readFileSync, statSync, existsSync } from "fs";
import { dirname, join } from "path";
import {
  computeFingerprint, readBakedFingerprint, compareFingerprints, bakedFingerprintPath,
} from "../src/lib/version-fingerprint";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const valOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

/**
 * buildId قطعی: اول BUILD_ID واقعی که Next نوشته (.next/BUILD_ID) —
 * این همان مقداری است که سرور سرو می‌کند؛ بعد env پخته؛ آخر محاسبهٔ زنده.
 * builtAt: mtime همان فایل (نزدیک‌ترین شاهد زمان بیلد).
 * buildMode: وجود .next/BUILD_ID + standalone/server.js = بستهٔ production
 *   (استنباط از محصول، نه از NODE_ENV شل — شل postbuild/verify آن را به ارث نمی‌برد).
 * ن۰۰۷ (رفع باگ): مسیرها نسبت به «ریشهٔ همین پروژه» حل می‌شوند (محل خودِ اسکریپت)،
 * نه مسیر هاردکد پروژهٔ اصلی — تا هر clone تازه buildId خودش را بخواند.
 */
const PROJECT_ROOT = join(dirname(import.meta.dir));
function authoritativeBuildIdentity(): { buildId?: string; builtAt?: string; buildMode?: "production" | "development" } {
  try {
    const p = join(PROJECT_ROOT, ".next/BUILD_ID");
    if (existsSync(p)) {
      return {
        buildId: readFileSync(p, "utf-8").trim(),
        builtAt: new Date(statSync(p).mtimeMs).toISOString(),
        buildMode: existsSync(join(PROJECT_ROOT, ".next/standalone/server.js")) ? "production" : "development",
      };
    }
  } catch { /* نبود فایل — ادامه با env/زنده */ }
  return {};
}

async function main() {
  // ── محاسبه با شاهد بیلد واقعی (BUILD_ID که Next نوشته) اگر موجود ──
  const auth = authoritativeBuildIdentity();
  const fp = computeFingerprint({
    buildId: auth.buildId ?? process.env.NEXT_PUBLIC_BUILD_ID,
    builtAt: auth.builtAt ?? process.env.NEXT_PUBLIC_BUILT_AT,
    buildMode: auth.buildMode ?? ((process.env.NODE_ENV as "production" | "development") || "development"),
    computedBy: "cli",
  });

  if (has("--out")) {
    const out = valOf("--out")!;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(fp, null, 2));
    console.log(`✅ fingerprint → ${out}`);
    return;
  }

  if (has("--write-next")) {
    // خروجی next build همیشه بستهٔ production است — NODE_ENV در شلِ postbuild
    // از پروسِس next به ارث نمی‌رسد؛ پس صریح ثبت می‌شود تا شاهد صادق بماند.
    fp.buildMode = "production";
    fp.computedBy = "postbuild";
    writeFileSync(bakedFingerprintPath(), JSON.stringify(fp, null, 2));
    console.log(`✅ fingerprint → ${bakedFingerprintPath()}`);
    // رونوشت داخل بستهٔ standalone تا سرورِ مستقل هم شاهد پخته داشته باشد.
    // ن۰۰۷ (رفع باگ): مسیر قبلی هاردکد /home/z/my-project بود — بیلدِ هر clone
    // تازه (آزمون بازیابی) اثر انگشت خود را در پروژهٔ اصلی می‌نوشت (آلودگی متقابل!)
    // اکنون نسبت به محل خودِ اسکریپت حل می‌شود: <root>/scripts/../.next/standalone
    try {
      const standaloneCopy = join(dirname(import.meta.dir), ".next/standalone/.next/fingerprint.json");
      mkdirSync(dirname(standaloneCopy), { recursive: true });
      copyFileSync(bakedFingerprintPath(), standaloneCopy);
      console.log(`✅ fingerprint → ${standaloneCopy} (رونوشت سرور مستقل)`);
    } catch { /* standalone هنوز ساخته نشده — بی‌خطر */ }
    return;
  }

  if (has("--verify")) {
    const baked = readBakedFingerprint();
    if (!baked) {
      console.error("✗ verify: .next/fingerprint.json موجود نیست — ابتدا build اجرا شود");
      process.exit(1);
    }
    const cmp = compareFingerprints(fp, baked);
    console.log(`fields: ${cmp.totalFields} | compared: ${cmp.comparedFields} | identical: ${cmp.identicalFields} | exempt(زمانی): ${cmp.exemptFields.join(", ") || "—"}`);
    console.log(`identicalRatio: ${(cmp.identicalRatio * 100).toFixed(1)}% (آستانه ≥ ۹۵٪)`);
    if (cmp.diffs.length > 0) {
      console.error(`✗ ${cmp.diffs.length} تفاوت غیرمجاز:`);
      for (const d of cmp.diffs) console.error(`   ${d.field}: live=${d.a} vs baked=${d.b}`);
      process.exit(1);
    }
    if (!cmp.reproducible) { console.error("✗ نسبت همانی زیر آستانه"); process.exit(1); }
    console.log("✅ REPRODUCIBLE — اثر انگشت کد = اثر انگشت بیلد");
    return;
  }

  // پیش‌فرض: چاپ JSON
  console.log(JSON.stringify(fp, null, 2));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
