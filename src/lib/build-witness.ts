/**
 * شاهد زندهٔ بیلد — P6519 (دستور شورا: رفع دائمی لینک‌های کهنه Preview/Publish)
 * ---------------------------------------------------------------------------
 * سه منبع یکسانِ نسخه، همه از همین ماژول:
 *   ۱) GET /api/version          — شاهد ماشینی (curl) بدون احراز هویت
 *   ۲) <meta name="app-build-id"> — شاهد در HTML خام (بدون لاگین)
 *   ۳) فوتر داشبورد               — شاهد چشمی مالک
 * + ثبت در DB (جدول AppMeta) هنگام بوت سرور توسط instrumentation.
 *
 * اصل صداقت: در حالت dev هیچ مقدار جعلی «production-مانند» ساخته نمی‌شود؛
 * مقدار dev به‌صورت زنده از git خوانده و با برچسب development برچسب می‌خورد.
 */

import { execSync } from "child_process";
import type { PrismaClient } from "@prisma/client";

export interface BuildWitness {
  /** شناسهٔ یکتای بیلد: "<gitSha8>-<yyyymmdd>-<hhmm>" یا "dev-<sha>-<زمان بوت سرور>" */
  buildId: string;
  /** زمان بیلد (production) یا زمان بوت سرور (dev) — ISO 8601 */
  builtAt: string;
  /** ۸ نویسهٔ ابتدای کامیت گیت */
  gitSha: string;
  /** development | production */
  env: string;
  /** منبع مقدار: baked (پخته‌شده در build) | dev-live (محاسبهٔ زنده در dev) */
  source: "baked" | "dev-live";
}

function gitShaLive(): string {
  try {
    return execSync("git rev-parse --short HEAD", { timeout: 5000 })
      .toString()
      .trim()
      .slice(0, 8);
  } catch {
    return "nogit";
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function stampOf(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`
  );
}

/** زمان بوت ماژول — در dev به‌عنوان builtAt استفاده می‌شود (برای هر بوت سرور ثابت) */
const devBootIso = new Date().toISOString();

/** کش درون‌فرایندی — شاهد بیلد در طول عمر یک فرایند ثابت است (محاسبهٔ یک‌باره) */
let cachedWitness: BuildWitness | null = null;

/** فقط برای تست‌ها — پاک‌سازی کش (تولید هرگز صدا نمی‌زند) */
export function __resetBuildWitnessCacheForTests(): void {
  cachedWitness = null;
}

/**
 * شاهد بیلد جاری.
 * production: مقادیر پخته‌شده در زمان build توسط next.config (env درlining).
 * development: مقادیر زنده (sha لحظهٔ اجرا + زمان بوت سرور) — صادقانه برچسب‌دار.
 */
export function getBuildWitness(): BuildWitness {
  if (cachedWitness) return cachedWitness;

  const bakedId = process.env.NEXT_PUBLIC_BUILD_ID;
  const bakedSha = process.env.NEXT_PUBLIC_GIT_SHA;
  const bakedAt = process.env.NEXT_PUBLIC_BUILT_AT;

  if (bakedId && bakedSha && bakedAt) {
    cachedWitness = {
      buildId: bakedId,
      builtAt: bakedAt,
      gitSha: bakedSha,
      env: process.env.NODE_ENV ?? "unknown",
      source: "baked",
    };
    return cachedWitness;
  }

  // حالت dev (سرور dev مقادیر next.config env را inline نمی‌کند)
  const sha = gitShaLive();
  cachedWitness = {
    buildId: `dev-${sha}-${stampOf(new Date(devBootIso))}`,
    builtAt: devBootIso,
    gitSha: sha,
    env: process.env.NODE_ENV ?? "development",
    source: "dev-live",
  };
  return cachedWitness;
}

/**
 * ثبت شاهد بیلد در DB — جدول AppMeta (singleton).
 * توسط instrumentation در هر بوت سرور فراخوانده می‌شود؛ خطا هرگز بوت را نمی‌شکند
 * (شاهد زندهٔ endpoint همچنان کار می‌کند — DB مکمل است، نه شرط بقا).
 */
export async function recordBuildWitnessToDb(db: PrismaClient): Promise<void> {
  const w = getBuildWitness();
  try {
    await db.appMeta.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        buildId: w.buildId,
        builtAt: w.builtAt,
        gitSha: w.gitSha,
        env: w.env,
      },
      update: {
        buildId: w.buildId,
        builtAt: w.builtAt,
        gitSha: w.gitSha,
        env: w.env,
      },
    });
  } catch {
    // fail-safe عمدی — جلوگیری از شکستن بوت سرور
  }
}
