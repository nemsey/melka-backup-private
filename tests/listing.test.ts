/**
 * تست‌های کاشی «آگهی» — مولد محتوای اینستاگرام، اعتبارسنجی ۵ گامی،
 * ساخت بدنه CRM، درون‌ریزی دیوار، موبایل آرم و تفکیک نام
 */

import { describe, expect, test } from "bun:test";
import {
  validateListing,
  toLatinDigits,
  priceEvaluationLabel,
  seriousnessLabel,
  desirabilityLabel,
  sellReasonLabel,
  changeWithLabel,
  fileTypeLabels,
  fileFindingLabelOf,
  computeCompleteness,
} from "../src/lib/listing/types";
import { generateInstagramContent, faPriceText, extractPriceToman, buildHashtags } from "../src/lib/instagram/content";
import { toArmMobile, splitName, buildCreatePayload } from "../src/lib/listing/crm-transfer";
import { DIVAR_CATEGORY_TO_ARM } from "../src/lib/listing/store";

// ===================== اعتبارسنجی ۵ گامی =====================

const completeInput = {
  customerName: "علی محمدی",
  customerMobile: "۰۹۱۴۱۲۳۴۵۶۷",
  areaId: "6158168f6cd8d114dcd010fd",
  lineId: "61781957601cbd30c974d74b",
  address: "خیابان امام، کوچه ۳، پلاک ۷",
  postalCode: "۵۱۳۳۶۷۵۱۳۴",
  tradeTypeId: "614ed62da50555f0a54c1eca",
  buildingTypeId: "614edc35a50555f0a54c1f1e",
  propertyTypeId: "614ee704a50555f0a54c227d",
  changeWith: ["notChangeable"],
  inputs: { مساحت: "۱۲۰", اتاق: "۲" },
  priceEvaluation: "61a7dae115a8b67e5ef937ad",
  fileFinding: "officeVisit",
  fileType: ["private"],
  userSeriousness: "61a7536b0927675c45489a59",
};

describe("اعتبارسنجی ۵ گامی فایل آگهی (عین zod آرم)", () => {
  test("فایل کامل، بدون خطا", () => {
    const v = validateListing(completeInput);
    expect(v.ok).toBe(true);
    expect(v.errors.length).toBe(0);
  });

  test("نام کوتاه و موبایل نامعتبر → خطای گام ۱", () => {
    const v = validateListing({ ...completeInput, customerName: "ع", customerMobile: "12345" });
    expect(v.ok).toBe(false);
    expect(v.errors.filter((e) => e.step === 1).length).toBe(2);
  });

  test("بدون محله → خطای گام ۲", () => {
    const v = validateListing({ ...completeInput, lineId: null });
    expect(v.ok).toBe(false);
    expect(v.errors[0].step).toBe(2);
  });

  test("کد پستی ۸ رقمی → خطای گام ۲؛ کد پستی خالی مجاز", () => {
    expect(validateListing({ ...completeInput, postalCode: "۵۱۳۳۶۷" }).ok).toBe(false);
    expect(validateListing({ ...completeInput, postalCode: "" }).ok).toBe(true);
  });

  test("«مایل نیستم» همزمان با سایر گزینه‌ها → خطای انحصاری گام ۳", () => {
    const v = validateListing({ ...completeInput, changeWith: ["notChangeable", "land"] });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.message.includes("همزمان"))).toBe(true);
  });

  test("معاوضه خالی → حداقل یک مورد", () => {
    const v = validateListing({ ...completeInput, changeWith: [] });
    expect(v.errors.some((e) => e.message.includes("حداقل یک مورد"))).toBe(true);
  });

  test("بدون مساحت → خطای گام ۳", () => {
    const v = validateListing({ ...completeInput, inputs: { اتاق: "۲" } });
    expect(v.errors.some((e) => e.field === "inputs.مساحت")).toBe(true);
  });

  test("بدون قیمت فایل/نحوه یافتن/جدیت → خطاهای گام ۵", () => {
    const v = validateListing({ ...completeInput, priceEvaluation: null, fileFinding: null, userSeriousness: null, fileType: [] });
    expect(v.errors.filter((e) => e.step === 5).length).toBe(4);
  });

  test("ارقام فارسی/عربی نرمال می‌شوند", () => {
    expect(toLatinDigits("۰۹۱۴")).toBe("0914");
    expect(toLatinDigits("٥١٣")).toBe("513");
  });
});

