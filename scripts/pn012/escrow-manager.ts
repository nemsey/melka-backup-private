/**
 * PN-012-B — مدیر Escrow راز بوت (سه‌لایهٔ سه‌مکانی)
 * ------------------------------------------------------
 * سند: ملکا-شورا-ن۰۱۲-۱۴۰۵ (بخش ۶ · راه‌حل ۱ + راه‌حل ۳ triple-redundant)
 *
 * مسئلهٔ ریشه‌ای (تشخیص بحران ششم — diagnosis.json):
 *   پلتفرم در هر بازنشانی محیط، ‎.env.local‎ را به قالب ۳-کلیدی بازنویسی می‌کند
 *   (MELK_TOKEN_KEY حذف می‌شود)، ‎env.platform.json‎ و ‎backups/‎ را کامل پاک می‌کند.
 *   نتیجه: fail-fast امنیتی PN-008 → 500 عمومی. بحران‌های ۴ و ۵ و ۶ همه همین ریشه دارند.
 *
 * راه‌حل — سه مکان ذخیرهٔ escrow با سه سطح بقای متفاوت:
 *   ۱) db/.runtime/boot-secrets.json      — plaintext، gitignored؛ db/ در هر ۶ بحران زنده ماند
 *   ۲) upload/.runtime/boot-secrets.json   — plaintext، gitignored؛ upload/ هرگز پاک نشد
 *   ۳) env.escrow.enc + env.escrow.meta.json — رمزنگاری‌شده، در گیت/آینه GitHub؛
 *      فقط نابودی کامل مخزن آن را می‌کشد. کلید = scrypt(کد مستر, salt) → AES-256-GCM
 *      (مجاز به‌صراحت: بند راه‌حل ۱ شورا — «سند env در مخزن GitHub رمزنگاری‌شده با
 *      کلید مشتق از کد مستر»؛ راز plaintext هرگز وارد گیت نمی‌شود — درس PN-007)
 *
 * زنجیرهٔ بازیابی (restore):
 *   ‎.env.local‎ دارد؟ → ensure/write-back
 *   → db escrow → upload escrow → env.escrow.enc (با کد مسترِ موجود در ‎.env.local‎)
 *   → هیچ‌کدام؟ خروجی BLOCKED و fail-fast امنیتی سرور به‌درستی می‌ماند.
 *
 * فراخوانی در بوت (ضد تکرار بحران):
 *   - scripts/pn006/dev-entry.sh  (مسیر بوت پلتفرم: bun run dev)
 *   - scripts/prod-watchdog.sh    (قبل از هر اسپاون سرور — پوشش هر ری‌استارت/ریست)
 *   - start.sh                    (بوت رسمی)
 *
 * قیدها: صفر وابستگی به node_modules (فقط node:*) · idempotent · هرگز مقدار
 * موجود در ‎.env.local‎ را بازنویسی نمی‌کند (اولویت مطلق env واقعی) · صفر خروجی راز.
 *
 * اجرا: bun scripts/pn012/escrow-manager.ts <restore|ensure|encrypt|status|verify>
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

const PATHS = {
  envLocal: path.join(ROOT, ".env.local"),
  envPlatform: path.join(ROOT, "env.platform.json"),
  escrowDb: path.join(ROOT, "db", ".runtime", "boot-secrets.json"),
  escrowUpload: path.join(ROOT, "upload", ".runtime", "boot-secrets.json"),
  encEscrow: path.join(ROOT, "env.escrow.enc"),
  encMeta: path.join(ROOT, "env.escrow.meta.json"),
} as const;

/** فیلدهای رازِ بوت‌حیاتی که escrow حمل می‌کند */
const SECRET_FIELDS = ["MELK_TOKEN_KEY", "MASTER_ACCESS_CODE", "OWNER_PERSONNEL_CODES", "MELK_SYNC_MODE"] as const;

/** پارامترهای KDF — scrypt سختِ حافظه (هر تلاش بروت‌فورس ~۱۰۰ms و پرهزینهٔ RAM) */
const KDF = { N: 32768, r: 8, p: 1 } as const;

type Secrets = Partial<Record<(typeof SECRET_FIELDS)[number], string>>;

// ───────────────────────── ابزارهای env ─────────────────────────

function readEnvLocal(): string {
  return existsSync(PATHS.envLocal) ? readFileSync(PATHS.envLocal, "utf8") : "";
}

function envLocalHas(content: string, key: string): boolean {
  return new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(content);
}

