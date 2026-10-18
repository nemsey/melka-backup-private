// ============================================================
// PN-040 (جلسهٔ ۰۶۶ · گام ۴) — سپر دفاعی گیت‌هاب
// github-supreme-guard.sh + reset-guard→GitHub + /api/version drift
// + قلاب بوت dev-entry + GitHub Action
//
// روش: شبیه‌سازی کامل چرخهٔ بازنشانی در مخزن ساختگی (الگوی PN-015):
//   فیکسچر با origin محلی → برگرداندن درخت/آینه → تشخیص سه‌لایهٔ سپر.
// CRITICAL: MELK_HEAD_GUARD_PORT=3999 (پورت مرده) — لایهٔ سوم (بیلد زنده)
// هرگز سرور واقعی را نباید در تست‌ها کند.
// ============================================================
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = join(import.meta.dir, "..");
const SUPREME = join(REPO, "scripts", "recovery", "github-supreme-guard.sh");
const RESET_GUARD = join(REPO, "scripts", "recovery", "reset-guard.sh");
const DEV_ENTRY = join(REPO, "scripts", "pn006", "dev-entry.sh");
const VERSION_ROUTE = join(REPO, "src", "app", "api", "version", "route.ts");
const ACTION = join(REPO, ".github", "workflows", "github-shield-alert.yml");
const DAEMONIZER = join(REPO, "scripts", "pn040", "daemonize-watchdog.py");

function sh(cwd: string, cmd: string): string {
  const p = spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`"${cmd}" failed: ${p.stderr}`);
  return p.stdout.trim();
}

function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

interface GuardEnv {
  repo: string;
  origin: string;
  skipSnapshot?: boolean;
  extra?: Record<string, string>;
}

function runSupreme(mode: string, e: GuardEnv): { code: number; out: string } {
  const p = spawnSync("bash", [SUPREME, mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      REPO_DIR: e.repo,
      ORIGIN_URL: e.origin,
      MELK_HEAD_GUARD_PORT: "3999", // پورت مرده — لایهٔ سوم در تست خاموش
      ...(e.skipSnapshot ? { SUPREME_SKIP_SNAPSHOT: "1" } : {}),
      ...(e.extra ?? {}),
      HOME: process.env.HOME ?? "/tmp",
    },
  });
  return { code: p.status ?? -1, out: `${p.stdout}\n${p.stderr}` };
}

/** مخزن ساختگی: c1→c2→c3 + origin محلی + شاخهٔ survival/code با دو اسنپ‌شات
 *  (تازه: sha برگشته — کهنه: sha سالم) — دقیقاً الگوی بحران K3 امروز. */
function fixture(): { repo: string; origin: string; c1: string; c2: string; c3: string } {
  const base = mkdtempSync(join(tmpdir(), "pn040-shield-"));
  const repo = join(base, "repo");
  const origin = join(base, "origin.git");
  mkdirSync(repo, { recursive: true });
  sh(base, `git init -q -b main repo && git init -q --bare origin.git`);
  const env = "GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t";
  sh(repo, `git config user.name t && git config user.email t@t`);
  const shas: Record<string, string> = {};
  for (const msg of ["c1", "c2", "c3"]) {
    writeFileSync(join(repo, "f.txt"), msg);
    sh(repo, `git add -A && ${env} git commit -q -m ${msg}`);
    shas[msg] = sh(repo, "git rev-parse HEAD");
  }
  sh(repo, `git remote add origin "${origin}" && git push -q origin main`);
  // شاخهٔ اسنپ‌شات بقای: نخست snapshot سالم (c3)، سپس snapshot وضعیتِ برگشته (c1)
  // — الگوی زندهٔ امروز: 6f627ec (سالم) زیر 0d5ab7a (برگشته)
  sh(repo, `git checkout -q -b survival/code main`);
  sh(repo, `${env} git commit -q --allow-empty -m "survival snapshot ${sh(repo, "git rev-parse --short HEAD")} 2026-10-17T21:35:54Z — full tree minus >99MB files (db in survival packages)"`);
  sh(repo, `${env} git commit -q --allow-empty -m "survival snapshot ${sh(repo, `git rev-parse --short ${shas["c1"]}`)} 2026-10-18T02:23:05Z — full tree minus >99MB files (db in survival packages)"`);
  sh(repo, `git checkout -q main`);
  return { repo, origin, c1: shas["c1"], c2: shas["c2"], c3: shas["c3"] };
}

