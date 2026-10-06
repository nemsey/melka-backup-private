/**
 * P6546 — اجرای واقعی غنی‌سازی تاریخ استخدام پرسنل PM (شاهد)
 */
import { writeFileSync } from "node:fs";

async function main() {
  const { getPmSyncToken, syncPmPersonnelInfo } = await import("../src/lib/melk-api/pm-acc-sync");
  const token = await getPmSyncToken();
  if (!token) {
    console.log("NO_PM_TOKEN");
    process.exit(1);
  }
  const result = await syncPmPersonnelInfo(token, { maxRows: 25 });
  console.log(JSON.stringify(result, null, 1));
  writeFileSync("/home/z/my-project/download/p6546/pm-hire-date-proof.json", JSON.stringify({ ranAt: new Date().toISOString(), result }, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
