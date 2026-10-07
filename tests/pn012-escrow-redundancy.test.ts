/**
 * PN-012 BLOCK 3 — تست‌های افزونگی Escrow (سه‌مکانی + رمزنگاری‌شدهٔ گیت)
 * ------------------------------------------------------------------------
 * بند ۳.۳ دستور: «فقدان نسخهٔ ۱ → نسخهٔ ۲ بازیابی کند» — گسترش یافته به سه لایه:
 *   v1-a: db/.runtime/boot-secrets.json  (پایدارترین — زنده در ۶ بحران)
 *   v1-b: upload/.runtime/boot-secrets.json (طرح PN-011)
 *   v2:   env.escrow.enc (رمزنگاری‌شدهٔ گیت — scrypt کد مستر · AES-256-GCM)
 * + env.platform.json (لایهٔ بارگذاری) + تولید تازه در فقدان کامل (PN-011)
 *
 * سنجه‌ها (۱۰ تست — هر کدام با repoRoot ایزوله در tmp):
 *   ۱) فقدان upload → بازیابی از db
 *   ۲) فقدان db → بازیابی از upload
 *   ۳) فقدان هر دو متنی → بازیابی از env.escrow.enc (رمزگشایی با کد مستر)
 *   ۴) فقدان «همه‌چیز» → تولید MELK_TOKEN_KEY تازه (رفتار PN-011 حفظ شد)
 *   ۵) env سالم → هر سه مکان escrow تازه می‌شوند (write-back)
 *   ۶) سازگاری قالب با scripts/pn012/escrow-manager.ts (همان فایل‌ها)
 *   ۷) کد مستر نادرست → رمزگشایی GCM شکست می‌خورد (جامعیت رمز)
 *   ۸) اولویت: db بر upload (وقتی هر دو کلید متفاوت دارند)
 *   ۹) env.platform.json از escrow بازسازی می‌شود
 *   ۱۰) escrow با تنها یک کلید هم منبع معتبر است (ادغام per-key)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { ensureBootSecrets, secretFingerprint } from "../src/lib/auth/boot-secrets";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const MASTER = "12345678";

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pn012-escrow-"));
  mkdirSync(path.join(root, "upload"), { recursive: true });
  mkdirSync(path.join(root, "db"), { recursive: true });
  writeFileSync(path.join(root, "db", "custom.db"), "test-db");
  writeFileSync(path.join(root, "package.json"), "{}\n");
  return root;
}

function writeEscrow(root: string, rel: string, data: Record<string, string>): void {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ _note: "test", updatedAt: new Date().toISOString(), ...data }));
}

/** ساخت env.escrow.enc سازگار با escrow-manager/boot-secrets (iv|tag|ct → base64) */
function writeEncryptedEscrow(root: string, data: Record<string, string>, masterCode: string): void {
  const salt = randomBytes(16);
  const key = scryptSync(masterCode, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(path.join(root, "env.escrow.enc"), Buffer.concat([iv, tag, ct]).toString("base64") + "\n");
  writeFileSync(
    path.join(root, "env.escrow.meta.json"),
    JSON.stringify({
      version: 2,
      kdf: { name: "scrypt", N: 32768, r: 8, p: 1 },
      cipher: "aes-256-gcm",
      saltB64: salt.toString("base64"),
      keyFp16: createHash("sha256").update(data.MELK_TOKEN_KEY ?? "").digest("hex").slice(0, 16),
      updatedAt: new Date().toISOString(),
    }),
  );
}

const cleanEnv = () => {
  delete process.env.MELK_TOKEN_KEY;
  delete process.env.MASTER_ACCESS_CODE;
  delete process.env.OWNER_PERSONNEL_CODES;
};

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {
    MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY,
    MASTER_ACCESS_CODE: process.env.MASTER_ACCESS_CODE,
    OWNER_PERSONNEL_CODES: process.env.OWNER_PERSONNEL_CODES,
  };
  cleanEnv();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete (process.env as Record<string, unknown>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
});

