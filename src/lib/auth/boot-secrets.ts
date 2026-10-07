/**
 * خوددرمانی رازهای اجباری بوت — PN-011 اولاً (مصوبهٔ مالک: «رفع برای همیشه»)
 * ---------------------------------------------------------------------
 * مسئلهٔ ثبت‌شده در پنج رخداد (بازنشانی‌های محیط پلتفرم):
 *   بازنشانی محیط، env.platform.json و محتوای .env.local را می‌زداید؛
 *   MELK_TOKEN_KEY در هیچ رسانهٔ بادوامی نبود (قانون PN-007: راز در بستهٔ بقا
 *   و git نمی‌رود) → گارد fail-fast امنیتی (SEC-1/SEC-2) جلوی بوت را می‌گرفت
 *   → 500 عمومی روی همهٔ مسیرها تا مداخلهٔ دستی مهندس شورا.
 *
 * راه‌حل — «Escrow بومی بادوام» (لایهٔ ۲):
 *   پوشهٔ upload/ در هر پنج بازنشانی محیط زنده مانده است (شواهد: بسته‌های
 *   PN-001…010 و dataset-backups). فایل upload/.runtime/boot-secrets.json
 *   (تماماً خارج از git به‌واسطهٔ قانون /upload/ در .gitignore — هرگز به آینهٔ
 *   GitHub نمی‌رسد) نسخهٔ بادوام رازهای اجباری است.
 *
 * اولویت‌ها در هر بوت (instrumentation — پیش از assertProductionSecrets):
 *   ۱) env واقعی همیشه برنده است؛ این ماژول هرگز مقدار موجود را بازنویسی نمی‌کند.
 *   ۲) راز غایب ← از escrow بازیابی و در process.env نشسته می‌شود.
 *   ۳) escrow هم غایب ← MELK_TOKEN_KEY تازه (randomBytes(32).hex) تولید و در
 *      escrow ثبت می‌شود. هزینهٔ صادقانهٔ این حالت: نشست‌های ARM رمزشده با
 *      کلید قبلی نامعتبر می‌شوند و مالک باید یک‌بار مجدداً وارد ARM شود.
 *      MASTER_ACCESS_CODE تولید تصادفی نمی‌شود (مالک باید مقدار را بداند)؛
 *      در فقدان کامل، همان fail-fast قبلی با پیام راهنمای دقیق برقرار می‌ماند —
 *      اما پس از نخستین بوت سالم، escrow همیشه آن را در اختیار دارد.
 *   ۴) env سالم ← escrow تازه‌سازی می‌شود (نسخهٔ بادوام همیشه همگام است).
 *   ۵) env.platform.json ریشهٔ مخزن در صورت نبود از escrow بازسازی می‌شود
 *      (لایهٔ بارگذاری P6.5-08 + سازگاری اسکریپت build که آن را کپی می‌کند).
 *
 * قوانین امنیتی:
 *   - هرگز مقدار راز لاگ نمی‌شود؛ فقط اثر انگشت (۱۰ کاراکتر اول sha256).
 *   - نوشتن اتمیک (tmp + rename) با مجوز 0600.
 *   - این فایل «نام‌ها» را مستند می‌کند؛ سازندهٔ بستهٔ بقا (env/KEYS.md) فقط
 *     نام کلیدها را می‌برد — مقادیر هرگز وارد git/بستهٔ بقا نمی‌شوند.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, statSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

/** کلیدهای مدیریت‌شده — نام‌ها عمداً صریح‌اند (مستند در KEYS.md بستهٔ بقا) */
export const BOOT_SECRET_KEYS = [
  "MELK_TOKEN_KEY",
  "MASTER_ACCESS_CODE",
  "OWNER_PERSONNEL_CODES",
] as const;

export type BootSecretKey = (typeof BOOT_SECRET_KEYS)[number];

