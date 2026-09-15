/**
 * کمکی‌های مشترک مسیرهای API کاشی آگهی
 */

import type { ListingRecord } from "@prisma/client";
import { toListingRow, priceEvaluationLabel, seriousnessLabel, desirabilityLabel, sellReasonLabel } from "./types";

/** ردیف UI امن — هرگز throw نمی‌کند */
export function toListingRowSafe(rec: ListingRecord): ReturnType<typeof toListingRow> {
  return toListingRow(rec);
}

/** برچسب‌های فارسی گام ۵ برای پیش‌نمایش انتقال */
export function stepFiveLabels(rec: ListingRecord): {
  priceEvaluation: string;
  desirabilityLevel: string;
  userSeriousness: string;
  sellReason: string;
} {
  return {
    priceEvaluation: priceEvaluationLabel(rec.priceEvaluation),
    desirabilityLevel: desirabilityLabel(rec.desirabilityLevel),
    userSeriousness: seriousnessLabel(rec.userSeriousness),
    sellReason: sellReasonLabel(rec.sellReason),
  };
}

export { listingReadiness } from "./store";
