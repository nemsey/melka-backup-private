/**
 * palette13.ts — مولد نظام رنگ ۱۳بخش×۵سایه (قانون ظاهر فاخر ملکا ۰۳۵-B — بخش الف/خ)
 * ---------------------------------------------------------------------------
 * • ۱۳ رنگ یکتا روی چرخهٔ hue با «حداکثر فاصلهٔ ممکن»: ۱۳×۲۷٫۶۹° = ۳۶۰°
 *   (نکتهٔ ریاضی صادقانه: شرط ≥۳۰° تنها با ≤۱۲ رنگ ممکن است — ۱۳ رنگ سقف ۲۷٫۷° دارد؛
 *    قانون ۰۳۵-B خود «۱۳ رنگ برای ۱۳ بخش» را الزامی کرده ⇒ حداکثرِ ممکن + تفکیک
 *    روشنایی/اشباع برای تمایز ادراکی. این قید در evidence ثبت می‌شود.)
 * • تخصیص بهینه (DP بیت‌مَسک) با وزن لنگرهای معنایی (M3=قرمز، M1=سبز، M2=کهربایی…)
 * • ۵ سایه روشن (50/100/300/500/700) + دارک + fg + نگاشت سازگار 200→300
 * • کنتراست WCAG AA (≥۴٫۵:۱) همهٔ جفت‌های الزامی + خودتنظیمی روشنایی
 * • خروجی: src/lib/palette13.json + splice خودکار globals.css (سه ناحیه) + evidence
 * اجرا: bun scripts/p6549/palette13.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

/* ---------- ۱) بخش‌ها و لنگرهای معنایی ---------- */
type Sec = { key: string; fa: string; anchor: number; w: number };
const SECTIONS: Sec[] = [
  { key: "login", fa: "صفحهٔ ورود", anchor: 263, w: 2 },
  { key: "home", fa: "صفحهٔ هوم", anchor: 222, w: 2 },
  { key: "finder", fa: "فایل‌یابی ملکا", anchor: 200, w: 3 },
  { key: "melka-listing", fa: "آگهی ملکا", anchor: 161, w: 2 },
  { key: "melka-request", fa: "درخواست ملکا", anchor: 21, w: 2 },
  { key: "settings", fa: "تنظیمات عمومی", anchor: 215, w: 1 },
  { key: "mgmt", fa: "داشبورد مدیریتی", anchor: 30, w: 1 },
  { key: "m1", fa: "M1 آگهی ملک تبریز", anchor: 160, w: 3 },
  { key: "m2", fa: "M2 درخواست ملک تبریز", anchor: 38, w: 3 },
  { key: "m3", fa: "M3 معاملات ملک تبریز", anchor: 0, w: 3 },
  { key: "m4", fa: "M4 کارشناسان ملک تبریز", anchor: 192, w: 3 },
  { key: "consultant", fa: "صفحهٔ مشاور (ایجنت)", anchor: 333, w: 2 },
  { key: "ai", fa: "هوش مصنوعی/گزارش‌ها", anchor: 243, w: 2 },
];
const N = SECTIONS.length;

/* ---------- ۲) OKLCH → sRGB + روشنایی نسبی + کنتراست ---------- */
function oklchToRgb(L: number, C: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const g2 = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  return [g2(clip(r)), g2(clip(g)), g2(clip(bl))];
}
const hex = (rgb: [number, number, number]) =>
  "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
