// scripts/pn002/probe-nested.ts — کاوش عمیق ساختارهای تودرتو (pricePerMeter، status، inputs، changeWith)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { applyPlatformEnvFallbacks } = await import('@/lib/platform-env');
  applyPlatformEnvFallbacks();
  const { getIntegrationRepository } = await import('@/core/repositories');
  const { decryptSecret } = await import('@/lib/auth/crypto');
  const repo = getIntegrationRepository();
  const conn = await repo.getArmConnection('410031320');
  const token = conn?.tokenEnc ? decryptSecret(conn.tokenEnc) : null;
  if (!token) { console.log('NO TOKEN'); process.exit(1); }

  const { armCall } = await import('@/lib/melk-api/client');
  const { getMelkApiConfig } = await import('@/lib/melk-api/config');
  const { MELK_ENDPOINTS } = await import('@/lib/melk-api/endpoints');
  const cfg = getMelkApiConfig();

  // ---------- ۱) دو آگهی: یکی فروش (totalPrice)، یکی اجاره (rent) ----------
  const pRes = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.propertiesList, baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 40 }, timeoutMs: 45_000, maxRetries: 1 });
  const pList = ((pRes.data as Record<string, unknown>)?.list ?? []) as Array<Record<string, unknown>>;
  const sale = pList.find((r) => typeof r.totalPrice === "number" && !r.rent_price);
  const rental = pList.find((r) => typeof r.rent_price === "number");
  for (const [label, row] of [["آگهی فروش", sale], ["آگهی اجاره", rental]] as const) {
    if (!row) { console.log(`\n${label}: یافت نشد`); continue; }
    console.log(`\n===== ${label} (code=${row.code}) =====`);
    console.log("  pricePerMeter:", JSON.stringify(row.pricePerMeter));
    console.log("  totalPrice:", JSON.stringify(row.totalPrice));
    console.log("  deposite_price:", JSON.stringify(row.deposite_price));
    console.log("  rent_price:", JSON.stringify(row.rent_price));
    console.log("  viewCount:", JSON.stringify(row.viewCount), "| isRental:", row.isRental, "| isTarget:", row.isTarget, "| isReposted:", row.isReposted);
    console.log("  addedToDivar:", row.addedToDivar, "| addedToInsta:", row.addedToInsta);
    console.log("  businessId:", JSON.stringify(row.businessId));
    console.log("  link:", JSON.stringify(row.link));
    console.log("  images.length:", Array.isArray(row.images) ? row.images.length : 0);
    console.log("  state/city/area/line:", (row.state as {name?:string})?.name, "/", (row.city as {name?:string})?.name, "/", (row.area as {name?:string})?.name, "/", (row.line as {name?:string})?.name);
    const st = Array.isArray(row.status) ? (row.status[0] as Record<string, unknown>) : null;
    if (st) {
      console.log("  status[0]: actionType=", JSON.stringify(st.actionType), "currentStatus=", JSON.stringify(st.currentStatus), "currentInbox=", JSON.stringify(st.currentInbox), "date=", JSON.stringify(st.date));
    }
    console.log("  ownerPermission:", row.ownerPermission, "processPermission:", row.processPermission);
  }

  // ---------- ۲) دو درخواست: ساختار inputs کامل + فلگ‌ها ----------
  const rRes = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 20 }, timeoutMs: 45_000, maxRetries: 1 });
  const rList = ((rRes.data as Record<string, unknown>)?.list ?? []) as Array<Record<string, unknown>>;
  for (const row of rList.slice(0, 2)) {
    console.log(`\n===== درخواست (code=${row.code}) =====`);
    console.log("  inputs:", JSON.stringify(row.inputs));
    console.log("  tradeType:", JSON.stringify(row.tradeType), "| buildingType:", JSON.stringify(row.buildingType), "| propertyType:", JSON.stringify(row.propertyType));
    console.log("  urgent:", row.urgent, "luxury:", row.luxury, "ocasion:", row.ocasion, "deposite:", row.deposite, "changeable:", row.changeable, "isRental:", row.isRental, "confirmSMS:", row.confirmSMS, "notifyMe:", row.notifyMe);
    console.log("  changeWith:", JSON.stringify(row.changeWith));
    console.log("  userPaymentMethod:", JSON.stringify(row.userPaymentMethod), "| userSeriousity:", JSON.stringify(row.userSeriousity));
    console.log("  createdByRealtor:", JSON.stringify(row.createdByRealtor), "| platform:", JSON.stringify(row.platform));
    console.log("  totalPrice_from/to:", row.totalPrice_from, "/", row.totalPrice_to);
  }

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
