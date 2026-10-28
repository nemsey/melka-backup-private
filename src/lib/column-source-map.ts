/**
 * column-source-map.ts — PN-051 · فرمان ۲ — ماتریس کشف Endpoint و Fallback
 * ---------------------------------------------------------------------------
 * «برای هر ستون کسب‌وکاری، بهترین منبع داده کدام است؟» — پاسخ ساختاری همین‌جاست.
 * هر ستون: { primary, fallback, lane }:
 *   · primary   — نخستین منبعِ امتحان‌شده در هر Job
 *   · fallback  — اگر primary نال بود، این منبع امتحان می‌شود
 *   · lane      — 'critical' (P0 · فاز A سریع) | 'standard' (P1 · فاز B)
 *                 | 'deep' (P2 · غنی‌سازی فاز B)
 *
 * نام منابع (SourceLane):
 *   arm_list      — ردیف خود فهرست ARM (properties/list · requests/list · trade-overviews/list)
 *   arm_details   — ARM properties/details/{id} · requests/details/{id}
 *   arm_owner     — ARM properties/owner/{id} · requests/applicant/{id}
 *   crm_private   — نمای خصوصی CRM ملکتون (myFilings — ویرایش مستقیم کارشناس؛ برندهٔ قانون ۰۵)
 *   crm_public    — نمای عمومی CRM ملکتون (filings)
 *   public_site   — melketabriz.com صفحات عمومی آگهی
 *   title_nlp     — استخراج از عنوان (parse عنوان)
 *   tx_overview   — ردیف trade-overviews/list (خود فهرست معاملات)
 *   tx_info       — trade-overviews/info/{id} (غنی‌سازی کامل معامله)
 *
 * قوانین حاکم:
 *   · Law 05 — به‌روزرسانی متخصص (crm_private) همیشه برنده است (merge.ts قاعدهٔ ب)
 *   · Law 04 — null هرگز روی مقدار پر نمی‌نشیند (kernel · CASE WHEN … ELSE keep)
 *   · Law 03 — هر مصرف این ماتریس در گزارش endpoint-selection-report.md مستند است
 *
 * استخراد مصرف: endpointSelectionReport() خروجی markdown برای
 * download/PN-051/endpoint-selection-report.md می‌سازد (فرمان ۲ · بند ۳).
 */

/** آدرس‌های منبع داده — هویت‌های پایدار (هرگز رشتهٔ آزاد) */
export type SourceLane =
  | "arm_list"
  | "arm_details"
  | "arm_owner"
  | "crm_private"
  | "crm_public"
  | "public_site"
  | "title_nlp"
  | "tx_overview"
  | "tx_info";

/** لایهٔ اولویت — تعیین‌کنندهٔ فاز (A سریع / B عمیق) */
export type PriorityLane = "critical" | "standard" | "deep";

export interface ColumnSourceRule {
  /** ستون کسب‌وکاری (نام منطقی — نه نام ستون فیزیکی) */
  column: string;
  /** ستون‌های فیزیکی متأثر در دیتابیس (برای ممیزی و trace) */
  dbColumns: readonly string[];
  /** بهترین منبع — اولین امتحان */
  primary: SourceLane;
  /** اگر primary نال بود */
  fallback: SourceLane | null;
  /** P0=critical (فاز A) · P1=standard (فاز B) · P2=deep (فاز B) */
  lane: PriorityLane;
  /** یادداشت کشف (چرا این منبع؟) */
  note?: string;
}