// ===================== کامل‌بودن گام‌ها =====================

describe("کامل‌بودن ۵ گام روی رکورد", () => {
  test("رکورد کامل → هر ۵ گام کامل", () => {
    const steps = computeCompleteness({
      customerName: "علی محمدی",
      customerMobile: "09141234567",
      areaId: "a",
      lineId: "l",
      address: "آدرس",
      tradeTypeId: "t",
      buildingTypeId: "b",
      propertyTypeId: "p",
      changeWithJson: '["notChangeable"]',
      inputsJson: '{"مساحت":"120"}',
      imagesJson: '["https://img/1.jpg"]',
      priceEvaluation: "pe",
      fileFinding: "officeVisit",
      fileTypeJson: '["private"]',
      userSeriousness: "us",
    });
    expect(steps.every((s) => s.done)).toBe(true);
    expect(steps.length).toBe(5);
  });

  test("رکورد دیوار بدون مالک → گام ۱ و ۵ ناقص", () => {
    const steps = computeCompleteness({
      customerName: null,
      customerMobile: null,
      areaId: "a",
      lineId: "l",
      address: "آدرس",
      tradeTypeId: "t",
      buildingTypeId: "b",
      propertyTypeId: "p",
      changeWithJson: '["notChangeable"]',
      inputsJson: '{"مساحت":"120"}',
      imagesJson: "[]",
      priceEvaluation: null,
      fileFinding: "divar",
      fileTypeJson: '["private"]',
      userSeriousness: null,
    });
    expect(steps[0].done).toBe(false);
    expect(steps[1].done).toBe(true);
    expect(steps[2].done).toBe(true);
    expect(steps[4].done).toBe(false);
  });
});

// ===================== برچسب‌های فارسی =====================

describe("برچسب‌های فارسی گام ۵", () => {
  test("قیمت فایل id → نام", () => {
    expect(priceEvaluationLabel("61a7dae115a8b67e5ef937ad")).toBe("قیمت کارشناسی");
    expect(priceEvaluationLabel("61a7dafe15a8b67e5ef937c1")).toBe("زیر قیمت کارشناسی");
  });
  test("جدیت id → نام", () => {
    expect(seriousnessLabel("61a7536b0927675c45489a59")).toBe("خیلی زیاد");
    expect(seriousnessLabel(null)).toBe("—");
  });
  test("مطلوبیت و دلیل فروش", () => {
    expect(desirabilityLabel("61a7da4815a8b67e5ef93771")).toBe("عالی");
    expect(sellReasonLabel("6513f4ddb58cb42930e43477")).toBe("سرمایه گذاری");
  });
  test("معاوضه و وضعیت فایل و نحوه یافتن", () => {
    expect(changeWithLabel(["notChangeable"])).toEqual(["مایل نیستم"]);
    expect(changeWithLabel(["land", "car"])).toEqual(["زمین / ملک کلنگی", "خودرو"]);
    expect(fileTypeLabels(["private", "shareReal"])).toEqual(["اختصاصی", "اشتراکی با املاک"]);
    expect(fileFindingLabelOf("officeVisit")).toBe("مراجعه به دفتر");
    expect(fileFindingLabelOf("divar")).toContain("دیوار");
  });
});

// ===================== موبایل/نام آرم =====================

describe("تبدیل‌های آرم", () => {
  test("موبایل بدون صفر ابتدایی (عین خود سامانه)", () => {
    expect(toArmMobile("09141234567")).toBe("9141234567");
    expect(toArmMobile("۹۱۴۱۲۳۴۵۶۷")).toBe("9141234567");
    expect(toArmMobile("09141234567")).toHaveLength(10);
  });
  test("تفکیک نام کامل", () => {
    expect(splitName("علی محمدی")).toEqual({ firstName: "علی", lastName: "محمدی" });
    expect(splitName("سید نعمت اله سیدی")).toEqual({ firstName: "سید", lastName: "نعمت اله سیدی" });
    expect(splitName("مهدی")).toEqual({ firstName: "مهدی", lastName: "" });
  });
});

