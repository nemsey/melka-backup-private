/** بررسی محله‌های مناطق «ایل گلی» و «فردوس» + جست‌وجوی هر چیزی شبیه فردوس */
import raw from "../src/lib/divar/tabriz-locations.data.json";

interface TabrizLine { n: string; id: string; lat: number | null; lng: number | null }
interface TabrizArea { id: string; n: string; l: TabrizLine[] }
const data = raw as { cityId: string; areas: TabrizArea[] };

for (const an of ["ایل گلی", "فردوس", "دادگستری (ایل گلی)", "سهند (ایل گلی)"]) {
  const a = data.areas.find((x) => x.n.replace(/\s+/g, "").replace(/[()]/g, "") === an.replace(/\s+/g, "").replace(/[()]/g, ""));
  if (!a) { console.log(`منطقه «${an}» یافت نشد`); continue; }
  console.log(`\n■ منطقه «${a.n}» (id=${a.id}):`);
  for (const l of a.l) console.log(`   - «${l.n}» id=${l.id}`);
}

// همه محله‌هایی که «فردوس» در نامشان هست
console.log("\n■ محله‌های دارای واژه «فردوس» در کل رجیستری:");
for (const a of data.areas) for (const l of a.l) if (l.n.includes("فردوس")) console.log(`   - «${l.n}» زیر «${a.n}» id=${l.id}`);

// همه مناطقی که «ایل گلی» در نامشان هست
console.log("\n■ مناطق دارای «ایل گلی» در نام:");
for (const a of data.areas) if (a.n.includes("ایل گلی")) console.log(`   - «${a.n}» id=${a.id} (${a.l.length} محله)`);
