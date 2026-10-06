/**
 * ممیزی گراف import لایه هوشمندی — بخش بازگشتی audit-intelligence-boundary.sh
 * -------------------------------------------------------------------------
 * از هر فایل «ریشه خالص» (۱۱ قرارداد + engines/index + engine-deps)، گراف
 * importهای «ارزشی» (غیر type-only) را تا انتها پیمایش می‌کند؛ رسیدن به
 * @prisma/client یا @/lib/db = نقض مرز. (الگوی P1-03 / P3-02 تست)
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SRC = "/home/z/my-project/src";
const INTEL = join(SRC, "core/intelligence");
const FORBIDDEN = ["@/lib/db", "@prisma/client"];

interface ImportEdge {
  target: string;
  typeOnly: boolean;
}

function parseImports(content: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*\s{},]*?)from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    edges.push({ target: m[2], typeOnly: Boolean(m[1]) });
  }
  return edges;
}

function statMaybeDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function resolveModule(target: string, fromFile: string): string | null {
  let base: string;
  if (target.startsWith("@/")) {
    base = join(SRC, target.slice(2));
  } else if (target.startsWith(".")) {
    base = resolve(dirname(fromFile), target);
  } else {
    return null; // ماژول بسته — خارج از مرز
  }
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  for (const c of candidates) {
    if (existsSync(c) && !statMaybeDir(c)) return c;
  }
  return null;
}

function collectTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collectTs(p, acc);
    else if (e.name.endsWith(".ts")) acc.push(p);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function walkImports(startFile: string): Set<string> {
  const visited = new Set<string>();
  const queue = [startFile];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const content = readFileSync(file, "utf8");
    for (const edge of parseImports(content)) {
      if (edge.typeOnly) continue; // import type در کامپایل پاک می‌شود
      const resolved = resolveModule(edge.target, file);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

// ---------- اجرا ----------

const pureRoots = [...collectTs(join(INTEL, "engines")), join(INTEL, "engine-deps.ts")];
const violations: string[] = [];

for (const root of pureRoots) {
  const graph = walkImports(root);
  for (const mod of graph) {
    const content = readFileSync(mod, "utf8");
    for (const edge of parseImports(content)) {
      if (!edge.typeOnly && FORBIDDEN.includes(edge.target)) {
        violations.push(`${root} ⇝ ${mod} → ${edge.target}`);
      }
    }
  }
}

console.log(`ریشه‌های خالص بررسی‌شده: ${pureRoots.length} (۱۱ قرارداد + index + engine-deps)`);
if (violations.length > 0) {
  console.error("نقض مرز (مسیر ارزشی به Prisma/lib-db):");
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log("✓ هیچ ریشه خالصی از مسیر ارزشی به Prisma/lib-db نمی‌رسد");