describe("PN-012 BLOCK 3 — افزونگی Escrow (بند ۳.۳)", () => {
  test("۳-ا-۱ فقدان upload → بازیابی از db/.runtime (پایدارترین محل)", async () => {
    const root = makeRepo();
    try {
      writeEscrow(root, path.join("db", ".runtime", "boot-secrets.json"), { MELK_TOKEN_KEY: KEY_A, MASTER_ACCESS_CODE: MASTER });
      const report = await ensureBootSecrets({ repoRoot: root });
      expect(process.env.MELK_TOKEN_KEY).toBe(KEY_A);
      const healed = report.actions.filter((a) => a.action === "restored-from-escrow");
      expect(healed.length).toBeGreaterThan(0);
      // بازنویسی: upload هم دوباره زنده می‌شود (triple write-back)
      expect(existsSync(path.join(root, "upload", ".runtime", "boot-secrets.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۲ فقدان db → بازیابی از upload (طرح PN-011 همچنان کار می‌کند)", async () => {
    const root = makeRepo();
    try {
      writeEscrow(root, path.join("upload", ".runtime", "boot-secrets.json"), { MELK_TOKEN_KEY: KEY_A });
      await ensureBootSecrets({ repoRoot: root });
      expect(process.env.MELK_TOKEN_KEY).toBe(KEY_A);
      // db مکان تازه هم ساخته می‌شود
      expect(existsSync(path.join(root, "db", ".runtime", "boot-secrets.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۳ فقدان هر دو متنی → بازیابی از env.escrow.enc (رمزگشایی با کد مستر)", async () => {
    const root = makeRepo();
    try {
      writeEncryptedEscrow(root, { MELK_TOKEN_KEY: KEY_B }, MASTER);
      process.env.MASTER_ACCESS_CODE = MASTER; // پلتفرم کد مستر را در .env.local حفظ می‌کند
      await ensureBootSecrets({ repoRoot: root });
      expect(process.env.MELK_TOKEN_KEY).toBe(KEY_B);
      // هر دو مکان متنی دوباره زنده شدند
      expect(existsSync(path.join(root, "db", ".runtime", "boot-secrets.json"))).toBe(true);
      expect(existsSync(path.join(root, "upload", ".runtime", "boot-secrets.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۴ فقدان کامل → MELK_TOKEN_KEY تازه تولید و در هر سه مکان ثبت می‌شود (رفتار PN-011)", async () => {
    const root = makeRepo();
    try {
      const report = await ensureBootSecrets({ repoRoot: root });
      const generated = report.actions.find((a) => a.key === "MELK_TOKEN_KEY" && a.action === "generated");
      expect(generated).toBeDefined();
      expect(process.env.MELK_TOKEN_KEY).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(path.join(root, "db", ".runtime", "boot-secrets.json"))).toBe(true);
      expect(existsSync(path.join(root, "upload", ".runtime", "boot-secrets.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۵ env سالم → هر سه مکان تازه می‌شوند و مقدار env تغییر نمی‌کند", async () => {
    const root = makeRepo();
    try {
      process.env.MELK_TOKEN_KEY = KEY_A;
      process.env.MASTER_ACCESS_CODE = MASTER;
      const before = secretFingerprint(KEY_A);
      await ensureBootSecrets({ repoRoot: root });
      await ensureBootSecrets({ repoRoot: root }); // idempotent
      expect(secretFingerprint(process.env.MELK_TOKEN_KEY!)).toBe(before);
      const dbEscrow = JSON.parse(readFileSync(path.join(root, "db", ".runtime", "boot-secrets.json"), "utf8"));
      const upEscrow = JSON.parse(readFileSync(path.join(root, "upload", ".runtime", "boot-secrets.json"), "utf8"));
      expect(dbEscrow.MELK_TOKEN_KEY).toBe(KEY_A);
      expect(upEscrow.MELK_TOKEN_KEY).toBe(KEY_A);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۶ سازگاری قالب با escrow-manager.ts — فایل رمزنگاری‌شدهٔ بوت درونی با CLI یکی است", async () => {
    const root = makeRepo();
    try {
      // بوت درونی می‌نویسد…
      process.env.MELK_TOKEN_KEY = KEY_A;
      process.env.MASTER_ACCESS_CODE = MASTER;
      await ensureBootSecrets({ repoRoot: root });
      // …و CLI باید همان قالب را بخواند (شاهد: فایل meta با kdf/saltB64)
      const meta = JSON.parse(readFileSync(path.join(root, "env.escrow.meta.json"), "utf8"));
      expect(meta.kdf.name).toBe("scrypt");
      expect(meta.kdf.N).toBe(32768);
      expect(typeof meta.saltB64).toBe("string");
      expect(meta.keyFp16).toBe(createHash("sha256").update(KEY_A).digest("hex").slice(0, 16));
      // و رمزگشایی دستی موفق (همان الگوریتم CLI):
      delete process.env.MELK_TOKEN_KEY;
      const enc = Buffer.from(readFileSync(path.join(root, "env.escrow.enc"), "utf8").trim(), "base64");
      const salt = Buffer.from(meta.saltB64, "base64");
      const key = scryptSync(MASTER, salt, 32, { N: meta.kdf.N, r: meta.kdf.r, p: meta.kdf.p, maxmem: 128 * 1024 * 1024 });
      const { createDecipheriv } = await import("node:crypto");
      const dec = createDecipheriv("aes-256-gcm", key, enc.subarray(0, 12));
      dec.setAuthTag(enc.subarray(12, 28));
      const pt = JSON.parse(Buffer.concat([dec.update(enc.subarray(28)), dec.final()]).toString("utf8"));
      expect(pt.MELK_TOKEN_KEY).toBe(KEY_A);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۷ کد مستر نادرست → رمزگشایی شکست (جامعیت GCM) → تولید تازه، نه افشا", async () => {
    const root = makeRepo();
    try {
      writeEncryptedEscrow(root, { MELK_TOKEN_KEY: KEY_B }, MASTER);
      process.env.MASTER_ACCESS_CODE = "99999999"; // کد مستر دیگری
      const report = await ensureBootSecrets({ repoRoot: root });
      // رمزگشایی ناموفق → تولید تازه (کلید قبلی به دست نمی‌آید — درست)
      expect(process.env.MELK_TOKEN_KEY).not.toBe(KEY_B);
      const generated = report.actions.find((a) => a.key === "MELK_TOKEN_KEY" && a.action === "generated");
      expect(generated).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۸ اولویت per-key: db بر upload مقدم است (مقادیر متفاوت)", async () => {
    const root = makeRepo();
    try {
      writeEscrow(root, path.join("db", ".runtime", "boot-secrets.json"), { MELK_TOKEN_KEY: KEY_A });
      writeEscrow(root, path.join("upload", ".runtime", "boot-secrets.json"), { MELK_TOKEN_KEY: KEY_B, OWNER_PERSONNEL_CODES: "410031320" });
      await ensureBootSecrets({ repoRoot: root });
      expect(process.env.MELK_TOKEN_KEY).toBe(KEY_A); // db برنده
      // و کلید مفقود از upload هم ادغام می‌شود (per-key merge)
      expect(process.env.OWNER_PERSONNEL_CODES).toBe("410031320");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۹ env.platform.json از escrow بازسازی می‌شود (لایهٔ بارگذاری)", async () => {
    const root = makeRepo();
    try {
      writeEscrow(root, path.join("db", ".runtime", "boot-secrets.json"), { MELK_TOKEN_KEY: KEY_A, MASTER_ACCESS_CODE: MASTER });
      const report = await ensureBootSecrets({ repoRoot: root });
      expect(report.envPlatformRegenerated).toBe(true);
      const envPlatform = JSON.parse(readFileSync(path.join(root, "env.platform.json"), "utf8"));
      expect(envPlatform.MELK_TOKEN_KEY).toBe(KEY_A);
      expect(envPlatform.MASTER_ACCESS_CODE).toBe(MASTER);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳-ا-۱۰ escrow با تنها یک کلید هم منبع معتبر است (درس تست ۶ PN-011)", async () => {
    const root = makeRepo();
    try {
      writeEscrow(root, path.join("db", ".runtime", "boot-secrets.json"), { OWNER_PERSONNEL_CODES: "410031320" });
      await ensureBootSecrets({ repoRoot: root });
      expect(process.env.OWNER_PERSONNEL_CODES).toBe("410031320");
      // MELK_TOKEN_KEY غایب و منبعی ندارد → تولید (نه خطا)
      expect(process.env.MELK_TOKEN_KEY).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
