/**
 * تطبیق ۱۷ منطقه پیش‌فرض مالک با رجیستری منطقه‌بندی ARM تبریز
 * اجرا: bun /home/z/my-project/scripts/resolve-default-locations.ts
 */
import raw from "../src/lib/divar/tabriz-locations.data.json";

interface TabrizLine { n: string; id: string; lat: number | null; lng: number | null }
interface TabrizArea { id: string; n: string; l: TabrizLine[] }

const data = raw as { cityId: string; areas: TabrizArea[] };

function normalizeText(s: string): string {
  return s
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[آأإ]/g, "ا")
    .replace(/[\s«»"'()\[\]،؛:.\-_]/g, "")
    .trim()
    .toLowerCase();
}

const USER_NAMES = [
  "ولیعصر",
  "ولیعصر جنوبی",
  "استانداری",
  "سپهر صادرات",
  "میرداماد",
  "زعفرانیه",
  "الهی پرست",
  "رجایی شهر",
  "ویلاشهر",
  "دادگستری ایل گلی",
  "سهند ایل گلی",
  "فردوس ایل گلی",
  "باغچه بان",
  "یاغچیان",
  "۳۵ متری سینا",
  "گلشهر",
  "پرواز",
];

// نمایه‌سازی مناطق و محله‌ها با نام نرمال‌شده
const areaIndex = new Map<string, TabrizArea>();
for (const a of data.areas) areaIndex.set(normalizeText(a.n), a);

const lineIndex = new Map<string, { line: TabrizLine; area: TabrizArea }[]>();
for (const a of data.areas) {
  for (const l of a.l) {
    const key = normalizeText(l.n);
    const arr = lineIndex.get(key) ?? [];
    arr.push({ line: l, area: a });
    lineIndex.set(key, arr);
  }
}

console.log("=".repeat(90));
console.log(`تعداد مناطق رجیستری: ${data.areas.length} — تعداد محله‌ها: ${[...lineIndex.values()].reduce((s, v) => s + v.length, 0)}`);
console.log("=".repeat(90));

for (const name of USER_NAMES) {
  const key = normalizeText(name);
  const asArea = areaIndex.get(key);
  const asLine = lineIndex.get(key);
  console.log(`\n■ «${name}»`);
  if (asArea) {
    console.log(`   ✅ AREA  «${asArea.n}» (id=${asArea.id}) — ${asArea.l.length} محله:`);
    for (const l of asArea.l) console.log(`        - «${l.n}» id=${l.id} lat=${l.lat} lng=${l.lng}`);
  }
  if (asLine) {
    for (const { line, area } of asLine) {
      console.log(`   ${asArea ? "⚠️  هم‌نام محله:" : "✅ LINE "} «${line.n}» id=${line.id} — زیر منطقه «${area.n}» (areaId=${area.id}) lat=${line.lat} lng=${line.lng}`);
    }
  }
  if (!asArea && !asLine) {
    // جست‌وجوی فازی: نام‌های محتوی کلیدواژه
    const contains = (s: string) => s.includes(key) || key.includes(s);
    const fuzzyLines: string[] = [];
    for (const [k, entries] of lineIndex) {
      if (k.length >= 3 && contains(k)) for (const e of entries) fuzzyLines.push(`«${e.line.n}» (منطقه ${e.area.n}) id=${e.line.id}`);
      if (fuzzyLines.length > 8) break;
    }
    const fuzzyAreas: string[] = [];
    for (const [k, a] of areaIndex) {
      if (k.length >= 3 && contains(k)) fuzzyAreas.push(`«${a.n}» id=${a.id} (${a.l.length} محله)`);
      if (fuzzyAreas.length > 8) break;
    }
    if (fuzzyAreas.length) console.log(`   ❌ یافت نشد — مناطق مشابه: ${fuzzyAreas.join(" | ")}`);
    if (fuzzyLines.length) console.log(`   ❌ یافت نشد — محله‌های مشابه: ${fuzzyLines.join(" | ")}`);
    if (!fuzzyAreas.length && !fuzzyLines.length) console.log("   ❌ هیچ نام مشابهی یافت نشد");
  }
}
