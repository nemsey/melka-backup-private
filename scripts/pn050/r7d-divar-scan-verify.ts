/**
 * اجرای اسکن واقعی فایل‌یابی با تنظیمات جدید (همه تبریز · ۸ صفحه) و گزارش قیف
 */
import { runDivarScan } from "@/lib/divar/scan";

const t0 = Date.now();
const s = await runDivarScan();
console.log(JSON.stringify({
  ok: s.ok, source: s.source,
  scanned: s.scanned, fetched: s.fetched, inWindow: s.inWindow,
  outOfArea: s.outOfArea, autoRejected: s.autoRejected,
  newAds: s.newAds, updatedAds: s.updatedAds,
  durationS: Math.round((Date.now() - t0) / 1000),
  message: s.message,
}, null, 1));
process.exit(0);
