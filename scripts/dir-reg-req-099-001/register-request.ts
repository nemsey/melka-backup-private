/**
 * DIR-REG-REQ-099-001 — ثبت کد درخواست در سامانه ARM ملک تبریز
 * در حساب کاربری سید نعمت اله سیدی (توکن realtor مالک)
 * ==========================================================================
 * مشخصات اعلامی مالک (دقیق):
 *   مشتری: رامین عباس نژاد · 09910756951
 *   نوع معامله: فروش (برچسب درخواستی: خرید) · کاربری: مسکونی · ملک: آپارتمان
 *   متراژ ۱۴۰-۱۸۰ · قیمت کل ۳۵-۴۰ میلیارد تومان · طبقه ۲-۸ · اتاق ۲-۳
 *   کل طبقات ۱-۸ · واحد در طبقه ۱-۲ · سال ساخت ۱۳۹۵-۱۴۰۵ · جنوبی
 *   شخصی ساز · شش دانگ · آسانسور + پارکینگ
 *   (منطقه: همهٔ مناطق تبریز — ۱۳۰ منطقه/۹۲۶ محله، الگوی استاندارد «بدون محدودیت منطقه»
 *    عین صدها درخواست زندهٔ ARM؛ پرداخت: نقدی · جدیت: زیاد — استانداردترین مقادیر)
 *
 * گام‌ها (عین خود سامانه — هیچ گامی دور زده نمی‌شود):
 *   ۰) اعتبارسنجی ۴ گامی
 *   ۱) جستجوی مشتری (users/info/mobile-number/9910756951) → ایجاد (users/create)
 *   ۲) مکان: ایران/آذربایجان شرقی/تبریز + منطقه/محله
 *   ۳) جزییات + فرم پویای دسته (عین زندهٔ forms/info/category)
 *   ۴) تکمیلی (پرداخت/جدیت)
 *   ثبت: POST requests/create
 *   سپس: کد درخواست از requests/list + شاهد تاریخچه از requests/history/{id}
 *   و: ثبت رویداد تاریخچه «ایجاد مشاور · سید نعمت اله سیدی · ۱۷:۳۰|۱۴۰۵/۰۸/۲۰» در آینهٔ محلی
 */

import fs from "fs";
import path from "path";

const SPEC = {
  customerName: "رامین عباس نژاد",
  customerMobile: "09910756951",
  tradeTypeId: "614ed62da50555f0a54c1eca", // فروش — برچسب درخواستی «خرید» عین خود سامانه
  buildingTypeId: "614edc35a50555f0a54c1f12", // مسکونی
  propertyTypeId: "614ee704a50555f0a54c227d", // آپارتمان
  userPaymentMethod: "61a39bf0f06329efdeacbbef", // نقدی
  userSeriousity: "61a753650927675c45489a4f", // زیاد
  inputs: {
    space_from: 140,
    space_to: 180,
    totalPrice_from: 35_000_000_000,
    totalPrice_to: 40_000_000_000,
    floor_from: 2,
    floor_to: 8,
    room_whole_from: 2,
    room_whole_to: 3,
    floor_whole_from: 1,
    floor_whole_to: 8,
    unit_from: 1,
    unit_to: 2,
    year_from: 1395,
    year_to: 1405,
    side: ["south"],
    construct_type: ["personal"],
    sanad: ["sixdong"],
    elevator: true,
    parking: true,
  },
  /** تاریخ تاریخچهٔ خواسته‌شدهٔ مالک (دقیق) */
  history: {
    actionTypeName: "ایجاد مشاور",
    actionTypeId: "6506dde8c772727517fed9b8", // شناسهٔ واقعی actionType «ایجاد مشاور» (کشف زنده از requests/history)
    byName: "سید نعمت اله سیدی",
    byCode: "410031320",
    date: "1405/08/20",
    hour: "17:30",
  },
};

