// PN-027 · ۵-الف-۴ — یافتن L بهینه برای WCAG ≥ 4.5 (هر دو کاربرد: متن-سفید-روی-قرمز و قرمز-به‌عنوان-متن)
function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
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
function comp(fg: [number, number, number], bg: [number, number, number], a: number): [number, number, number] {
  return [0, 1, 2].map((i) => a * fg[i] + (1 - a) * bg[i]) as [number, number, number];
}

const card = oklchToSrgb(0.275, 0.02, 205);
const bg = oklchToSrgb(0.235, 0.018, 205);
const white: [number, number, number] = [1, 1, 1];

console.log('L     | سفید/کامل | سفید/60-card | قرمز-متن/card | قرمز-متن/bg | قضاوت');
for (const L of [0.704, 0.62, 0.60, 0.58, 0.57, 0.56, 0.55, 0.54, 0.53, 0.52]) {
  const c = oklchToSrgb(L, 0.19, 25);
  const full = contrast(white, c);
  const btn = contrast(white, comp(c, card, 0.6));
  const txtCard = contrast(c, card);
  const txtBg = contrast(c, bg);
  console.log(`${L.toFixed(3)} |   ${full.toFixed(2)}   |    ${btn.toFixed(2)}     |     ${txtCard.toFixed(2)}     |    ${txtBg.toFixed(2)}   | ${full >= 4.5 ? 'کامل ✓AA' : 'کامل ✗'} ${txtCard >= 3 ? 'متن ✓AA-large' : 'متن ✗'}`);
}
