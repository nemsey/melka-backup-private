/**
 * P6545 / گام ۳ — BLOCK 3.3: چهار ایجنت اختصاصی کاشی‌های M1-M4
 * ---------------------------------------------------------------------------
 * تعریف رسمی (جلسه ۰۳۳): ایجنت = متخصص دامنه که مدل را فراخوانی می‌کند.
 *
 *  PropertyAgent (M1)     → مدل melka-property-v3
 *  RequestAgent (M2)      → مدل melka-request-v1
 *  TransactionAgent (M3)  → مدل melka-transaction-v2
 *  ExpertAgent (M4)       → مدل melka-expert-v1
 *
 * قواعد:
 *  · ارث‌بری از BaseIntelligentAgent (موتورهای تزریقی مشترک)
 *  · دسترسی به سه گراف (زمینهٔ غنی‌تر — GraphService)
 *  · انتشار رویداد روی Blackboard (prediction.created / outcome.recorded)
 *  · صفر منطق هوش داخلی — همهٔ هوش از مغز (همان ۱۱ موتور) می‌آید
 */

import type { PrismaClient } from "@prisma/client";
import { BaseIntelligentAgent, type BaseIntelligentAgentOptions } from "@/core/intelligence/base-intelligent-agent";
import { GraphService, type GraphName } from "@/core/graphs";
import { SharedFeatureStore } from "@/core/features/store";
import { bootstrapModels, modelRegistry, type ModelConfig } from "@/core/intelligence/models/registry";
import { emitEvent } from "@/lib/intelligence/blackboard";
import type { PropertyPredictionPayload } from "@/core/intelligence/prediction/prediction-record";
import type { InsightCard } from "@/core/agent/base-agent";

export interface DomainAgentOptions extends BaseIntelligentAgentOptions {
  db: PrismaClient;
  /** انبار ویژگی مشترک — یک‌بار استخراج، چندبار مصرف */
  featureStore?: SharedFeatureStore;
}

/** پایهٔ چهار ایجنت دامنه‌ای — قواعد مشترک (گراف + مدل + رویداد) */
export abstract class DomainIntelligentAgent extends BaseIntelligentAgent {
  protected readonly db: PrismaClient;
  protected readonly graphs: GraphService;
  protected readonly featureStore: SharedFeatureStore;
  readonly model: ModelConfig;

  constructor(model: ModelConfig, opts: DomainAgentOptions) {
    super({ agentId: `agent-${model.domain}-${model.modelId}`, engines: opts.engines, memory: opts.memory, policy: opts.policy });
    this.db = opts.db;
    this.graphs = new GraphService(opts.db);
    this.featureStore = opts.featureStore ?? new SharedFeatureStore({ noPersist: true });
    this.model = model;
  }

  /** زمینهٔ گرافیکی — مسیرهای همسایهٔ موجودیت در سه گراف (بدون منطق هوش) */
  async graphContext(graph: GraphName, nodeType: string, refId: string, maxDepth = 1) {
    return this.graphs.traverse(graph, { nodeType, refId }, { maxDepth, limit: 10 });
  }

  /** انتشار رویداد پیش‌بینی روی تختهٔ سیاه — شفافیت بین‌کاشی */
  protected async publishPrediction(entityId: string, probability: number | null): Promise<void> {
    try {
      await emitEvent("prediction.created", {
        agentId: this.intelligentAgentId,
        modelId: this.model.modelId,
        domain: this.model.domain,
        entityId,
        probability,
        outcomeType: this.model.outcomeType,
      });
    } catch {
      // تخته هرگز جریان ایجنت را نمی‌شکند
    }
  }

  /* اعضای انتزاعی BaseLearningAgent — بینش از موتورها، نه منطق داخلی */
  abstract readonly tileId: string;
  abstract readonly insightDomains: readonly string[];
  protected async computeRawInsights(): Promise<InsightCard[]> {
    // صفر منطق هوش داخلی — بینش‌ها از مسیر پیش‌بینی/ارزیابی مغز می‌آیند
    return [];
  }
}

/* ═══════════════ M1 — PropertyAgent ═══════════════ */

