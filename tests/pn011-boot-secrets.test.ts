/**
 * PN-011 اولاً — تست‌های گارد خوددرمانی رازهای بوت (boot-secrets)
 * ----------------------------------------------------------------
 * مصوبهٔ مالک پس از پنجمین بازنشانی محیط: «این مشکل با تکرار مجدد را به هر
 * طریق ممکن برای همیشه رفع گردد».
 *
 * سنجه‌ها (هر تست با repoRoot ایزوله در tmp — هرگز escrow واقعی لمس نمی‌شود):
 *   ۱) بازیابی MELK_TOKEN_KEY از escrow وقتی env غایب است
 *   ۲) env سالم هرگز بازنویسی نمی‌شود (اولویت مطلق env)
 *   ۳) env سالم ← escrow تازه‌سازی می‌شود
 *   ۴) فقدان کامل ← MELK_TOKEN_KEY تولید + ثبت در escrow
 *   ۵) MASTER_ACCESS_CODE در فقدان کامل تولید نمی‌شود (fail-fast می‌ماند)
 *   ۶) OWNER_PERSONNEL_CODES نیز از escrow بازیابی می‌شود
 *   ۷) env.platform.json در صورت نبود بازسازی و در صورت وجود فقط merge می‌شود
 *   ۸) اثر انگشت هرگز خودِ راز نیست + idempotency (اجرای دوم بدون تغییر)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureBootSecrets,
  secretFingerprint,
  escrowExists,
  resolveRepoRoot,
} from "../src/lib/auth/boot-secrets";

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pn011-boot-"));
  // نشانهٔ ریشهٔ کامل (درس زندهٔ standalone): package.json + db/custom.db
  mkdirSync(path.join(root, "upload"), { recursive: true });
  mkdirSync(path.join(root, "db"), { recursive: true });
  writeFileSync(path.join(root, "db", "custom.db"), "test-db");
  writeFileSync(path.join(root, "package.json"), "{}\n");
  return root;
}

/** سناریوی زندهٔ PN-011 (دو مرحله): کاندید standalone-مانند — file-tracing
 * خودِ Next حتی package.json + src + .git + start.sh را داخل standalone کپی
 * می‌کند؛ اما هرگز db/custom.db (در excludes) و نه .env.local */
function makeStandaloneLikeDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "pn011-standalone-"));
  mkdirSync(path.join(root, "upload"), { recursive: true });
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, ".git"), { recursive: true });
  writeFileSync(path.join(root, "start.sh"), "echo decoy");
  writeFileSync(path.join(root, "package.json"), "{}\n");
  return root;
}

const ENV_KEYS = ["MELK_TOKEN_KEY", "MASTER_ACCESS_CODE", "OWNER_PERSONNEL_CODES"] as const;
let saved: Record<string, string | undefined> = {};
let savedRepoDir: string | undefined;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  savedRepoDir = process.env.MELKA_REPO_DIR;
  delete process.env.MELKA_REPO_DIR;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (savedRepoDir === undefined) delete process.env.MELKA_REPO_DIR;
  else process.env.MELKA_REPO_DIR = savedRepoDir;
});

