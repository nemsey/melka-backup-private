/**
 * DIR-REG-REQ-099-001 — اصلاح قالب تاریخ رویداد به ISO (عین قرارداد UI)
 */
async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { isoToJalaliString } = await import("@/lib/jalali");

  const ev = await db.requestEventRecord.update({
    where: { id: "cmwk7nx9q0008s4zs04xe3d63" },
    data: { date: "2026-11-11" }, // 1405/08/20 — قالب ISO فقط-تاریخ عین JalaliDatePicker
  });
  console.log("updated event:", ev.id, "| name:", ev.eventTypeName, "| date:", ev.date, "| hour:", ev.hour, "| actor:", ev.actorCode);
  console.log("نمایش عین UI → اقدام:", ev.eventTypeName, "· تاریخ:", isoToJalaliString(ev.date), "ساعت", ev.hour);

  const rec = await db.requestRecord.findUnique({ where: { requestCode: "55920" }, include: { events: true } });
  console.log("record:", rec.requestCode, "| actorName:", rec.actorName, "| events:", rec.events.length);
  process.exit(0);
}
main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
