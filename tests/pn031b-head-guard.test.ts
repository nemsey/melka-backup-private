// ============================================================
// PN-031-B (شورا-ن۰۳۹) — گارد تازگی بیلد زنده (audit-head-guard.sh)
// ---------------------------------------------------------------------------
// الف) اسکریپت: شبیه‌سازی «بیلد کهنه سرو می‌شود» با مخزن ساختگی +
//      سرور نسخهٔ ساختگی (python) — تشخیص STALE/OK/ERROR + نرخ‌حد + پارک.
// ب) رجیستری Worker: ثبت کار head-guard با فاصلهٔ مصوب ۱۰ دقیقه.
// ج) حکم تازگی (خالص): FRESH/STALE/UNKNOWN + خواندن شاهد گارد.
// د) سازگاری: قرارداد شناسهٔ AuditLog + روت مالک‌محور + بنر در تنظیمات.
// مسیر خوش‌بختی rebuild واقعی (بیلد+ری‌استارت) با شبیه‌سازی زندهٔ گام ۱۰
// سند ۰۳۹ اثبات می‌شود (خارج از این فایل — شاهد live-test.json).
// ============================================================
import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dir, "..", "scripts", "recovery", "audit-head-guard.sh");

function sh(cwd: string, cmd: string): string {
  const p = spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`"${cmd}" failed: ${p.stderr}`);
  return p.stdout.trim();
}

/** مخزن ساختگی با دو کامیت — HEAD معلوم برای شبیه‌سازی */
function fixture(): { repo: string; headFull: string } {
  const repo = mkdtempSync(join(tmpdir(), "pn031b-head-"));
  mkdirSync(join(repo, "upload/.runtime"), { recursive: true });
  sh(repo, "git init -q -b main && git config user.name t && git config user.email t@t");
  const env = "GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t";
  writeFileSync(join(repo, "f.txt"), "c1");
  sh(repo, `git add -A && ${env} git commit -q -m c1`);
  writeFileSync(join(repo, "f.txt"), "c2");
  sh(repo, `git add -A && ${env} git commit -q -m c2`);
  return { repo, headFull: sh(repo, "git rev-parse HEAD") };
}

/** راه‌اندازی سرور ساختگی با خواندن پورت از stdout (بدون condition race) */
function startFakeServer(sha: string): Promise<{ proc: ChildProcess; port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const py = `
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
SHA = ${JSON.stringify(sha)}
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        b = json.dumps({"buildId": "fake-" + SHA[:7], "gitSha": SHA, "fingerprint": {"gitSha": SHA}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def log_message(self, *a):
        pass
srv = HTTPServer(("127.0.0.1", 0), H)
print(srv.server_address[1], flush=True)
srv.serve_forever()
`;
    const proc = spawn("python3", ["-c", py], { stdio: ["ignore", "pipe", "ignore"] });
    let data = "";
    const timer = setTimeout(() => reject(new Error("fake server boot timeout")), 10_000);
    proc.stdout!.on("data", (chunk) => {
      data += String(chunk);
      const m = data.trim().match(/^(\d+)$/m);
      if (m) {
        clearTimeout(timer);
        resolve({
          proc,
          port: Number(m[1]),
          stop: () => { try { proc.kill("SIGKILL"); } catch { /* قبلاً خارج شده */ } },
        });
      }
    });
    proc.on("exit", () => { clearTimeout(timer); reject(new Error("fake server died at boot")); });
  });
}

interface GuardRun { code: number; out: string; witness: any | null }

function runGuard(repo: string, mode: string, port: number | null, extra: Record<string, string> = {}): GuardRun {
  const p = spawnSync("bash", [SCRIPT, mode], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...extra,
      REPO_DIR: repo,
      ...(port !== null ? { MELK_HEAD_GUARD_PORT: String(port) } : { MELK_HEAD_GUARD_PORT: "1" }), // پورت ۱ = بسته — شبیه‌ساز بی‌سروری
    },
  });
  let witness: any = null;
  try { witness = JSON.parse(readFileSync(join(repo, "upload/.runtime/head-guard.json"), "utf8")); } catch { /* نبود مجاز */ }
  return { code: p.status ?? -1, out: `${p.stdout}\n${p.stderr}`, witness };
}

const CLEANUPS: Array<() => void> = [];
afterAll(() => { for (const c of CLEANUPS) c(); });

