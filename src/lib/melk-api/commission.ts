/**
 * محاسبه‌گر کمیسیون — عین تعرفه رسمی اتحادیه مشاورین املاک تبریز
 * ------------------------------------------------------
 * ✅ قواعد از «نرخ‌نامه رسمی» سامانه مالی ملک تبریز استخراج شده
 *    (پاسخ زنده fm-api.melketabriz.ir/apm/commission/configList):
 *
 * تعرفه خرید و فروش (مبایعه‌نامه):
 *   ۱) تا سقف ۷۰۰٬۰۰۰٬۰۰۰ تومان: نیم درصد (۰٫۵٪) از هر طرف معامله
 *   ۲) مازاد بر ۷۰۰ میلیون: بیست‌وپنج صدم درصد (۰٫۲۵٪) از مازاد
 *      به اضافه بند ۱ — از هر طرف معامله
 *
 * تعرفه رهن و اجاره (اجاره‌نامه):
 *   ۱) یک درصد (۱٪) از مبلغ رهن به اضافه یک‌چهارم (۲۵٪) اجاره‌بهای
 *      ماه اول — از هر طرف قرارداد
 *
 * تمدید اجاره:
 *   ۱) یک‌دوم (۵۰٪) تعرفه مصوب از مالک (موجر)
 *   ۲) یک‌چهارم (۲۵٪) تعرفه مصوب از مستأجر
 *
 * مالیات ارزش افزوده (پیش‌فرض ۱۰٪) بر کمیسیون هر طرف افزوده می‌شود.
 */

import type { CommissionCityConfig, CommissionResult } from "./types";

/** سقف بند ۱ تعرفه خرید و فروش — تومان */
export const SELL_TARIFF_STEP = 700_000_000;
/** نرخ بند ۱ (تا سقف) — ۰٫۵٪ */
export const SELL_TARIFF_RATE_1 = 0.005;
/** نرخ بند ۲ (مازاد) — ۰٫۲۵٪ */
export const SELL_TARIFF_RATE_2 = 0.0025;
/** نرخ تعرفه رهن — ۱٪ */
export const RENT_DEPOSIT_RATE = 0.01;
/** سهم اجاره ماه اول در تعرفه اجاره — ۲۵٪ */
export const RENT_FIRST_MONTH_SHARE = 0.25;
/** سهم مالک (موجر) در تعرفه تمدید — ۵۰٪ تعرفه مصوب */
export const RENEWAL_LANDLORD_SHARE = 0.5;
/** سهم مستأجر در تعرفه تمدید — ۲۵٪ تعرفه مصوب */
export const RENEWAL_TENANT_SHARE = 0.25;

/**
 * کمیسیون پایه هر طرف در مبایعه‌نامه (خرید و فروش) — طبق نرخ‌نامه.
 * هر دو طرف (خریدار و فروشنده) سهم برابر می‌پردازند.
 */
export function saleCommissionBase(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= SELL_TARIFF_STEP) {
    return Math.round(price * SELL_TARIFF_RATE_1);
  }
  const step1 = SELL_TARIFF_STEP * SELL_TARIFF_RATE_1;
  const extra = (price - SELL_TARIFF_STEP) * SELL_TARIFF_RATE_2;
  return Math.round(step1 + extra);
}

/**
 * کمیسیون پایه هر طرف در اجاره‌نامه — ۱٪ رهن + ۲۵٪ اجاره ماه اول.
 */
export function rentCommissionBase(deposit: number, monthlyRent: number): number {
  const d = Number.isFinite(deposit) ? Math.max(0, deposit) : 0;
  const r = Number.isFinite(monthlyRent) ? Math.max(0, monthlyRent) : 0;
  return Math.round(d * RENT_DEPOSIT_RATE + r * RENT_FIRST_MONTH_SHARE);
}

/**
 * تعرفه مصوب اجاره (مبنای تمدید) — همان کمیسیون پایه اجاره‌نامه.
 * در تمدید: موجر ۵۰٪ و مستأجر ۲۵٪ این تعرفه را می‌پردازند.
 */
export function rentRenewalCommissions(deposit: number, monthlyRent: number): { landlord: number; tenant: number } {
  const base = rentCommissionBase(deposit, monthlyRent);
  return {
    landlord: Math.round(base * RENEWAL_LANDLORD_SHARE),
    tenant: Math.round(base * RENEWAL_TENANT_SHARE),
  };
}

