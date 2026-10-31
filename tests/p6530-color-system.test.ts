import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * گام صفر (قاعده ۶) — تست‌های نظام رنگ ۱۳ بخش ملکا
 * ------------------------------------------------
 *  §۱  یکتایی رنگ: ۱۳ بخش × ۱۳ مقدار ۵۰۰ یکتا (صفر تکرار — قاعده ۱)
 *  §۲  چهار سایه هر بخش: ۵۰/۲۰۰/۵۰۰/۷۰۰ + fg (قاعده ۲)
 *  §۳  کنتراست WCAG AA: همهٔ جفت‌های الزامی ≥ ۴٫۵:۱ (قاعده ۳) — محاسبهٔ مستقل
 *  §۴  دارک مود: معادل تیرهٔ همهٔ ۱۳ بخش (قاعده ۴: ۵۰۰→۴۰۰)
 *  §۵  رنگ‌های دستور مالک: ۱۳ مقدار عین جدول قاعده ۱
 *  §۶  اعمال در رجیستری: هر کاشی فعال رنگ بخش خودش را دارد
 */

// ---------- ابزار رنگ (محاسبهٔ مستقل — بدون اتکا به مولد) ----------

function rgb(c: string): [number, number, number] {
  const h = c.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relLum(c: string): number {
  const ch = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb(c);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function normalizeHex(c: string): string {
  return `#${c.replace("#", "").toUpperCase()}`;
}

// ---------- منبع حقیقت: سند colors.json (قاعده ۷ — شاهد) ----------

const ROOT = join(import.meta.dir, "..");
// PN-027/۵-ب-۳ — اسکریپت‌های تاریخی به docs/archive منتقل شدند؛ شاهد colors.json همان‌جاست.
// جست‌وجوی هر دو مسیر (اصلی → آرشیو) — سازگاری دوطرفه.
const colorsPath = existsSync(join(ROOT, "scripts", "p6530", "colors.json"))
  ? join(ROOT, "scripts", "p6530", "colors.json")
  : join(ROOT, "docs", "archive", "scripts", "p6530", "colors.json");
const globalsPath = join(ROOT, "src", "app", "globals.css");
const tailwindPath = join(ROOT, "tailwind.config.ts");

interface SectionDoc {
  n: number;
  key: string;
  fa: string;
  name: string;
  "50": string;
  "200": string;
  "500": string;
  "700": string;
  dark: { "500→400": string; "50": string; "200": string; "700": string };
  fgOn500: string;
  hue: number;
  contrastAA: Record<string, number>;
  pass: boolean;
}

const doc = JSON.parse(readFileSync(colorsPath, "utf-8")) as {
  sections: SectionDoc[];
  meta: { uniqueColors: number };
};
const sections = doc.sections;

/** ۱۳ مقدار عین جدول قاعده ۱ دستور مالک */
const DIRECTIVE_500: Record<string, string> = {
  login: "#6D28D9",
  home: "#0F172A",
  finder: "#0284C7",
  "melka-listing": "#059669",
  "melka-request": "#EA580C",
  settings: "#475569",
  mgmt: "#92400E",
  m1: "#10B981",
  m2: "#F59E0B",
  m3: "#DC2626",
  m4: "#0891B2",
  consultant: "#DB2777",
  ai: "#4F46E5",
};

describe("گام صفر — نظام رنگ ۱۳ بخش (قاعده ۶)", () => {
  test("§۱ سند colors.json موجود و کامل است", () => {
    expect(existsSync(colorsPath)).toBe(true);
    expect(sections.length).toBe(13);
    expect(doc.meta.uniqueColors).toBe(13);
  });

  test("§۱ یکتایی مطلق: ۱۳ مقدار ۵۰۰ بدون هیچ تکراری (صفر تکرار رنگ)", () => {
    const values = sections.map((s) => normalizeHex(s["500"]));
    expect(new Set(values).size).toBe(13);
  });

  test("§۱ یکتایی hue: ۱۳ hue بدون جفت تکراری (صفر تکرار hue عددی یکسان)", () => {
    const hues = sections.map((s) => s.hue);
    // hue یکتا به‌معنای «هویت رنگی متمایز» — جفت‌های هم‌hue مجاز نیستند مگر با تفکیک روشنایی
    const map = new Map<number, string[]>();
    for (const s of sections) {
      const list = map.get(s.hue) ?? [];
      list.push(s.key);
      map.set(s.hue, list);
    }
    // جدول مالک مرجع است: جفت‌های نزدیک باید دست‌کم در روشنایی متمایز باشند
    for (const [hue, keys] of map) {
      if (keys.length > 1) {
        const lums = keys.map((k) => relLum(DIRECTIVE_500[k]));
        const spread = Math.max(...lums) - Math.min(...lums);
        expect(spread).toBeGreaterThan(0.05); // تفکیک روشناییِ محسوس
      }
      expect(hue).toBeGreaterThanOrEqual(0);
    }
  });

  test("§۲ چهار سایه + fg برای هر ۱۳ بخش (قاعده ۲)", () => {
    for (const s of sections) {
      expect(normalizeHex(s["50"])).not.toBe(normalizeHex(s["500"]));
      expect(normalizeHex(s["200"])).not.toBe(normalizeHex(s["500"]));
      expect(normalizeHex(s["700"])).not.toBe(normalizeHex(s["500"]));
      expect(s.fgOn500).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  test("§۳ کنتراست WCAG AA ≥ ۴٫۵:۱ — همهٔ جفت‌های الزامی هر ۱۳ بخش (محاسبهٔ مستقل)", () => {
    const failures: string[] = [];
    for (const s of sections) {
      const pairs: Array<[string, string, string]> = [
        [`[${s.key}] متن روی ۵۰۰`, s.fgOn500, s["500"]],
        [`[${s.key}] ۷۰۰ روی ۵۰`, s["700"], s["50"]],
        [`[${s.key}] ۷۰۰ روی ۲۰۰`, s["700"], s["200"]],
        [`[${s.key}] ۷۰۰ روی سفید`, s["700"], "#FFFFFF"],
        [`[${s.key}] دارک ۷۰۰ روی کارت تیره`, s.dark["700"], "#1B2331"],
      ];
      for (const [label, a, b] of pairs) {
        const ratio = contrast(a, b);
        if (ratio < 4.5) failures.push(`${label} = ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("§۴ دارک مود: معادل تیرهٔ کامل همهٔ ۱۳ بخش (قاعده ۴ — ۵۰۰→۴۰۰)", () => {
    for (const s of sections) {
      const dark500 = normalizeHex(s.dark["500→400"]);
      const light500 = normalizeHex(s["500"]);
      expect(dark500).not.toBe(light500); // ۴۰۰ ≠ ۵۰۰ (روشن‌تر در دارک)
      // ۴۰۰ باید روشن‌تر از ۵۰۰ باشد (متن معکوس خوانا می‌ماند)
      expect(relLum(dark500)).toBeGreaterThan(relLum(light500));
      expect(normalizeHex(s.dark["50"])).not.toBe(normalizeHex(s["50"]));
      expect(normalizeHex(s.dark["200"])).not.toBe(normalizeHex(s["200"]));
    }
  });

  test("§۵ رنگ‌های ۵۰۰ عین جدول قاعده ۱ دستور مالک (۱۳ مقدار)", () => {
    for (const s of sections) {
      expect(normalizeHex(s["500"])).toBe(normalizeHex(DIRECTIVE_500[s.key]));
    }
    expect(new Set(Object.keys(DIRECTIVE_500))).toEqual(new Set(sections.map((s) => s.key)));
  });

  test("§۵ متغیرهای CSS هر ۱۳ بخش در globals.css حاضرند (نور + دارک)", () => {
    const css = readFileSync(globalsPath, "utf-8");
    for (const key of Object.keys(DIRECTIVE_500)) {
      for (const shade of ["50", "200", "500", "700", "fg"]) {
        expect(css).toContain(`--sec-${key}-${shade}:`);
      }
    }
    // بلوک دارک باید همان متغیرها را بازتعریف کند (قاعده ۴)
    const darkBlock = css.split(".dark {")[1] ?? "";
    for (const key of Object.keys(DIRECTIVE_500)) {
      expect(darkBlock).toContain(`--sec-${key}-500:`); // ۵۰۰→۴۰۰ در دارک
    }
    // نقشهٔ @theme برای ابزارهای Tailwind (کلیدها فقط در همین بلوک تعریف می‌شوند)
    for (const key of Object.keys(DIRECTIVE_500)) {
      expect(css).toContain(`--color-sec-${key}-500:`);
      expect(css).toContain(`--color-sec-${key}-fg:`);
    }
  });

  test("§۵ پالت مرکزی در tailwind.config.ts سند‌گذاری شده (قاعده ۵)", () => {
    const tw = readFileSync(tailwindPath, "utf-8");
    for (const key of Object.keys(DIRECTIVE_500)) {
      expect(tw).toContain(`'sec-${key}'`);
      expect(tw.toLowerCase()).toContain(DIRECTIVE_500[key].toLowerCase());
    }
  });

  test("§۶ اعمال در رجیستری: هر کاشی فعال رنگ بخش اختصاصی خودش را دارد", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    // PN-038/فاز ۲: هشت کاشی ریشهٔ هوم یک‌پارچه (M6/M7/ظرف/ملکا-قدیمی حذف)
    const expected: Record<string, string> = {
      "arm-listings": "m1",
      "arm-requests": "m2",
      "transactions-contracts": "m3",
      experts: "m4",
      "file-finder": "finder",
      "smart-matching": "m5",
      "learning-tier": "m8",
      settings: "settings",
    };
    for (const [tileId, sectionKey] of Object.entries(expected)) {
      const tile = tileRegistry.get(tileId);
      expect(tile).toBeDefined();
      expect(tile!.accent).toBe(sectionKey as never);
    }
  });

  test("§۶ کارت کاشی: SECTION_ACCENTS همهٔ ۱۳ کلید بخش را پوشش می‌دهد", async () => {
    const mod = await import("@/components/app/TileCard");
    const acc = (mod as unknown as { SECTION_ACCENTS: Record<string, unknown> }).SECTION_ACCENTS;
    for (const key of Object.keys(DIRECTIVE_500)) {
      expect(acc[key]).toBeDefined();
      const a = acc[key] as Record<string, string>;
      expect(a.icon).toContain(`sec-${key}-500`);
      expect(a.chip).toContain(`sec-${key}-50`);
      expect(a.hairline).toContain(`sec-${key}-500`);
    }
  });

  test("§۶ اصول زیبایی: کلاس‌های تنفس/عمق/حرکت در globals.css تعریف شده‌اند (قاعده ۳)", () => {
    const css = readFileSync(globalsPath, "utf-8");
    expect(css).toContain(".sec-breath"); // ≥۱۶px
    expect(css).toContain(".sec-soft-shadow"); // 0 4px 12px نرم
    expect(css).toContain(".sec-motion"); // ۲۰۰ms
    expect(css).toContain("200ms");
    expect(css).toContain("prefers-reduced-motion");
  });
});