describe("PN-011 boot-secrets — خوددرمانی رازهای بوت", () => {
  test("۱) MELK_TOKEN_KEY غایب در env از escrow بازیابی می‌شود", async () => {
    const root = makeRepo();
    try {
      const escrowPath = path.join(root, "upload", ".runtime", "boot-secrets.json");
      mkdirSync(path.dirname(escrowPath), { recursive: true });
      writeFileSync(
        escrowPath,
        JSON.stringify({ MELK_TOKEN_KEY: "aa".repeat(32), MASTER_ACCESS_CODE: "12345678" })
      );

      const report = await ensureBootSecrets({ repoRoot: root });

      expect(process.env.MELK_TOKEN_KEY ?? "").toBe("aa".repeat(32));
      expect(process.env.MASTER_ACCESS_CODE ?? "").toBe("12345678");
      const restored = report.actions.filter((a) => a.action === "restored-from-escrow");
      expect(restored.length).toBeGreaterThanOrEqual(2);
      // راز خام هرگز در گزارش نیست — فقط اثر انگشت
      expect(JSON.stringify(report.actions)).not.toContain("aa".repeat(32));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۲) env سالم هرگز بازنویسی نمی‌شود (اولویت مطلق env)", async () => {
    const root = makeRepo();
    try {
      process.env.MELK_TOKEN_KEY = "bb".repeat(32);
      const escrowPath = path.join(root, "upload", ".runtime", "boot-secrets.json");
      mkdirSync(path.dirname(escrowPath), { recursive: true });
      writeFileSync(escrowPath, JSON.stringify({ MELK_TOKEN_KEY: "cc".repeat(32) }));

      await ensureBootSecrets({ repoRoot: root });

      expect(process.env.MELK_TOKEN_KEY ?? "").toBe("bb".repeat(32)); // env برنده
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۳) env سالم ← escrow با مقدار تازه همگام می‌شود", async () => {
    const root = makeRepo();
    try {
      process.env.MELK_TOKEN_KEY = "dd".repeat(32);
      const escrowPath = path.join(root, "upload", ".runtime", "boot-secrets.json");

      await ensureBootSecrets({ repoRoot: root });

      expect(escrowExists(root)).toBe(true);
      const escrow = JSON.parse(readFileSync(escrowPath, "utf8"));
      expect(escrow.MELK_TOKEN_KEY).toBe("dd".repeat(32));
      expect(escrow.MASTER_ACCESS_CODE).toBeUndefined(); // نه در env بود نه در escrow
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۴) فقدان کامل ← MELK_TOKEN_KEY تازه تولید و در escrow ثبت می‌شود", async () => {
    const root = makeRepo();
    try {
      const escrowPath = path.join(root, "upload", ".runtime", "boot-secrets.json");
      process.env.MASTER_ACCESS_CODE = "80211186";

      const report = await ensureBootSecrets({ repoRoot: root });

      const key = process.env.MELK_TOKEN_KEY ?? "";
      expect(key).toMatch(/^[0-9a-f]{64}$/); // 32 بایت hex
      const escrow = JSON.parse(readFileSync(escrowPath, "utf8"));
      expect(escrow.MELK_TOKEN_KEY).toBe(key);
      const generated = report.actions.find((a) => a.action === "generated");
      expect(generated?.key).toBe("MELK_TOKEN_KEY");
      // ۶۴ کاراکتر هگزیدسیمال معتبر
      expect(key).not.toContain(" ");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۵) MASTER_ACCESS_CODE در فقدان کامل تولید تصادفی نمی‌شود", async () => {
    const root = makeRepo();
    try {
      const report = await ensureBootSecrets({ repoRoot: root });

      expect(process.env.MASTER_ACCESS_CODE ?? "").toBe("");
      const generated = report.actions.find(
        (a) => a.key === "MASTER_ACCESS_CODE" && a.action === "generated"
      );
      expect(generated).toBeUndefined(); // fail-fast این کلید باقی می‌ماند
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۶) OWNER_PERSONNEL_CODES از escrow بازیابی می‌شود", async () => {
    const root = makeRepo();
    try {
      const escrowPath = path.join(root, "upload", ".runtime", "boot-secrets.json");
      mkdirSync(path.dirname(escrowPath), { recursive: true });
      writeFileSync(escrowPath, JSON.stringify({ OWNER_PERSONNEL_CODES: "410031320" }));

      await ensureBootSecrets({ repoRoot: root });

      expect(process.env.OWNER_PERSONNEL_CODES).toBe("410031320");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۷) env.platform.json در نبود بازسازی و در وجود فقط merge می‌شود", async () => {
    const root = makeRepo();
    try {
      // حالت نبود — بازسازی
      process.env.MELK_TOKEN_KEY = "ee".repeat(32);
      let report = await ensureBootSecrets({ repoRoot: root });
      expect(report.envPlatformRegenerated).toBe(true);
      const envPlatform = JSON.parse(readFileSync(path.join(root, "env.platform.json"), "utf8"));
      expect(envPlatform.MELK_TOKEN_KEY).toBe("ee".repeat(32));

      // حالت وجود — کلید نامرتبط دست نمی‌خورد، کلید تازه merge می‌شود
      delete process.env.MELK_TOKEN_KEY;
      process.env.MASTER_ACCESS_CODE = "99887766";
      report = await ensureBootSecrets({ repoRoot: root });
      const envPlatform2 = JSON.parse(readFileSync(path.join(root, "env.platform.json"), "utf8"));
      expect(envPlatform2.MELK_TOKEN_KEY).toBe("ee".repeat(32)); // از escrow ماندگار
      expect(envPlatform2.MASTER_ACCESS_CODE).toBe("99887766"); // merge تازه
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۸) idempotency — اجرای دوم بدون تغییر state + اثر انگشت امن", async () => {
    const root = makeRepo();
    try {
      process.env.MELK_TOKEN_KEY = "ff".repeat(32);
      await ensureBootSecrets({ repoRoot: root });
      delete process.env.MELK_TOKEN_KEY;

      const r2 = await ensureBootSecrets({ repoRoot: root });
      expect(r2.envPlatformRegenerated).toBe(false); // همگام — بدون بازنویسی
      expect(process.env.MELK_TOKEN_KEY ?? "").toBe("ff".repeat(32)); // از escrow

      const fp = secretFingerprint("ff".repeat(32));
      expect(fp).toMatch(/^[0-9a-f]{10}$/);
      expect(fp).not.toContain("ff");
      expect(fp.length).toBe(10);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۹) resolveRepoRoot — کاندیدها و MELKA_REPO_DIR محترم‌اند", () => {
    const root = makeRepo();
    try {
      process.env.MELKA_REPO_DIR = root;
      expect(resolveRepoRoot()).toBe(path.resolve(root));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("۱۰) درس زندهٔ standalone — file-tracing کل مخزن را کپی می‌کند؛ نشانگر ساختاری تضمینی لازم است", () => {
    const standalone = makeStandaloneLikeDir();
    const root = makeRepo();
    try {
      // cwd داخل ساختار standalone-مانند (با src/.git/start.sh): نباید ریشه پذیرفته شود
      const savedCwd = process.cwd();
      process.chdir(standalone);
      try {
        const resolved = resolveRepoRoot();
        expect(resolved).not.toBe(path.resolve(standalone));
      } finally {
        process.chdir(savedCwd);
      }
      // با MELKA_REPO_DIR صریح (الگوی نگهبان تولید) — تعیینی
      process.env.MELKA_REPO_DIR = root;
      expect(resolveRepoRoot()).toBe(path.resolve(root));
    } finally {
      delete process.env.MELKA_REPO_DIR;
      rmSync(standalone, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});
