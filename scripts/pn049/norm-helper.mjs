// کپی هم‌ارز normalizeFilterInput برای اسکریپت‌های standalone (منبع یگانه: src/lib/normalize-input.ts)
export function normalizeFilterInput(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  s = s.replace(/[۰-۹٠-٩]/g, (d) => { const i = FA.indexOf(d); return i >= 0 ? String(i) : String(AR.indexOf(d)); });
  s = s.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  return s.replace(/\s+/g, ' ').trim();
}