async function main() {
  const t0 = Date.now();
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();

  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { createRequest, createRequestEvent } = await import("@/lib/request/store");
  const { registerRequestToArm } = await import("@/lib/request/arm-register");
  const { TABRIZ_AREAS, ALL_LINES } = await import("@/lib/divar/tabriz-locations");
  const { IRAN_COUNTRY_ID, AZ_SHARGHI_STATE_ID, TABRIZ_CITY } = await import("@/lib/listing/crm-transfer");
  const { audit } = await import("@/lib/auth/session");

  const report: Record<string, unknown> = { spec: { ...SPEC, inputs: { ...SPEC.inputs } }, steps: [] };
  const step = (key: string, data: unknown) => {
    (report.steps as Array<Record<string, unknown>>).push({ key, at: new Date().toISOString(), data });
    console.log(`[${key}]`, JSON.stringify(data).slice(0, 300));
  };

  // ── توکن مالک (realtor سید نعمت اله سیدی) ──
  const resolved = await resolveBestArmToken(db);
  if (!resolved || !resolved.token) throw new Error("هیچ توکن ARM در دسترس نیست");
  const token = resolved.token;
  step("token", { source: resolved.source, expIso: resolved.expMs ? new Date(resolved.expMs).toISOString() : null, valid: resolved.expMs ? resolved.expMs - Date.now() > 120_000 : null });
  const cfg = getMelkApiConfig();
  const exec = <T,>(fn: (t: string) => Promise<T>) => fn(token);

  // ── گام ۰: ورودی کامل (منطقه/محله = همهٔ تبریز) ──
  const areaIds = TABRIZ_AREAS.map((a) => a.id);
  const areaNames = TABRIZ_AREAS.map((a) => a.n);
  const lineIds = ALL_LINES.map((l) => l.id);
  const lineNames = ALL_LINES.map((l) => l.n);
  step("location", { areas: areaIds.length, lines: lineIds.length, city: "تبریز" });

  const input = {
    source: "auto" as const,
    customerName: SPEC.customerName,
    customerMobile: SPEC.customerMobile,
    countryId: IRAN_COUNTRY_ID,
    stateId: AZ_SHARGHI_STATE_ID,
    cityId: TABRIZ_CITY,
    areaIds,
    areaNames,
    lineIds,
    lineNames,
    tradeTypeId: SPEC.tradeTypeId,
    buildingTypeId: SPEC.buildingTypeId,
    propertyTypeId: SPEC.propertyTypeId,
    inputs: SPEC.inputs,
    userPaymentMethod: SPEC.userPaymentMethod,
    userSeriousity: SPEC.userSeriousity,
  };

  // ── ثبت محلی (اعتبارسنجی ۴ گامی داخلش) ──
  const created = await createRequest(input, SPEC.history.byCode);
  if (!created.record) throw new Error("ثبت محلی ناموفق: " + JSON.stringify(created.errors));
  step("local-create", { id: created.record.id, complete: created.ok, errors: created.errors });
  await db.requestRecord.update({
    where: { id: created.record.id },
    data: { actorName: SPEC.history.byName },
  });

  // رویداد هوشمند (عین روت /api/requests — هرگز ثبت را نمی‌شکند)
  try {
    const { emitEvent } = await import("@/lib/intelligence/blackboard");
    await emitEvent("request.created", { requestId: created.record.id, source: "auto", actor: SPEC.history.byCode });
    const { OpportunityListener } = await import("@/core/matching/opportunity-listener");
    const listener = new OpportunityListener(db, 3);
    const alertReport = await listener.onRequestCreated(created.record.id);
    step("opportunity-listener", { alerts: alertReport.alertsCreated, topScore: alertReport.topScores[0] ?? null });
  } catch (e) {
    step("opportunity-listener-skipped", { reason: String(e).slice(0, 120) });
  }

  // ── ثبت گام‌به‌گام در سامانه ARM (عین کاربر عادی) ──
  const guard = {
    sessionId: "script-dir-reg-req-099-001",
    personnelCode: SPEC.history.byCode,
    role: "OWNER" as const,
    armTokens: { accessToken: token, refreshToken: "", userType: "realtor" as const },
  };
  const reg = await registerRequestToArm(guard as never, created.record.id, "create", exec);
  step("arm-register", {
    ok: reg.ok,
    armRequestId: reg.armRequestId ?? null,
    customerId: reg.customerId ?? null,
    customerCreated: reg.customerCreated ?? null,
    steps: reg.steps.map((s) => ({ key: s.key, status: s.status, title: s.title, detail: s.detail })),
    error: reg.error ?? null,
  });
  if (!reg.ok || !reg.armRequestId) {
    fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "register-result.json"), JSON.stringify(report, null, 2), "utf-8");
    throw new Error("ثبت در ARM ناموفق: " + (reg.error ?? "?"));
  }

  // ── کد درخواست از فهرست زنده ARM (تازه‌ترین صفحه) ──
  let armRow: Record<string, any> | null = null;
  for (let page = 1; page <= 3 && !armRow; page++) {
    const res = await armCall<Record<string, any>>({
      method: "GET",
      path: "requests/list",
      baseUrl: cfg.armApiBase,
      query: { page: String(page), limit: "20" },
      token,
      timeoutMs: 90_000,
      maxRetries: 1,
    });
    const list = (res.data?.list ?? []) as Array<Record<string, any>>;
    armRow = list.find((r) => r._id === reg.armRequestId) ?? null;
    if (armRow) break;
  }
  if (!armRow) throw new Error("ردیف درخواست تازه در فهرست ARM یافت نشد (id=" + reg.armRequestId + ")");
  const requestCode = String(armRow.code ?? armRow.requestCode ?? "");
  step("arm-row", {
    armRequestId: reg.armRequestId,
    requestCode,
    title: armRow.title,
    relatedRealtor: armRow.relatedRealtor,
    relatedCustomer: armRow.relatedCustomer,
    createdAt: armRow.createdAt,
    areaCount: Array.isArray(armRow.area) ? armRow.area.length : null,
    lineCount: Array.isArray(armRow.line) ? armRow.line.length : null,
  });

  // ── شاهد تاریخچهٔ ARM (ایجاد مشاور خودکار) ──
  let armHistory: unknown = null;
  try {
    const hres = await armCall<Record<string, any>>({
      method: "GET",
      path: `requests/history/${encodeURIComponent(reg.armRequestId)}`,
      baseUrl: cfg.armApiBase,
      token,
      timeoutMs: 90_000,
      maxRetries: 0,
    });
    armHistory = hres.data;
    const entries = ((hres.data as any)?.list ?? []) as Array<Record<string, any>>;
    step("arm-history", {
      count: entries.length,
      entries: entries.map((e) => ({
        action: e.actionType?.name,
        actionTypeId: e.actionType?._id,
        realtor: e.realtor?.fullName,
        date: e.date,
      })),
    });
  } catch (e) {
    step("arm-history-failed", { error: String(e).slice(0, 160) });
  }

  // ── تکمیل ستون‌های کاتالوگ رکورد محلی (عین toArmRequestData — بدون تغییر source) ──
  const raw = armRow as Record<string, any>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const inputsRow = (raw.inputs ?? {}) as Record<string, any>;
  await db.requestRecord.update({
    where: { id: created.record.id },
    data: {
      requestCode,
      title: typeof raw.title === "string" ? raw.title : null,
      actorName: typeof raw.relatedRealtor === "string" ? raw.relatedRealtor : SPEC.history.byName,
      status: "ready",
      customerName: typeof raw.relatedCustomer === "string" && raw.relatedCustomer ? raw.relatedCustomer : SPEC.customerName,
      tradeTypeName: "فروش",
      buildingTypeName: "مسکونی",
      propertyTypeName: "آپارتمان",
      userPaymentMethodName: "نقدی",
      userSeriousityName: "زیاد",
      priceFrom: num(raw.totalPrice_from),
      priceTo: num(raw.totalPrice_to),
      spaceFrom: num(inputsRow.space_from),
      spaceTo: num(inputsRow.space_to),
      roomsFrom: num(inputsRow.room_whole_from) as number | null,
      roomsTo: num(inputsRow.room_whole_to) as number | null,
      floorFrom: num(inputsRow.floor_from) as number | null,
      floorTo: num(inputsRow.floor_to) as number | null,
      buildYearFrom: num(inputsRow.year_from) as number | null,
      buildYearTo: num(inputsRow.year_to) as number | null,
      sanadNames: "شش دانگ",
      constructTypeNames: "شخصی ساز",
      sideNames: "جنوبی",
      createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
      customerNameNorm: null,
      actorNameNorm: null,
    },
  });
  step("local-catalog-columns", { requestCode });

  // ── ثبت «تاریخچه تغییرات درخواست» — دقیقاً طبق اعلام مالک ──
  //   اقدام: ایجاد مشاور · توسط: سید نعمت اله سیدی · تاریخ: ۱۷:۳۰|۱۴۰۵/۰۸/۲۰
  //   (شناسهٔ نوع = شناسهٔ واقعی actionType «ایجاد مشاور» خود سامانه؛
  //    تاریخ/ساعت دقیق اعلامی مالک — عین فرم رویداد خود سامانه با تاریخ جلالی)
  const event = await createRequestEvent(
    {
      requestId: created.record.id,
      eventTypeId: SPEC.history.actionTypeId,
      eventTypeName: SPEC.history.actionTypeName,
      flags: {},
      date: SPEC.history.date,
      hour: SPEC.history.hour,
      message: null,
    },
    SPEC.history.byCode
  );
  // شاهد همگام‌سازی: پاسخ تاریخچهٔ زندهٔ ARM + مرجع درخواست
  await db.requestEventRecord.update({
    where: { id: event.id },
    data: {
      armSyncJson: JSON.stringify({
        at: new Date().toISOString(),
        kind: "change-history-entry",
        byOwnerDirective: true,
        demanded: { اقدام: SPEC.history.actionTypeName, توسط: SPEC.history.byName, تاریخ: `${SPEC.history.hour}|${SPEC.history.date}` },
        armRequestCode: requestCode,
        armRequestId: reg.armRequestId,
        armAutoHistoryEntry: ((armHistory as any)?.list ?? [])[0]
          ? {
              action: ((armHistory as any).list[0].actionType ?? {}).name,
              realtor: (((armHistory as any).list[0].realtor ?? {}) as Record<string, unknown>).fullName,
              date: (armHistory as any).list[0].date,
            }
          : null,
      }),
    },
  });
  step("history-entry", {
    eventId: event.id,
    اقدام: SPEC.history.actionTypeName,
    توسط: SPEC.history.byName,
    "تاریخ": `${SPEC.history.hour}|${SPEC.history.date}`,
  });

  // ── ممیزی ──
  await audit("REQUEST_CREATE", SPEC.history.byCode, `id=${created.record.id} code=${requestCode} arm=${reg.armRequestId} by=script-dir-reg-req-099-001`).catch(() => undefined);

  // ── خروجی نهایی ──
  const finalRec = await db.requestRecord.findUnique({ where: { id: created.record.id }, include: { events: true } });
  report.final = finalRec
    ? {
        id: finalRec.id,
        requestCode: finalRec.requestCode,
        armRequestId: finalRec.armRequestId,
        armRegisteredAt: finalRec.armRegisteredAt,
        source: finalRec.source,
        status: finalRec.status,
        customerName: finalRec.customerName,
        customerMobile: finalRec.customerMobile,
        actorName: finalRec.actorName,
        title: finalRec.title,
        events: finalRec.events.map((e) => ({ name: e.eventTypeName, date: e.date, hour: e.hour })),
      }
    : null;
  report.durationMs = Date.now() - t0;
  const dir = path.join(process.cwd(), "scripts", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "register-result.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log("═".repeat(60));
  console.log("ثبت کامل ✓ — کد درخواست ARM:", requestCode, "| شناسه:", reg.armRequestId);
  console.log("═".repeat(60));
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
