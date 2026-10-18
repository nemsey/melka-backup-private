#!/usr/bin/env bun
/** PN-026 · فاز ۳ — تحلیل دقیق endpointهای بدون استفاده (پوشش کامل نقل‌قول‌ها) */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project";
function walk(d: string, out: string[] = [], ext = /\.(ts|tsx)$/, skip = /node_modules|\.git$|\.next|\/db\/|\/backups\/|\/download\//): string[] {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!skip.test(p)) walk(p, out, ext, skip); continue; }
    if (ext.test(e.name)) out.push(p);
  }
  return out;
}

const srcFiles = walk(join(ROOT, "src"));

// همهٔ رشته‌های /api/... از هر نوع نقل‌قول (دابل/تک/بک‌تیک) — مسیر بدون پیشوند api ذخیره می‌شود
const used: string[] = [];
for (const f of srcFiles) {
  const t = readFileSync(f, "utf8");
  for (const m of t.matchAll(/["'`](\/api\/[a-zA-Z0-9\-_\/\[\].{}$?&=]*)["'`\?]/g)) {
    used.push(m[1].replace(/^\/api/, "").replace(/\$\{[^}]*\}/g, "X").replace(/["'`].*/g, ""));
  }
  // الگوهای با پیشوند متغیر: `/api/${...}` یا `/api/some${x}` — همچنین مسیرهای بدون /api که api() با پیشوند می‌گیرد
  for (const m of t.matchAll(/["'`]\/(auth|crm|agent|admin|sync|matching|graphs|runtime|coverage|version|health|indicators|requests|listings|experts|divar|gap|instagram|pm|arm|melk-public|market-index|smart-matching|file-finder|intelligence|opportunity-alerts|connection|users)(\/[a-zA-Z0-9\-_\/\[\].{}$?&=]*)*["'`\?]/g)) {
    used.push(("/" + m[1] + (m[2] ?? "")).replace(/\$\{[^}]*\}/g, "X").replace(/["'`].*/g, ""));
  }
}
// روت‌های واقعی (همهٔ سطح‌ها)
const routes: string[] = [];
(function w(d: string) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) w(p);
    else if (e.name === "route.ts") routes.push(p.replace(ROOT + "/src/app/api", "").replace("/route.ts", ""));
  }
})(join(ROOT, "src/app/api"));

const norm = (s: string) => s.split("/").filter(Boolean).map((x) => (x.startsWith("[") ? "X" : x));
const routeUsed = (rel: string): boolean => {
  const parts = norm(rel);
  if (parts.length === 0) return true;
  return used.some((u) => {
    const up = norm(u);
    if (up.length === 0 || up[0] !== parts[0]) return false;
    let ok = true;
    for (let i = 0; i < Math.min(parts.length, up.length); i++) {
      const a = parts[i], b = up[i];
      if (a !== "X" && b !== "X" && a !== b) { ok = false; break; }
    }
    return ok && up.length >= Math.min(parts.length, 2);
  });
};
const unused = routes.filter((r) => !routeUsed(r));
const mainUnused = unused.filter((r) => !r.startsWith("/v1"));
const v1Unused = unused.filter((r) => r.startsWith("/v1"));

// اعتبارسنجی متقاطع: کدام unused واقعاً در Worker/scripts استفاده می‌شوند؟
const workerScripts = [...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "src/core/runtime"))];
const scriptTxt = workerScripts.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n");
const usedByWorker = mainUnused.filter((r) => scriptTxt.includes(r) || scriptTxt.includes(r.replace(/^\//, "")));
const trulyUnused = mainUnused.filter((r) => !usedByWorker.includes(r));

const result = { totalRoutes: routes.length, usedStrings: used.length, mainUnused, v1UnusedCount: v1Unused.length, usedByWorker, trulyUnused };
writeFileSync("/tmp/pn026-endpoints.json", JSON.stringify(result, null, 1));
console.log(JSON.stringify({ totalRoutes: routes.length, mainUnused: mainUnused.length, v1Unused: v1Unused.length, usedByWorker: usedByWorker.length, trulyUnused: trulyUnused.length }, null, 1));
console.log("mainUnused:", mainUnused.join(" | "));
console.log("usedByWorker (حذف از فهرست):", usedByWorker.join(" | "));
