/**
 * PrismaPredictionRepository — پیاده‌سازی Prisma قرارداد PredictionRepository
 * ------------------------------------------------------
 * امروز: PriceIndexHistory (سری زمانی شاخص قیمت — مبنای روند/جهش).
 * PHASE 3+: جدول‌های پیش‌بینی واقعی به همین قرارداد متصل می‌شوند.
 */
import type { PriceHistoryInput, PriceIndexHistoryDTO, PredictionRepository } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaPredictionRepository implements PredictionRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async listRecentHistory(take: number): Promise<PriceIndexHistoryDTO[]> {
    return this.client.priceIndexHistory.findMany({ orderBy: { recordedAt: "desc" }, take });
  }

  async listHistorySince(since: Date): Promise<PriceIndexHistoryDTO[]> {
    return this.client.priceIndexHistory.findMany({
      where: { recordedAt: { gte: since } },
    });
  }

  async createHistoryEntry(input: PriceHistoryInput): Promise<PriceIndexHistoryDTO> {
    return this.client.priceIndexHistory.create({
      data: {
        areaName: input.areaName,
        category: input.category,
        medianPerMeter: input.medianPerMeter,
        p25PerMeter: input.p25PerMeter,
        p75PerMeter: input.p75PerMeter,
        minPerMeter: input.minPerMeter,
        maxPerMeter: input.maxPerMeter,
        sampleCount: input.sampleCount,
      },
    });
  }
}
