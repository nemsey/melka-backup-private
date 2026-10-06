/**
 * تست‌های PHASE 6 — مرز دیدپذیری Feature/Prediction (P6-09)
 * ------------------------------------------------------
 * نسخه تست‌محور همان قانون اسکنر audit-feature-visibility.sh (P6-08):
 *  ۱) صفر import (ارزشی یا تایپ) از ماژول‌های feature/prediction در src/app/**
 *  ۲) صفر import نماد بدنه از barrel هوشمندی در src/app/**
 * دسترسی فقط از طریق ایجنت‌ها (src/core/agent) مجاز است — «هیچ Feature/Prediction
 * به UI نشت نمی‌کند» (قاعده ۹ بخش D دستور).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(import.meta.dir, "..", "src", "app");
const FEATURE_DIR = join(import.meta.dir, "..", "src", "core", "intelligence", "feature");
const PREDICTION_DIR = join(import.meta.dir, "..", "src", "core", "intelligence", "prediction");

/** جمع بازگشتی فایل‌های ts/tsx */
function collectTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collectTs(p, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** استخراج نمادهای بدنه (کلاس/تابع/ثابت) با منطق میدان-آگاه اسکنر */
function extractBodySymbols(dirs: string[]): Set<string> {
  const symbols = new Set<string>();
  for (const dir of dirs) {
    for (const f of collectTs(dir)) {
      const lines = readFileSync(f, "utf8").split("\n");
      for (const line of lines) {
        const m = line.match(/^export (?:async )?(?:function|class|const) ([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) symbols.add(m[1]!);
      }
    }
  }
  return symbols;
}

describe("P6-09 مرز دیدپذیری Feature/Prediction (اسکن src/app)", () => {
  const appFiles = collectTs(APP_DIR);

  test("صفر import مستقیم از feature/prediction در UI و API — دسترسی فقط از طریق ایجنت", () => {
    expect(appFiles.length).toBeGreaterThan(40); // سیم‌کشی اسکن: واقعاً فایل‌ها را می‌بینیم (۴۷ فایل فعلی)
    const violators: string[] = [];
    for (const f of appFiles) {
      const content = readFileSync(f, "utf8");
      // هر پیشوندی: alias (@/core/...) یا نسبی (../../core/...)
      const re = /from ["'][^"']*core\/intelligence\/(?:feature|prediction)(?:\/[^"']*)?["']/;
      if (re.test(content)) violators.push(f);
    }
    expect(violators).toEqual([]);
  });

  test("صفر import نماد بدنه از barrel هوشمندی در src/app", () => {
    const bodySymbols = extractBodySymbols([FEATURE_DIR, PREDICTION_DIR]);
    expect(bodySymbols.size).toBeGreaterThanOrEqual(20); // سیم‌کشی: نمادها استخراج شدند

    const violators: string[] = [];
    for (const f of appFiles) {
      const content = readFileSync(f, "utf8");
      const barrelImports = content.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*core\/intelligence["']/g);
      for (const m of barrelImports) {
        const bindings = m[1]!.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!.trim());
        for (const b of bindings) {
          if (b && bodySymbols.has(b)) violators.push(`${f} ← ${b}`);
        }
      }
    }
    expect(violators).toEqual([]);
  });
});
