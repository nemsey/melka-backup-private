/**
 * PN-012 · BLOCK 4 (بند ۴.۲) — مولد آینه‌های /api/v1
 * ------------------------------------------------------
 * برای هر روت ‎src/app/api/<sub>/route.ts‎ یک آینهٔ ‎src/app/api/v1/<sub>/route.ts‎
 * می‌سازد که با ‎export *‎ همهٔ handlerها (GET/POST/...) و configها (dynamic و…)
 * را از مسیر اصلی re-export می‌کند:
 *   · صفر تغییر رفتار (بند ۴.۲)
 *   · تک‌منبع حقیقت — منطق فقط در مسیر اصلی
 *   · مسیر قدیمی = alias زنده (بند ۴.۲)
 * idempotent: فایل موجود را بازنویسی می‌کند (متن deterministic است).
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const API_DIR = "/home/z/my-project/src/app/api";
const V1_DIR = path.join(API_DIR, "v1");

/** گردآوری همهٔ زیرمسیرهای دارای route.ts (نسبی به api/) */
function collectRoutes(dir: string, prefix: string[] = []): string[][] {
  const out: string[][] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "v1") continue; // خودش
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full, [...prefix, entry]));
    } else if (entry === "route.ts") {
      out.push(prefix);
    }
  }
  return out;
}

const routes = collectRoutes(API_DIR);
let created = 0;
const manifest: Array<{ aliasOf: string; v1: string }> = [];

for (const seg of routes) {
  const sub = seg.join("/");
  const relDepth = seg.length + 1; // از دایرکتوری آینه تا api/
  const relImport = "../".repeat(relDepth) + sub + "/route";
  const mirrorDir = path.join(V1_DIR, ...seg);
  const mirrorPath = path.join(mirrorDir, "route.ts");
  const content = `/**
 * /api/v1/${sub} — نسخهٔ v1 (PN-012 · BLOCK 4 · بند ۴.۲)
 * آینهٔ سبک مسیر اصلی ‎/api/${sub}‎ — همهٔ handlerها و configها re-export می‌شوند.
 * صفر تغییر رفتار · تک‌منبع حقیقت در مسیر اصلی · مسیر قدیمی = alias زنده.
 */
export * from "${relImport}";
`;
  mkdirSync(mirrorDir, { recursive: true });
  const existed = existsSync(mirrorPath);
  writeFileSync(mirrorPath, content, "utf8");
  if (!existed) created++;
  manifest.push({ aliasOf: `/api/${sub}`, v1: `/api/v1/${sub}` });
}

writeFileSync(
  "/home/z/my-project/download/pn012/api-versioning.json",
  JSON.stringify(
    {
      schema: "melka-pn012-api-versioning",
      generatedAt: new Date().toISOString(),
      policy: "v1 = مسیر نسخه‌دار (re-export سبک) · مسیر قدیمی = alias زنده · صفر تغییر رفتار",
      totalRoutes: manifest.length,
      created,
      routes: manifest,
    },
    null,
    2,
  ),
  "utf8",
);
console.log(`OK — ${manifest.length} روت آینه‌سازی شد (${created} تازه) → download/pn012/api-versioning.json`);