export interface BootSecretAction {
  key: string;
  action:
    | "env-kept" // env مقدار داشت — دست نخورد
    | "restored-from-escrow" // راز غایب بود — از escrow برگشت
    | "generated" // هر دو غایب بودند — تولید تصادفی (فقط MELK_TOKEN_KEY)
    | "escrow-refreshed" // env سالم بود — نسخهٔ بادوام تازه شد
    | "escrow-created"; // نخستین بوت — escrow از صفر ساخته شد
  fingerprint?: string;
}

export interface BootSecretsReport {
  repoRoot: string;
  escrowPath: string;
  envPlatformRegenerated: boolean;
  actions: BootSecretAction[];
  errors: string[];
}

/** اثر انگشت امن برای لاگ — هرگز خود راز */
export function secretFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

/**
 * ریشهٔ مخزن — سازگار با سرور standalone (cwd=.next/standalone):
 * اول MELKA_REPO_DIR (قرارداد PN-005 قلاب خوددرمانی — و از PN-011 به بعد
 * نگهبان تولید هم آن را صریح می‌نویسد)، سپس نخستین والدِ «دارای نشانهٔ ریشهٔ
 * کامل»؛ در نهایت مسیر رسمی پیش‌فرض.
 *
 * ⚠️ درس زندهٔ PN-011 (دو مرحله): خروجی file-tracing خودِ Next کل مخزن را
 * داخل standalone کپی می‌کند — حتی package.json، src/، .git و start.sh!
 * پس هیچ‌یک از این نشانه‌ها تمایز نمی‌دهد. تنها تفاوت‌های ساختاری تضمینی:
 *   · db/custom.db — در outputFileTracingExcludes است و اسکریپت build هم
 *     standalone/db را صریح حذف می‌کند (هرگز در standalone نیست)
 *   · .env.local — Next آن را به باندل trace نمی‌کند (اجرا/توسعهٔ واقعی)
 * و مهم‌تر از همه: نگهبان تولید MELKA_REPO_DIR را صریح صادر می‌کند — تعیینی.
 */
export function resolveRepoRoot(explicit?: string): string {
  const isRepoRoot = (c: string): boolean => {
    try {
      if (!existsSync(path.join(c, "package.json"))) return false;
      return (
        existsSync(path.join(c, "db", "custom.db")) ||
        existsSync(path.join(c, ".env.local"))
      );
    } catch {
      return false; // دسترسی ناقص — کاندید بعدی
    }
  };

  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  if (process.env.MELKA_REPO_DIR) candidates.push(process.env.MELKA_REPO_DIR);
  candidates.push(process.cwd());
  candidates.push(path.join(process.cwd(), ".."));
  candidates.push(path.join(process.cwd(), "..", ".."));
  candidates.push(path.join(process.cwd(), "..", "..", ".."));
  candidates.push("/home/z/my-project");

  for (const c of candidates) {
    if (c && isRepoRoot(c)) return path.resolve(c);
  }
  return "/home/z/my-project";
}

interface EscrowData {
  [key: string]: string;
}

/** PN-012-B — سه مکان escrow با سه سطح بقای متفاوت (ترتیب خواندن):
 *  ۱) db/.runtime/boot-secrets.json — db/ در هر ۶ بحران زنده ماند
 *  ۲) upload/.runtime/boot-secrets.json — upload/ هرگز پاک نشد (طرح PN-011)
 *  ۳) env.escrow.enc — رمزنگاری‌شده با کلید مشتق از کد مستر (scrypt) — در گیت/آینه؛
 *     فقط نابودی کامل مخزن (و آینه) آن را می‌کشد (مجاز صریح بند راه‌حل ۱/۳ شورای ۰۱۲).
 */
const ESCROW_RELATIVE_PATHS = [
  path.join("db", ".runtime", "boot-secrets.json"),
  path.join("upload", ".runtime", "boot-secrets.json"),
] as const;

const ENC_ESCROW_REL = "env.escrow.enc";
const ENC_META_REL = "env.escrow.meta.json";