describe("PN-031-B/A — audit-head-guard.sh (تشخیص)", () => {
  test("A-1: اسکریپت موجود و سالم (bash -n)", () => {
    const p = spawnSync("bash", ["-n", SCRIPT]);
    expect(p.status).toBe(0);
  });

  test("A-2: بیلد کهنه سرو می‌شود (عین بازنشانی هشتم) — STALE (خروج ۲)", async () => {
    const { repo, headFull } = fixture();
    CLEANUPS.push(() => rmSync(repo, { recursive: true, force: true }));
    const staleSha = (headFull[0] === "1" ? "0" : "1") + headFull.slice(1); // SHA متفاوت تضمینی با همان طول (رفع flake: اگر HEAD با ۱ شروع می‌شد یکسان می‌شد)
    const srv = await startFakeServer(staleSha);
    CLEANUPS.push(srv.stop);
    const r = runGuard(repo, "check", srv.port);
    expect(r.code).toBe(2);
    expect(r.out).toContain("STALE");
    expect(r.witness?.verdict).toBe("STALE");
    expect(r.witness?.head).toBe(headFull);
    expect(r.witness?.live).toBe(staleSha);
  });

  test("A-3: بیلد زنده = HEAD — OK (خروج ۰، بی‌صدا)", async () => {
    const { repo, headFull } = fixture();
    CLEANUPS.push(() => rmSync(repo, { recursive: true, force: true }));
    const srv = await startFakeServer(headFull);
    CLEANUPS.push(srv.stop);
    const r = runGuard(repo, "check", srv.port);
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK");
    expect(r.witness?.verdict).toBe("OK");
  });

  test("A-4: سرور در دسترس نیست — ERROR بدون rebuild (خروج ۱)", () => {
    const { repo } = fixture();
    CLEANUPS.push(() => rmSync(repo, { recursive: true, force: true }));
    const r = runGuard(repo, "check", 1); // پورت ۱ — همیشه بسته
    expect(r.code).toBe(1);
    expect(r.witness?.verdict).toBe("ERROR");
    expect(r.witness?.reason).toBe("server-unreachable");
  });
});

describe("PN-031-B/A2 — audit-head-guard.sh (نگهبان‌های rebuild)", () => {
  test("A-5: نرخ‌حد — rebuild اخیر = صرف نظر (خروج ۴)", () => {
    const { repo, headFull } = fixture();
    CLEANUPS.push(() => rmSync(repo, { recursive: true, force: true }));
    writeFileSync(
      join(repo, "upload/.runtime/head-guard-last.json"),
      JSON.stringify({ at: new Date().toISOString() }),
    );
    const r = runGuard(repo, "rebuild", 1, { FORCE_RECOVER: "" });
    expect(r.code).toBe(4);
    expect(r.witness?.verdict).toBe("RATE-LIMITED");
    void headFull;
  });

  test("A-6: قانون ۹ پارک اتمی — PARK_ACTIVE = rebuild قفل (خروج ۴)", () => {
    const { repo } = fixture();
    CLEANUPS.push(() => rmSync(repo, { recursive: true, force: true }));
    writeFileSync(join(repo, "upload/.runtime/PARK_ACTIVE"), "1");
    const r = runGuard(repo, "rebuild", 1);
    expect(r.code).toBe(4);
    expect(r.witness?.verdict).toBe("LOCKED");
    expect(r.witness?.reason).toBe("park-or-ci-active");
  });

  test("A-7: شاهد AuditLog با شناسهٔ ثابت HEAD_GUARD_AUTOBUILD (قرارداد با روت/بنر)", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toContain('HEAD_GUARD_AUTOBUILD');
    expect(src).toContain('worker:head-guard');
  });
});

describe("PN-031-B/B — رجیستری Worker (jobs.ts)", () => {
  test("B-1: کار head-guard ثبت شده — فاصلهٔ مصوب ۱۰ دقیقه + شروع ۹۰ثانیه", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(null as never);
    const hg = jobs.find((j) => j.id === WORKER_JOB_IDS.headGuard);
    expect(hg).toBeDefined();
    expect(hg!.intervalMs).toBe(10 * 60_000);
    expect(hg!.firstRunDelayMs).toBe(90_000);
  });

  test("B-2: خاموشی با env — MELK_HEAD_GUARD=disabled", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const saved = process.env.MELK_HEAD_GUARD;
    process.env.MELK_HEAD_GUARD = "disabled";
    try {
      const off = buildWorkerJobs(null as never);
      expect(off.find((j) => j.id === WORKER_JOB_IDS.headGuard)).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.MELK_HEAD_GUARD;
      else process.env.MELK_HEAD_GUARD = saved;
    }
  });

  test("B-3: فاصله از env خوانده می‌شود — ۷ دقیقه", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const saved = process.env.MELK_HEAD_GUARD_INTERVAL_MINUTES;
    process.env.MELK_HEAD_GUARD_INTERVAL_MINUTES = "7";
    try {
      const jobs = buildWorkerJobs(null as never);
      const hg = jobs.find((j) => j.id === WORKER_JOB_IDS.headGuard);
      expect(hg!.intervalMs).toBe(7 * 60_000);
    } finally {
      if (saved === undefined) delete process.env.MELK_HEAD_GUARD_INTERVAL_MINUTES;
      else process.env.MELK_HEAD_GUARD_INTERVAL_MINUTES = saved;
    }
  });

  test("B-4: شناسهٔ کار در رجیستری = head-guard (منبع یگانه)", async () => {
    const { WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    expect(WORKER_JOB_IDS.headGuard).toBe("head-guard");
  });
});