function lum(L: number, C: number, h: number): number {
  const [r, g, b] = oklchToRgb(L, C, h);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(l1: number, l2: number): number {
  const [a, b] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

/* ---------- ۳) تخصیص بهینه به چرخهٔ یکنواخت (DP) ---------- */
const slots = Array.from({ length: N }, (_, i) => (i * 360) / N);
const cd = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const FULL = 1 << N;
const INF = 1e18;
const dp = new Array<number>(FULL).fill(INF);
const choice = new Array<number>(FULL).fill(-1);
dp[0] = 0;
for (let mask = 0; mask < FULL; mask++) {
  if (dp[mask] === INF) continue;
  let si = 0;
  for (let t = mask; t; t >>= 1) si += t & 1;
  if (si >= N) continue;
  for (let j = 0; j < N; j++) {
    if (mask & (1 << j)) continue;
    const cost = SECTIONS[si].w * Math.pow(cd(SECTIONS[si].anchor, slots[j]), 2);
    const nm = mask | (1 << j);
    if (dp[mask] + cost < dp[nm]) { dp[nm] = dp[mask] + cost; choice[nm] = j; }
  }
}
const assign = new Array<number>(N).fill(-1);
{
  let mask = FULL - 1;
  for (let si = N - 1; si >= 0; si--) {
    const j = choice[mask];
    assign[si] = j;
    mask &= ~(1 << j);
  }
}

/* ---------- ۴) تولید سایه‌ها + خودتنظیمی AA ---------- */
const OFFWHITE = "#FAFBFC", NEARBLACK = "#0A0E1A", DARKINK = "#0F172A", DARKCARD_L = 0.062;
const lumHex = (hx: string) => {
  const r = parseInt(hx.slice(1, 3), 16) / 255, g = parseInt(hx.slice(3, 5), 16) / 255, b = parseInt(hx.slice(5, 7), 16) / 255;
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
type Shades = { s50: string; s100: string; s300: string; s500: string; s700: string; fg: string; d50: string; d100: string; d300: string; d500: string; d700: string; dfg: string };
function build(hue: number): { shades: Shades; contrast: Record<string, number>; pass: boolean } {
  let L500 = 0.555, C500 = 0.15, L700 = 0.375, L500d = 0.72, L700d = 0.83;
  // ۳۰۰ = میان‌تُن (مرز/جداکننده — هم‌نقش ۲۰۰ قدیم) · ۳۰۰دارک = سطح تیرهٔ میان‌تُن (سطح متن نیست)
  const mk = (): Shades => ({
    s50: hex(oklchToRgb(0.965, 0.025, hue)), s100: hex(oklchToRgb(0.93, 0.04, hue)),
    s300: hex(oklchToRgb(0.78, 0.075, hue)), s500: hex(oklchToRgb(L500, C500, hue)), s700: hex(oklchToRgb(L700, 0.11, hue)),
    d50: hex(oklchToRgb(0.28, 0.035, hue)), d100: hex(oklchToRgb(0.33, 0.05, hue)),
    d300: hex(oklchToRgb(0.45, 0.08, hue)), d500: hex(oklchToRgb(L500d, 0.115, hue)), d700: hex(oklchToRgb(L700d, 0.06, hue)),
    fg: NEARBLACK, dfg: DARKINK,
  });
  for (let i = 0; i < 24; i++) {
    const l5 = lum(L500, C500, hue);
    const fgOk = contrast(lumHex(OFFWHITE), l5) >= 4.5 ? OFFWHITE : (contrast(lumHex(NEARBLACK), l5) >= 4.5 ? NEARBLACK : null);
    const l7 = lum(L700, 0.11, hue), l50 = lum(0.965, 0.025, hue), l1 = lum(0.93, 0.04, hue), l3 = lum(0.78, 0.075, hue);
    const l5d = lum(L500d, 0.115, hue), l7d = lum(L700d, 0.06, hue), l50d = lum(0.28, 0.035, hue), l1d = lum(0.33, 0.05, hue);
    const dfgOk = contrast(lumHex(OFFWHITE), l5d) >= 4.5 ? OFFWHITE : (contrast(lumHex(DARKINK), l5d) >= 4.5 ? DARKINK : null);
    // جفت‌های متنی (استاندارد P6530 + قانون): ۳۰۰دارک سطح متن نیست (مرز/میان‌تُن)
    const pairsOk =
      fgOk !== null && dfgOk !== null &&
      contrast(l7, l50) >= 4.5 && contrast(l7, l1) >= 4.5 && contrast(l7, l3) >= 4.5 && contrast(l7, lumHex(OFFWHITE)) >= 4.5 &&
      contrast(l7d, l50d) >= 4.5 && contrast(l7d, l1d) >= 4.5 && contrast(l7d, DARKCARD_L) >= 4.5;
    if (pairsOk) {
      const fg = fgOk!, dfg = dfgOk!;
      return {
        shades: { ...mk(), fg, dfg },
        contrast: {
          "fg_on_500": contrast(lumHex(fg), l5), "700_on_50": contrast(l7, l50), "700_on_100": contrast(l7, l1), "700_on_300": contrast(l7, l3), "700_on_card": contrast(l7, lumHex(OFFWHITE)),
          "dark_fg_on_500": contrast(lumHex(dfg), l5d), "dark_700_on_50": contrast(l7d, l50d), "dark_700_on_100": contrast(l7d, l1d), "dark_700_on_card": contrast(l7d, DARKCARD_L),
        },
        pass: true,
      };
    }
    L500 = Math.max(0.30, L500 - 0.015); L700 = Math.max(0.24, L700 - 0.01);
    L500d = Math.min(0.88, L500d + 0.01); L700d = Math.min(0.92, L700d + 0.008);
  }
  return { shades: mk(), contrast: {}, pass: false };
}

/* ---------- ۵) ساخت داده + evidence ---------- */
const out: any[] = [];
for (let i = 0; i < N; i++) {
  const hue = slots[assign[i]];
  const { shades, contrast: ct, pass } = build(hue);
  out.push({ n: i + 1, key: SECTIONS[i].key, fa: SECTIONS[i].fa, hue: Math.round(hue * 10) / 10, anchor: SECTIONS[i].anchor, ...shades, contrast: ct, pass });
}
const hues = out.map((o) => o.hue).sort((a: number, b: number) => a - b);
const gaps: number[] = [];
for (let i = 0; i < hues.length; i++) gaps.push(Math.round(((i === hues.length - 1 ? hues[0] + 360 : hues[i + 1]) - hues[i]) * 10) / 10);
const allPass = out.every((o) => o.pass);
const evidence = {
  meta: {
    title: "نظام رنگ ۱۳بخش×۵سایه — قانون ظاهر فاخر ملکا ۰۳۵-B",
    uniqueColors: N,
    minHueGap: Math.min(...gaps),
    maxPossibleGapFor13: Math.round((360 / 13) * 10) / 10,
    honestNote: "شرط ≥۳۰° فقط با ≤۱۲ رنگ روی چرخهٔ ۳۶۰° ممکن است (۱۲×۳۰=۳۶۰)؛ قانون ۰۳۵-B خود «۱۳ بخش» را الزامی کرده ⇒ حداکثر فاصلهٔ ممکن ۲۷٫۷° اعمال شد و تمایز ادراکی با تفکیک روشنایی/اشباع سایه‌ها تقویت شد.",
    shades: ["50", "100", "300", "500", "700"],
    contrastRule: "WCAG AA >= 4.5:1 — همهٔ جفت‌های الزامی",
    allPass,
  },
  gapsSorted: hues.map((h: number, i: number) => ({ hue: h, gapToNext: gaps[i] })),
  sections: out,
};
mkdirSync("src/lib", { recursive: true });
mkdirSync("download/p6549", { recursive: true });
writeFileSync("src/lib/palette13.json", JSON.stringify(evidence, null, 2));
writeFileSync("download/p6549/palette-evidence.json", JSON.stringify(evidence, null, 2));

/* ---------- ۶) splice به globals.css ---------- */
const CSS = "src/app/globals.css";
let css = readFileSync(CSS, "utf8");
for (const o of out) {
  const rootLine = `--sec-${o.key}-50: ${o.s50}; --sec-${o.key}-100: ${o.s100}; --sec-${o.key}-200: ${o.s300}; --sec-${o.key}-300: ${o.s300}; --sec-${o.key}-500: ${o.s500}; --sec-${o.key}-700: ${o.s700}; --sec-${o.key}-fg: ${o.fg};`;
  const darkLine = `--sec-${o.key}-50: ${o.d50}; --sec-${o.key}-100: ${o.d100}; --sec-${o.key}-200: ${o.d300}; --sec-${o.key}-300: ${o.d300}; --sec-${o.key}-500: ${o.d500}; --sec-${o.key}-700: ${o.d700}; --sec-${o.key}-fg: ${o.dfg};`;
  const themeLine = `--color-sec-${o.key}-50: var(--sec-${o.key}-50); --color-sec-${o.key}-100: var(--sec-${o.key}-100); --color-sec-${o.key}-200: var(--sec-${o.key}-200); --color-sec-${o.key}-300: var(--sec-${o.key}-300); --color-sec-${o.key}-500: var(--sec-${o.key}-500); --color-sec-${o.key}-700: var(--sec-${o.key}-700); --color-sec-${o.key}-fg: var(--sec-${o.key}-fg);`;
  // ناحیهٔ :root (نخستین تطابق) و .dark (دومین تطابق)
  const re = new RegExp(`^(\\s*)--sec-${o.key}-50:[^\\n]*$`, "gm");
  let seen = 0;
  css = css.replace(re, (m, sp) => { seen++; return seen === 1 ? sp + rootLine : seen === 2 ? sp + darkLine : m; });
  css = css.replace(new RegExp(`^\\s*--color-sec-${o.key}-50:[^\\n]*$`, "m"), (m) => m.replace(/^.*/, "  " + themeLine));
}
writeFileSync(CSS, css);

/* ---------- ۷) گزارش ---------- */
console.log("== پالت ۱۳×۵ ساخته شد ==");
for (const o of out) console.log(`${String(o.n).padStart(2)} ${o.key.padEnd(14)} hue=${String(o.hue).padStart(5)} (لنگر ${String(o.anchor).padStart(3)}) 500=${o.s500} دارک500=${o.d500} fg=${o.fg} AA=${o.pass}`);
console.log(`کمینهٔ فاصلهٔ hue: ${Math.min(...gaps)} (سقف ۱۳ رنگ: 27.7) · همهٔ کنتراست‌ها AA: ${allPass}`);