function readEscrow(escrowPath: string): EscrowData | null {
  try {
    if (!existsSync(escrowPath)) return null;
    const parsed = JSON.parse(readFileSync(escrowPath, "utf8" as never) as unknown as string) as Record<string, unknown>;
    const out: EscrowData = {};
    for (const k of BOOT_SECRET_KEYS) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim();
    }
    return out;
  } catch {
    return null; // escrow خراب = مثل نبود؛ تولید/خطا طبق قواعد
  }
}

/** رمزگشایی escrow رمزنگاری‌شدهٔ گیت — AES-256-GCM با کلید scrypt(کد مستر)
 *  سازگار با scripts/pn012/escrow-manager.ts (قالب یکسان — iv|tag|ct در base64) */
function readEncryptedEscrow(repoRoot: string): EscrowData | null {
  try {
    const encPath = path.join(repoRoot, ENC_ESCROW_REL);
    const metaPath = path.join(repoRoot, ENC_META_REL);
    if (!existsSync(encPath) || !existsSync(metaPath)) return null;
    const masterCode = (process.env.MASTER_ACCESS_CODE ?? "").trim();
    if (!masterCode) return null; // بدون کد مستر، رمزگشایی ممکن نیست
    const meta = JSON.parse(readFileSync(metaPath, "utf8") as unknown as string) as {
      saltB64?: string;
      kdf?: { N?: number; r?: number; p?: number };
    };
    if (!meta.saltB64) return null;
    const kdf = meta.kdf ?? { N: 32768, r: 8, p: 1 };
    const { createDecipheriv, scryptSync } = require("node:crypto") as typeof import("node:crypto");
    const salt = Buffer.from(meta.saltB64, "base64");
    const key = scryptSync(masterCode, salt, 32, {
      N: kdf.N ?? 32768, r: kdf.r ?? 8, p: kdf.p ?? 1, maxmem: 128 * 1024 * 1024,
    });
    const blob = Buffer.from(
      (readFileSync(encPath, "utf8") as unknown as string).trim(),
      "base64"
    );
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(pt) as Record<string, unknown>;
    const out: EscrowData = {};
    for (const k of BOOT_SECRET_KEYS) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim().length > 0) out[k] = v.trim();
    }
    return out;
  } catch {
    return null; // GCM auth fail = کد مستر متفاوت یا دستکاری — مثل نبود
  }
}

/** نوشتن اتمیک escrow — tmp + rename + 0600 (عین PN-011) */
function writeEscrow(escrowPath: string, data: EscrowData, note: string): void {
  const dir = path.dirname(escrowPath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${escrowPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ _note: note, updatedAt: new Date().toISOString(), ...data }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // فایل‌سیستم بدون chmod — غیرمهلک
  }
  renameSync(tmp, escrowPath);
}

