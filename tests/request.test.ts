/**
 * تست‌های کاشی «درخواست ملک» — اعتبارسنجی ۴ گامی (عین zod آرم)،
 * ساخت بدنه requests/create (سریال‌سازی عین خود سامانه)، موتور تطبیق درخواست↔آگهی،
 * امتیاز سلامت/چرخه عمر مشتری و برچسب‌های nameRequest
 */

import { describe, expect, test } from "bun:test";
import {
  validateRequest,
  buildCreatePayload,
  computeCompleteness,
  buildRequestTitle,
  toRequestRow,
  tradeTypeRequestLabel,
  buildingTypeLabel,
  propertyTypeLabel,
  paymentMethodLabel,
  seriousnessLabel,
  buildingAllowsTrade,
  isValidIranMobile,
  locationLabel,
  type RequestRecordRow,
} from "../src/lib/request/types";
import { matchRequestToListings, computeHealth, computeStage, computeNextActions } from "../src/lib/request/customer-mgmt";

// ===================== داده نمونه =====================

const completeInput = {
  customerName: "سید علی محمدی",
  customerMobile: "۰۹۱۴۱۲۳۴۵۶۷",
  countryId: "614ed19700cace6eac4f9ded",
  stateId: "614ed19700cace6eac4f9df0",
  cityId: "614ed19700cace6eac4f9df2",
  areaIds: ["6158168f6cd8d114dcd010fd", "615817696cd8d114dcd01105"],
  areaNames: ["17 شهریور جدید", "ولیعصر"],
  lineIds: ["61781957601cbd30c974d74b"],
  lineNames: ["ارگ"],
  tradeTypeId: "614ed62da50555f0a54c1eca",
  buildingTypeId: "614edc35a50555f0a54c1f12",
  propertyTypeId: "614ee704a50555f0a54c227d",
  inputs: { space_from: "100", space_to: "150", totalPrice_from: "2000000000", totalPrice_to: "3000000000", elevator: true, sanad: ["shesh"] },
  customerDescription: "دارای ویو ابدی",
  userPaymentMethod: "61a39bf0f06329efdeacbbef",
  userSeriousity: "61a7536b0927675c45489a59",
  realtorDescription: "مشتری Very Serious",
};