export class PropertyAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت تطبیق آگهی ملکا";
  readonly tileId = "arm-listings";
  readonly insightDomains = ["arm-listings"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-property-v3")!, opts);
  }

  /** پیش‌بینی فروش/اجاره شدن آگهی — همهٔ هوش از PredictionEngine مشترک */
  async predictDealProbability(propertyCode: string): Promise<{ probability: number | null; graphNeighbors: number }> {
    const listing = await this.db.propertyRecord.findFirst({ where: { propertyCode } });
    if (!listing) return { probability: null, graphNeighbors: 0 };
    // ویژگی‌ها از انبار مشترک (یک‌بار استخراج)
    const marketSamples = await this.db.propertyRecord.findMany({
      where: { areaId: listing.areaId, price: { not: null }, meterage: { not: null } },
      select: { price: true, meterage: true },
      take: 200,
    });
    const market = await this.featureStore.marketFeatures(listing.areaId ?? "unknown", {
      areaId: listing.areaId ?? "",
      snapshotDate: new Date(listing.syncedAt),
      samples: marketSamples.map((s) => ({ pricePerMeter: (s.price ?? 0) / 10 / Math.max(s.meterage ?? 1, 1), at: listing.syncedAt.toISOString() })),
    } as never);
    const property = await this.featureStore.propertyFeatures(propertyCode, {
      id: propertyCode,
      areaId: listing.areaId ?? "",
      areaName: listing.areaName ?? "",
      price: (listing.price ?? 0) / 10,
      pricePerMeter: (listing.pricePerMeter ?? 0) / 10,
      propertyType: listing.propertyTypeName ?? "نامشخص",
      tradeType: listing.tradeTypeName ?? "نامشخص",
      meterage: listing.meterage ?? 0,
      rooms: listing.rooms ?? 0,
    } as never, market as never);
    // پیش‌بینی — از مغز (PredictionEngine تزریقی)
    const record = await this.predict<never>("PROPERTY", propertyCode, { property, market });
    const probability = record ? (record as unknown as { payload?: PropertyPredictionPayload }).payload?.transactionProbability ?? null : null;
    await this.publishPrediction(propertyCode, probability);
    const neighbors = await this.graphContext("property", "property", propertyCode, 1);
    return { probability, graphNeighbors: neighbors.length };
  }
}

/* ═══════════════ M2 — RequestAgent ═══════════════ */

export class RequestAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت درخواست ملکا";
  readonly tileId = "arm-requests";
  readonly insightDomains = ["arm-requests"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-request-v1")!, opts);
  }

  /** پیش‌بینی برآورده شدن درخواست (رسیدن به معامله) — از PredictionEngine مشترک */
  async predictRequestFulfillment(requestId: string): Promise<{ probability: number | null }> {
    const request = await this.db.requestRecord.findFirst({ where: { id: requestId } });
    if (!request) return { probability: null };
    const customer = await this.featureStore.customerFeatures(requestId, {
      id: requestId,
      recencyDays: Math.max(0, Math.round((Date.now() - new Date(request.updatedAt).getTime()) / 86400000)),
      frequencyCount: 1,
      monetaryValue: request.priceTo ?? 0,
      responseRate: 0.5,
      seriousnessScore: 0.5,
      budgetCompatibility: 0.5,
    } as never);
    const record = await this.predict<never>("CUSTOMER", requestId, { customer });
    const probability = record ? (record as unknown as { probability?: number }).probability ?? null : null;
    await this.publishPrediction(requestId, probability);
    return { probability };
  }
}

/* ═══════════════ M3 — TransactionAgent ═══════════════ */

