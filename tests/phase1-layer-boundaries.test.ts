/**
 * تست‌های PHASE 1 — P1-03: مرزهای لایه‌ای UI ↔ سرور
 * ------------------------------------------------------
 * ۱. مستقیم: هیچ tsx در components/app یا core/tiles نباید @/lib/db یا
 *    @prisma/client را (حتی type-only) import کند.
 * ۲. بازگشتی: از هر tsx آن ناحیه، گراف import را تا انتها پیمایش می‌کنیم؛
 *    هیچ ماژول قابل‌دستیابی نباید این دو را «ارزشی» import کند
 *    (import ارزشی = ورود واقعی Prisma به باندل کلاینت).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const SRC = "/home/z/my-project/src";
const FORBIDDEN = ["@/lib/db", "@prisma/client"];

// ---------- جمع‌آوری فایل‌های tsx ناحیه UI ----------
function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collectTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const UI_DIRS = [join(SRC, "components/app"), join(SRC, "core/tiles")];
const UI_FILES = UI_DIRS.flatMap((d) => collectTsx(d));

// ---------- تجزیه import و تفکیک type-only ----------
interface ImportEdge {
  target: string; // مسیر ماژول خام («@/lib/db» یا «./types»)
  typeOnly: boolean;
}

function parseImports(content: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  // import … from "…"  |  export … from "…"
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*\s{},]*?)from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    edges.push({ target: m[2], typeOnly: Boolean(m[1]) });
  }
  return edges;
}

// ---------- تبدیل مسیر ماژول به فایل ----------
function resolveModule(target: string, fromFile: string): string | null {
  let base: string;
  if (target.startsWith("@/")) {
    base = join(SRC, target.slice(2));
  } else if (target.startsWith(".")) {
    base = resolve(dirname(fromFile), target);
  } else {
    return null; // ماژول بسته (react و…) — خارج از مرز
  }
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, "index.ts"), join(base, "index.tsx"), base];
  for (const c of candidates) {
    if (existsSync(c) && !statMaybeDir(c)) return c;
  }
  return null;
}

function statMaybeDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------- پیمایش گراف از یک فایل ----------
interface WalkResult {
  visitedModules: Set<string>; // مسیر فایل‌های پیموده‌شده
  violations: Array<{ from: string; via: string; target: string }>; // import ارزشی ممنوع
  typeOnlyHits: Array<{ via: string; target: string }>; // فقط گزارش (پاک شده در کامپایل)
}

function walkImports(startFile: string): WalkResult {
  const visited = new Set<string>();
  const violations: WalkResult["violations"] = [];
  const typeOnlyHits: WalkResult["typeOnlyHits"] = [];
  const queue: string[] = [startFile];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const content = readFileSync(file, "utf8");
    for (const edge of parseImports(content)) {
      if (FORBIDDEN.includes(edge.target)) {
        if (edge.typeOnly) {
          typeOnlyHits.push({ via: file, target: edge.target });
        } else {
          violations.push({ from: startFile, via: file, target: edge.target });
        }
        continue; // خود ماژول ممنوع را پیمایش نکن
      }
      const resolved = resolveModule(edge.target, file);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return { visitedModules: visited, violations, typeOnlyHits };
}

describe("P1-03 / مرز لایه‌ای — مستقیم", () => {
  test(`هیچ tsx ناحیه UI نباید @/lib/db یا @prisma/client را import کند (حتی type-only) — ${UI_FILES.length} فایل`, () => {
    const offenders: string[] = [];
    for (const f of UI_FILES) {
      const content = readFileSync(f, "utf8");
      for (const edge of parseImports(content)) {
        if (FORBIDDEN.includes(edge.target)) offenders.push(`${f} → ${edge.target}${edge.typeOnly ? " (type-only)" : ""}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("P1-03 / مرز لایه‌ای — بازگشتی (گراف import)", () => {
  test("از هیچ tsx ناحیه UI، ماژولی که @/lib/db یا @prisma/client را «ارزشی» import کند قابل‌دستیابی نیست", () => {
    const all: WalkResult["violations"] = [];
    for (const f of UI_FILES) {
      all.push(...walkImports(f).violations);
    }
    expect(all).toEqual([]);
  });

  test("ماژول‌های مشترک کلاینت-امن واقعاً امن‌اند (lib/types + lib/listing/types + shared)", () => {
    const guardFiles = [
      join(SRC, "lib/types/customer-lifecycle.ts"),
      join(SRC, "lib/listing/types.ts"),
      join(SRC, "components/app/shared/kpi-card.tsx"),
      join(SRC, "components/app/shared/data-source.tsx"),
      join(SRC, "components/app/shared/step-report-list.tsx"),
      join(SRC, "components/app/shared/use-tile-data.ts"),
    ];
    for (const f of guardFiles) {
      const r = walkImports(f);
      expect(r.violations).toEqual([]);
      // حتی type-only هم نباشد — این ماژول‌ها مرز تمیز هستند
      expect(r.typeOnlyHits).toEqual([]);
    }
  });

  test("نقض سخت قبلی رفع شده: پنل مدیریت مشتریان دیگر به مسیر Prisma نمی‌رسد", () => {
    const panel = join(SRC, "core/tiles/tiles/request/CustomerManagementPanel.tsx");
    const r = walkImports(panel);
    expect(r.violations).toEqual([]);
    expect(r.typeOnlyHits).toEqual([]);
    // و از ماژول خالص چرخه عمر import می‌کند
    expect(readFileSync(panel, "utf8")).toContain("@/lib/types/customer-lifecycle");
  });

  test("RequestsPage از ماژول خالص نوع می‌گیرد (نقض نرم قبلی)", () => {
    const page = readFileSync(join(SRC, "core/tiles/tiles/request/RequestsPage.tsx"), "utf8");
    expect(page).toContain('from "@/lib/types/customer-lifecycle"');
    expect(page).not.toContain('from "@/lib/request/customer-mgmt"');
  });

  test("listing/types دیگر @prisma/client را import نمی‌کند (نقض نرم قبلی)", () => {
    const c = readFileSync(join(SRC, "lib/listing/types.ts"), "utf8");
    expect(c).not.toContain('from "@prisma/client"');
    expect(c).toContain("ListingRecordDTO");
  });

  test("customer-mgmt همچنین انواع را re-export می‌کند (سازگاری عقب‌وار سرور/تست)", () => {
    const c = readFileSync(join(SRC, "lib/request/customer-mgmt.ts"), "utf8");
    expect(c).toContain('from "@/lib/types/customer-lifecycle"');
  });
});
