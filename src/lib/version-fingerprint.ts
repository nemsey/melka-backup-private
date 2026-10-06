/**
 * VersionFingerprint — هویت کامل نسخه (ملکا-شورا-ن۰۰۷-۱۴۰۵ · فاز ۰.۵ · BLOCK 1)
 * ---------------------------------------------------------------------------
 * «هر Build + هر Runtime = قابل بازتولید.»
 * این ماژول تنها مرجع محاسبهٔ اثر انگشت نسخه است — هم در زمان Build
 * (postbuild → .next/fingerprint.json) و هم در Runtime (GET /api/version).
 *
 * اصول:
 *  - صفر وابستگی خارج از node استاندارد (fs/crypto/child_process) —
 *    تا هم Next باندلش کند، هم bun مستقیم اجرایش کند.
 *  - صفر راز: envFingerprint فقط از «نام» کلیدها ساخته می‌شود، هرگز مقادیر.
 *  - قطعیت: همهٔ فیلدها تابع محتوای گیت/فایل‌ها/نسخه‌ها هستند؛
 *    فقط builtAt و buildId (که زمان را حمل می‌کنند) بین دو بیلد مجاز به تفاوت‌اند.
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

/** ریشهٔ پروژه — cwd سرور همیشه ریشه است (start/dev هر دو از ریشه اجرا می‌شوند) */
export const PROJECT_ROOT = process.cwd();

export interface VersionFingerprint {
  // ── کد ─────────────────────────────────────────────────────────
  gitSha: string;              // SHA کامل
  gitShortSha: string;         // ۷ رقم
  gitBranch: string;
  gitCommittedAt: string;      // ISO

  // ── Runtime ────────────────────────────────────────────────────
  bunVersion: string;          // مانند 1.3.14
  nodeVersion: string;         // از Bun/Node در حال اجرا
  prismaVersion: string;
  nextVersion: string;

  // ── Build ───────────────────────────────────────────────────────
  buildId: string;             // SHA-YYYYMMDD-HHMM
  builtAt: string;
  buildMode: "production" | "development";
  sourceMapsEnabled: boolean;

  // ── Env ─────────────────────────────────────────────────────────
  envFingerprint: string;      // SHA-256 از «نام کلیدها» (نه مقادیر)
  envKeyCount: number;

  // ── Lockfile ───────────────────────────────────────────────────
  lockfileSha256: string;      // از bun.lock (متن) یا bun.lockb (باینری)
  packageJsonSha256: string;

  // ── DB ──────────────────────────────────────────────────────────
  schemaSha256: string;       // از prisma/schema.prisma
  dbMigrationCount: number;

  // ── متادیتا (خارج از قرارداد ۱۸فیلدی شورا — فقط برای شفافیت) ──
  lockfileName?: string;
  computedAt?: string;
  computedBy?: "postbuild" | "api-live" | "cli";
}

/* ─────────────────────── ابزارهای پایه ─────────────────────── */

function sh(cmd: string, timeoutMs = 8000): string | null {
  try { return execSync(cmd, { encoding: "utf-8", timeout: timeoutMs, cwd: PROJECT_ROOT }).trim(); }
  catch { return null; }
}

