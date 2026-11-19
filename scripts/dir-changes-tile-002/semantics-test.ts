/**
 * DIR-CHANGES-TILE-002 — آزمون تعیین‌کننده: semantics به‌روزرسانی آرایهٔ status
 * در PUT requests/update — merge (ادغام با _id) یا replace (جایگزینی کامل)؟
 *
 * روی درخواست خود مالک 55920 (کاملاً بازگشت‌پذیر با الگوی اثبات‌شدهٔ ۰۹۹):
 *   ۱) GET history → before (۲ مدخل در تاریخ شاهکار)
 *   ۲) PUT با status = [فقط مدخل اول با همان مقادیر]
 *   ۳) GET history → آیا مدخل دوم ماند؟ (merge) یا حذف شد؟ (replace)
 *   ۴) PUT با status = آرایهٔ کامل عینی → بازگردانی
 *   ۵) GET history → تأیید بازگردانی
 */
import fs from "fs";
import path from "path";

const CODE = "55920";

async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { buildCreatePayload, parseJson } = await import("@/lib/request/types");
  const { LOCATION_IDS } = await import("@/lib/changes/variables");

  const resolved = await resolveBestArmToken(db);
  if (!resolved || !resolved.token) throw new Error("no token");
  const cfg = getMelkApiConfig();
  const call = async <T>(method: "GET" | "PUT", p: string, opts: { body?: unknown; query?: Record<string, string> } = {}, tries = 5): Promise<any> => {
    for (let i = 1; i <= tries; i++) {
      try {
        return await armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body: opts.body, query: opts.query, timeoutMs: 110_000, maxRetries: 0 });
      } catch (e) {
        console.error(`  [try ${i}] ${method} ${p.slice(0, 50)} → ${String((e as Error).message).slice(0, 70)}`);
        if (i === tries) throw e;
        await new Promise((r) => setTimeout(r, 18_000));
      }
    }
  };

  const out: Record<string, unknown> = {};
  const rec = await db.requestRecord.findUnique({ where: { requestCode: CODE } });
  if (!rec?.armRequestId) throw new Error("رکورد محلی 55920 با شناسهٔ ARM یافت نشد");
  const rid = rec.armRequestId;
  console.log("[rid]", rid);

  const hist = async (label: string) => {
    const h = await call("GET", `requests/history/${rid}`);
    const list = (h?.data?.list ?? []) as any[];
    out[label] = list.map((e) => ({ _id: e._id, action: e.actionType?.name, date: e.date }));
    console.log(`[${label}]`, JSON.stringify(out[label], null, 1));
    return list;
  };

  // ۱) before
  const before = await hist("before");
  if (before.length < 2) throw new Error(`انتظار ۲ مدخل بود؛ ${before.length} یافت شد — لغو آزمون`);

  // ۲) ساخت بدنهٔ ویرایش عین updateRequestCode (بدون تغییر تاریخ)
  let row: any = null;
  for (let page = 1; page <= 3 && !row; page++) {
    const res = await call("GET", "requests/list", { query: { page: String(page), limit: "20" } });
    row = ((res?.data?.list ?? []) as any[]).find((r) => r._id === rid) ?? null;
  }
  const areaIds = parseJson<string[]>(rec.areaIdsJson, []);
  const lineIds = parseJson<string[]>(rec.lineIdsJson, []);
  const payload = buildCreatePayload({
    customerId: rec.armCustomerId ?? "",
    countryId: rec.countryId ?? LOCATION_IDS.country,
    stateId: rec.stateId ?? LOCATION_IDS.state,
    cityId: rec.cityId ?? LOCATION_IDS.city,
    areaIds, lineIds,
    tradeTypeId: rec.tradeTypeId ?? "",
    buildingTypeId: rec.buildingTypeId ?? "",
    propertyTypeId: rec.propertyTypeId ?? "",
    inputs: parseJson<Record<string, unknown>>(rec.inputsJson, {}),
    customerDescription: rec.customerDescription,
    userPaymentMethod: rec.userPaymentMethod ?? "",
    userSeriousity: rec.userSeriousity ?? "",
    realtorDescription: rec.realtorDescription,
  }) as Record<string, unknown>;
  if (row) {
    payload.urgent = row.urgent ?? false;
    payload.luxury = row.luxury ?? false;
    payload.changeable = row.changeable ?? false;
    payload.ocasion = row.ocasion ?? false;
    payload.deposite = row.deposite ?? false;
    payload.confirmSMS = row.confirmSMS ?? true;
    payload.isRental = row.isRental ?? false;
    if (Array.isArray(row.changeWith)) payload.changeWith = row.changeWith;
  }
  const mk = (e: any, date: string) => ({
    _id: e._id,
    actionType: e.actionType?._id ?? e.actionType,
    currentStatus: typeof e.currentStatus === "string" ? e.currentStatus : e.currentStatus?._id,
    currentInbox: typeof e.currentInbox === "string" ? e.currentInbox : e.currentInbox?._id,
    customer: e.customer && typeof e.customer === "object" ? e.customer._id : e.customer ?? null,
    realtor: e.realtor?._id ?? e.realtor,
    outOfArea: e.outOfArea ?? false,
    date,
  });

  // ۳) PUT با آرایهٔ جزئی (فقط مدخل اول — همان مقادیر)
  const partial = { ...payload, status: [mk(before[0], before[0].date)] };
  await call("PUT", `requests/update/${rid}`, { body: partial });
  console.log("[partial-put] done");

  // ۴) بعد از جزئی
  const afterPartial = await hist("afterPartial");

  // ۵) بازگردانی کامل
  const full = { ...payload, status: before.map((e) => mk(e, e.date)) };
  await call("PUT", `requests/update/${rid}`, { body: full });
  console.log("[restore-put] done");

  // ۶) تأیید بازگردانی
  const afterRestore = await hist("afterRestore");

  // نتیجه
  const semantics = afterPartial.length === before.length ? "MERGE" : "REPLACE";
  out.verdict = {
    semantics,
    beforeCount: before.length,
    afterPartialCount: afterPartial.length,
    afterRestoreCount: afterRestore.length,
    restoredOk: afterRestore.length === before.length,
  };
  console.log("VERDICT:", JSON.stringify(out.verdict, null, 1));

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "semantics-test.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED scripts/tmp/semantics-test.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
