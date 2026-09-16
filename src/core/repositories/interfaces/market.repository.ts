/**
 * MarketRepository — قرارداد دسترسی به داده بازار و دیوار
 * ------------------------------------------------------
 * دامنه: عرضه/تقاضا، آگهی‌های دیوار، آمار قیمت بازار، گزارش اسکن،
 * تنظیمات فایل‌یابی و کش فهرست‌های مرجع عمومی.
 * مصرف‌کننده‌ها: ایجنت عرضه‌وتقاضا، ایجنت فایل‌یابی، ایجنت شاخص قیمت،
 * ایجنت باشگاه مشتریان، روت‌های crm/supply-demand، crm/price-index،
 * crm/customer-club و روت‌های divar/**.
 */
import type {
  AdPriceSampleProjection,
  AdScoreProjection,
  BucketCount,
  DivarAdDTO,
  DivarScanLogDTO,
  DivarSettingDTO,
  MarketStatDTO,
  RefListCacheDTO,
  SupplyDemandDTO,
} from "./dto";

/** فیلتر پنجره فایل‌یابی — عین پارامترهای روت divar/ads */
export interface AdWindowFilter {
  /** hunt | follow | review | all */
  bucket?: string;
  category?: string;
  /** محله خاص (تک مقدار) */
  lineId?: string;
  /** اجتماع محله‌های مجاز مناطق انتخابی (null = همه تبریز) */
  allowedLineIds?: string[] | null;
}

/** گزینه‌های فهرست آگهی‌های پنجره فایل‌یابی */
export interface AdWindowOptions {
  filter: AdWindowFilter;
  limit: number;
  offset: number;
}

/** ردیف فایل‌یابی برای کارت‌ها — عین select روت divar/ads */
export interface AdWindowRow {
  token: string;
  category: string;
  title: string;
  price: number | null;
  priceText: string | null;
  pricePerMeter: number | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  publishedAt: Date | null;
  bumpedAt: Date | null;
  locationText: string | null;
  matchedAreaName: string | null;
  matchedLineName: string | null;
  personalScore: number;
  underpriceScore: number;
  otherScore: number;
  locationScore: number;
  totalScore: number;
  bucket: string;
  publisherType: string | null;
  publisherName: string | null;
  imagesJson: string | null;
}

export interface MarketRepository {
  // ---------- عرضه و تقاضا ----------
  /** همه رکوردهای عرضه/تقاضا (تحلیل ایجنت — بدون ترتیب، عین findMany فعلی) */
  listSupplyDemand(): Promise<SupplyDemandDTO[]>;
  /** مرتب بر اساس تعداد آگهی نزولی (روت crm/supply-demand) */
  listSupplyDemandOrderByPropertyCountDesc(): Promise<SupplyDemandDTO[]>;
  /** شمارش کل */
  countSupplyDemand(): Promise<number>;
  /** جایگزینی کامل (حالت legacy) */
  replaceSupplyDemand(rows: SupplyDemandUpsertInput[]): Promise<number>;
  /** درج/به‌روزرسانی بر اساس id (افزایشی — P2-04) */
  upsertSupplyDemandBatch(rows: SupplyDemandUpsertInput[]): Promise<{ created: number; updated: number }>;
  /** پاک‌سازی کامل */
  deleteAllSupplyDemand(): Promise<void>;

  // ---------- آگهی‌های دیوار ----------
  /** پیش‌نمایش امتیاز آگهی‌های فعال (ایجنت فایل‌یابی — عین select فعلی) */
  listActiveAdScores(take: number): Promise<AdScoreProjection[]>;
  /** آگهی‌های دارای قیمت هر متر (ایجنت شاخص قیمت — رکورد کامل، بدون select) */
  listAdsWithPrice(): Promise<DivarAdDTO[]>;
  /** فقط قیمت آگهی‌ها برای برآورد میانگین بازار (ایجنت مالی — عین select فعلی) */
  listAdPrices(take: number): Promise<Array<{ price: number | null }>>;
  /** نمونه‌های قیمت بازار (روت crm/price-index — عین select فعلی) */
  listPriceSamples(category?: string): Promise<AdPriceSampleProjection[]>;
  /** فهرست پنجره فایل‌یابی + شمارنده دسته‌ها (روت divar/ads) */
  listAdsWithBucketCounts(options: AdWindowOptions): Promise<{ rows: AdWindowRow[]; bucketCounts: BucketCount }>;
  /** یک آگهی با توکن (جزئیات/رد/ثبت) */
  findAdByToken(token: string): Promise<DivarAdDTO | null>;
  /** تغییر وضعیت آگهی (ثبت → registered) */
  setAdStatus(token: string, status: string): Promise<void>;
  /** حذف کامل رکورد آگهی (رد — هرگز آرشیو نمی‌شود) */
  deleteAdByToken(token: string): Promise<void>;

  // ---------- آمار قیمت بازار ----------
  /** آمار قیمت بازار برای فیلتر زیرقیمت (ایجنت فایل‌یابی) */
  listMarketPriceStats(take: number): Promise<MarketStatDTO[]>;

  // ---------- گزارش اسکن ----------
  /** گزارش‌های اسکن اخیر (ایجنت فایل‌یابی + روت divar/scan) */
  listRecentScanLogs(take: number): Promise<DivarScanLogDTO[]>;

  // ---------- تنظیمات فایل‌یابی ----------
  /** تنظیمات singleton ایجنت فایل‌یابی */
  getDivarSettings(): Promise<DivarSettingDTO | null>;

  // ---------- کش فهرست‌های مرجع ----------
  /** فهرست‌های مرجع با کلیدهای مشخص (ایجنت باشگاه مشتریان) */
  listRefListsByKeys(keys: string[]): Promise<RefListCacheDTO[]>;
  /** یک رکورد کش با کلید */
  findRefList(key: string): Promise<RefListCacheDTO | null>;
}

/** ورودی درج عرضه/تقاضا (عین نگاشت toSdCreates) */
export interface SupplyDemandUpsertInput {
  id: string;
  rangeTitle: string;
  propertyCount: number;
  requestPercent: number;
  status: string;
}