// ===================== بدنه properties/create =====================

describe("ساخت بدنه ثبت آرم (سریال‌سازی عین خود سامانه: id خام)", () => {
  test("بدنه کامل — شناسه‌ها و مقادیر خام", () => {
    const payload = buildCreatePayload({
      customerId: "64da0505f833d77fd08f34c2",
      areaId: "area1",
      areaName: "منطقه",
      lineId: "line1",
      lineName: "محله",
      latitude: 38.06,
      longitude: 46.29,
      postalCode: "5133675134",
      address: "آدرس",
      tradeTypeId: "614ed62da50555f0a54c1eca",
      propertyTypeId: "614ee704a50555f0a54c227d",
      buildingTypeId: "614edc35a50555f0a54c1f1e",
      changeWith: ["notChangeable"],
      inputs: { مساحت: "120" },
      images: ["https://img/1.jpg"],
      videos: [],
      priceEvaluation: "61a7dae115a8b67e5ef937ad",
      desirabilityLevel: "61a7d9eb15a8b67e5ef93767",
      fileFinding: "officeVisit",
      fileType: ["private"],
      userSeriousness: "61a7536b0927675c45489a59",
      sellReason: "6513f4ddb58cb42930e43477",
      description: "توضیحات",
    });
    expect(payload.customer).toBe("64da0505f833d77fd08f34c2");
    expect(payload.country).toBe("614ed19700cace6eac4f9ded");
    expect(payload.state).toBe("614ed19700cace6eac4f9df0");
    expect(payload.area).toBe("area1");
    expect(payload.line).toBe("line1");
    expect(payload.tradeType).toBe("614ed62da50555f0a54c1eca");
    expect(payload.fileFinding).toBe("officeVisit");
    expect(payload.fileType).toEqual(["private"]);
    expect(payload.postal_code).toBe("5133675134");
    expect(payload.location).toEqual({ lat: 38.06, lng: 46.29 });
    expect(payload.images).toEqual(["https://img/1.jpg"]);
  });

  test("مقادیر اختیاری خالی حذف می‌شوند (عین removeEmpty)", () => {
    const payload = buildCreatePayload({
      customerId: "u1",
      areaId: "a",
      areaName: "a",
      lineId: "l",
      lineName: "l",
      postalCode: null,
      address: "آدرس",
      tradeTypeId: "t",
      propertyTypeId: "p",
      buildingTypeId: "b",
      changeWith: ["notChangeable"],
      inputs: { مساحت: "100" },
      images: [],
      videos: [],
      priceEvaluation: "pe",
      fileFinding: "divar",
      fileType: ["private"],
      userSeriousness: "us",
      sellReason: null,
      description: null,
    });
    expect("postal_code" in payload).toBe(false);
    expect("desirabilityLevel" in payload).toBe(false);
    expect("sellReason" in payload).toBe(false);
    expect("location" in payload).toBe(false);
    expect("images" in payload).toBe(false);
  });
});

// ===================== نگاشت دیوار → آرم =====================

describe("نگاشت دسته دیوار به نوع‌های آرم", () => {
  test("۱۳ دسته املاک دیوار نگاشت شده‌اند", () => {
    expect(Object.keys(DIVAR_CATEGORY_TO_ARM).length).toBeGreaterThanOrEqual(13);
  });
  test("آپارتمان فروش و اجاره", () => {
    expect(DIVAR_CATEGORY_TO_ARM["apartment-sell"].tradeTypeName).toBe("فروش");
    expect(DIVAR_CATEGORY_TO_ARM["apartment-sell"].propertyTypeName).toBe("آپارتمان");
    expect(DIVAR_CATEGORY_TO_ARM["apartment-rent"].tradeTypeName).toBe("رهن و اجاره");
  });
});