/** آدرس‌های فیزیکی Endpoint برای هر SourceLane (Law 03 — مستندسازی Endpointها) */
export const SOURCE_ENDPOINTS: Record<SourceLane, string> = {
  arm_list: "ARM: properties/list · requests/list · trade-overviews/list (صفحه‌بندی؛ خودِ فهرست — صفر هزینهٔ اضافه)",
  arm_details: "ARM: properties/details/{id} · requests/details/{id} (آدرس دقیق + مشخصات)",
  arm_owner: "ARM: properties/owner/{id} · requests/applicant/{id} (نام/موبایل مالک یا متقاضی)",
  crm_private: "Melketun CRM: myFilings funnel (نمای خصوصی کارشناس — ویرایش مستقیم؛ Law 05 برنده)",
  crm_public: "Melketun CRM: filings module (نمای عمومی آگهی‌ها)",
  public_site: "melketabriz.com/apu — صفحات عمومی ملک تبریز (پوشش کدهای غایب از فهرست ARM)",
  title_nlp: "پارس عنوان آگهی (بدون فراخوانی شبکه — استخراج محلی)",
  tx_overview: "ARM: trade-overviews/list (ردیف فهرست صورت‌وضعیت — طرفین پایه)",
  tx_info: "ARM: trade-overviews/info/{id} (نوع/مبلغ/خریدار/فروشنده/مشاوران/وضعیت — ۱۰۰٪ ستون‌ها)",
};

/** جدول مالک: آگهی‌ها (M1 ملک‌تبریز · M7 ملکتون) — per فرمان ۲ */
export const PROPERTY_COLUMNS: readonly ColumnSourceRule[] = [
  {
    column: "owner",
    dbColumns: ["ownerName", "ownerMobile", "rawOwnerName", "rawOwnerMobile"],
    primary: "arm_owner",
    fallback: "public_site",
    lane: "critical",
    note: "مالک = ستون حیاتی فاز A؛ properties/owner/{id} منبع قطعی، صفحات عمومی پشتیبان کدهای غنی‌سازی‌نشده",
  },
  {
    column: "address",
    dbColumns: ["address", "areaName", "lineName", "cityName", "stateName"],
    primary: "arm_details",
    fallback: "arm_list",
    lane: "critical",
    note: "address دقیق از details؛ ترکیب موقعیت از خود ردیف فهرست (composeLocationAddress) همیشه موجود",
  },
  {
    column: "customer",
    dbColumns: ["customerName", "customerMobile"],
    primary: "crm_private",
    fallback: "title_nlp",
    lane: "critical",
    note: "مشتری/متقاضی آگهی — نمای خصوصی CRM قطعی‌ترین؛ در غیابش از عنوان (Law 05: متخصص برنده)",
  },
  {
    column: "ownerCode",
    dbColumns: ["ownerCode", "ownerName"],
    primary: "arm_list",
    fallback: "crm_private",
    lane: "critical",
    note: "کارشناس مسؤول (relatedRealtor→personnelCode) — همیشه در خود ردیف فهرست",
  },
  {
    column: "price",
    dbColumns: ["price", "rawPrice", "rawPriceUnit", "pricePerMeter"],
    primary: "arm_list",
    fallback: "arm_details",
    lane: "standard",
    note: "مبلغ پایه از فهرست؛ details فقط در نبودش (ناهمگونی واحدها → rawPrice لایهٔ ۱)",
  },
  {
    column: "metadata",
    dbColumns: ["meterage", "rooms", "floor", "buildYear", "depositPrice", "rentPrice"],
    primary: "arm_list",
    fallback: "arm_details",
    lane: "standard",
  },
  {
    column: "propertyType",
    dbColumns: ["propertyTypeId", "propertyTypeName", "tradeTypeId", "tradeTypeName"],
    primary: "arm_list",
    fallback: "arm_details",
    lane: "standard",
    note: "typeMaps رجیستری مرجع (P6547) نگاشت شناسه→نام",
  },
  {
    column: "images",
    dbColumns: ["imageCount", "publicUrl"],
    primary: "arm_list",
    fallback: "public_site",
    lane: "deep",
  },
  {
    column: "ownerNote",
    dbColumns: ["ownerNote"],
    primary: "crm_private",
    fallback: null,
    lane: "deep",
    note: "قانون دادهٔ مقدس: فقط PATCH مالک می‌نویسد؛ سینک هرگز (PN-039 گام ۴)",
  },
];

