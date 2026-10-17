// PN-035 · دیباگ claim — چرا claimRelayBatch خالی برمی‌گرداند؟
const { createRelayDevice, enqueueRelayRequest, claimNextRelayRequest, claimRelayBatch } = await import(
  "/home/z/my-project/src/lib/melk-api/relay"
);
const { db } = await import("/home/z/my-project/src/lib/db");

// ۱) ساخت دستگاه
try {
  const dev = await createRelayDevice("dbg-claim-1", "dbg");
  console.log("device created:", dev?.deviceId);
} catch (e) {
  console.log("createRelayDevice threw:", (e as Error).message);
}
const found = await db.relayDevice.findUnique({ where: { deviceId: "dbg-claim-1" } });
console.log("device in db:", found?.deviceId, "· revokedAt:", found?.revokedAt, "· secret len:", found?.secret?.length);

// ۲) enqueue
const { id } = await enqueueRelayRequest({ method: "GET", url: "https://pm-api.melketabriz.ir/api/dbg", source: "dbg" });
console.log("enqueued:", id);

// ۳) claim
const one = await claimNextRelayRequest("dbg-claim-1");
console.log("claim result:", one?.id ?? "NULL", "· expected:", id);

const batch = await claimRelayBatch("dbg-claim-1", 10);
console.log("batch len:", batch.length);

// ۴) وضعیت آیتم
const item = await db.relayQueue.findUnique({ where: { id } });
console.log("item status:", item?.status, "· claimedBy:", item?.claimedBy);

await db.relayQueue.deleteMany({ where: { id } });
await db.relayDevice.deleteMany({ where: { deviceId: "dbg-claim-1" } });
process.exit(0);
