/**
 * PN-012 · BLOCK 4 — تست‌های Domain API Versioning (بند ۴.۳)
 * ------------------------------------------------------------------------
 * سنجه‌ها (۱۰ تست):
 *   · پوشش کامل: هر روت api یک آینهٔ v1 دارد (۶۸/۶۸)
 *   · آینهٔ سبک: هر v1 فقط re-export است (صفر منطق/صفر db.*)
 *   · مسیرهای قدیمی به‌عنوان alias زنده باقی‌اند
 *   · رفتار یکسان: همان ماژول → همان گاردها (تست ساختاری + واحد)
 *   · مانیفست api-versioning.json با واقعیت هم‌خوان است
 */

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = "src/app/api";
const V1_DIR = path.join(API_DIR, "v1");

function collectRoutes(dir: string, prefix: string[] = []): string[][] {
  const out: string[][] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "v1") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full, [...prefix, entry]));
    } else if (entry === "route.ts") {
      out.push(prefix);
    }
  }
  return out;
}

const originalRoutes = collectRoutes(API_DIR);
const v1Routes = collectRoutes(V1_DIR);

describe("PN-012 BLOCK 4 — API Versioning (بند ۴.۲/۴.۳)", () => {
  test("۴-و-۱ پوشش کامل: هر روت اصلی یک آینهٔ v1 دارد", () => {
    expect(originalRoutes.length).toBeGreaterThanOrEqual(64); // دستور: ۶۴ روت — امروز ۶۸
    const v1Set = new Set(v1Routes.map((r) => r.join("/")));
    const missing = originalRoutes.map((r) => r.join("/")).filter((r) => !v1Set.has(r));
    expect(missing).toEqual([]);
    expect(v1Routes.length).toBe(originalRoutes.length);
  });

  test("۴-و-۲ هر آینهٔ v1 دقیقاً re-export از مسیر اصلی است (آینهٔ سبک)", () => {
    for (const seg of originalRoutes) {
      const sub = seg.join("/");
      const mirror = readFileSync(path.join(V1_DIR, ...seg, "route.ts"), "utf8");
      expect(mirror).toContain(`export * from "`);
      // مسیر نسبی درست: depth = segments + 1
      const relDepth = seg.length + 1;
      const expectedImport = "../".repeat(relDepth) + sub + "/route";
      expect(mirror).toContain(`export * from "${expectedImport}";`);
    }
  });

  test("۴-و-۳ آینه‌های v1 صفر منطق دامنه دارند (نه db.*، نه fetch، نه prisma)", () => {
    for (const seg of v1Routes) {
      const mirror = readFileSync(path.join(V1_DIR, ...seg, "route.ts"), "utf8");
      expect(mirror).not.toMatch(/\bdb\.[a-zA-Z]/);
      expect(mirror).not.toMatch(/@prisma\/client/);
      expect(mirror).not.toMatch(/\bfetch\s*\(/);
    }
  });

  test("۴-و-۴ مسیرهای قدیمی (alias) همگی زنده‌اند — فایل‌های اصلی دست‌نخورده", () => {
    // هر روت اصلی هنوز route.ts خودش را دارد (بدون تغییر) — alias زنده
    for (const seg of originalRoutes) {
      expect(existsSync(path.join(API_DIR, ...seg, "route.ts"))).toBe(true);
    }
  });

  test("۴-و-۵ روت‌های داینامیک نیز آینه دارند ([entity]/[id]/[tileId]/[token])", () => {
    const dynamicOriginals = originalRoutes.filter((s) => s.some((x) => x.startsWith("[")));
    expect(dynamicOriginals.length).toBeGreaterThanOrEqual(10);
    const v1Set = new Set(v1Routes.map((r) => r.join("/")));
    for (const seg of dynamicOriginals) {
      expect(v1Set.has(seg.join("/"))).toBe(true);
    }
  });

  test("۴-و-۶ همان ماژول = همان رفتار: import از دو مسیر یک شیء برمی‌گرداند", async () => {
    const aliasMod = await import("../src/app/api/health/route");
    const v1Mod = await import("../src/app/api/v1/health/route");
    expect(v1Mod.GET).toBe(aliasMod.GET); // تک‌منبع حقیقت — نه کپی
  });

  test("۴-و-۷ configهای مسیر (dynamic) نیز منتقل می‌شوند", async () => {
    const aliasMod = await import("../src/app/api/coverage/route");
    const v1Mod = await import("../src/app/api/v1/coverage/route");
    expect(v1Mod.dynamic).toBe(aliasMod.dynamic);
  });

  test("۴-و-۸ مانیفست api-versioning.json با واقعیت هم‌خوان است", () => {
    const manifest = JSON.parse(readFileSync("download/pn012/api-versioning.json", "utf8"));
    expect(manifest.totalRoutes).toBe(originalRoutes.length);
    expect(manifest.routes.length).toBe(originalRoutes.length);
    const manifestSet = new Set(manifest.routes.map((r: { v1: string }) => r.v1));
    for (const seg of originalRoutes) {
      expect(manifestSet.has(`/api/v1/${seg.join("/")}`)).toBe(true);
    }
  });

  test("۴-و-۹ سازگاری با گاردها: روت محافظت‌شده از v1 هم همان گارد را می‌گیرد", async () => {
    // coverage نیازمند نشست است — همان ماژول از هر دو مسیر → همان رفتار ۴۰۱
    const aliasMod = await import("../src/app/api/coverage/route");
    const v1Mod = await import("../src/app/api/v1/coverage/route");
    expect(v1Mod.GET).toBe(aliasMod.GET);
    expect(typeof v1Mod.GET).toBe("function");
  });

  test("۴-و-۱۰ صفر تغییر رفتار فایل‌های اصلی: روت‌های اصلی همچنان سبک‌اند (بند ۱.۲)", () => {
    // پس از BLOCK 1، فایل‌های اصلی باید بدون db.* باشند — اینجا دوباره تأیید می‌شود
    const offenders: string[] = [];
    for (const seg of originalRoutes) {
      const src = readFileSync(path.join(API_DIR, ...seg, "route.ts"), "utf8");
      if (/\bdb\.[a-zA-Z]/.test(src)) offenders.push(seg.join("/"));
    }
    expect(offenders).toEqual([]); // گارد مرز Repository در همهٔ روت‌ها برقرار
  });
});