/** جدول درخواست‌ها (M2 ملک‌تبریز · M8 ملکتون) */
export const REQUEST_COLUMNS: readonly ColumnSourceRule[] = [
  {
    column: "customer",
    dbColumns: ["customerName", "customerMobile"],
    primary: "arm_owner",
    fallback: "crm_private",
    lane: "critical",
    note: "درخواست‌دهنده: requests/applicant/{id} قطعی؛ نمای خصوصی CRM پشتیبان (Law 05)",
  },
  {
    column: "ownerCode",
    dbColumns: ["ownerCode"],
    primary: "arm_list",
    fallback: "crm_private",
    lane: "critical",
  },
  {
    column: "areas",
    dbColumns: ["areasJson"],
    primary: "arm_details",
    fallback: "arm_list",
    lane: "standard",
    note: "منطقه‌های منتخب — M2 ستون منطقه (P6521)",
  },
  {
    column: "priceRange",
    dbColumns: ["priceFrom", "priceTo"],
    primary: "arm_list",
    fallback: "arm_details",
    lane: "standard",
    note: "extractRequestPriceRange از inputs خود ردیف",
  },
];

/** جدول معاملات (M9) — فرمان ۶: ۱۰۰٪ ستون‌ها */
export const TRANSACTION_COLUMNS: readonly ColumnSourceRule[] = [
  {
    column: "parties",
    dbColumns: ["propertyCustomer", "requestCustomer", "buyerName", "sellerName", "buyerMobile", "sellerMobile"],
    primary: "tx_info",
    fallback: "tx_overview",
    lane: "critical",
    note: "طرفین معامله — info/{id} فهرست‌های خریدار/فروشنده کامل؛ ردیف فهرست فقط نام پایه",
  },
  {
    column: "amount",
    dbColumns: ["contractPrice", "rawContractPrice"],
    primary: "tx_info",
    fallback: null,
    lane: "critical",
    note: "مبلغ قرارداد (contractPrice) — فقط از info (فرمان ۶ ستون مبلغ)",
  },
  {
    column: "date",
    dbColumns: ["contractDate", "documentDate", "deliveryDate", "rawDate"],
    primary: "tx_overview",
    fallback: "tx_info",
    lane: "critical",
    note: "تاریخ سند از ردیف فهرست؛ documentDate/deliveryDate تکمیلی از info",
  },
  {
    column: "expert",
    dbColumns: ["ownerCode", "realtorSharesJson"],
    primary: "tx_info",
    fallback: "tx_overview",
    lane: "critical",
    note: "کارشناس و حق‌السهم مشاوران (realtorShares) — فرمان ۶ ستون کارشناس",
  },
  {
    column: "status",
    dbColumns: ["status", "contractType"],
    primary: "tx_info",
    fallback: "tx_overview",
    lane: "standard",
    note: "وضعیت صورت‌وضعیت + نوع قرارداد (مبایعه‌نامه/اجاره‌نامه/تمدید) — فرمان ۶ ستون وضعیت",
  },
  {
    column: "propertyRef",
    dbColumns: ["propertyCode", "propertyTitle", "propertyAddress"],
    primary: "tx_overview",
    fallback: "tx_info",
    lane: "standard",
  },
];

/** نقشهٔ کامل برای پرس‌وجوهای برنامه‌ای */
export const COLUMN_SOURCE_MAP: Readonly<
  Record<"property" | "request" | "transaction", readonly ColumnSourceRule[]>
> = {
  property: PROPERTY_COLUMNS,
  request: REQUEST_COLUMNS,
  transaction: TRANSACTION_COLUMNS,
};

