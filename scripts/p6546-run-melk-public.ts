/**
 * P6546 — اجرای واقعی استخراج سامانهٔ عمومی ملک تبریز (شاهد)
 * خروجی: download/p6546/melk-public-sync-proof.json
 */
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  // بایپس تست‌ها به دیتابیس اصلی وصل می‌شوند — همین محیط dev
  const { syncMelkPublicCatalog } = await import("../src/lib/melk-api/melk-public");
  const t0 = Date.now();
  const result = await syncMelkPublicCatalog({ maxPages: 40, enrichDetails: true });
  const proof = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    result,
    newCodesSample: result.newCodes.slice(0, 30),
  };
  mkdirSync("/home/z/my-project/download/p6546", { recursive: true });
  writeFileSync("/home/z/my-project/download/p6546/melk-public-sync-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ ...result, newCodes: `${result.newCodes.length} کد تازه` }, null, 1));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