describe("PN-031-B/C — حکم تازگی (خالص)", () => {
  test("C-1: بیلد زنده = HEAD ⇒ FRESH", async () => {
    const { computeBuildFreshness } = await import("@/lib/runtime/build-freshness");
    const sha = "a".repeat(40);
    const r = computeBuildFreshness({ liveGitSha: sha, gitHead: sha, liveBuildId: "aaaaaaa-1", checkedAt: "2026-10-13T00:00:00Z" });
    expect(r.fresh).toBe(true);
    expect(r.verdict).toBe("FRESH");
    expect(r.message).toContain("سرور روی HEAD است");
  });

  test("C-2: بیلد زنده ≠ HEAD ⇒ STALE با پیام جبران خودکار", async () => {
    const { computeBuildFreshness } = await import("@/lib/runtime/build-freshness");
    const r = computeBuildFreshness({
      liveGitSha: "b".repeat(40),
      gitHead: "c".repeat(40),
      liveBuildId: "bbbbb-1",
      checkedAt: "2026-10-13T00:00:00Z",
    });
    expect(r.fresh).toBe(false);
    expect(r.verdict).toBe("STALE");
    expect(r.message).toContain("جبران خودکار");
  });

  test("C-3: هویت نامشخص ⇒ UNKNOWN (نه سبز کاذب نه قرمز کاذب)", async () => {
    const { computeBuildFreshness } = await import("@/lib/runtime/build-freshness");
    const r1 = computeBuildFreshness({ liveGitSha: null, gitHead: "c".repeat(40) });
    const r2 = computeBuildFreshness({ liveGitSha: "a".repeat(40), gitHead: null });
    expect(r1.verdict).toBe("UNKNOWN");
    expect(r2.verdict).toBe("UNKNOWN");
    expect(r1.fresh).toBe(false);
  });

  test("C-4: خواندن شاهد گارد — معتبر / غایب / خراب", async () => {
    const { readHeadGuardWitness } = await import("@/lib/runtime/build-freshness");
    const dir = mkdtempSync(join(tmpdir(), "pn031b-witness-"));
    CLEANUPS.push(() => rmSync(dir, { recursive: true, force: true }));
    const runtimeDir = join(dir, "upload/.runtime");
    mkdirSync(runtimeDir, { recursive: true });
    // معتبر
    writeFileSync(join(runtimeDir, "head-guard.json"), JSON.stringify({ at: "2026-10-13T00:00:00Z", verdict: "VERIFIED", action: "auto-rebuild" }));
    const w = readHeadGuardWitness(dir);
    expect(w?.verdict).toBe("VERIFIED");
    // غایب
    const dir2 = mkdtempSync(join(tmpdir(), "pn031b-witness2-"));
    CLEANUPS.push(() => rmSync(dir2, { recursive: true, force: true }));
    expect(readHeadGuardWitness(dir2)).toBeNull();
    // خراب
    mkdirSync(join(dir2, "upload/.runtime"), { recursive: true });
    writeFileSync(join(dir2, "upload/.runtime/head-guard.json"), "{not json");
    expect(readHeadGuardWitness(dir2)).toBeNull();
  });
});

