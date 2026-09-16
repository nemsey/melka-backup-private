/**
 * PrismaMarketRepository — پیاده‌سازی Prisma قرارداد MarketRepository
 * ------------------------------------------------------
 * ⚠️ هر متد عین کوئری فعلی مصرف‌کننده‌اش نگاشت شده — selectها، ترتیب‌ها
 * و whereها بدون تغییر معنایی تا خروجی JSON بایت‌به‌بایت یکسان بماند.
 */
import type { Prisma } from "@prisma/client";
import type {
  AdPriceSampleProjection,
  AdScoreProjection,
  AdWindowOptions,
  AdWindowRow,
  BucketCount,
  DivarAdDTO,
  DivarScanLogDTO,
  DivarSettingDTO,
  MarketRepository,
  MarketStatDTO,
  RefListCacheDTO,
  SupplyDemandDTO,
  SupplyDemandUpsertInput,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaMarketRepository implements MarketRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  // ---------- عرضه و تقاضا ----------

  async listSupplyDemand(): Promise<SupplyDemandDTO[]> {
    return this.client.supplyDemandRecord.findMany();
  }

  async listSupplyDemandOrderByPropertyCountDesc(): Promise<SupplyDemandDTO[]> {
    return this.client.supplyDemandRecord.findMany({ orderBy: { propertyCount: "desc" } });
  }

  async countSupplyDemand(): Promise<number> {
    return this.client.supplyDemandRecord.count();
  }

  async replaceSupplyDemand(rows: SupplyDemandUpsertInput[]): Promise<number> {
    await this.client.$transaction([
      this.client.supplyDemandRecord.deleteMany({}),
      ...rows.map((s) =>
        this.client.supplyDemandRecord.create({
          data: {
            id: s.id,
            rangeTitle: s.rangeTitle,
            propertyCount: s.propertyCount,
            requestPercent: s.requestPercent,
            status: s.status,
          },
        })
      ),
    ]);
    return rows.length;
  }

  async upsertSupplyDemandBatch(rows: SupplyDemandUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const s of rows) {
      const existing = await this.client.supplyDemandRecord.findUnique({ where: { id: s.id }, select: { id: true } });
      await this.client.supplyDemandRecord.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          rangeTitle: s.rangeTitle,
          propertyCount: s.propertyCount,
          requestPercent: s.requestPercent,
          status: s.status,
        },
        update: {
          rangeTitle: s.rangeTitle,
          propertyCount: s.propertyCount,
          requestPercent: s.requestPercent,
          status: s.status,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAllSupplyDemand(): Promise<void> {
    await this.client.supplyDemandRecord.deleteMany({});
  }

  // ---------- آگهی‌های دیوار ----------

  /** عین select ایجنت فایل‌یابی */
  private static readonly AD_SCORE_SELECT = {
    bucket: true,
    personalScore: true,
    totalScore: true,
    underpriceScore: true,
    otherScore: true,
    locationScore: true,
    matchedLineName: true,
    matchedAreaName: true,
    category: true,
    publishedAt: true,
    pricePerMeter: true,
    publisherType: true,
    publisherName: true,
  } as const;

  async listActiveAdScores(take: number): Promise<AdScoreProjection[]> {
    return this.client.divarAd.findMany({
      where: { status: "active" },
      select: PrismaMarketRepository.AD_SCORE_SELECT,
      take,
    });
  }

  async listAdsWithPrice(): Promise<DivarAdDTO[]> {
    return this.client.divarAd.findMany({
      where: { status: { in: ["active", "registered"] }, pricePerMeter: { gt: 0 } },
    });
  }

  async listAdPrices(take: number): Promise<Array<{ price: number | null }>> {
    return this.client.divarAd.findMany({
      where: { price: { gt: 0 } },
      select: { price: true },
      take,
    });
  }

  async listPriceSamples(category?: string): Promise<AdPriceSampleProjection[]> {
    return this.client.divarAd.findMany({
      where: {
        status: { in: ["active", "registered"] },
        pricePerMeter: { gt: 0 },
        ...(category ? { category } : {}),
      },
      select: {
        token: true,
        title: true,
        category: true,
        pricePerMeter: true,
        matchedLineName: true,
        matchedAreaName: true,
        totalScore: true,
        publisherType: true,
      },
    });
  }

  async listAdsWithBucketCounts(options: AdWindowOptions): Promise<{ rows: AdWindowRow[]; bucketCounts: BucketCount }> {
    const { filter, limit, offset } = options;

    // عین منطق where روت divar/ads
    const whereBase: Prisma.DivarAdWhereInput = { status: "active" };
    if (filter.allowedLineIds) whereBase.matchedLineId = { in: filter.allowedLineIds };

    const where: Prisma.DivarAdWhereInput = { ...whereBase };
    if (filter.bucket && filter.bucket !== "all") where.bucket = filter.bucket;
    if (filter.category) where.category = filter.category;
    if (filter.lineId) where.matchedLineId = filter.lineId;

    const [rows, counts] = await Promise.all([
      this.client.divarAd.findMany({
        where,
        orderBy: { totalScore: "desc" },
        take: limit,
        skip: offset,
        select: {
          token: true, category: true, title: true, price: true, priceText: true, pricePerMeter: true,
          meterage: true, rooms: true, floor: true, buildYear: true, publishedAt: true, bumpedAt: true,
          locationText: true, matchedAreaName: true, matchedLineName: true,
          personalScore: true, underpriceScore: true, otherScore: true, locationScore: true, totalScore: true, bucket: true,
          publisherType: true, publisherName: true,
          imagesJson: true,
        },
      }),
      this.client.divarAd.groupBy({ by: ["bucket"], where: whereBase, _count: { _all: true } }),
    ]);

    const bucketCounts: BucketCount = { hunt: 0, follow: 0, review: 0 };
    for (const g of counts) {
      if (g.bucket in bucketCounts) bucketCounts[g.bucket as keyof BucketCount] = g._count._all;
    }

    return { rows, bucketCounts };
  }

  async findAdByToken(token: string): Promise<DivarAdDTO | null> {
    return this.client.divarAd.findUnique({ where: { token } });
  }

  async setAdStatus(token: string, status: string): Promise<void> {
    await this.client.divarAd.update({
      where: { token },
      data: { status },
    });
  }

  async deleteAdByToken(token: string): Promise<void> {
    await this.client.divarAd.delete({ where: { token } });
  }

  // ---------- آمار قیمت بازار ----------

  async listMarketPriceStats(take: number): Promise<MarketStatDTO[]> {
    return this.client.marketPriceStat.findMany({ take });
  }

  // ---------- گزارش اسکن ----------

  async listRecentScanLogs(take: number): Promise<DivarScanLogDTO[]> {
    return this.client.divarScanLog.findMany({ orderBy: { startedAt: "desc" }, take });
  }

  // ---------- تنظیمات فایل‌یابی ----------

  async getDivarSettings(): Promise<DivarSettingDTO | null> {
    return this.client.divarSetting.findUnique({ where: { id: "singleton" } });
  }

  // ---------- کش فهرست‌های مرجع ----------

  async listRefListsByKeys(keys: string[]): Promise<RefListCacheDTO[]> {
    return this.client.refListCache.findMany({
      where: { key: { in: keys } },
    });
  }

  async findRefList(key: string): Promise<RefListCacheDTO | null> {
    return this.client.refListCache.findUnique({ where: { key } });
  }
}
