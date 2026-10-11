// PN-027 · ۵-الف-۴ — محاسبهٔ WCAG دکمهٔ destructive در تم تاریک (قبل/بعد)
// تبدیل OKLCH → sRGB (نسبی‌شده) → آلفا-کامپوزیت → روشنایی نسبی → نسبت کنتراست

function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  // OKLab → LMS
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  // LMS → linear sRGB
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  // گاما
  const gam = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055);
  return [gam(r), gam(g), gam(bl)].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(c1: [number, number, number], c2: [number, number, number]): number {
  const l1 = luminance(c1), l2 = luminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function composite(fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as [number, number, number];
}

// زمینه‌های تم تاریک
const card = oklchToSrgb(0.275, 0.02, 205);
const bg = oklchToSrgb(0.235, 0.018, 205);
const white: [number, number, number] = [1, 1, 1];

// قبل: destructive تاریک = oklch(0.704 0.191 22.22) — با آلفای /60 روی card (button.tsx dark:bg-destructive/60)
const before = oklchToSrgb(0.704, 0.191, 22.22);
// بعد (قرارداد جلسهٔ ۰۳۴): oklch(0.62 0.19 25)
const after = oklchToSrgb(0.62, 0.19, 25);

const variants = [
  { name: 'قبل — متن سفید روی destructive کامل', fg: white, bgc: before },
  { name: 'قبل — سفید روی /60 روی card (دکمهٔ واقعی تاریک)', fg: white, bgc: composite(before, card, 0.6) },
  { name: 'قبل — سفید روی /60 روی background', fg: white, bgc: composite(before, bg, 0.6) },
  { name: 'بعد — متن سفید روی destructive کامل', fg: white, bgc: after },
  { name: 'بعد — سفید روی /60 روی card (دکمهٔ واقعی تاریک)', fg: white, bgc: composite(after, card, 0.6) },
  { name: 'بعد — سفید روی /60 روی background', fg: white, bgc: composite(after, bg, 0.6) },
];

for (const v of variants) {
  console.log(`${v.name.padEnd(52)} → WCAG ${contrast(v.fg, v.bgc).toFixed(2)}`);
}