/** افزودن مالیات ارزش افزوده به کمیسیون پایه */
export function withVat(commission: number, vatPercent: number): { commission: number; tax: number; payable: number } {
  const tax = Math.round((commission * vatPercent) / 100);
  return { commission: Math.round(commission), tax, payable: commission + tax };
}

/**
 * محاسبه کامل کمیسیون یک معامله — خروجی عین commissionData سامانه مالی:
 * کمیسیون خریدار/فروشنده، مالیات هر طرف و مبلغ قابل پرداخت هر طرف.
 */
export function calculateCommission(input: {
  contractType: string;
  contractPrice?: number;
  contractDeposite?: number;
  contractRent?: number;
  vatPercent?: number;
}): CommissionResult {
  const vat = input.vatPercent ?? 10;
  let buyerCommission = 0;
  let sellerCommission = 0;
  let dealValue = 0;

  switch (input.contractType) {
    case "mobayeName": {
      const price = Number.isFinite(input.contractPrice) ? Math.max(0, input.contractPrice ?? 0) : 0;
      dealValue = price;
      const base = saleCommissionBase(price);
      buyerCommission = base;
      sellerCommission = base;
      break;
    }
    case "ejareName": {
      const deposit = Number.isFinite(input.contractDeposite) ? Math.max(0, input.contractDeposite ?? 0) : 0;
      const rent = Number.isFinite(input.contractRent) ? Math.max(0, input.contractRent ?? 0) : 0;
      dealValue = deposit;
      const base = rentCommissionBase(deposit, rent);
      buyerCommission = base; // مستأجر
      sellerCommission = base; // موجر
      break;
    }
    case "rentalRenewal": {
      const deposit = Number.isFinite(input.contractDeposite) ? Math.max(0, input.contractDeposite ?? 0) : 0;
      const rent = Number.isFinite(input.contractRent) ? Math.max(0, input.contractRent ?? 0) : 0;
      dealValue = deposit;
      const { landlord, tenant } = rentRenewalCommissions(deposit, rent);
      buyerCommission = tenant; // مستأجر (۲۵٪ تعرفه)
      sellerCommission = landlord; // موجر (۵۰٪ تعرفه)
      break;
    }
    default:
      break;
  }

  const buyer = withVat(buyerCommission, vat);
  const seller = withVat(sellerCommission, vat);

  return {
    contractType: input.contractType,
    buyerCommission: buyer.commission,
    sellerCommission: seller.commission,
    buyerTax: buyer.tax,
    sellerTax: seller.tax,
    buyerPayable: buyer.payable,
    sellerPayable: seller.payable,
    dealValue,
    vatPercent: vat,
  };
}

/**
 * اعتبارسنجی ورودی محاسبه — بازگرداندن خطای فارسی دقیق.
 * ورودی‌های الزامی هر نوع معامله طبق پیکربندی سامانه مالی.
 */
export function validateCommissionInput(
  contractType: string,
  values: { contractPrice?: number; contractDeposite?: number; contractRent?: number }
): string | null {
  if (!["mobayeName", "ejareName", "rentalRenewal"].includes(contractType)) {
    return "نوع معامله انتخاب‌شده معتبر نیست.";
  }
  if (contractType === "mobayeName") {
    if (!values.contractPrice || values.contractPrice <= 0) return "ثمن معامله را وارد کنید.";
  } else {
    if (!values.contractDeposite && !values.contractRent) return "ودیعه و اجاره ماهانه را وارد کنید.";
    if (values.contractDeposite !== undefined && values.contractDeposite < 0) return "ودیعه نمی‌تواند منفی باشد.";
    if (values.contractRent !== undefined && values.contractRent < 0) return "اجاره ماهانه نمی‌تواند منفی باشد.";
  }
  return null;
}

/** برچسب فارسی انواع معامله — عین contractTypeFa سامانه مالی */
export const COMMISSION_TYPE_FA: Record<string, string> = {
  mobayeName: "مبایعه‌نامه (خرید و فروش)",
  ejareName: "اجاره‌نامه",
  rentalRenewal: "تمدید اجاره",
};