describe("PN-031-B/D — سازگاری و قراردادها", () => {
  test("D-1: روت build-freshness — مالک‌محور + no-store + مرز Repository (db در سرویس)", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/app/api/runtime/build-freshness/route.ts"), "utf8");
    expect(src).toContain('requireRole(request, "OWNER"');
    expect(src).toContain("no-store");
    expect(src).toContain("servedFingerprint");
    expect(src).toContain("countAutoRebuildsThisMonth"); // آمار AuditLog از لایهٔ سرویس
    expect(src).not.toContain('from "@/lib/db"'); // قانون P2 — روت سبک
    expect(src).not.toContain("@prisma/client");
    const lib = readFileSync(join(import.meta.dir, "..", "src/lib/runtime/build-freshness.ts"), "utf8");
    expect(lib).toContain("HEAD_GUARD_AUTOBUILD"); // قرارداد شناسهٔ AuditLog
  });

  test("D-2: بنر در صفحهٔ تنظیمات سوار شده (بالای بخش‌ها — پس از کارت مالک)", () => {
    const page = readFileSync(join(import.meta.dir, "..", "src/core/tiles/tiles/settings/SettingsPage.tsx"), "utf8");
    expect(page).toContain("BuildFreshnessBanner");
    const ownerIdx = page.indexOf("مالک و برنامه نویس و طراح");
    const bannerIdx = page.indexOf("<BuildFreshnessBanner />");
    expect(bannerIdx).toBeGreaterThan(ownerIdx);
    const banner = readFileSync(join(import.meta.dir, "..", "src/core/tiles/tiles/settings/BuildFreshnessBanner.tsx"), "utf8");
    expect(banner).toContain("سرور روی HEAD است");
    expect(banner).toContain("جبران خودکار");
    expect(banner).toContain("403");
  });

  test("D-3: اسکریپت در مسیر رجISTRY اشاره‌شده واقعاً موجود است", () => {
    const jobs = readFileSync(join(import.meta.dir, "..", "src/core/runtime/jobs.ts"), "utf8");
    expect(jobs).toContain("scripts/recovery/audit-head-guard.sh");
    const p = spawnSync("bash", ["-c", `test -x ${join(import.meta.dir, "..", "scripts/recovery/audit-head-guard.sh")}`]);
    expect(p.status).toBe(0);
  });

  test("D-4: قرارداد شناسهٔ داخلی — HEAD کامل مقایسه می‌شود (نه کوتاه)", async () => {
    const { computeBuildFreshness } = await import("@/lib/runtime/build-freshness");
    // SHA کامل در برابر SHA کوتاه نباید FRESH بدهد — جلوگیری از سبز کاذب
    const headFull = "a".repeat(40);
    const r = computeBuildFreshness({ liveGitSha: headFull.slice(0, 7), gitHead: headFull });
    expect(r.verdict).not.toBe("FRESH");
  });

  test("D-5: بقا در برابر بازنشانی env — کلیدهای عملیاتی جزو BOOT_SECRET_KEYS (درس هشتم · به‌روزشدهٔ ن۰۵۴)", async () => {
    const { BOOT_SECRET_KEYS } = await import("@/lib/auth/boot-secrets");
    for (const k of ["MELK_PROXY_SECRET", "MELK_ARM_RELAY_MODE", "MELK_ARM_OFFLINE", "MELK_ARM_CIRCUIT_DISABLED"]) {
      expect(BOOT_SECRET_KEYS as readonly string[]).toContain(k);
    }
    // PN-033 (شورا-ن۰۵۴): کلیدهای دوران Worker از escrow حذف شدند
    expect(BOOT_SECRET_KEYS as readonly string[]).not.toContain("MELK_ARM_PROXY_URL");
    expect(BOOT_SECRET_KEYS as readonly string[]).not.toContain("MELK_RELAY_ALT_URL");
  });

  test("D-6: env.platform.json زنده — حالت رله + راز HMAC + بی‌Worker + بی‌پرچم آفلاینی + فیوز خاموش (ن۰۵۴)", () => {
    const env = JSON.parse(readFileSync(join(import.meta.dir, "..", "env.platform.json"), "utf8")) as Record<string, string>;
    expect((env.MELK_ARM_OFFLINE ?? "")).toBe(""); // PN-031-E (دستور مالک ۱۴۰۵/۰۷/۲۳): پرچم آفلاین حذف شد
    expect(env.MELK_ARM_RELAY_MODE ?? "").toBe("mobile");
    expect(env.MELK_PROXY_SECRET ?? "").toMatch(/^[0-9a-f]{64}$/);
    // PN-033 (شورا-ن۰۵۴): کلیدهای Worker حذف شدند — مسیر یگانه رلهٔ Termux
    expect(env).not.toHaveProperty("MELK_ARM_PROXY_URL");
    expect(env).not.toHaveProperty("MELK_RELAY_ALT_URL");
    expect(env.MELK_ARM_CIRCUIT_DISABLED ?? "").toBe("1");
    expect(env.MELK_PUBLIC_BASE_URL ?? "").toMatch(/^https:\/\/preview-/);
  });
});