describe("PN-040 · گام ۴ — github-supreme-guard.sh (تشخیص سه‌لایه)", () => {
  test("۴.۱-الف) HEALTHY — درخت=آینه، بدون اسنپ‌شاتِ گواهِ گم‌شدگی", () => {
    const f = fixture();
    const r = runSupreme("check", { repo: f.repo, origin: f.origin });
    expect(r.code).toBe(0);
    expect(r.out).toContain("HEALTHY");
    rmSync(join(f.repo, ".."), { recursive: true, force: true });
  });

  test("۴.۱-ب) DRIFT-behind — بازنشانی repo.tar: درخت محلی عقب، آینه جلو", () => {
    const f = fixture();
    sh(f.repo, `git reset -q --hard ${f.c2}`);
    const r = runSupreme("check", { repo: f.repo, origin: f.origin, skipSnapshot: true });
    expect(r.code).toBe(2);
    expect(r.out).toContain("DRIFT-behind");
    rmSync(join(f.repo, ".."), { recursive: true, force: true });
  });

  test("۴.۱-ج) MIRROR-ROLLBACK — حفرهٔ K3: آینه هم برگشته؛ داور مستقل = اسنپ‌شات‌های بقا", () => {
    const f = fixture();
    // آینه به c1 برمی‌گردد (پوشِ چرخهٔ پس از بازنشانی) + درخت محلی هم c1
    sh(f.repo, `git push -q -f origin ${f.c1}:refs/heads/main`);
    sh(f.repo, `git reset -q --hard ${f.c1}`);
    const r = runSupreme("check", { repo: f.repo, origin: f.origin });
    expect(r.code).toBe(2);
    expect(r.out).toContain("MIRROR-ROLLBACK");
    // کدِ سالمِ گم‌شده = c3 (از اسنپ‌شاتِ کهنه‌تر — نه تیپِ برگشته‌شده)
    expect(r.out).toContain(f.c3);
    // پیمایش چند-اسنپ‌شاتی: تیپِ تازه (c1) باید رد شده باشد
    expect(r.out).not.toContain(`lost=${f.c1}`);
    rmSync(join(f.repo, ".."), { recursive: true, force: true });
  });

  test("۴.۱-د) recover در حالت DRILL — شاهد ثبت، درخت دست‌نخورده", () => {
    const f = fixture();
    sh(f.repo, `git push -q -f origin ${f.c1}:refs/heads/main`);
    sh(f.repo, `git reset -q --hard ${f.c1}`);
    const r = runSupreme("recover", {
      repo: f.repo,
      origin: f.origin,
      extra: { DRILL: "1", FORCE_RECOVER: "1" },
    });
    expect(r.code).toBe(0);
    expect(sh(f.repo, "git rev-parse HEAD")).toBe(f.c1); // دریل: بدون اقدام
    const w = JSON.parse(read(join(f.repo, "upload/.runtime/github-supreme-guard.json")));
    expect(w.verdict.toLowerCase()).toContain("mirror-rollback");
    expect(String(w.action).toLowerCase()).toContain("drill");
    rmSync(join(f.repo, ".."), { recursive: true, force: true });
  });
});

describe("PN-040 · گام ۴ — قراردادهای ساختاری (منابع)", () => {
  test("۴.۲) منطق سپر: fetch→checkout -B→install→build→restart→مهر", () => {
    const s = read(SUPREME);
    for (const marker of [
      "git ls-remote",
      'git checkout -q -B main',
      "bun install",
      "bun run build",
      'pkill -f "standalone/server.js"',
      "daemonize-watchdog.py",
      "rate_limited",
      "sacred-data-guard.ts",
      "/api/version",
    ]) {
      expect(s).toContain(marker);
    }
  });

  test("۴.۲-ب) درس OOM: توقف تمیز نگهبان (فلگ) پیش از بیلد", () => {
    const s = read(SUPREME);
    expect(s).toContain(".prod-stop");
    expect(s).toContain("درس OOM");
  });

  test("۴.۳) reset-guard: مرجع GitHub (origin) + واگذاری بازیابی به سپر", () => {
    const s = read(RESET_GUARD);
    expect(s).toContain("remote get-url origin");
    expect(s).toContain("github-supreme-guard.sh");
  });

  test("۴.۴-الف) روت version: کلید drift با قرارداد پایدار (کلیدهای قبلی دست‌نخورده)", () => {
    const s = read(VERSION_ROUTE);
    for (const mustStay of ["buildId", "builtAt", "gitSha", "env", "source", "runtime", "serverTime", "fingerprint"]) {
      expect(s).toContain(mustStay);
    }
    expect(s).toContain("computeDrift");
    expect(s).toContain("MELKA_REPO_DIR");
  });

  test("۴.۴-ب) نرمال‌سازی sha (کوتاه ۷ در برابر کامل ۴۰) در drift", () => {
    const s = read(VERSION_ROUTE);
    expect(s).toContain("Math.min(headSha.length, bakedSha.length)");
    expect(s).toContain("headSha.slice(0, n) === bakedSha.slice(0, n)");
  });

  test("بوت-قلاب: dev-entry سپر را در هر بوت کانتینر اجرا می‌کند", () => {
    const s = read(DEV_ENTRY);
    expect(s).toContain("github-supreme-guard.sh");
    expect(s).toContain("قلاب بوت کانتینر");
  });

  test("اکشن گیت‌هاب: اطلاع‌رسانی فوری مغایرت", () => {
    const s = read(ACTION);
    expect(s).toContain("github-shield-version-drift");
    expect(s).toContain("drift.match");
    expect(s).toContain("gh issue create");
    expect(s).toContain("github-supreme-guard.sh recover");
  });

  test("دیمن‌ساز نگهبان (درس مرز reap): دو-فورکی + pidfile", () => {
    expect(existsSync(DAEMONIZER)).toBe(true);
    const s = read(DAEMONIZER);
    expect(s).toContain("os.fork()");
    expect(s).toContain("os.setsid()");
    expect(s).toContain("prod-watchdog.sh");
  });

  test("گارد رسمی سپر در سوئیت audit (شمارش داینامیک گاردها)", () => {
    expect(existsSync(join(REPO, "scripts", "audit-github-shield.sh"))).toBe(true);
  });
});

