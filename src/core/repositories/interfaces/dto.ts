/**
 * DTOهای مستقل لایه Repository — PHASE 2 (P2-01)
 * ------------------------------------------------------
 * قرارداد ساختاری داده بین ایجنت‌ها/روت‌ها و لایه دسترسی داده.
 *
 * اصول:
 *  ۱) صفر وابستگی به Prisma — این فایل هیچ importی از @prisma/client یا @/lib/db ندارد.
 *  ۲) آینه ساختاری دقیق ردیف‌های دیتابیس (عین ترتیب فیلدهای schema) —
 *     بنابراین خروجی JSON روت‌ها بایت‌به‌بایت با قبل یکسان می‌ماند
 *     (نگاشت Prisma→DTO در لایه پیاده‌سازی، بدون تغییر کلید/ترتیب).
 *  ۳) Dateها به‌صورت Date می‌مانند (serialization عین قبل توسط Response.json).
 */

// ===================== معاملات (گزارش تطابق) =====================

/** ردیف TransactionRecord — گزارش تطابق معاملات سامانه ARM */
export interface TransactionDTO {
  id: string;
  contractDate: Date;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳) — انتساب Scope؛ تجمیعی در ماتریس فعلی */
  ownerCode: string | null;
  branchId: string | null;
  /** P6.5-02 (§۱۴) — آماده‌سازی چند-مستأجری */
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ورودی جایگزینی/درج دسته‌ای معاملات (برای همگام‌سازی) */
export interface TransactionUpsertInput {
  id: string;
  contractDate: Date;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
  /** P6.5-04-e-v2 — سه‌لایه حقیقت: لایه ۱ خام + provenance (خط لوله Bulk پر می‌کند؛ مسیرهای v1 تهی می‌گذارند — merge non-null حفظ می‌کند) */
  rawDate?: string | null;
  rawSourceVersion?: string | null;
  extractedAt?: Date | null;
  extractionBatchId?: string | null;
  normalizationVersion?: string | null;
}

// ===================== قراردادها (صورت وضعیت) =====================