function sha256File(path: string): string | null {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
  catch { return null; }
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/* ─────────────────────── اجزای اثر انگشت ─────────────────────── */

/** اطلاعات گیت: SHA کامل، کوتاه، شاخه، زمان کامیت */
export function gitIdentity(): Pick<VersionFingerprint, "gitSha" | "gitShortSha" | "gitBranch" | "gitCommittedAt"> {
  const gitSha = sh("git rev-parse HEAD") ?? "nogit";
  const branch = sh("git rev-parse --abbrev-ref HEAD") ?? "nobranch";
  const committedAt = sh("git log -1 --format=%cI") ?? new Date(0).toISOString();
  return {
    gitSha,
    gitShortSha: gitSha.slice(0, 7),
    gitBranch: branch,
    gitCommittedAt: committedAt,
  };
}

/** نسخه‌های Runtime — از پروسِس جاری + فایل‌های پکیج (بدون اجرای CLI سنگین) */
export function runtimeVersions(): Pick<VersionFingerprint, "bunVersion" | "nodeVersion" | "prismaVersion" | "nextVersion"> {
  const anyProc = process as any;
  const bunVersion = anyProc.versions?.bun ?? (sh("bun --version") ?? "unknown");
  const nodeVersion = anyProc.versions?.node ?? (sh("node --version")?.replace("v", "") ?? "unknown");

  const prismaVersion =
    readPkgVersion("node_modules/@prisma/client/package.json") ??
    readPkgVersion(".next/standalone/node_modules/@prisma/client/package.json") ??
    (sh("bunx prisma --version", 20000)?.match(/prisma\s+:\s*(\S+)/)?.[1] ?? "unknown");

  const nextVersion = readPkgVersion("node_modules/next/package.json") ?? "unknown";
  return { bunVersion, nodeVersion, prismaVersion, nextVersion };
}

function readPkgVersion(rel: string): string | null {
  try { return JSON.parse(readFileSync(join(PROJECT_ROOT, rel), "utf-8")).version ?? null; } catch { return null; }
}

/**
 * envFingerprint — SHA-256 از «نام کلیدها» فقط.
 * منبع قطعی: union کلیدهای .env و .env.example (هر دو بدون رازِ ماشین‌محور؛
 * .env.local عمداً کنار گذاشته می‌شود تا اثر انگشت بین ماشین‌ها قابل مقایسه بماند).
 */
export function envIdentity(): Pick<VersionFingerprint, "envFingerprint" | "envKeyCount"> {
  const keys = new Set<string>();
  for (const f of [".env", ".env.example"]) {
    const p = join(PROJECT_ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) keys.add(m[1]);
    }
  }
  const sorted = [...keys].sort();
  return {
    envFingerprint: sha256Text(sorted.join("\n")),
    envKeyCount: sorted.length,
  };
}

/** قفل وابستگی‌ها: bun.lock (متن) ترجیح دارد، وگرنه bun.lockb (باینری) */
export function lockfileIdentity(): Pick<VersionFingerprint, "lockfileSha256" | "lockfileName"> {
  for (const name of ["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock"]) {
    const h = sha256File(join(PROJECT_ROOT, name));
    if (h) return { lockfileSha256: h, lockfileName: name };
  }
  return { lockfileSha256: "missing", lockfileName: "none" };
}

/** هش package.json و schema.prisma + تعداد migrationها */
export function dbAndPackageIdentity(): Pick<VersionFingerprint, "packageJsonSha256" | "schemaSha256" | "dbMigrationCount"> {
  const packageJsonSha256 = sha256File(join(PROJECT_ROOT, "package.json")) ?? "missing";
  const schemaSha256 = sha256File(join(PROJECT_ROOT, "prisma/schema.prisma")) ?? "missing";
  let dbMigrationCount = 0;
  try {
    const migDir = join(PROJECT_ROOT, "prisma/migrations");
    dbMigrationCount = readdirSync(migDir).filter((d) => d !== "migration_lock.toml").length;
  } catch { /* پروژه db-push است — صفر migration مجاز */ }
  return { packageJsonSha256, schemaSha256, dbMigrationCount };
}

/** sourceMapsEnabled — استخراج صریح از next.config.ts (پیش‌فرض false) */
export function sourceMapsSetting(): boolean {
  try {
    const cfg = readFileSync(join(PROJECT_ROOT, "next.config.ts"), "utf-8");
    const m = cfg.match(/productionBrowserSourceMaps\s*:\s*(true|false)/);
    return m ? m[1] === "true" : false;
  } catch { return false; }
}

/* ─────────────────────── محاسبهٔ کامل ─────────────────────── */

export interface FingerprintOptions {
  /** buildId/builtAt از شاهد پخته‌شده (build) — وگرنه زنده ساخته می‌شود */
  buildId?: string;
  builtAt?: string;
  buildMode?: "production" | "development";
  computedBy?: "postbuild" | "api-live" | "cli";
}