const baseRecord: RequestRecordRow = {
  id: "req-1",
  source: "manual",
  customerName: "سید علی محمدی",
  customerMobile: "09141234567",
  armCustomerId: "arm-user-1",
  countryId: "614ed19700cace6eac4f9ded",
  stateId: "614ed19700cace6eac4f9df0",
  cityId: "614ed19700cace6eac4f9df2",
  areaIdsJson: '["6158168f6cd8d114dcd010fd"]',
  areaNamesJson: '["ولیعصر"]',
  lineIdsJson: '["61781957601cbd30c974d74b"]',
  lineNamesJson: '["ارگ"]',
  tradeTypeId: "614ed62da50555f0a54c1eca",
  buildingTypeId: "614edc35a50555f0a54c1f12",
  propertyTypeId: "614ee704a50555f0a54c227d",
  inputsJson: '{"space_from":"100","space_to":"150","totalPrice_from":"2000000000","totalPrice_to":"3000000000"}',
  customerDescription: null,
  userPaymentMethod: "61a39bf0f06329efdeacbbef",
  userSeriousity: "61a7536b0927675c45489a59",
  realtorDescription: null,
  status: "ready",
  armRegistrationJson: null,
  armRegisteredAt: new Date("2026-09-01T10:00:00Z"),
  armRequestId: "arm-req-777",
  createdAt: new Date("2026-08-20T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
};

// ===================== اعتبارسنجی ۴ گامی =====================

describe("اعتبارسنجی ۴ گامی درخواست (عین zod آرم)", () => {
  test("درخواست کامل، بدون خطا", () => {
    const v = validateRequest(completeInput);
    expect(v.ok).toBe(true);
    expect(v.errors.length).toBe(0);
  });

  test("نام کوتاه و موبایل نامعتبر → دو خطای گام ۱", () => {
    const v = validateRequest({ ...completeInput, customerName: "ع", customerMobile: "12345" });
    expect(v.ok).toBe(false);
    expect(v.errors.filter((e) => e.step === 1).length).toBe(2);
  });

  test("بدون منطقه → خطای گام ۲", () => {
    const v = validateRequest({ ...completeInput, areaIds: [] });
    expect(v.ok).toBe(false);
    expect(v.errors[0].step).toBe(2);
    expect(v.errors[0].field).toBe("areaIds");
  });

  test("بدون نوع ملک → خطای گام ۳", () => {
    const v = validateRequest({ ...completeInput, propertyTypeId: undefined });
    expect(v.ok).toBe(false);
    expect(v.errors.filter((e) => e.step === 3).length).toBe(1);
  });

  test("معامله «رهن و اجاره» با کاربری «باغ و ویلا» → مجاز نیست (عین قید tradeTypes خود سامانه)", () => {
    expect(buildingAllowsTrade("614edc58a50555f0a54c1f24", "614ed649a50555f0a54c1edc")).toBe(false);
    expect(buildingAllowsTrade("614edc35a50555f0a54c1f12", "614ed649a50555f0a54c1edc")).toBe(true);
    const v = validateRequest({ ...completeInput, tradeTypeId: "614ed649a50555f0a54c1edc", buildingTypeId: "614edc58a50555f0a54c1f24", propertyTypeId: "614f2ec1a50555f0a54c2719" });
    expect(v.errors.some((e) => e.field === "tradeTypeId" && e.message.includes("مجاز نیست"))).toBe(true);
  });

  test("نوع ملک نامتناسب با کاربری → خطای گام ۳ (عین خود سامانه)", () => {
    const v = validateRequest({ ...completeInput, propertyTypeId: "614f2ec1a50555f0a54c2719" }); // باغ با کاربری مسکونی
    expect(v.errors.some((e) => e.field === "propertyTypeId")).toBe(true);
  });

  test("بدون پرداخت/جدیت → دو خطای گام ۴", () => {
    const v = validateRequest({ ...completeInput, userPaymentMethod: undefined, userSeriousity: undefined });
    expect(v.errors.filter((e) => e.step === 4).length).toBe(2);
  });

  test("موبایل ایران: با صفر و بدون صفر معتبر", () => {
    expect(isValidIranMobile("09141234567")).toBe(true);
    expect(isValidIranMobile("9141234567")).toBe(true);
    expect(isValidIranMobile("0914123456")).toBe(false);
    expect(isValidIranMobile("۰۹۱۴۱۲۳۴۵۶۷")).toBe(true);
  });
});

// ===================== ساخت بدنه requests/create =====================

describe("ساخت بدنه requests/create (سریال‌سازی عین خود سامانه)", () => {
  test("بدنه با شناسه‌های خام + area/line از areaAndLine", () => {
    const payload = buildCreatePayload({
      customerId: "arm-user-1",
      countryId: "614ed19700cace6eac4f9ded",
      stateId: "614ed19700cace6eac4f9df0",
      cityId: "614ed19700cace6eac4f9df2",
      areaIds: ["area-1", "area-2"],
      lineIds: ["line-1"],
      tradeTypeId: "614ed62da50555f0a54c1eca",
      buildingTypeId: "614edc35a50555f0a54c1f12",
      propertyTypeId: "614ee704a50555f0a54c227d",
      inputs: { space_from: "100", elevator: true },
      customerDescription: "توضیح",
      userPaymentMethod: "61a39bf0f06329efdeacbbef",
      userSeriousity: "61a7536b0927675c45489a59",
      realtorDescription: null,
    });
    expect(payload.customer).toBe("arm-user-1");
    expect(payload.area).toEqual(["area-1", "area-2"]);
    expect(payload.line).toEqual(["line-1"]);
    expect(payload.tradeType).toBe("614ed62da50555f0a54c1eca");
    expect(payload.userPaymentMethod).toBe("61a39bf0f06329efdeacbbef");
    expect(payload.inputs).toEqual({ space_from: "100", elevator: true });
    expect(payload.customerDescription).toBe("توضیح");
    // مقادیر تهی حذف می‌شوند (عین removeEmpty خود سامانه)
    expect("realtorDescription" in payload).toBe(false);
  });
});

// ===================== برچسب‌ها و عنوان =====================

describe("برچسب‌های فارسی عین خود سامانه", () => {
  test("نام درخواستی نوع معامله (فروش→خرید، پیش فروش→پیش خرید)", () => {
    expect(tradeTypeRequestLabel("614ed62da50555f0a54c1eca")).toBe("خرید");
    expect(tradeTypeRequestLabel("614ed63aa50555f0a54c1ed3")).toBe("پیش خرید");
    expect(tradeTypeRequestLabel("614ed649a50555f0a54c1edc")).toBe("رهن و اجاره");
    expect(tradeTypeRequestLabel("614ed790a50555f0a54c1ee5")).toBe("مشارکت در ساخت");
  });

  test("برچسب کاربری/ملک/پرداخت/جدیت", () => {
    expect(buildingTypeLabel("614edc35a50555f0a54c1f12")).toBe("مسکونی");
    expect(propertyTypeLabel("614ee704a50555f0a54c227d", "614edc35a50555f0a54c1f12")).toBe("آپارتمان");
    expect(propertyTypeLabel("614ee704a50555f0a54c227d")).toBe("آپارتمان");
    expect(paymentMethodLabel("61a39bf0f06329efdeacbbef")).toBe("نقدی");
    expect(paymentMethodLabel("61b4b26567a91fbc73ec8cdd")).toBe("تهاتر با کالا");
    expect(seriousnessLabel("61a7536b0927675c45489a59")).toBe("خیلی زیاد");
    expect(seriousnessLabel("61a39c18f06329efdeacbe47")).toBe("کم");
  });

  test("عنوان درخواست — عین ستون «نوع و متراژ درخواست»", () => {
    const title = buildRequestTitle(baseRecord);
    expect(title).toContain("خرید");
    expect(title).toContain("آپارتمان");
    expect(title).toContain("۱۰۰");
    expect(title).toContain("ولیعصر");
  });

  test("برچسب مکان", () => {
    expect(locationLabel(["ولیعصر"], ["ارگ"])).toContain("ولیعصر");
    expect(locationLabel([], [])).toBe("—");
  });
});

// ===================== کامل‌بودن ۴ گامی و ردیف =====================

describe("کامل‌بودن ۴ گامی و ردیف نمایشی", () => {
  test("رکورد کامل → هر ۴ گام", () => {
    const c = computeCompleteness(baseRecord);
    expect(c.completeCount).toBe(4);
    expect(c.total).toBe(4);
  });

  test("رکورد بدون مشتری → گام ۱ ناقص", () => {
    const c = computeCompleteness({ ...baseRecord, customerName: null, customerMobile: null });
    expect(c.steps[0].complete).toBe(false);
    expect(c.completeCount).toBe(3);
  });

  test("ردیف نمایشی: کد آرم، برچسب بودجه/متراژ", () => {
    const row = toRequestRow(baseRecord, 2);
    expect(row.code).toContain("آرم-");
    expect(row.tradeTypeName).toBe("خرید");
    expect(row.propertyTypeName).toBe("آپارتمان");
    expect(row.priceLabel).toContain("۲");
    expect(row.priceLabel).toContain("۳");
    expect(row.spaceLabel).toContain("۱۰۰");
    expect(row.eventCount).toBe(2);
    expect(row.armCustomerFound).toBe(true);
    expect(row.userPaymentMethodId).toBe("61a39bf0f06329efdeacbbef");
    expect(row.userSeriousityId).toBe("61a7536b0927675c45489a59");
  });

  test("ردیف رهن و اجاره: برچسب ودیعه + اجاره", () => {
    const row = toRequestRow({
      ...baseRecord,
      tradeTypeId: "614ed649a50555f0a54c1edc",
      inputsJson: '{"deposite_price_from":"500000000","deposite_price_to":"1000000000","rent_price_from":"30000000","rent_price_to":"60000000"}',
    });
    expect(row.isRental).toBe(true);
    expect(row.priceLabel).toContain("اجاره");
  });
});

// ===================== موتور تطبیق درخواست↔آگهی (شاهکار) =====================

const listingRecord = {
  id: "lst-1",
  source: "manual",
  customerName: "مالک تست",
  customerMobile: "09351112233",
  armCustomerId: null,
  areaId: "6158168f6cd8d114dcd010fd",
  areaName: "ولیعصر",
  lineId: "l1",
  lineName: "ارگ",
  postalCode: null,
  address: "آدرس",
  latitude: null,
  longitude: null,
  tradeTypeId: "614ed62da50555f0a54c1eca",
  tradeTypeName: "فروش",
  propertyTypeId: "614ee704a50555f0a54c227d",
  propertyTypeName: "آپارتمان",
  buildingTypeId: "614edc35a50555f0a54c1f12",
  buildingTypeName: "مسکونی",
  changeWithJson: "[]",
  inputsJson: '{"مساحت":"120","قیمت":"2500000000"}',
  imagesJson: "[]",
  videosJson: "[]",
  documentsJson: "[]",
  priceEvaluation: "61a7dae115a8b67e5ef937ad",
  desirabilityLevel: null,
  fileFinding: "officeVisit",
  fileTypeJson: "[]",
  userSeriousness: "61a7536b0927675c45489a59",
  sellReason: null,
  description: null,
  isLuxury: false,
  isVacation: false,
  isUrgent: false,
  notifyBySms: false,
  status: "ready",
  crmTransferJson: null,
  crmTransferredAt: null,
  armPropertyId: null,
  instagramPostJson: null,
  instagramPublishedAt: null,
  instagramMediaId: null,
  actorCode: "41372895",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Parameters<typeof matchRequestToListings>[1][number];

describe("موتور تطبیق درخواست↔آگهی (شاهکار ایجنت)", () => {
  test("تطبیق کامل: منطقه + معامله + ملک + قیمت + متراژ = ۱۰۰٪", () => {
    const matches = matchRequestToListings(baseRecord as never, [listingRecord]);
    expect(matches.length).toBe(1);
    const m = matches[0];
    expect(m.score).toBe(100);
    expect(m.band).toBe("عالی");
    expect(m.breakdown.length).toBe(5);
  });

  test("آگهی خارج از بازه قیمت → نصف امتیاز قیمت", () => {
    const expensive = { ...listingRecord, inputsJson: '{"مساحت":"120","قیمت":"9000000000"}' };
    const matches = matchRequestToListings(baseRecord as never, [expensive]);
    const price = matches[0].breakdown.find((b) => b.label === "تناسب قیمت")!;
    expect(price.got).toBeLessThan(price.max);
    expect(matches[0].score).toBeLessThan(100);
  });

  test("آگهی منطقه دیگر → تطبیق منطقه صفر", () => {
    const elsewhere = { ...listingRecord, areaId: "other-area" };
    const matches = matchRequestToListings(baseRecord as never, [elsewhere]);
    const area = matches[0].breakdown.find((b) => b.label === "تطبیق منطقه")!;
    expect(area.got).toBe(0);
  });

  test("آگهی نامرتبط (زیر آستانه ۲۵) حذف می‌شود", () => {
    const unrelated = { ...listingRecord, areaId: "other", tradeTypeId: "614ed790a50555f0a54c1ee5", propertyTypeId: "614f8450a50555f0a54c3bbf", buildingTypeId: "614edc8ba50555f0a54c1f36", inputsJson: '{"مساحت":"900","قیمت":"12000000000"}' };
    const matches = matchRequestToListings(baseRecord as never, [unrelated]);
    expect(matches.length).toBe(0);
  });

  test("درخواست بدون بازه قیمت → امتیاز قیمت خنثی (نصف)", () => {
    const noBudget = { ...baseRecord, inputsJson: '{"space_from":"100","space_to":"150"}' };
    const matches = matchRequestToListings(noBudget as never, [listingRecord]);
    const price = matches[0].breakdown.find((b) => b.label === "تناسب قیمت")!;
    expect(price.got).toBe(10);
  });
});

// ===================== امتیاز سلامت و چرخه عمر =====================

describe("امتیاز سلامت مشتری (۵ مؤلفه ۳۵/۲۵/۲۰/۱۰/۱۰)", () => {
  test("مشتری تازه با ۵+ رویداد و جدیت/پرداخت کامل → امتیاز بالا", () => {
    const h = computeHealth({ lastInteractionDays: 0, eventCount: 6, maxSeriousness: 20, maxPayment: 10, completenessRatio: 1 });
    expect(h.score).toBe(100);
    expect(h.breakdown.length).toBe(5);
    expect(h.breakdown[0].max).toBe(35);
    expect(h.breakdown[1].max).toBe(25);
  });

  test("مشتری بدون تعامل → امتیاز صفر", () => {
    const h = computeHealth({ lastInteractionDays: null, eventCount: 0, maxSeriousness: 0, maxPayment: 0, completenessRatio: 0 });
    expect(h.score).toBe(0);
  });

  test("بی‌تعاملی ۶۰ روزه → فقط ۳ امتیاز تازگی", () => {
    const h = computeHealth({ lastInteractionDays: 60, eventCount: 1, maxSeriousness: 5, maxPayment: 2, completenessRatio: 0.5 });
    expect(h.breakdown[0].got).toBe(3);
  });
});

describe("چرخه عمر مشتری", () => {
  test("ترتیب اولویت: معامله‌شده > راکد > آماده معامله > جدی > در تعامل > جدید", () => {
    expect(computeStage({ eventCount: 5, daysSinceInteraction: 1, maxSeriousness: 20, hasStrongMatch: true, convertedDeals: 1 })).toBe("CONVERTED");
    expect(computeStage({ eventCount: 5, daysSinceInteraction: 45, maxSeriousness: 20, hasStrongMatch: true, convertedDeals: 0 })).toBe("DORMANT");
    expect(computeStage({ eventCount: 2, daysSinceInteraction: 2, maxSeriousness: 20, hasStrongMatch: true, convertedDeals: 0 })).toBe("READY_TO_DEAL");
    expect(computeStage({ eventCount: 4, daysSinceInteraction: 2, maxSeriousness: 5, hasStrongMatch: false, convertedDeals: 0 })).toBe("SERIOUS");
    expect(computeStage({ eventCount: 1, daysSinceInteraction: 2, maxSeriousness: 5, hasStrongMatch: false, convertedDeals: 0 })).toBe("ENGAGED");
    expect(computeStage({ eventCount: 0, daysSinceInteraction: 0, maxSeriousness: 0, hasStrongMatch: false, convertedDeals: 0 })).toBe("NEW");
  });
});

describe("اقدام بعدی هوشمند (Next Best Action)", () => {
  test("بی‌تماسی +۱۴ روز → اقدام فوری تماس", () => {
    const actions = computeNextActions({
      name: "علی",
      daysSinceInteraction: 20,
      eventCount: 1,
      incompleteRequests: 0,
      readyNotRegistered: 0,
      strongMatches: [],
      stage: "ENGAGED",
      maxSeriousness: 10,
    });
    expect(actions.some((a) => a.kind === "CONTACT_OVERDUE" && a.priority === 1)).toBe(true);
  });

  test("تطبیق قوی + جدیت بالا → هماهنگی بازدید با اولویت ۱", () => {
    const actions = computeNextActions({
      name: "علی",
      daysSinceInteraction: 2,
      eventCount: 3,
      incompleteRequests: 0,
      readyNotRegistered: 0,
      strongMatches: [{ requestId: "r", requestTitle: "خرید", listingId: "l", listingTitle: "آپارتمان ولیعصر", listingPrice: "2500000000", score: 85, band: "عالی", breakdown: [] }],
      stage: "SERIOUS",
      maxSeriousness: 20,
    });
    const visit = actions.find((a) => a.kind === "ARRANGE_VISIT");
    expect(visit).toBeDefined();
    expect(visit!.priority).toBe(1);
  });

  test("درخواست ناقص + آماده ثبت آرم → هر دو اقدام پیشنهاد می‌شوند", () => {
    const actions = computeNextActions({
      name: "علی",
      daysSinceInteraction: 3,
      eventCount: 1,
      incompleteRequests: 2,
      readyNotRegistered: 1,
      strongMatches: [],
      stage: "ENGAGED",
      maxSeriousness: 10,
    });
    expect(actions.some((a) => a.kind === "COMPLETE_REQUEST")).toBe(true);
    expect(actions.some((a) => a.kind === "REGISTER_TO_ARM")).toBe(true);
  });

  test("مشتری راکد → اقدام بازگرداندن", () => {
    const actions = computeNextActions({
      name: "علی",
      daysSinceInteraction: 40,
      eventCount: 2,
      incompleteRequests: 0,
      readyNotRegistered: 0,
      strongMatches: [],
      stage: "DORMANT",
      maxSeriousness: 10,
    });
    expect(actions.some((a) => a.kind === "REACTIVATE")).toBe(true);
  });

  test("حداکثر ۳ اقدام با اولویت مرتب", () => {
    const actions = computeNextActions({
      name: "علی",
      daysSinceInteraction: 40,
      eventCount: 0,
      incompleteRequests: 3,
      readyNotRegistered: 3,
      strongMatches: [
        { requestId: "r", requestTitle: "خرید", listingId: "l", listingTitle: "آ", listingPrice: null, score: 85, band: "عالی", breakdown: [] },
        { requestId: "r2", requestTitle: "خرید", listingId: "l2", listingTitle: "ب", listingPrice: null, score: 72, band: "عالی", breakdown: [] },
      ],
      stage: "DORMANT",
      maxSeriousness: 20,
    });
    expect(actions.length).toBeLessThanOrEqual(3);
    const priorities = actions.map((a) => a.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });
});
