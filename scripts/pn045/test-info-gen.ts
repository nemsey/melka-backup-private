// PN-045 · تأیید نهایی — تست مستقیم generator فایل اطلاعات (دو tenant × دو نوع)
import { generateInfoFile } from "@/lib/info-files/generator";

async function main() {
  // ملکتون — آگهی ME8418 (کشف‌شده در فاز ۱)
  const m1 = await generateInfoFile("melketun", "listing", "ME8418");
  console.log("melketun/listing/ME8418 → found:", m1.found, "| file:", m1.filepath);
  console.log("--- ۱۲ خط نخست ---");
  console.log(m1.content.split("\n").slice(0, 12).join("\n"));
  console.log("...\n");

  // ملکتون — درخواست POT4396
  const m2 = await generateInfoFile("melketun", "request", "POT4396");
  console.log("melketun/request/POT4396 → found:", m2.found, "| file:", m2.filepath);

  // تبریز — یک کد واقعی از DB
  const { db } = await import("@/lib/db");
  const tab = await db.propertyRecord.findFirst({ where: { tenantId: "melk-tabriz" }, select: { propertyCode: true }, take: 1 });
  if (tab) {
    const t1 = await generateInfoFile("tabriz", "listing", tab.propertyCode);
    console.log("tabriz/listing/" + tab.propertyCode, "→ found:", t1.found, "| file:", t1.filepath);
    console.log("--- ۸ خط نخست ---");
    console.log(t1.content.split("\n").slice(0, 8).join("\n"));
  }

  // کد ناموجود — گزارش صادقانه
  const none = await generateInfoFile("melketun", "listing", "ME-NOPE-999");
  console.log("\nmelketun/listing/ME-NOPE-999 → found:", none.found, "(گزارش صادقانه)");

  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", e); process.exit(1); });
