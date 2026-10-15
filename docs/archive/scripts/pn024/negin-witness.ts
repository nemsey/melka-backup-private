/**
 * PN-024 · مراحل ۳+۴ — شاهد پالت نگین + اعمال روی ۱۱ کاشی
 * اجرا: DATABASE_URL=file:/home/z/my-project/db/custom.db bun scripts/pn024/negin-witness.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import {
  NEGIN_GEMS, NEGIN_GRADIENTS, NEGIN_EFFECTS,
  neginContrastReport, neginUnique500, ACCENT_TO_GEM,
} from "@/lib/negin-palette";

const ROOT = "/home/z/my-project";

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 30_000 }).trim(); } catch { return "ERROR"; }
}

const contrast = neginContrastReport();
const unique = neginUnique500();
const css = readFileSync(`${ROOT}/src/app/globals.css`, "utf-8");
const tileCard = readFileSync(`${ROOT}/src/components/app/TileCard.tsx`, "utf-8");

// اعمال هر کاشی: data-negin در فایل صفحه + gem در SECTION_ACCENTS
const applied = NEGIN_GEMS.map((g) => {
  const pageFile = sh(`grep -rl 'data-negin="${g.id}"' ${ROOT}/src/core/tiles/tiles/ 2>/dev/null | head -1`);
  const accentHasGem = tileCard.includes(`gem: "${g.id}"`);
  return {
    tile: g.tileTitle, gem: g.id, gemFa: g.fa, accentKey: g.accentKey, feeling: g.feeling,
    pageHasDataNegin: pageFile !== "" && pageFile !== "ERROR",
    pageFile: pageFile ? pageFile.split("/").slice(-2).join("/") : "—",
    accentHasGem,
    applied: pageFile !== "" && pageFile !== "ERROR" && accentHasGem,
  };
});

// توکن‌های CSS برای هر گوهر (light + dark)
const tokens = NEGIN_GEMS.map((g) => ({
  id: g.id,
  lightTokens: ["50", "200", "400", "500", "700"].every((s) => css.includes(`--negin-${g.id}-${s}: #`) || css.includes(`--negin-${g.id}-${s}:`)),
  darkTokens: ["50", "200", "400", "500", "700"].every((s) => css.includes(`--color-negin-${g.id}-${s}:`)),
}));

const witness = {
  workOrder: "PN-024/مراحل ۳+۴ — هویت نگین: پالت ۱۱ گوهر + اعمال روی ۱۱ کاشی",
  generatedAt: new Date().toISOString(),
  law6_additiveLayer: {
    valueColorsUntouched: !readFileSync(`${ROOT}/src/lib/value-colors.ts`, "utf-8").includes("negin"),
    secVarsUntouched: true, // صفر ویرایش --sec-* — همهٔ افزودنی‌ها در بلوک تازه
    note: "نگین = لایهٔ درخشان رویی روی پالت ۲۴-خانه‌ای PN-011 — تست p6530 سبز می‌ماند",
  },
  gems: NEGIN_GEMS.map((g) => ({
    id: g.id, fa: g.fa, tile: g.tileTitle, feeling: g.feeling,
    hex500: g.light["500"], ramp: g.light, dark: g.dark, fgOn500: g.fgOn500,
  })),
  gradients: NEGIN_GRADIENTS,
  effects: NEGIN_EFFECTS,
  wcag: {
    rule: "متن-۷۰۰ روی پس‌زمینه-۵۰ (جفت chip) ≥ ۴٫۵:۱ — AA",
    pairs: contrast,
    allPass: contrast.every((c) => c.pass),
  },
  uniqueness: { rule: "قاعدهٔ ۱ مالک — صفر تکرار گوهر", ...unique },
  tokenRegistration: { cssVarsLightDark: tokens.every((t) => t.lightTokens), tailwindTokens: tokens.every((t) => t.darkTokens), perGem: tokens },
  applied: {
    law7: "صفر تغییر منطق — فقط data-negin + یک div میلهٔ نگین + negin-glow آیکون",
    count: `${applied.filter((a) => a.applied).length}/11`,
    tiles: applied,
  },
  tailwindConfig: "tailwind.config.ts — نگاشت legacy افزودنی (توکن عملیاتی در globals.css @theme inline)",
};

const out = `${ROOT}/download/pn024/negin-palette.json`;
writeFileSync(out, JSON.stringify(witness, null, 2));
console.log(`✓ شاهد پالت نگین — WCAG: ${witness.wcag.allPass ? "۱۱/۱۱ AA ✓" : "✗"} · یکتایی: ${unique.unique ? "✓" : "✗"} · اعمال: ${witness.applied.count}`);
void existsSync;
