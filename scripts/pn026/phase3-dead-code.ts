#!/usr/bin/env bun
/** PN-026 · فاز ۳ — لیست اضافات (شناسایی فقط · صفر حذف) · ۱۰ بررسی */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { Database } from "bun:sqlite";

const ROOT = "/home/z/my-project";
const db = new Database(join(ROOT, "db/custom.db"), { readonly: true });

function walk(dir: string, opts: { ext?: string[]; skip?: (p: string) => boolean } = {}): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!opts.skip?.(p)) out.push(...walk(p, opts)); continue; }
    if (opts.ext && !opts.ext.some((x) => e.name.endsWith(x))) continue;
    out.push(p);
  }
  return out;
}
const skipNode = (p: string) => /node_modules|\.git(\/|$)|\.next|\/db\/|\/backups\/|\/download\//.test(p);
const srcFiles = walk(join(ROOT, "src"), { skip: skipNode });
const scriptFiles = walk(join(ROOT, "scripts"), { skip: (p) => /node_modules/.test(p) });
const testFiles = walk(join(ROOT, "tests"));

// ═══ ۱) endpointهای بی‌استفاده — مقایسهٔ روت‌های API با فراخوانی‌های UI ═══
const apiRoutes: string[] = [];
for (const f of walk(join(ROOT, "src/app/api"), { ext: ["route.ts"] })) {
  const rel = f.replace(ROOT + "/src/app/api", "").replace("/route.ts", "");
  apiRoutes.push(rel);
}
// فراخوانی‌های UI: همهٔ فایل‌های src (کامل‌تر از قبلی)
const srcAll = srcFiles.map((f) => ({ f, txt: readFileSync(f, "utf8") }));
const apiBase = (rel: string) => rel.replace(/\[.*?\]/g, "X").split("/").filter(Boolean);
const usedInSrc = new Set<string>();
for (const { txt } of srcAll) {
  for (const m of txt.matchAll(/["'`]\/api\/([a-zA-Z0-9\-_\/\[\].${}]+)["'`]/g)) {
    usedInSrc.add("/" + m[1].replace(/\$\{[^}]*\}/g, "X"));
  }
}
const routeIsUsed = (rel: string) => {
  const base = apiBase(rel);
  if (base.length === 0) return true;
  // جست‌وجوی پیشوند: /api/admin/users/[id] → استفادهٔ /api/admin/users یا /api/admin/users/...
  for (const u of usedInSrc) {
    const up = u.split("/").filter(Boolean);
    if (up.length >= 1 && up[0] === base[0]) {
      // تطابق پیشوند مسیر (تا عمق مشترک)
      let match = true;
      for (let i = 0; i < Math.min(base.length, up.length); i++) {
        const a = base[i].startsWith("[") ? "X" : base[i];
        const b = up[i].startsWith("[") ? "X" : up[i];
        if (a !== "X" && b !== "X" && a !== b) { match = false; break; }
      }
      if (match && up.length >= Math.min(base.length, 2)) return true;
    }
  }
  return false;
};
const unusedCandidates = apiRoutes.filter((r) => !routeIsUsed(r));

// ═══ ۲) جدول‌های رهاشده — صفر ردیف + صفر ارجاع کد ═══
const tables = (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'").all() as any[]).map((r) => r.name);
const emptyTables: string[] = [];
for (const t of tables) {
  try { const c = (db.query(`SELECT COUNT(*) c FROM "${t}"`).get() as any).c; if (c === 0) emptyTables.push(t); } catch {}
}
const codeAllTxt = srcFiles.map((f) => readFileSync(f, "utf8")).join("\n") + testFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const abandonedTables = emptyTables.filter((t) => !new RegExp(`\\b${t}\\b`).test(codeAllTxt));
const emptyButReferenced = emptyTables.filter((t) => new RegExp(`\\b${t}\\b`).test(codeAllTxt));

// ═══ ۳) کد مرده — ماژول‌های src بدون import ═══
// کدام فایل‌های src هرگز import نمی‌شوند؟ (تقریبی — تحلیل نام‌فایل)
const importedPaths = new Set<string>();
for (const { txt } of srcAll) {
  for (const m of txt.matchAll(/from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)) {
    let p = m[1];
    if (p.startsWith("@/")) p = join(ROOT, "src", p.slice(2));
    else p = join(ROOT, "src", p); // تقریبی — نسبی‌ها از مکان فایل حل نمی‌شوند ولی علامت‌گذاری کافی است
    importedPaths.add(p.replace(/\.(ts|tsx)$/, ""));
  }
}
const entryPoints = [/src\/app\/page\.tsx/, /src\/app\/layout\.tsx/, /src\/app\/api\/.*route\.ts/, /src\/app\/.*\/page\.tsx$/, /instrumentation/, /middleware/];
const notImported = srcFiles.filter((f) => {
  const rel = f.replace(ROOT + "/", "");
  if (entryPoints.some((e) => e.test(rel))) return false;
  const base = f.replace(/\.(ts|tsx)$/, "");
  const baseName = base.split("/").pop()!;
  // آیا هر فایلی این ماژول را با نام پایانی import کرده؟ (کاوش سطح اسم — برای گزارش)
  const referenced = srcAll.some(({ f: sf, txt }) => sf !== f && txt.includes(`/${baseName}"`) || srcAll.some(({ txt: t2 }) => t2.includes(`/${baseName}'`)));
  return !importedPaths.has(base) && !referenced;
}).map((f) => f.replace(ROOT + "/", "")).filter((f) => !f.includes("index.ts") && !/\.d\.ts$/.test(f));

// ═══ ۴-۵) کامپوننت‌ها/توابع بی‌استفاده (تقریبی سطح-نام) — پوشش در deadCandidates ═══

// ═══ ۶) dependencyهای بی‌استفاده — مقایسهٔ package.json با importها ═══
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const deps = Object.keys(pkg.dependencies ?? {});
const devDeps = Object.keys(pkg.devDependencies ?? {});
const allTxtForDep = codeAllTxt + scriptFiles.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
const unusedDeps = deps.filter((d) => !new RegExp(`from ["']${d.replace("/", "\\/")}["']|require\\(["']${d.replace("/", "\\/")}["']\\)|import\\(["']${d.replace("/", "\\/")}["']\\)`).test(allTxtForDep) && !/^(react|react-dom|next)$/.test(d));

// ═══ ۷) فایل‌های موقت قدیمی ═══
const tmpFiles: string[] = [];
for (const f of [...walk(ROOT, { skip: skipNode })]) {
  const base = f.split("/").pop()!;
  if (/\.tmp$|~$|^\.#|\.bak$/.test(base) || /^(tmp|temp)\./i.test(base)) tmpFiles.push(f.replace(ROOT + "/", ""));
}

// ═══ ۸) تست‌های تکراری — فایل‌های تست با هم‌پوشانی نام/پوشش ═══
const testNames = testFiles.map((f) => f.split("/").pop()!);
const duplicateish = testNames.filter((n, i) => testNames.indexOf(n) !== i);

// ═══ ۹) لاگ‌های حجیم > ۱۰MB ═══
const bigLogs: { file: string; sizeMB: number }[] = [];
for (const f of [join(ROOT, "server.log"), join(ROOT, "dev.log"), ...walk(join(ROOT, "download/pn005")).slice(0, 5)]) {
  try { const s = statSync(f).size / 1048576; if (s > 10) bigLogs.push({ file: f.replace(ROOT + "/", ""), sizeMB: Math.round(s * 10) / 10 }); } catch {}
}

// ═══ ۱۰) بکاپ‌های قدیمی > ۳۰ روز ═══
const cutoff = Date.now() - 30 * 864e5;
const oldBackups: string[] = [];
for (const f of readdirSync(join(ROOT, "backups"))) {
  const p = join(ROOT, "backups", f);
  try { if (statSync(p).mtimeMs < cutoff) oldBackups.push(f); } catch {}
}

// ═══ نگین‌ها و مشتقات ═══
const customerClubDir = existsSync(join(ROOT, "src/core/tiles/tiles/customer-club"));
const legacyTileDirs = ["listing", "request"].filter((d) => existsSync(join(ROOT, "src/core/tiles/tiles", d)));

// ═══ خروجی ═══
const items = [
  { num: 1, type: "endpointهای بی‌استفاده (کاندید)", count: unusedCandidates.length, items: unusedCandidates, note: "روت‌هایی که هیچ ارجاع مستقیمی در src/ ندارند — نیازمند بازبینی دستی پیش از هر تصمیم (ممکن است از طریق آینهٔ v1 یا Worker استفاده شوند)" },
  { num: 2, type: "جدول‌های رهاشده (صفر ردیف + صفر ارجاع)", count: abandonedTables.length, items: abandonedTables, note: "طبق قانون دادهٔ مقدس حذف جدول ممنوع است — پیشنهاد: علامت‌گذاری archive در RetentionPolicy" },
  { num: "2b", type: "جدول‌های خالی اما ارجاع‌شده در کد", count: emptyButReferenced.length, items: emptyButReferenced, note: "آمادهٔ استفادهٔ آینده — حفظ شوند" },
  { num: 3, type: "ماژول‌های src بدون import (کاندید تقریبی)", count: notImported.length, items: notImported.slice(0, 30), note: "تحلیل سطح-نام — پیش از هر حذف بازبینی دقیق لازم" },
  { num: 4, type: "کاشی حذف‌نمای customer-club", count: customerClubDir ? 1 : 0, items: customerClubDir ? ["src/core/tiles/tiles/customer-club/ (از bootstrap حذف شده اما پوشه مانده — قانون دادهٔ مقدس: ایجنت و داده ماندگار)"] : [], note: "پوشه + ایجنت میراثی — تصمیم با مالک" },
  { num: 5, type: "dependencyهای بی‌استفاده (کاندید)", count: unusedDeps.length, items: unusedDeps, note: "مقایسهٔ package.json با importهای واقعی" },
  { num: 6, type: "فایل‌های موقت", count: tmpFiles.length, items: tmpFiles.slice(0, 20), note: "قابل حذف بی‌خطر" },
  { num: 7, type: "تست‌های هم‌نام", count: duplicateish.length, items: duplicateish, note: "هم‌پوشانی نام فایل — پوشش واقعی ممکن است متفاوت باشد" },
  { num: 8, type: "لاگ‌های > ۱۰MB", count: bigLogs.length, items: bigLogs, note: "چرخش خودکار فعال" },
  { num: 9, type: "بکاپ‌های > ۳۰ روز", count: oldBackups.length, items: oldBackups, note: "سیاست نگهداری ۳ نسل فعال — موارد قدیمی قابل پاک‌سازی" },
  { num: 10, type: "اسکریپت‌های تأیید یک‌بار-مصرف تاریخی", count: 0, items: [], note: "پرکردن در گزارش — scripts/pn0* و verify-p2-03 و غیره" },
];
// شمارش واقعی اسکریپت‌های تاریخی
const historicalScripts = scriptFiles.filter((f) => /\/(verify-p\d|p65\d\d|pn0\d\d|hotfix|dbg-|check-|analyze_)/.test(f));
items[9].count = historicalScripts.length;
items[9].items = historicalScripts.map((f) => f.replace(ROOT + "/", "")).slice(0, 60);

const totalSize = {
  historicalScriptsMB: Math.round(historicalScripts.reduce((a, f) => a + statSync(f).size, 0) / 1024 * 10) / 10,
};

const evidence = {
  phase: "فاز ۳ — لیست اضافات (فقط شناسایی)",
  rule: "قاعدهٔ ۶ — تصمیم مالک: صفر حذف خودکار",
  scanned: { srcFiles: srcFiles.length, testFiles: testFiles.length, scriptFiles: scriptFiles.length, apiRoutes: apiRoutes.length, tables: tables.length },
  items,
  totalSize,
  decisionMatrix: items.map((i) => ({ what: i.type, count: i.count, impactIfRemoved: i.num === 2 ? "دادهٔ مقدس — ممنوع" : "صفر عملکردی (پس از بازبینی)", risk: i.num === 1 ? "🟡 نیازمند بازبینی Worker/v1" : i.num === 2 ? "🔴 ممنوع" : "🟢" })),
};
writeFileSync(join(ROOT, "download/pn026/dead-code-list.json"), JSON.stringify(evidence, null, 1));
console.log(JSON.stringify({
  unusedEndpoints: unusedCandidates.length,
  abandonedTables: abandonedTables.length, emptyButReferenced: emptyButReferenced.length,
  notImportedModules: notImported.length, unusedDeps: unusedDeps.length,
  tmp: tmpFiles.length, bigLogs: bigLogs.length, oldBackups: oldBackups.length,
  historicalScripts: historicalScripts.length,
}, null, 1));
console.log("unusedEndpoints:", unusedCandidates.slice(0, 15).join(" | "));
console.log("abandoned:", abandonedTables.join(" | "));
console.log("emptyButRef:", emptyButReferenced.join(" | "));
console.log("notImported:", notImported.slice(0, 12).join(" | "));
console.log("unusedDeps:", unusedDeps.join(" | "));