function envLocalGet(content: string, key: string): string | undefined {
  const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/** افزودن «فقط کلید غایب» به .env.local — هرگز بازنویسی نمی‌کند (اولویت env واقعی) */
function envLocalSetMissing(key: string, value: string): boolean {
  let content = readEnvLocal();
  if (envLocalHas(content, key)) return false;
  content = content.trimEnd() + (content.trim() ? "\n" : "") + `${key}=${value}\n`;
  writeFileSync(PATHS.envLocal, content, "utf8");
  chmodSync(PATHS.envLocal, 0o600);
  return true;
}

// ───────────────────────── ابزارهای escrow ─────────────────────────

function readEscrowFile(p: string): Secrets | null {
  try {
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const out: Secrets = {};
    for (const f of SECRET_FIELDS) if (typeof raw[f] === "string" && raw[f]) out[f] = raw[f];
    return Object.keys(out).length > 0 && out.MELK_TOKEN_KEY ? out : null;
  } catch {
    return null;
  }
}

function writeEscrowFile(p: string, secrets: Secrets, note: string): void {
  mkdirSync(path.dirname(p), { recursive: true });
  const body = {
    ...secrets,
    _note: note,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(body, null, 2) + "\n", "utf8");
  try { chmodSync(p, 0o600); } catch { /* کانتینر ممکن است chmod خاص داشته باشد */ }
}

function fp(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

// ───────────────────────── escrow رمزنگاری‌شده (نسخهٔ ۲ — بقا در گیت) ─────────────────────────

function deriveKey(masterCode: string, salt: Buffer): Buffer {
  return scryptSync(masterCode, salt, 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 128 * 1024 * 1024 });
}

/** رمزنگاری اسناد راز با کلید مشتق از کد مستر → env.escrow.enc + env.escrow.meta.json */
function writeEncryptedEscrow(secrets: Secrets, masterCode: string): boolean {
  if (!secrets.MELK_TOKEN_KEY || !masterCode) return false;
  const salt = randomBytes(16);
  const key = deriveKey(masterCode, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(secrets, null, 2);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(PATHS.encEscrow, Buffer.concat([iv, tag, ct]).toString("base64") + "\n", "utf8");
  writeFileSync(
    PATHS.encMeta,
    JSON.stringify(
      {
        version: 2,
        doc: "PN-012-B راه‌حل ۱/۳ — escrow رمزنگاری‌شدهٔ راز بوت برای مخزن گیت/آینه (زنده مانده در نابودی کامل کانتینر).",
        kdf: { name: "scrypt", N: KDF.N, r: KDF.r, p: KDF.p },
        cipher: "aes-256-gcm",
        saltB64: salt.toString("base64"),
        keyFp16: fp(secrets.MELK_TOKEN_KEY),
        updatedAt: new Date().toISOString(),
        _note:
          "رمزگشایی فقط با کد مستر مالک (در .env.local که پلتفرم حفظش می‌کند). salt عمومی است (استاندارد). هرگز خود راز اینجا نیست.",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return true;
}

/** رمزگشایی env.escrow.enc با کد مستر — null یعنی ناموفق (کد اشتباه/فایل خراب) */
function readEncryptedEscrow(masterCode: string): Secrets | null {
  try {
    if (!existsSync(PATHS.encEscrow) || !existsSync(PATHS.encMeta)) return null;
    const meta = JSON.parse(readFileSync(PATHS.encMeta, "utf8"));
    const salt = Buffer.from(String(meta.saltB64), "base64");
    const key = deriveKey(masterCode, salt);
    const blob = Buffer.from(readFileSync(PATHS.encEscrow, "utf8").trim(), "base64");
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ct = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const secrets = JSON.parse(pt) as Secrets;
    return secrets.MELK_TOKEN_KEY ? secrets : null;
  } catch {
    return null; // GCM auth fail = کد مستر متفاوت یا دستکاری
  }
}

// ───────────────────────── بازسازی env.platform.json (لایهٔ ۲) ─────────────────────────

/** env.platform.json فقط کلیدهای غایب را پر می‌کند — بازسازی با کد مسترِ تستی طبق قرارداد تست شش */
function rebuildEnvPlatform(secrets: Secrets): boolean {
  const hasKey = existsSync(PATHS.envPlatform);
  if (hasKey) {
    try {
      const cur = JSON.parse(readFileSync(PATHS.envPlatform, "utf8"));
      if (cur.MELK_TOKEN_KEY) return false; // سالم — دست نمی‌زنیم
    } catch { /* خراب → بازسازی */ }
  }
  writeFileSync(
    PATHS.envPlatform,
    JSON.stringify(
      {
        _comment:
          "بازسازی‌شده توسط PN-012-B escrow-manager — لایهٔ دوم بوت (fallback فقط کلید غایب). MELK_TOKEN_KEY واقعی؛ MASTER_ACCESS_CODE تست عمومی — کد واقعی فقط .env.local + هش AppMeta.",
        MELK_TOKEN_KEY: secrets.MELK_TOKEN_KEY,
        MASTER_ACCESS_CODE: "00000000",
        DATABASE_URL: "file:/home/z/my-project/db/custom.db",
        MELK_SYNC_MODE: secrets.MELK_SYNC_MODE ?? "incremental",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return true;
}

// ───────────────────────── write-back همهٔ مکان‌ها ─────────────────────────

function ensureAllLocations(secrets: Secrets, source: string): string[] {
  const actions: string[] = [];
  if (!writeFileSyncSafe()) { /* noop */ }
  const before = existsSync(PATHS.escrowDb);
  writeEscrowFile(
    PATHS.escrowDb,
    secrets,
    `PN-012 escrow v1 — db/.runtime (پایدارترین محل: db/ در ۶ بحران زنده ماند). منبع فعلی: ${source}`,
  );
  if (!before) actions.push("create:db/.runtime/boot-secrets.json");
  else actions.push("refresh:db/.runtime/boot-secrets.json");

  writeEscrowFile(
    PATHS.escrowUpload,
    secrets,
    `PN-012 escrow v1 — upload/.runtime (زنده در همهٔ بحران‌ها). منبع فعلی: ${source}`,
  );
  actions.push("refresh:upload/.runtime/boot-secrets.json");

  const masterCode = secrets.MASTER_ACCESS_CODE ?? envLocalGet(readEnvLocal(), "MASTER_ACCESS_CODE");
  if (masterCode && secrets.MELK_TOKEN_KEY) {
    if (writeEncryptedEscrow(secrets, masterCode)) actions.push("refresh:env.escrow.enc (رمزنگاری‌شدهٔ گیت)");
  }
  return actions;
}

function writeFileSyncSafe(): boolean {
  return true;
}

// ───────────────────────── فرمان‌ها ─────────────────────────

function cmdRestore(): void {
  const envContent = readEnvLocal();
  const envHasKey = envLocalHas(envContent, "MELK_TOKEN_KEY") && !!envLocalGet(envContent, "MELK_TOKEN_KEY");

  // حالت ۱: .env.local سالم — فقط write-back و تازگی لایه‌ها
  if (envHasKey) {
    const secrets: Secrets = {};
    for (const f of SECRET_FIELDS) {
      const v = envLocalGet(envContent, f);
      if (v) secrets[f] = v;
    }
    const actions = ensureAllLocations(secrets, ".env.local");
    console.log(`[escrow] OK — .env.local کامل؛ ${actions.length} مکان تازه‌سازی شد (${actions.join(" · ")})`);
    return;
  }

  // حالت ۲-۴: بازیابی از زنجیرهٔ escrow
  const chain: Array<[string, Secrets | null]> = [
    ["db/.runtime/boot-secrets.json", readEscrowFile(PATHS.escrowDb)],
    ["upload/.runtime/boot-secrets.json", readEscrowFile(PATHS.escrowUpload)],
  ];
  // حالت ۴: رمزنگاری‌شدهٔ گیت — با کد مستری که پلتفرم در .env.local حفظ می‌کند
  const masterCode = envLocalGet(envContent, "MASTER_ACCESS_CODE");
  const fromEnc = masterCode ? readEncryptedEscrow(masterCode) : null;
  if (fromEnc) chain.push(["env.escrow.enc (رمزگشایی با کد مستر)", fromEnc]);

  for (const [src, secrets] of chain) {
    if (!secrets?.MELK_TOKEN_KEY) continue;
    // فقط کلیدهای غایب را می‌نویسیم — MASTER_ACCESS_CODE موجود پلتفرم دست‌نخورده می‌ماند
    const applied: string[] = [];
    for (const f of SECRET_FIELDS) {
      if (secrets[f] && envLocalSetMissing(f, secrets[f]!)) applied.push(f);
    }
    if (envLocalSetMissing("MELK_TOKEN_KEY", secrets.MELK_TOKEN_KEY) && !applied.includes("MELK_TOKEN_KEY")) {
      applied.push("MELK_TOKEN_KEY");
    }
    // بازسازی لایهٔ دوم
    if (rebuildEnvPlatform(secrets)) applied.push("env.platform.json(rebuild)");
    // write-back به همهٔ مکان‌ها (اگر یکی از لایه‌ها مفقود بود)
    const fresh = readEnvLocal();
    const merged: Secrets = {};
    for (const f of SECRET_FIELDS) {
      const v = envLocalGet(fresh, f) ?? secrets[f];
      if (v) merged[f] = v;
    }
    ensureAllLocations(merged, src);
    console.log(`[escrow] RESTORED — منبع: ${src} · کلیدهای اعمالی: ${applied.join(", ") || "—"} · همهٔ مکان‌ها تازه شد`);
    return;
  }

  // حالت ۵: هیچ منبعی — fail-fast امنیتی به‌درستی می‌ماند (رفتار صحیح SEC-1/SEC-2)
  console.log(
    `[escrow] BLOCKED — هیچ escrow زنده‌ای یافت نشود و .env.local کلید ندارد. fail-fast امنیتی فعال می‌ماند. ` +
      `راهنمای مالک: docs/SECURITY-RECOVERY.md — بازیابی دستی با بستهٔ بقا یا چرخش کلید.`,
  );
}

function cmdStatus(): void {
  const envContent = readEnvLocal();
  const envKey = envLocalGet(envContent, "MELK_TOKEN_KEY");
  const dbE = readEscrowFile(PATHS.escrowDb);
  const upE = readEscrowFile(PATHS.escrowUpload);
  const masterCode = envLocalGet(envContent, "MASTER_ACCESS_CODE");
  const encOk = masterCode ? readEncryptedEscrow(masterCode) : null;
  const report = {
    envLocalHasKey: !!envKey,
    envLocalKeyFp: envKey ? fp(envKey) : null,
    escrowDb: dbE ? { alive: true, keyFp: fp(dbE.MELK_TOKEN_KEY!), mtime: statSync(PATHS.escrowDb).mtime.toISOString() } : { alive: false },
    escrowUpload: upE ? { alive: true, keyFp: fp(upE.MELK_TOKEN_KEY!), mtime: statSync(PATHS.escrowUpload).mtime.toISOString() } : { alive: false },
    escrowEncrypted: {
      filesExist: existsSync(PATHS.encEscrow) && existsSync(PATHS.encMeta),
      decrypts: !!encOk,
      keyFp: encOk ? fp(encOk.MELK_TOKEN_KEY!) : null,
    },
    envPlatformExists: existsSync(PATHS.envPlatform),
    consistent: !!envKey && !!dbE && !!upE && !!encOk && fp(envKey) === fp(dbE.MELK_TOKEN_KEY!) && fp(envKey) === fp(upE.MELK_TOKEN_KEY!) && fp(envKey) === fp(encOk?.MELK_TOKEN_KEY ?? envKey),
    // خروجی شامل خود راز نیست — فقط اثر انگشت ۱۶ نویسه‌ای
  };
  console.log(JSON.stringify(report, null, 2));
}

function cmdVerify(): void {
  const envContent = readEnvLocal();
  const masterCode = envLocalGet(envContent, "MASTER_ACCESS_CODE");
  const secrets = masterCode ? readEncryptedEscrow(masterCode) : null;
  if (!secrets) {
    console.log("[escrow] VERIFY-FAIL — رمزگشایی env.escrow.enc ناموفق (کد مستر متفاوت یا فایل مفقود/خراب)");
    process.exit(1);
  }
  const envKey = envLocalGet(envContent, "MELK_TOKEN_KEY");
  const match = envKey ? fp(envKey) === fp(secrets.MELK_TOKEN_KEY!) : null;
  console.log(`[escrow] VERIFY-OK — رمزگشایی سبز${match === null ? " (بدون مقایسه: .env.local بی‌کلید)" : match ? " · اثر انگشت با .env.local یکسان" : " ⚠ اثر انگشت با .env.local متفاوت (چرخش تازه؟ ensure را اجرا کنید)"}`);
}

function cmdEncrypt(): void {
  const envContent = readEnvLocal();
  const masterCode = envLocalGet(envContent, "MASTER_ACCESS_CODE");
  if (!masterCode) {
    console.log("[escrow] ENCRYPT-FAIL — MASTER_ACCESS_CODE در .env.local نیست");
    process.exit(1);
  }
  const secrets: Secrets = {};
  for (const f of SECRET_FIELDS) {
    const v = envLocalGet(envContent, f);
    if (v) secrets[f] = v;
  }
  if (!secrets.MELK_TOKEN_KEY) {
    console.log("[escrow] ENCRYPT-FAIL — MELK_TOKEN_KEY در .env.local نیست");
    process.exit(1);
  }
  writeEncryptedEscrow(secrets, masterCode);
  console.log(`[escrow] ENCRYPT-OK — env.escrow.enc تازه شد (scrypt N=${KDF.N},r=${KDF.r} · AES-256-GCM · keyFp=${fp(secrets.MELK_TOKEN_KEY)})`);
}

const cmd = process.argv[2] ?? "restore";
switch (cmd) {
  case "restore": cmdRestore(); break;
  case "status": cmdStatus(); break;
  case "verify": cmdVerify(); break;
  case "encrypt": cmdEncrypt(); break;
  default:
    console.error("فرمان نامعتبر — استفاده: bun scripts/pn012/escrow-manager.ts <restore|status|verify|encrypt>");
    process.exit(2);
}