export class TransactionAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت معاملات ملکا";
  readonly tileId = "transactions-contracts";
  readonly insightDomains = ["transactions-contracts"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-transaction-v2")!, opts);
  }

  /**
   * معامله واقعیت است نه پیش‌بینی جلو (predictor=none — صادقانه)؛
   * کار ایجنت: زمینهٔ گرافی معامله (زنجیرهٔ ملک/طرف‌ها/کارشناس) برای بینش.
   */
  async transactionContext(txId: string): Promise<{
    ok: boolean;
    propertyCode: string | null;
    graphPaths: number;
    contractType: string | null;
    contractPriceMilionToman: number | null;
  }> {
    const tx = await this.db.transactionRecord.findFirst({ where: { id: txId } });
    if (!tx) return { ok: false, propertyCode: null, graphPaths: 0, contractType: null, contractPriceMilionToman: null };
    const enrich = await this.db.transactionEnrichment.findFirst({ where: { txId } });
    const paths = await this.graphContext("transaction", "transaction", txId, 1);
    await this.publishPrediction(txId, null); // رویداد زمینه — بدون ادعای عدد
    return {
      ok: true,
      propertyCode: tx.propertyCode,
      graphPaths: paths.length,
      contractType: enrich?.contractType ?? null,
      contractPriceMilionToman: enrich?.contractPrice ? Math.round((enrich.contractPrice / 10 / 1_000_000) * 10) / 10 : null,
    };
  }
}

/* ═══════════════ M4 — ExpertAgent ═══════════════ */

export class ExpertAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت کارشناسان ملکا";
  readonly tileId = "experts";
  readonly insightDomains = ["experts"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-expert-v1")!, opts);
  }

  /** پیش‌بینی موفقیت کارشناس در معامله بعدی — از PredictionEngine مشترک */
  async predictNextDealSuccess(personnelCode: string): Promise<{ probability: number | null }> {
    const expert = await this.db.expertRecord.findFirst({ where: { personnelCode } });
    if (!expert) return { probability: null };
    // سابقهٔ کارشناس از گراف معاملات (P6.5-04-i: صفر فیلتر دامنهٔ دست‌نویس)
    const dealCount = await this.db.graphEdge.count({ where: { graph: "transaction", edgeType: "brokered_by", toRef: personnelCode } });
    const expertFeatures = await this.featureStore.expertFeatures(personnelCode, {
      id: personnelCode,
      personnelCode,
      activeDaysLast30: 30,
      interactionsLast30: dealCount,
      responseRate: 0.5,
      conversionRate: Math.min(1, dealCount / 20),
    } as never);
    const record = await this.predict<never>("EXPERT", personnelCode, { expert: expertFeatures });
    const probability = record ? (record as unknown as { probability?: number }).probability ?? null : null;
    await this.publishPrediction(personnelCode, probability);
    return { probability };
  }
}

/* ═══════════════ P6546/گام پنجم-الف-۴ — شش ایجنت تازه (تجهیز شش کاشی به مغز) ═══════════════
 * قواعد عین چهار ایجنت اصلی: ارث BaseIntelligentAgent + همان ۱۱ موتور مشترک
 * (engineSet=SHARED-11) + گراف + رویداد تختهٔ سیاه + صفر منطق هوش داخلی. */

/** فایل‌یابی ملکا (دیوار) — کاشی هوم */
export class DivarIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت فایل‌یابی ملکا (دیوار)";
  readonly tileId = "file-finder";
  readonly insightDomains = ["file-finder"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-divar-v1")!, opts);
  }

  /** پیش‌بینی ارزش آگهی دیوار به‌عنوان فرصت (احتمال ثبت) — از مغز مشترک */
  async predictDivarOpportunity(token: string, priceToman: number | null): Promise<{ probability: number | null }> {
    const market = await this.featureStore.marketFeatures("tabriz", {
      areaId: "tabriz",
      snapshotDate: new Date(),
      samples: priceToman ? [{ pricePerMeter: priceToman, at: new Date().toISOString() }] : [],
    } as never);
    const record = await this.predict<never>("PROPERTY", token, { market });
    const probability = record ? (record as unknown as { probability?: number }).probability ?? null : null;
    await this.publishPrediction(token, probability);
    return { probability };
  }
}