describe("PN-040 · گام ۴ — رفتار drift در GET /api/version (شبیه‌سازی مخزن)", () => {
  test("۴.۴-ج) headSha زنده vs buildSha — تطبیق پیشوندی کوتاه/کامل", async () => {
    const base = mkdtempSync(join(tmpdir(), "pn040-drift-"));
    const repo = join(base, "repo");
    mkdirSync(repo, { recursive: true });
    sh(base, `git init -q -b main repo`);
    sh(repo, `git config user.name t && git config user.email t@t`);
    writeFileSync(join(repo, "f.txt"), "x");
    sh(repo, `GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git add -A && git commit -q -m c1`);
    const head = sh(repo, "git rev-parse HEAD");

    const { __resetBuildWitnessCacheForTests } = await import("@/lib/build-witness");
    const prevRepoDir = process.env.MELKA_REPO_DIR;
    const prevSha = process.env.NEXT_PUBLIC_GIT_SHA;
    const prevBuiltAt = process.env.NEXT_PUBLIC_BUILT_AT;
    const prevBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
    try {
      process.env.MELKA_REPO_DIR = repo;
      // حالت ۱: buildSha کامل = headSha کامل → match
      process.env.NEXT_PUBLIC_GIT_SHA = head;
      process.env.NEXT_PUBLIC_BUILT_AT = "2026-10-18T00:00:00.000Z";
      process.env.NEXT_PUBLIC_BUILD_ID = `test-1`;
      __resetBuildWitnessCacheForTests();
      let { GET } = await import("@/app/api/version/route");
      let drift = ((await (await GET()).json()) as { drift: { match: boolean | null; headSha: string | null } }).drift;
      expect(drift.match).toBe(true);
      expect(drift.headSha).toBe(head);

      // حالت ۲: buildSha کوتاه (۷) از همان head → match (نرمال‌سازی طول)
      process.env.NEXT_PUBLIC_GIT_SHA = head.slice(0, 7);
      __resetBuildWitnessCacheForTests();
      ({ GET } = await import("@/app/api/version/route"));
      drift = ((await (await GET()).json()) as { drift: { match: boolean | null } }).drift;
      expect(drift.match).toBe(true);

      // حالت ۳: sha متفاوت → عدم تطبیق
      process.env.NEXT_PUBLIC_GIT_SHA = "ffffffffffffffffffffffffffffffffffffffff";
      __resetBuildWitnessCacheForTests();
      ({ GET } = await import("@/app/api/version/route"));
      drift = ((await (await GET()).json()) as { drift: { match: boolean | null } }).drift;
      expect(drift.match).toBe(false);
    } finally {
      if (prevRepoDir === undefined) delete process.env.MELKA_REPO_DIR;
      else process.env.MELKA_REPO_DIR = prevRepoDir;
      if (prevSha === undefined) delete process.env.NEXT_PUBLIC_GIT_SHA;
      else process.env.NEXT_PUBLIC_GIT_SHA = prevSha;
      if (prevBuiltAt === undefined) delete process.env.NEXT_PUBLIC_BUILT_AT;
      else process.env.NEXT_PUBLIC_BUILT_AT = prevBuiltAt;
      if (prevBuildId === undefined) delete process.env.NEXT_PUBLIC_BUILD_ID;
      else process.env.NEXT_PUBLIC_BUILD_ID = prevBuildId;
      __resetBuildWitnessCacheForTests();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