// ===================== مولد محتوای اینستاگرام =====================

const listingSource = {
  propertyTypeName: "آپارتمان",
  tradeTypeName: "فروش",
  buildingTypeName: "مسکونی",
  lineName: "خ وحدت",
  areaName: "میدان پرواز",
  inputs: { مساحت: "120", اتاق: "2", طبقه: "3", "سال ساخت": "1402", قیمت: "3500000000" },
  priceEvaluationLabel: "زیر قیمت کارشناسی",
  desirabilityLabel: "عالی",
  sellReasonLabel: "سرمایه گذاری",
  description: "دارای ویو ابدی. دو پارکینیگ. سند تک‌برگ.",
  isLuxury: true,
  isUrgent: true,
  isVacation: false,
  imageCount: 5,
  videoCount: 0,
};

describe("مولد محتوای اینستاگرام", () => {
  test("پست برای فایل بدون ویدیو؛ رییلز برای فایل با ویدیو", () => {
    const post = generateInstagramContent(listingSource, "professional");
    expect(post.kind).toBe("post");
    const reel = generateInstagramContent({ ...listingSource, videoCount: 2 }, "warm");
    expect(reel.kind).toBe("reel");
  });

  test("کپشن شامل مشخصات، قیمت، نکات و هشتگ است", () => {
    const content = generateInstagramContent(listingSource, "professional", "041-33330000");
    expect(content.caption).toContain("آپارتمان");
    expect(content.caption).toContain("خ وحدت");
    expect(content.caption).toContain("۱۲۰");
    expect(content.caption).toContain("۳٫۵ میلیارد تومان");
    expect(content.caption).toContain("زیر قیمت کارشناسی");
    expect(content.caption).toContain("لوکس");
    expect(content.caption).toContain("فروش فوری");
    expect(content.caption).toContain("041-33330000");
    expect(content.caption).toContain("#");
    expect(content.hashtags.length).toBeGreaterThan(4);
    expect(content.hashtags.some((h) => h.includes("املاک_تبریز"))).toBe(true);
  });

  test("سه لحن، سه قلاب متفاوت", () => {
    const p = generateInstagramContent(listingSource, "professional");
    const w = generateInstagramContent(listingSource, "warm");
    const u = generateInstagramContent(listingSource, "urgent");
    const first = (s: string) => s.split("\n")[0];
    expect(first(p.caption)).not.toBe(first(w.caption));
    expect(first(u.caption)).toContain("فرصت");
  });

  test("قالب قیمت فارسی", () => {
    expect(faPriceText(3_500_000_000)).toBe("۳٫۵ میلیارد تومان");
    expect(faPriceText(450_000_000)).toBe("۴۵۰ میلیون تومان");
    expect(faPriceText(75_000_000)).toBe("۷۵ میلیون تومان");
    expect(faPriceText(12_500_000_000)).toBe("۱۲٫۵ میلیارد تومان");
  });

  test("استخراج قیمت از فرم پویا (ارقام فارسی)", () => {
    expect(extractPriceToman({ قیمت: "۳۵۰۰۰۰۰۰۰۰" })).toBe(3500000000);
    expect(extractPriceToman({})).toBeNull();
    expect(extractPriceToman(undefined)).toBeNull();
  });

  test("هشتگ‌ها ایمن‌سازی می‌شوند (بدون نویسه غیرمجاز)", () => {
    const tags = buildHashtags({ ...listingSource, lineName: "خ وحدت ائل" });
    for (const t of tags) {
      expect(t.match(/^[\p{L}\p{N}_]+$/u) ?? null).not.toBeNull();
    }
  });

  test("بدون قیمت، خط قیمت ساخته نمی‌شود", () => {
    const content = generateInstagramContent({ ...listingSource, inputs: { مساحت: "120" } }, "professional");
    expect(content.caption).not.toContain("قیمت:");
  });

  test("بدون تماس، فراخوان به دایرکت اشاره می‌کند", () => {
    const content = generateInstagramContent(listingSource, "warm");
    expect(content.caption).toContain("دایرکت");
  });
});