/** منبعِ برنده برای یک ستون — قرارداد «ابتدا primary، در نالی fallback» (فرمان ۲ بند ۲) */
export function resolveSource(entity: keyof typeof COLUMN_SOURCE_MAP, column: string): ColumnSourceRule | null {
  const rule = COLUMN_SOURCE_MAP[entity].find((r) => r.column === column);
  return rule ?? null;
}

/** ستون‌های یک لایهٔ اولویت (برای تفکیک فاز A/B در ماژول‌های فهرست) */
export function columnsForLane(
  entity: keyof typeof COLUMN_SOURCE_MAP,
  lane: PriorityLane
): readonly ColumnSourceRule[] {
  return COLUMN_SOURCE_MAP[entity].filter((r) => r.lane === lane);
}

/** گزارش Markdown انتخاب منبع — خروجی به download/PN-051/endpoint-selection-report.md (فرمان ۲ بند ۳) */
export function endpointSelectionReport(generatedAt = new Date()): string {
  const section = (title: string, entity: keyof typeof COLUMN_SOURCE_MAP) => {
    const rows = COLUMN_SOURCE_MAP[entity]
      .map(
        (r) =>
          `| ${r.column} | \`${r.dbColumns.slice(0, 3).join("`, `")}${r.dbColumns.length > 3 ? "`, …" : ""}\` | **${r.primary}** | ${r.fallback ?? "—"} | ${r.lane} |`
      )
      .join("\n");
    return `### ${title}\n\n| ستون | ستون‌های DB | primary | fallback | لایه |\n|---|---|---|---|---|\n${rows}\n`;
  };
  const laneDesc = (l: PriorityLane) =>
    l === "critical" ? "P0 · فاز A (Fast-Pass ≤۱ دقیقه)" : l === "standard" ? "P1 · فاز B (Deep-Pass)" : "P2 · فاز B عمیق";

  return `# گزارش انتخاب منبع داده برای هر ستون (PN-051 · فرمان ۲)
تولید: ${generatedAt.toISOString()}

## قرارداد انتخاب منبع
هر Job ابتدا **primary** را امتحان می‌کند؛ اگر مقدار نال/خالی بود، سراغ **fallback** می‌رود.
قانون ۰۵ (دادهٔ مقدس): به‌روزرسانی متخصص (\`crm_private\`) همیشه برنده است — اجرای قانون در \`src/lib/merge.ts\` (قاعدهٔ ب).
قانون ۰۴: null هرگز روی مقدار پر نمی‌نشیند — محافظ درگاه SQL در \`src/sync/lists/kernel.ts\`.

## لایه‌های اولویت
- **critical (P0)** → فاز A «Fast-Pass»: ستون‌های حیاتی (مالک · آدرس · متقاضی) — هدف ≤۱ دقیقه
- **standard (P1)** → فاز B «Deep-Pass»: متادیتا · قیمت · نوع
- **deep (P2)** → فاز B: تصاویر · جزئیات کامل

${section("آگهی‌ها (PropertyRecord — M1 ملک‌تبریز · M7 ملکتون)", "property")}
${section("درخواست‌ها (RequestRecord — M2 · M8)", "request")}
${section("معاملات (TransactionRecord + TransactionEnrichment — M9)", "transaction")}

## آدرس فیزیکی Endpointها (Law 03)
${Object.entries(SOURCE_ENDPOINTS)
  .map(([k, v]) => `- \`${k}\` → ${v}`)
  .join("\n")}

## مصرف‌کننده‌ها
- \`src/sync/lists/arm-listings.ts\` (M1) · \`arm-requests.ts\` (M2) · \`transactions.ts\` (M9) — مسیر ARM
- \`src/sync/lists/melketun-listings.ts\` (M7) · \`melketun-requests.ts\` (M8) — مسیر CRM ملکتون
- هستهٔ اجرا: \`src/sync/lists/kernel.ts\` (bulk upsert · همزمانی ۳ · تأخیر تطبیقی · delta)
`;
}