/** PN-012-B — نوشتن همزمان در هر سه مکان (triple-redundant) + رمزنگاری‌شدهٔ گیت */
function writeAllEscrows(repoRoot: string, data: EscrowData): void {
  const notes = [
    "PN-012 escrow v1 — db/.runtime (پایدارترین محل: db/ در ۶ بحران زنده ماند)",
    "PN-011/012 escrow v1 — upload/.runtime (زنده در همهٔ بحران‌ها)",
  ];
  ESCROW_RELATIVE_PATHS.forEach((rel, i) => {
    try {
      writeEscrow(path.join(repoRoot, rel), data, notes[i] ?? "PN-012 escrow");
    } catch {
      // نوشتن در یک مکان نباید بقیه را متوقف کند
    }
  });
  // نسخهٔ رمزنگاری‌شدهٔ گیت — فقط اگر کد مستر در دسترس است
  try {
    const masterCode = (process.env.MASTER_ACCESS_CODE ?? "").trim();
    const tokenKey = data.MELK_TOKEN_KEY;
    if (masterCode && tokenKey) {
      const { randomBytes, scryptSync, createCipheriv, createHash } = require("node:crypto") as typeof import("node:crypto");
      const salt = randomBytes(16);
      const key = scryptSync(masterCode, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(JSON.stringify(data, null, 2), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      writeFileSync(
        path.join(repoRoot, ENC_ESCROW_REL),
        Buffer.concat([iv, tag, ct]).toString("base64") + "\n",
        { encoding: "utf8" }
      );
      writeFileSync(
        path.join(repoRoot, ENC_META_REL),
        JSON.stringify(
          {
            version: 2,
            doc: "PN-012-B — escrow رمزنگاری‌شدهٔ راز بوت برای مخزن گیت/آینه (سازگار با scripts/pn012/escrow-manager.ts).",
            kdf: { name: "scrypt", N: 32768, r: 8, p: 1 },
            cipher: "aes-256-gcm",
            saltB64: salt.toString("base64"),
            keyFp16: createHash("sha256").update(tokenKey).digest("hex").slice(0, 16),
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        ) + "\n",
        { encoding: "utf8" }
      );
    }
  } catch {
    // رمزنگاری اختیاری است — شکستش نباید بوت را متوقف کند
  }
}

/** env.platform.json ریشه — فقط کلیدهای غایب را merge می‌کند (سایر کلیدها دست‌نخورده)
 *  PN-011: DATABASE_URL (غیرراز) نیز از env همگام می‌شود — سنتِ قدیمی
 *  «فقط مقادیر تستی» جایگزین شد: این فایل اکنون کاشِ بادوامِ بوت است که از
 *  escrow بازسازی می‌شود (gitignored + 0600 — هرگز در git/بستهٔ بقا). */
function regenerateEnvPlatform(repoRoot: string, secrets: EscrowData, databaseUrl?: string): boolean {
  const envPlatformPath = path.join(repoRoot, "env.platform.json");
  let existing: Record<string, unknown> = {};
  let hadFile = false;
  if (existsSync(envPlatformPath)) {
    hadFile = true;
    try {
      existing = JSON.parse(readFileSync(envPlatformPath, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {}; // فایل خراب — بازسازی کامل مجاز است
    }
  }
  let changed = false;
  for (const [k, v] of Object.entries(secrets)) {
    const cur = existing[k];
    if (typeof cur !== "string" || cur.trim() !== v) {
      existing[k] = v;
      changed = true;
    }
  }
  // PN-011 — DATABASE_URL از env واقعی (اگر هست) همگام می‌شود
  if (databaseUrl && (typeof existing.DATABASE_URL !== "string" || (existing.DATABASE_URL as string).trim() !== databaseUrl)) {
    existing.DATABASE_URL = databaseUrl;
    changed = true;
  }
  if (!hadFile || changed) {
    if (!hadFile) {
      existing._comment =
        "PN-011: بازسازی/همگام‌شده توسط گارد خوددرمانی راز (upload/.runtime/boot-secrets.json) — gitignored; مقادیر واقعی.";
    }
    const tmp = `${envPlatformPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(existing, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    try {
      chmodSync(tmp, 0o600);
    } catch {
      // غیرمهلک
    }
    renameSync(tmp, envPlatformPath);
    return true;
  }
  return false;
}

/**
 * گارد خوددرمانی رازهای بوت — نقطهٔ فراخوانی یگانه:
 *   instrumentation.register() ← applyPlatformEnvFallbacks() ← ensureBootSecrets()
 *   ← assertProductionSecrets()
 * idempotent است و هرگز مقدار env موجود را بازنویسی نمی‌کند.
 */
export async function ensureBootSecrets(opts?: {
  repoRoot?: string;
}): Promise<BootSecretsReport> {
  const repoRoot = resolveRepoRoot(opts?.repoRoot);
  const escrowPath = path.join(repoRoot, "upload", ".runtime", "boot-secrets.json");
  const report: BootSecretsReport = {
    repoRoot,
    escrowPath,
    envPlatformRegenerated: false,
    actions: [],
    errors: [],
  };

  // PN-012-B — زنجیرهٔ سه‌مکانی با ادغام per-key: db → upload → رمزنگاری‌شدهٔ گیت
  // (هر مکان هر کلیدی که دارد را می‌دهد؛ اولویت با مکان پایدارتر — عین منطق
  // تست ۶ PN-011: escrow با تنها یک کلید هم منبع معتبر است)
  const escrow: EscrowData = {};
  let escrowExisted = false;
  for (const rel of ESCROW_RELATIVE_PATHS) {
    const found = readEscrow(path.join(repoRoot, rel));
    if (found) {
      escrowExisted = true;
      for (const [k, v] of Object.entries(found)) if (!escrow[k]) escrow[k] = v;
    }
  }
  const enc = readEncryptedEscrow(repoRoot);
  if (enc) {
    escrowExisted = true;
    for (const [k, v] of Object.entries(enc)) if (!escrow[k]) escrow[k] = v;
  }
  let escrowDirty = false;

  for (const key of BOOT_SECRET_KEYS) {
    const envVal = (process.env[key] ?? "").trim();

    if (envVal.length > 0) {
      // حالت الف/ب: env سالم — escrow را همگام نگه دار
      if (escrow[key] !== envVal) {
        escrow[key] = envVal;
        escrowDirty = true;
        report.actions.push({
          key,
          action: escrowExisted ? "escrow-refreshed" : "escrow-created",
          fingerprint: secretFingerprint(envVal),
        });
      } else {
        report.actions.push({ key, action: "env-kept", fingerprint: secretFingerprint(envVal) });
      }
      continue;
    }

    // env غایب — لایهٔ ۲: بازیابی از escrow
    const escrowVal = escrow[key];
    if (escrowVal && escrowVal.trim().length > 0) {
      process.env[key] = escrowVal.trim();
      report.actions.push({
        key,
        action: "restored-from-escrow",
        fingerprint: secretFingerprint(escrowVal.trim()),
      });
      continue;
    }

    // حالت ج: هر دو غایب — فقط کلید رمزنگاری قابل تولید مجدد است
    if (key === "MELK_TOKEN_KEY") {
      const fresh = randomBytes(32).toString("hex");
      process.env[key] = fresh;
      escrow[key] = fresh;
      escrowDirty = true;
      report.actions.push({ key, action: "generated", fingerprint: secretFingerprint(fresh) });
      continue;
    }

    // MASTER_ACCESS_CODE / OWNER_PERSONNEL_CODES: تولید تصادفی ممنوع —
    // fail-fast با پیام راهنما در assertProductionSecrets برقرار می‌ماند.
    report.actions.push({ key, action: "env-kept" });
  }

  // PN-012-B — هرگونه خوددرمانی (بازیابی/تولید) یا کثیفی → هر سه مکان تازه
  // می‌شوند: بازیابی از یک مکان باید مکان‌های دیگر را نیز همگام کند (triple)
  const anyHeal = report.actions.some(
    (a) => a.action === "restored-from-escrow" || a.action === "generated",
  );
  if (escrowDirty || !escrowExisted || anyHeal) {
    try {
      writeAllEscrows(repoRoot, escrow);
    } catch (e) {
      report.errors.push(`escrow write failed: ${(e as Error).message}`);
    }
  }

  // لایهٔ ۳: env.platform.json ریشه — بازسازی/همگام‌سازی از رازهای سالم + DATABASE_URL
  try {
    const healthy: EscrowData = {};
    for (const k of BOOT_SECRET_KEYS) {
      const v = (process.env[k] ?? "").trim();
      if (v.length > 0) healthy[k] = v;
    }
    if (Object.keys(healthy).length > 0) {
      report.envPlatformRegenerated = regenerateEnvPlatform(
        repoRoot,
        healthy,
        (process.env.DATABASE_URL ?? "").trim() || undefined
      );
    }
  } catch (e) {
    report.errors.push(`env.platform.json regen failed: ${(e as Error).message}`);
  }

  return report;
}

/** فقط برای تست‌ها — پاک‌سازی اثر انگشت فایل (بدون لمس محتوا) */
export function escrowExists(repoRoot: string): boolean {
  try {
    return statSync(path.join(repoRoot, "upload", ".runtime", "boot-secrets.json")).isFile();
  } catch {
    return false;
  }
}
