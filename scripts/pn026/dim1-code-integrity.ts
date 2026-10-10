#!/usr/bin/env bun
/** PN-026 · بُعد ۱ — کد یکپارچه (Code Integrity) · ۱۰ جستجو · فقط-خواندنی */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project";
const SRC = join(ROOT, "src");

/** گردآوری فایل‌ها با مستثنی‌های مصوب */
function walk(dir: string, exts: string[], skip: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!skip(p)) out.push(...walk(p, exts, skip)); continue; }
    if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
const skipDirs = (p: string) => /node_modules|\.next|docs\/|download\/|\.git/.test(p);
const srcFiles = walk(SRC, [".ts", ".tsx"], skipDirs);
const testFiles = walk(join(ROOT, "tests"), [".ts", ".tsx"], () => false);
const scriptFiles = walk(join(ROOT, "scripts"), [".ts", ".sh", ".py"], (p) => /node_modules/.test(p));

type Hit = { file: string; line: number; text: string };
function search(files: string[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((l, i) => { if (pattern.test(l)) hits.push({ file: f.replace(ROOT + "/", ""), line: i + 1, text: l.trim().slice(0, 110) }); });
  }
  return hits;
}

const t0 = Date.now();
// ۱) کد مدیر hardcode در src/
const masterHardcode = search(srcFiles, /["']80211186["']/);
// ۲) کد قدیمی 00000000 در src/
const oldCode = search(srcFiles, /["']00000000["']/);
// ۳) توکن قدیمی arm-tok-p6509 در همه (src+tests+scripts، مستثنی docs/download)
const oldToken = search([...srcFiles, ...testFiles, ...scriptFiles], /arm-tok-p6509/);
// ۴) توکن تست verify-p2-03 در همه
const testToken = search([...srcFiles, ...testFiles, ...scriptFiles], /verify-p2-03/);
// ۵) مسیر مطلق /home/z/my-project در src/app (مجاز: env)
const appFiles = srcFiles.filter((f) => f.includes("/src/app/"));
const absPathAll = search(srcFiles, /\/home\/z\/my-project/);
const absPathApp = absPathAll.filter((h) => h.file.includes("/src/app/"));
const absPathEnvSafe = absPathAll.filter((h) => /env|ENV|process\.env|MELKA_REPO/.test(h.text));
// ۶) process.env.MELK_* — فهرست کامل
const envVars = new Set<string>();
for (const f of srcFiles) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/process\.env\.(MELK[A-Z0-9_]*)/g)) envVars.add(m[1]);
  for (const m of txt.matchAll(/process\.env\.(?!MELK)[A-Z][A-Z0-9_]{3,}/g)) envVars.add(m[1]);
}
// ۷) require(...) در .ts — CJS در ESM
const cjsHits = search(srcFiles.filter((f) => f.endsWith(".ts")), /(^|[^.\w])require\s*\(/);
const cjsReal = cjsHits.filter((h) => !h.file.endsWith(".d.ts"));
// ۸) console.log در src/
const consoleLog = search(srcFiles, /console\.log\(/);
// ۹) TODO/FIXME/XXX
const todo = search(srcFiles, /\b(TODO|FIXME|XXX)\b/);
// ۱۰) @deprecated
const deprecated = search(srcFiles, /@deprecated/);

const sev = (n: number, red = 0) => (n === 0 ? "🟢" : n <= red ? "🟠" : "🔴");
const result = {
  dimension: "بُعد ۱ — کد یکپارچه (Code Integrity)",
  scope: { patterns: 10, src: `src/ (${srcFiles.length} فایل ts/tsx)`, excluded: "docs/, download/, .next/" },
  searches: [
    { id: 1, query: "«80211186» در src/", goal: "کد مدیر hardcode", count: masterHardcode.length, samples: masterHardcode.slice(0, 8), severity: sev(masterHardcode.length) },
    { id: 2, query: "«00000000» در src/", goal: "کد قدیمی", count: oldCode.length, samples: oldCode.slice(0, 8), severity: sev(oldCode.length) },
    { id: 3, query: "«arm-tok-p6509» در همه", goal: "توکن قدیمی", count: oldToken.length, samples: oldToken.slice(0, 8), severity: sev(oldToken.length) },
    { id: 4, query: "«verify-p2-03» در همه", goal: "توکن تست قدیمی", count: testToken.length, samples: testToken.slice(0, 8), severity: sev(testToken.length) },
    { id: 5, query: "«/home/z/my-project» در src/app", goal: "مسیر مطلق (مجاز: env)", count: absPathApp.length, samples: absPathApp.slice(0, 8), severity: "🟡", all: absPathAll.length, envSafe: absPathEnvSafe.length },
    { id: 6, query: "process.env.MELK_* فهرست کامل", goal: "متغیرهای env", count: envVars.size, vars: [...envVars].sort(), severity: "🟢" },
    { id: 7, query: "require(...) در .ts", goal: "CJS در ESM", count: cjsReal.length, samples: cjsReal.slice(0, 8), severity: "🟡" },
    { id: 8, query: "console.log در src/", goal: "لاگ تولیدی", count: consoleLog.length, samples: consoleLog.slice(0, 12), severity: "🟡" },
    { id: 9, query: "TODO, FIXME, XXX", goal: "کد ناتمام", count: todo.length, samples: todo.slice(0, 12), severity: "🟢" },
    { id: 10, query: "@deprecated", goal: "مسیرهای منسوخ", count: deprecated.length, samples: deprecated.slice(0, 12), severity: "🟠" },
  ],
  meta: { filesScanned: { src: srcFiles.length, tests: testFiles.length, scripts: scriptFiles.length }, durationMs: Date.now() - t0, mode: "read-only" },
};
console.log(JSON.stringify(result, null, 1));
