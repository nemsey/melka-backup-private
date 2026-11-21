/**
 * DIR-CHANGES-EXEC-001 · probe10 — رکورد کامل زندهٔ درخواست 48968 (requests/info)
 * برای بازسازی بدنهٔ ویرایش از منبع معتبر زنده (رکورد محلی armCustomerId ندارد).
 */
async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");

  const resolved = await resolveBestArmToken(db);
  if (!resolved) throw new Error("no token");
  const base = getMelkApiConfig().armApiBase;

  const r = await armCall({ method: "GET", path: "requests/info/6a42a5c12c4b2e2f7fea5172", baseUrl: base, token: resolved.token, timeoutMs: 120_000, maxRetries: 0 }).catch((e: any) => ({ err: String(e.message).slice(0, 150) }));
  if ((r as any).err) { console.log("ERR:", (r as any).err); process.exit(1); }
  const d: any = (r as any).data;
  const out = {
    _id: d._id, code: d.code, title: d.title,
    customer: d.customer && typeof d.customer === "object" ? { _id: d.customer._id, fullName: d.customer.fullName, mobileNumber: d.customer.mobileNumber } : d.customer,
    country: d.country?._id ?? d.country, state: d.state?._id ?? d.state, city: d.city?._id ?? d.city,
    area: Array.isArray(d.area) ? d.area.map((a: any) => a._id ?? a) : d.area,
    line: Array.isArray(d.line) ? d.line.map((a: any) => a._id ?? a) : d.line,
    tradeType: d.tradeType?._id ?? d.tradeType, buildingType: d.buildingType?._id ?? d.buildingType, propertyType: d.propertyType?._id ?? d.propertyType,
    userPaymentMethod: d.userPaymentMethod?._id ?? d.userPaymentMethod, userSeriousity: d.userSeriousity?._id ?? d.userSeriousity,
    urgent: d.urgent, luxury: d.luxury, changeable: d.changeable, ocasion: d.ocasion, deposite: d.deposite, confirmSMS: d.confirmSMS, isRental: d.isRental,
    changeWith: d.changeWith,
    inputs_keys: d.inputs ? Object.keys(d.inputs) : null,
  };
  console.log(JSON.stringify(out, null, 1).slice(0, 2200));
  const rec = await db.requestRecord.findFirst({ where: { requestCode: "48968" }, select: { armCustomerId: true, areaIdsJson: true, lineIdsJson: true, inputsJson: true, userPaymentMethod: true, userSeriousity: true } });
  console.log("── local record: armCustomerId=", rec?.armCustomerId, "· areaIds=", rec?.areaIdsJson?.slice(0, 80), "· lineIds=", rec?.lineIdsJson?.slice(0, 40), "· payment=", rec?.userPaymentMethod, "· seriousity=", rec?.userSeriousity);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
