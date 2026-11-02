// ============================================================
// PN-015 / K3 — گارد بازنشانی پلتفرم (reset-guard.sh)
// شبیه‌سازی کامل چرخهٔ بازنشانی در مخزن ساختگی: پوش به آینهٔ محلی،
// برگرداندن درخت (عین رفتار repo.tar پلتفرم)، تشخیص، بازیابی، نرخ‌حد.
// ============================================================
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dir, "..", "scripts", "recovery", "reset-guard.sh");

function sh(cwd: string, cmd: string): string {
  const p = spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`"${cmd}" failed: ${p.stderr}`);
  return p.stdout.trim();
}

/** مخزن ساختگی + آینهٔ محلی: سه کامیت روی main، پوش به آینه، سپس درخت به عقب */
function fixture(): { repo: string; mirror: string } {
  const base = mkdtempSync(join(tmpdir(), "pn015-reset-"));
  const repo = join(base, "repo");
  const mirror = join(base, "mirror.git");
  mkdirSync(repo, { recursive: true });
  sh(base, `git init -q -b main repo && git init -q --bare mirror.git`);
  const env = "GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t";
  sh(repo, `git config user.name t && git config user.email t@t`);
  for (const msg of ["c1", "c2", "c3"]) {
    writeFileSync(join(repo, "f.txt"), msg);
    sh(repo, `git add -A && ${env} git commit -q -m ${msg}`);
  }
  sh(repo, `git remote add mirror "${mirror}" && git push -q mirror main`);
  return { repo, mirror };
}

interface GuardRun { code: number; out: string; witness: any | null }

function runGuard(repo: string, mirror: string, mode: string, extra: Record<string, string> = {}): GuardRun {
  const p = spawnSync("bash", [SCRIPT, mode], {
    encoding: "utf8",
    env: { ...process.env, ...extra, REPO_DIR: repo, MIRROR_REMOTE_URL: mirror, HOME: process.env.HOME ?? "/tmp" },
  });
  let witness: any = null;
  try { witness = JSON.parse(spawnSync("cat", [join(repo, "upload/.runtime/reset-guard.json")], { encoding: "utf8" }).stdout); } catch { /* نبود مجاز */ }
  return { code: p.status ?? -1, out: `${p.stdout}\n${p.stderr}`, witness };
}

describe("PN-015/K3 — reset-guard.sh", () => {
  test("۱: اسکریپت موجود و سالم (bash -n)", () => {
    const p = spawnSync("bash", ["-n", SCRIPT]);
    expect(p.status).toBe(0);
  });

  test("۲: هم‌نسخهٔ آینه — HEALTHY (خروج ۰)", () => {
    const { repo, mirror } = fixture();
    try {
      const r = runGuard(repo, mirror, "check");
      expect(r.code).toBe(0);
      expect(r.out).toContain("HEALTHY");
      expect(r.witness?.verdict).toContain("HEALTHY");
    } finally { rmSync(repo, { recursive: true, force: true }); rmSync(mirror, { recursive: true, force: true }); }
  });

  test("۳: درخت به عقب برگشته (عین repo.tar پلتفرم) — RESET-DETECTED (خروج ۲)", () => {
    const { repo, mirror } = fixture();
    try {
      sh(repo, "git reset -q --hard HEAD~2"); // بازنشانی شبیه‌سازی‌شدهٔ پلتفرم
      const r = runGuard(repo, mirror, "check");
      expect(r.code).toBe(2);
      expect(r.out).toContain("RESET-DETECTED");
      expect(r.witness?.verdict).toContain("RESET-DETECTED");
    } finally { rmSync(repo, { recursive: true, force: true }); rmSync(mirror, { recursive: true, force: true }); }
  });

  test("۴: دریل بازیابی — fetch از آینه + reset --hard + مهر شاهد (بدون build در دریل)", () => {
    const { repo, mirror } = fixture();
    try {
      sh(repo, "git reset -q --hard HEAD~2");
      const r = runGuard(repo, mirror, "recover", { DRILL: "1", FORCE_RECOVER: "1" });
      expect(r.code).toBe(0);
      expect(r.out).toContain("DRILL");
      expect(sh(repo, "git rev-parse --short HEAD")).toBe(sh(repo, "git ls-remote " + mirror + " refs/heads/main | cut -c1-7").split("\t")[0].slice(0, 7) || "x");
      expect(r.witness?.action).toBe("drill-git-recovered");
    } finally { rmSync(repo, { recursive: true, force: true }); rmSync(mirror, { recursive: true, force: true }); }
  });

  test("۵: نرخ‌حد — بازیابی اخیر = صرف نظر تا پنجرهٔ بعدی", () => {
    const { repo, mirror } = fixture();
    try {
      sh(repo, "git reset -q --hard HEAD~2");
      mkdirSync(join(repo, "upload/.runtime"), { recursive: true });
      writeFileSync(join(repo, "upload/.runtime/reset-guard-last.json"), JSON.stringify({ at: new Date().toISOString() }));
      const r = runGuard(repo, mirror, "recover", { FORCE_RECOVER: "" });
      expect(r.code).toBe(4);
      expect(r.witness?.action).toBe("rate-limited");
    } finally { rmSync(repo, { recursive: true, force: true }); rmSync(mirror, { recursive: true, force: true }); }
  });

  test("۶: ثبت در رجیستری Worker + خاموشی با env", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(null as never);
    const rg = jobs.find((j) => j.id === WORKER_JOB_IDS.resetGuard);
    expect(rg).toBeDefined();
    expect(rg!.intervalMs).toBe(15 * 60_000);
    const p = process.env.MELK_RESET_GUARD;
    process.env.MELK_RESET_GUARD = "disabled";
    try {
      const off = buildWorkerJobs(null as never);
      expect(off.find((j) => j.id === WORKER_JOB_IDS.resetGuard)).toBeUndefined();
    } finally {
      delete process.env.MELK_RESET_GUARD;
      if (p !== undefined) process.env.MELK_RESET_GUARD = p;
    }
  });
});