export function computeFingerprint(opts: FingerprintOptions = {}): VersionFingerprint {
  const git = gitIdentity();
  const runtime = runtimeVersions();
  const env = envIdentity();
  const lock = lockfileIdentity();
  const dbpkg = dbAndPackageIdentity();

  const buildMode = opts.buildMode ?? ((process.env.NODE_ENV as "production" | "development") || "development");
  const builtAt = opts.builtAt ?? new Date().toISOString();
  const buildId = opts.buildId ?? `${git.gitShortSha}-${stampOf(new Date(builtAt))}`;

  return {
    ...git,
    ...runtime,
    buildId,
    builtAt,
    buildMode,
    sourceMapsEnabled: sourceMapsSetting(),
    ...env,
    ...lock,
    ...dbpkg,
    computedAt: new Date().toISOString(),
    computedBy: opts.computedBy ?? "cli",
  };
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function stampOf(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}`;
}

/* ─────────────────── خواندن نسخهٔ پخته‌شده ─────────────────── */

/** فایل اثر انگشتی که postbuild می‌نویسد: <root>/.next/fingerprint.json */
export function bakedFingerprintPath(): string {
  return join(PROJECT_ROOT, ".next/fingerprint.json");
}

export function readBakedFingerprint(): VersionFingerprint | null {
  try {
    return JSON.parse(readFileSync(bakedFingerprintPath(), "utf-8")) as VersionFingerprint;
  } catch { return null; }
}

/**
 * اثر انگشتی سرو‌شده — ترجیح: پخته‌شده (baked). نبود: محاسبهٔ زنده (صادقانه).
 * همانی این دو همان «بازتولیدپذیری» است که فاز ۰.۵ می‌سنجد.
 */
export function servedFingerprint(): { fingerprint: VersionFingerprint; source: "baked" | "api-live" } {
  const baked = readBakedFingerprint();
  if (baked) return { fingerprint: baked, source: "baked" };
  return { fingerprint: computeFingerprint({ computedBy: "api-live" }), source: "api-live" };
}

/* ─────────────────── مقایسهٔ بازتولیدپذیری ─────────────────── */

/** فیلدهایی که به‌طور ساختاری زمان را حمل می‌کنند — تفاوتشان «مجاز» است */
export const TIME_EXEMPT_FIELDS = ["builtAt", "buildId", "computedAt", "computedBy"] as const;

export interface FingerprintDiff {
  field: string;
  a: string | number | boolean | undefined;
  b: string | number | boolean | undefined;
}

export interface FingerprintComparison {
  totalFields: number;
  comparedFields: number;
  identicalFields: number;
  exemptFields: string[];
  diffs: FingerprintDiff[];
  identicalRatio: number;        // نسبت فیلدهای یکسان بین فیلدهای قابل‌مقایسه
  reproducible: boolean;         // ≥ ۰٫۹۵ و صفر تفاوت غیرمجاز
}

export function compareFingerprints(a: VersionFingerprint, b: VersionFingerprint): FingerprintComparison {
  const keys = Object.keys(a).filter((k) => typeof a[k as keyof VersionFingerprint] !== "object");
  const exempt: string[] = [];
  const diffs: FingerprintDiff[] = [];
  let identical = 0;

  for (const k of keys) {
    const va = a[k as keyof VersionFingerprint];
    const vb = b[k as keyof VersionFingerprint];
    const same = String(va) === String(vb);
    if (same) { identical++; continue; }
    if ((TIME_EXEMPT_FIELDS as readonly string[]).includes(k)) { exempt.push(k); continue; }
    diffs.push({ field: k, a: va as any, b: vb as any });
  }

  const compared = keys.length - exempt.length;
  return {
    totalFields: keys.length,
    comparedFields: compared,
    identicalFields: identical,
    exemptFields: exempt,
    diffs,
    identicalRatio: compared > 0 ? identical / compared : 0,
    reproducible: diffs.length === 0 && (compared === 0 || identical / compared >= 0.95),
  };
}