/** آگهی ملکا (فرم داخلی ثبت آگهی) — کاشی هوم */
export class LocalListingIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت آگهی ملکا";
  readonly tileId = "listing";
  readonly insightDomains = ["listing"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-local-listing-v1")!, opts);
  }

  /** زمینهٔ گرافی آگهی داخلی + رویداد شفافیت (بدون ادعای عدد) */
  async listingContext(listingId: string): Promise<{ graphNeighbors: number }> {
    const neighbors = await this.graphContext("property", "property", listingId, 1);
    await this.publishPrediction(listingId, null);
    return { graphNeighbors: neighbors.length };
  }
}

/** درخواست ملکا (فرم داخلی ثبت درخواست) — کاشی هوم */
export class LocalRequestIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت درخواست ملکا";
  readonly tileId = "request";
  readonly insightDomains = ["request"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-local-request-v1")!, opts);
  }

  /** پیش‌بینی برآورده شدن درخواست داخلی (ثبت موفق در ARM) — از مغز مشترک */
  async predictRegisterSuccess(requestId: string): Promise<{ probability: number | null }> {
    const customer = await this.featureStore.customerFeatures(requestId, {
      id: requestId,
      recencyDays: 0,
      frequencyCount: 1,
      monetaryValue: 0,
      responseRate: 0.5,
      seriousnessScore: 0.5,
      budgetCompatibility: 0.5,
    } as never);
    const record = await this.predict<never>("CUSTOMER", requestId, { customer });
    const probability = record ? (record as unknown as { probability?: number }).probability ?? null : null;
    await this.publishPrediction(requestId, probability);
    return { probability };
  }
}

/** تطبیق هوشمند M5 — چهار کاشی مدیریتی */
export class MatchingIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت تطبیق هوشمند ملک تبریز";
  readonly tileId = "smart-matching";
  readonly insightDomains = ["smart-matching"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-matching-v1")!, opts);
  }

  /** زمینهٔ گرافی تطبیق (ملک ↔ درخواست ↔ کارشناس) + رویداد — صفر منطق امتیازدهی داخلی */
  async matchContext(propertyCode: string, requestId: string): Promise<{ propertyNeighbors: number; requestNeighbors: number }> {
    const propertyNeighbors = await this.graphContext("property", "property", propertyCode, 1);
    const requestNeighbors = await this.graphContext("people", "request", requestId, 1);
    await this.publishPrediction(`${propertyCode}:${requestId}`, null);
    return { propertyNeighbors: propertyNeighbors.length, requestNeighbors: requestNeighbors.length };
  }
}

/** شاخص بازار M6 — چهار کاشی مدیریتی */
export class MarketIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت شاخص بازار ملک تبریز";
  readonly tileId = "market-index";
  readonly insightDomains = ["market-index"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-market-v1")!, opts);
  }

  /** ویژگی‌های بازار از انبار مشترک (یک‌بار استخراج، چندبار مصرف) + رویداد تازگی */
  async marketSnapshot(areaKey: string, samples: Array<{ pricePerMeter: number; at: string }>): Promise<{ sampled: number }> {
    const market = await this.featureStore.marketFeatures(areaKey, {
      areaId: areaKey,
      snapshotDate: new Date(),
      samples,
    } as never);
    await this.publishPrediction(`market:${areaKey}`, null);
    return { sampled: (market as unknown as { samples?: unknown[] }).samples?.length ?? samples.length };
  }
}

/** پوشش اطلاعات M7 — چهار کاشی مدیریتی */
export class CoverageIntelligentAgent extends DomainIntelligentAgent {
  readonly name = "ایجنت پوشش اطلاعات ملک تبریز";
  readonly tileId = "data-coverage";
  readonly insightDomains = ["data-coverage"] as const;

  constructor(opts: DomainAgentOptions) {
    bootstrapModels();
    super(modelRegistry.get("melka-coverage-v1")!, opts);
  }

  /** رویداد بهبود پوشش روی تختهٔ سیاه — سنجه است نه پیش‌بینی (predictor=none) */
  async reportCoverageImprovement(tileKey: string, beforePct: number, afterPct: number): Promise<{ improved: boolean }> {
    await this.publishPrediction(`coverage:${tileKey}:${afterPct >= beforePct ? "up" : "down"}`, null);
    return { improved: afterPct > beforePct };
  }
}
