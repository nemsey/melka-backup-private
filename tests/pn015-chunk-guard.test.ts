// ============================================================
// PN-015 / K1 — گارد یکپارچگی chunk (audit-chunk-integrity.sh)
// تست‌پذیری: اسکریپت با --root/--witness روی ساختار ساختگی اجرا می‌شود
//     (بدون دست زدن به بیلد واقعی پروژه).
// ============================================================
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = join(import.meta.dir, "..", "scripts", "audit-chunk-integrity.sh");

interface RunResult { code: number; stdout: string; witness: any | null }

function runAudit(root: string, witnessPath: string): RunResult {
  const p = spawnSync("bash", [SCRIPT, "--root", root, "--witness", witnessPath], { encoding: "utf8" });
  let witness: any = null;
  try { witness = JSON.parse(spawnSync("cat", [witnessPath], { encoding: "utf8" }).stdout); } catch { /* غایب مجاز */ }
  return { code: p.status ?? -1, stdout: p.stdout ?? "", witness };
}

function fixture(opts?: { missingChunk?: boolean; idMismatch?: boolean; noBuild?: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), "pn015-chunk-"));
  if (opts?.noBuild) return dir;
  const next = join(dir, ".next/standalone/.next");
  mkdirSync(join(next, "static/chunks"), { recursive: true });
  mkdirSync(join(next, "static/css"), { recursive: true });
  mkdirSync(join(next, "server/app"), { recursive: true });
  writeFileSync(join(dir, ".next/standalone/server.js"), "// stand-in");
  writeFileSync(join(next, "BUILD_ID"), opts?.idMismatch ? "build-A" : "build-1");
  writeFileSync(join(next, "fingerprint.json"), JSON.stringify({ buildId: "build-1" }));
  // مانیفست JSON با گویش نسبی + HTML با گویش مطلق — هر دو الگو باید پوشش داده شوند
  writeFileSync(join(next, "build-manifest.json"), JSON.stringify({ rootMainFiles: ["static/chunks/root.js"] }));
  writeFileSync(join(next, "server/app/index.html"),
    '<script src="/_next/static/chunks/root.js"></script><link href="/_next/static/css/app.css" rel="stylesheet">');
  writeFileSync(join(next, "static/chunks/root.js"), "// chunk");
  writeFileSync(join(next, "static/css/app.css"), "body{}");
  if (!opts?.missingChunk) {
    // default: همهٔ فایل‌ها حاضر
  } else {
    rmSync(join(next, "static/chunks/root.js"));
  }
  return dir;
}

describe("PN-015/K1 — audit-chunk-integrity.sh", () => {
  test("۱: اسکریپت موجود و اجرایی است", () => {
    const p = spawnSync("bash", ["-n", SCRIPT]);
    expect(p.status).toBe(0);
  });

  test("۲: بیلد سالم — PASS با شاهد JSON و پوشش هر دو گویش مسیر", () => {
    const dir = fixture();
    try {
      const r = runAudit(dir, join(dir, "w.json"));
      expect(r.code).toBe(0);
      expect(r.witness?.verdict).toBe("PASS");
      expect(r.witness?.checked).toBe(2); // root.js (HTML مطلق + JSON نسبی → یکی پس از یکسان‌سازی) + app.css
      expect(r.witness?.missing).toBe(0);
      expect(r.witness?.buildIdCoherence).toBe("match");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("۳: chunk ارجاع‌شدهٔ مفقود — FAIL با فهرست مفقودها (سناریوی chunk 404)", () => {
    const dir = fixture({ missingChunk: true });
    try {
      const r = runAudit(dir, join(dir, "w.json"));
      expect(r.code).toBe(1);
      expect(r.witness?.verdict).toBe("FAIL");
      expect(r.witness?.missing).toBeGreaterThanOrEqual(1);
      expect(r.witness?.missingList.join("\n")).toContain("root.js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("۴: ناهم‌خوانی BUILD_ID در برابر fingerprint — FAIL (بیلد آمیخته)", () => {
    const dir = fixture({ idMismatch: true });
    try {
      const r = runAudit(dir, join(dir, "w.json"));
      expect(r.code).toBe(1);
      expect(r.witness?.missingList.join("\n")).toContain("BUILD_ID");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("۵: نبود کامل بیلد — FAIL سریع (پیش‌نیاز بازسازی)", () => {
    const dir = fixture({ noBuild: true });
    try {
      const r = runAudit(dir, join(dir, "w.json"));
      expect(r.code).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