/** ردیف ContractRecord — صورت وضعیت‌های سامانه ARM */
export interface ContractDTO {
  id: string;
  status: string;
  contractHolo: string | null;
  propertyCode: string | null;
  requestCode: string | null;
  contractType: string | null;
  creatorName: string | null;
  createdAt: Date | null;
  contractDate: Date | null;
  documentDate: Date | null;
  deliveryDate: Date | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  buyerListJson: string | null;
  sellerListJson: string | null;
  realtorListJson: string | null;
  canAddRealtor: boolean;
  syncedAt: Date;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

// ===================== کارشناسان و تعاملات =====================

/** ردیف ExpertRecord — فهرست کاربران/مشاوران سامانه ARM */
export interface ExpertDTO {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  role: string;
  businessTitle: string;
  creator: string | null;
  active: boolean;
  createdAt: Date;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت */
  sourceRunId: string | null;
}

/** ردیف InteractionRecord — تعاملات مشاوران با یکدیگر */
export interface InteractionDTO {
  id: string;
  requestRealtorName: string;
  propertyRealtorName: string;
  count: number;
  syncedAt: Date;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت */
  sourceRunId: string | null;
}

// ===================== بازدیدها =====================

/** ردیف VisitRecord — بازدیدها و پیگیری‌ها */
export interface VisitDTO {
  id: string;
  propertyCode: string;
  requesterName: string;
  checkerName: string;
  propertyRealtorName: string;
  checkTime: Date | null;
  createdAt: Date;
  status: string;
  syncedAt: Date;
  /** P6.5-02 (§۵.۳) — انتساب Scope از checker؛ fail-closed روی تهی */
  ownerCode: string | null;
  branchId: string | null;
  /** P6.5-02 (§۱۴) — آماده‌سازی چند-مستأجری */
  tenantId: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

// ===================== عرضه و تقاضا =====================

/** ردیف SupplyDemandRecord — گزارش عرضه و تقاضا */
export interface SupplyDemandDTO {
  id: string;
  rangeTitle: string;
  propertyCount: number;
  requestPercent: number;
  status: string;
  syncedAt: Date;
}

// ===================== بازار / دیوار =====================

/** ردیف DivarAd — آگهی دیوار (فایل) */
export interface DivarAdDTO {
  token: string;
  category: string;
  title: string;
  description: string | null;
  priceText: string | null;
  price: number | null;
  pricePerMeter: number | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  publishedAt: Date | null;
  bumpedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  matchedAreaId: string | null;
  matchedAreaName: string | null;
  matchedLineId: string | null;
  matchedLineName: string | null;
  personalScore: number;
  underpriceScore: number;
  locationScore: number;
  otherScore: number;
  totalScore: number;
  bucket: string;
  status: string;
  analysisJson: string | null;
  imagesJson: string | null;
  specsJson: string | null;
  changeKey: string | null;
  publisherType: string | null;
  publisherName: string | null;
  publisherAdCount: number | null;
  publisherBrandUrl: string | null;
}

/** پیش‌نمایش امتیاز آگهی فعال — عین select ایجنت فایل‌یابی */
export interface AdScoreProjection {
  bucket: string;
  personalScore: number;
  totalScore: number;
  underpriceScore: number;
  otherScore: number;
  locationScore: number;
  matchedLineName: string | null;
  matchedAreaName: string | null;
  category: string;
  publishedAt: Date | null;
  pricePerMeter: number | null;
  publisherType: string | null;
  publisherName: string | null;
}

/** نمونه قیمت بازار — عین select مسیر شاخص قیمت */
export interface AdPriceSampleProjection {
  token: string;
  title: string;
  category: string;
  pricePerMeter: number | null;
  matchedLineName: string | null;
  matchedAreaName: string | null;
  totalScore: number;
  publisherType: string | null;
}

/** ردیف MarketPriceStat — آمار قیمت بازار برای فیلتر زیرقیمت */
export interface MarketStatDTO {
  id: string;
  scopeKey: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  sampleCount: number;
  armPerMeter: number | null;
  updatedAt: Date;
}

/** ردیف DivarScanLog — گزارش اجرای اسکن دیوار */
export interface DivarScanLogDTO {
  id: string;
  startedAt: Date;
  durationMs: number;
  scanned: number;
  fetched: number;
  inWindow: number;
  outOfArea: number;
  autoRejected: number;
  newAds: number;
  updatedAds: number;
  source: string;
  error: string | null;
}

/** ردیف DivarSetting — تنظیمات ایجنت فایل‌یابی (singleton) */
export interface DivarSettingDTO {
  id: string;
  dataJson: string;
  locFilterInit: boolean;
  updatedAt: Date;
}

/** ردیف RefListCache — کش فهرست‌های مرجع عمومی سامانه ARM */
export interface RefListCacheDTO {
  key: string;
  dataJson: string;
  fetchedAt: Date;
}

/** شمارنده دسته‌بندی آگهی‌ها (خروجی groupBy فایل‌یابی) */
export interface BucketCount {
  hunt: number;
  follow: number;
  review: number;
}

// ===================== درخواست‌ها (مدیریت مشتریان) =====================

/** ردیف RequestRecord — فرم ۴ گامی ثبت درخواست سامانه ARM */
export interface RequestRecordDTO {
  id: string;
  source: string;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIdsJson: string | null;
  areaNamesJson: string | null;
  lineIdsJson: string | null;
  lineNamesJson: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  inputsJson: string | null;
  customerDescription: string | null;
  userPaymentMethod: string | null;
  userPaymentMethodName: string | null;
  userSeriousity: string | null;
  userSeriousityName: string | null;
  realtorDescription: string | null;
  status: string;
  armRegistrationJson: string | null;
  armRegisteredAt: Date | null;
  armRequestId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 (§۱.۲) — کد درخواست ARM — کلید طبیعی رکوردهای Bulk (source='arm') */
  requestCode: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ردیف RequestEventRecord — رویدادهای درخواست */
export interface RequestEventDTO {
  id: string;
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  eventTypeFlagsJson: string | null;
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  armPropertyId: string | null;
  message: string | null;
  armSyncJson: string | null;
  armSyncedAt: Date | null;
  armEventId: string | null;
  actorCode: string;
  createdAt: Date;
}

/** درخواست به‌همراه رویدادهایش (عین include: { events }) */
export interface RequestRecordWithEventsDTO extends RequestRecordDTO {
  events: RequestEventDTO[];
}

// ===================== کاشی آگهی =====================

/** ردیف ListingRecord — فایل آگهی (فرم ۵ گامی) */
export interface ListingDTO {
  id: string;
  source: string;
  divarToken: string | null;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  areaId: string | null;
  areaName: string | null;
  lineId: string | null;
  lineName: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  changeWithJson: string | null;
  inputsJson: string | null;
  imagesJson: string | null;
  videosJson: string | null;
  documentsJson: string | null;
  priceEvaluation: string | null;
  desirabilityLevel: string | null;
  fileFinding: string | null;
  fileTypeJson: string | null;
  userSeriousness: string | null;
  sellReason: string | null;
  description: string | null;
  isLuxury: boolean;
  isVacation: boolean;
  isUrgent: boolean;
  notifyBySms: boolean;
  status: string;
  crmTransferJson: string | null;
  crmTransferredAt: Date | null;
  armPropertyId: string | null;
  instagramPostJson: string | null;
  instagramPublishedAt: Date | null;
  instagramMediaId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
}

/** ردیف InstagramPostLog — گزارش محتوای اینستاگرام */
export interface InstagramPostLogDTO {
  id: string;
  listingId: string;
  kind: string;
  caption: string;
  mediaJson: string;
  status: string;
  resultJson: string | null;
  publishedAt: Date | null;
  actorCode: string;
  createdAt: Date;
}

/** ردیف InstagramConnection — اتصال حساب اینستاگرام کسب‌وکار */
export interface InstagramConnectionDTO {
  id: string;
  status: string;
  igUserId: string | null;
  username: string | null;
  displayName: string | null;
  tokenEnc: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===================== لایه ایجنت — حافظه/بازخورد/سیاست =====================

/** ردیف AgentMemory — حافظه ساخت‌یافته هر کاشی (فقط افزودنی) */
export interface AgentMemoryDTO {
  id: string;
  tileId: string;
  kind: string;
  payload: string;
  createdAt: Date;
}

/** ردیف AgentFeedback — بازخورد کاربر روی بینش‌ها (فقط افزودنی) */
export interface AgentFeedbackDTO {
  id: string;
  tileId: string;
  insightKey: string;
  insightTitle: string;
  rating: number;
  comment: string | null;
  context: string;
  createdAt: Date;
}

/** ورودی ثبت بازخورد */
export interface AgentFeedbackInput {
  tileId: string;
  insightKey: string;
  insightTitle: string;
  rating: 1 | -1;
  comment: string | null;
  context: string;
}

/** ردیف AgentPolicyVersion — نسخه سیاست ایجنت (قابلیت Rollback) */
export interface AgentPolicyVersionDTO {
  id: string;
  tileId: string;
  version: number;
  content: string;
  rationale: string;
  active: boolean;
  createdAt: Date;
  activatedAt: Date | null;
}

/** ورودی ایجاد نسخه سیاست جدید */
export interface PolicyVersionInput {
  tileId: string;
  version: number;
  content: string;
  rationale: string;
  active: boolean;
  activatedAt: Date | null;
}

// ===================== شاخص قیمت — تاریخچه (منبع پیش‌بینی) =====================

/** ردیف PriceIndexHistory — تاریخچه شاخص قیمت هر منطقه (فقط افزودنی) */
export interface PriceIndexHistoryDTO {
  id: string;
  areaName: string;
  category: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  sampleCount: number;
  recordedAt: Date;
}

/** ورودی ثبت تاریخچه شاخص */
export interface PriceHistoryInput {
  areaName: string;
  category: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  sampleCount: number;
}

// ===================== گزارش‌های نتیجه اقدام (Outcome) =====================

/** ردیف LookupLog — استعلام زنده استخراج اطلاعات (فقط افزودنی) */
export interface LookupLogDTO {
  id: string;
  kind: string;
  code: string;
  found: boolean;
  personName: string | null;
  personMobile: string | null;
  address: string | null;
  actorCode: string;
  errorNote: string | null;
  createdAt: Date;
}

/** ورودی ثبت استعلام */
export interface LookupLogInput {
  kind: string;
  code: string;
  found: boolean;
  personName: string | null;
  personMobile: string | null;
  address: string | null;
  actorCode: string;
  errorNote: string | null;
}

/** ردیف DivarRejectLog — سیگنال یادگیری از رد آگهی (فقط افزودنی) */
export interface DivarRejectLogDTO {
  id: string;
  token: string;
  reasons: string;
  note: string | null;
  scoreSnapshotJson: string | null;
  featureSnapshotJson: string | null;
  actorCode: string;
  createdAt: Date;
}

/** ورودی ثبت سیگنال رد */
export interface DivarRejectInput {
  token: string;
  reasons: string;
  note: string | null;
  scoreSnapshotJson: string | null;
  featureSnapshotJson: string | null;
  actorCode: string;
}

/** ردیف CommissionCalcLog — گزارش محاسبات کمیسیون (فقط افزودنی) */
export interface CommissionCalcLogDTO {
  id: string;
  contractType: string;
  inputsJson: string;
  resultJson: string;
  dealValue: number;
  vatPercent: number;
  actorCode: string;
  createdAt: Date;
}

/** ورودی ثبت محاسبه کمیسیون */
export interface CommissionCalcInput {
  contractType: string;
  inputsJson: string;
  resultJson: string;
  dealValue: number;
  vatPercent: number;
  actorCode: string;
}

// ===================== اتصال PM =====================

/** ردیف PmConnection — اتصال حساب شخصی سامانه پرسنلی */
export interface PmConnectionDTO {
  id: string;
  status: string;
  personnelCode: string | null;
  displayName: string | null;
  tokenEnc: string | null;
  refreshTokenEnc: string | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** ورودی upsert اتصال PM */
export interface PmConnectionUpsertInput {
  status: string;
  personnelCode: string | null;
  displayName?: string | null;
  tokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  lastCheckedAt?: Date | null;
  lastError?: string | null;
}

// ===================== رجیستری‌های P6.5 (Data Readiness) =====================

/** ردیف PropertyRecord — کش آگهی‌های ARM (تاریخی + جاری)؛ قیمت = ریال (§۳.۵) */
export interface PropertyRecordDTO {
  id: string;
  propertyCode: string;
  title: string | null;
  status: string | null;
  ownerCode: string | null;
  ownerName: string | null;
  branchId: string | null;
  cityId: string | null;
  areaId: string | null;
  areaName: string | null;
  lineId: string | null;
  lineName: string | null;
  address: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  price: number | null;
  pricePerMeter: number | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  description: string | null;
  detailsJson: string | null;
  ownerMobile: string | null;
  tenantId: string | null;
  sourceRunId: string | null;
  syncedAt: Date;
  createdAt: Date | null;
  updatedAt: Date;
}

/** ردیف CustomerRecord — رجیستری مشتریان مشتق (خریدار/فروشنده/درخواست‌دهنده/مالک) */
export interface CustomerRecordDTO {
  id: string;
  mobile: string | null;
  personnelCode: string | null;
  fullName: string;
  rolesJson: string | null;
  sourceCountsJson: string | null;
  ownerCode: string | null;
  branchId: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  tenantId: string | null;
  sourceRunId: string | null;
  updatedAt: Date;
}

// ===================== درخواست‌های ملک (P2-03) =====================

/** ردیف RequestRecord — فرم ۵ گامی درخواست ملک */
export interface RequestRecordDTO {
  id: string;
  source: string;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIdsJson: string | null;
  areaNamesJson: string | null;
  lineIdsJson: string | null;
  lineNamesJson: string | null;
  tradeTypeId: string | null;
  tradeTypeName: string | null;
  buildingTypeId: string | null;
  buildingTypeName: string | null;
  propertyTypeId: string | null;
  propertyTypeName: string | null;
  inputsJson: string | null;
  customerDescription: string | null;
  userPaymentMethod: string | null;
  userPaymentMethodName: string | null;
  userSeriousity: string | null;
  userSeriousityName: string | null;
  realtorDescription: string | null;
  status: string;
  armRegistrationJson: string | null;
  armRegisteredAt: Date | null;
  armRequestId: string | null;
  actorCode: string;
  createdAt: Date;
  updatedAt: Date;
  /** P6.5-02 (§۵.۳/§۱۴) — انتساب Scope + آماده‌سازی چند-مستأجری */
  branchId: string | null;
  tenantId: string | null;
  /** P6.5-03 (§۱.۲) — کد درخواست ARM — کلید طبیعی رکوردهای Bulk (source='arm') */
  requestCode: string | null;
  /** P6.5-03 — آخرین اجرای Bulk که رکورد را نوشت (محافظت جاروی sync) */
  sourceRunId: string | null;
}

/** ردیف RequestEventRecord — رویداد درخواست (عین request-events سامانه) */
export interface RequestEventDTO {
  id: string;
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  eventTypeFlagsJson: string | null;
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  armPropertyId: string | null;
  message: string | null;
  armSyncJson: string | null;
  armSyncedAt: Date | null;
  armEventId: string | null;
  actorCode: string;
  createdAt: Date;
}

/** رکورد درخواست با رویدادهای نزولی (عین include قدیم روت events) */
export type RequestWithEventsDTO = RequestRecordDTO & { events: RequestEventDTO[] };

/** به‌روزرسانی نتیجه همگام‌سازی آرم روی رویداد (مسیر POST events) */
export interface RequestEventArmSyncInput {
  armEventId: string | null;
  armSyncedAt: Date | null;
  armPropertyId: string | null;
  armSyncJson: string;
}
