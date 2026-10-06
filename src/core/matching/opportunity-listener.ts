/**
 * P6545 / گام ۱ — BLOCK 1.4: شنوندهٔ هشدار فرصت (جلسه ۰۳۰ سؤال ۱۰)
 * ---------------------------------------------------------------------------
 * رویدادهای listing.created / request.created روی Blackboard منتشر می‌شوند؛
 * این شنونده:
 *   · در آگهی جدید → ۵ درخواست برتر (match) را پیدا می‌کند
 *   · در درخواست جدید → ۵ آگهی برتر را پیدا می‌کند
 *   · اگر امتیاز ≥ ۰٫۷ → هشدار تولید می‌شود (OpportunityAlert در DB)
 *
 * قید مطلق جلسه ۰۳۳: صفر اجرای خودکار — فقط هشدار.
 * نمایش: کاشی «تنظیمات عمومی» + کارت مغز (M8).
 */

import type { PrismaClient } from "@prisma/client";
import type { LearningTier } from "@/core/intelligence/contracts-p7-p11";
import { ALERT_SCORE_THRESHOLD, MatchingEngine, type MatchResult } from "./matching-engine";

export interface OpportunityAlertView {
  id: string;
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestId: string | null;
  matchScore: number;
  matchReasons: Array<{ factor: string; value: number; weight: number; note: string }>;
  status: string;
  emittedAt: string;
}

export interface ListenerRunReport {
  source: "listing.created" | "request.created" | "backfill";
  evaluated: number;
  alertsCreated: number;
  topScores: number[];
}

export class OpportunityListener {
  constructor(
    private readonly db: PrismaClient,
    private readonly tier: LearningTier = 3,
  ) {}

  /** رویداد آگهی تازه → ۵ درخواست برتر → هشدار برای امتیاز ≥ ۰٫۷ */
  async onListingCreated(listingCode: string): Promise<ListenerRunReport> {
    const engine = new MatchingEngine({ db: this.db, tier: this.tier });
    const result = await engine.matchListingToRequests(listingCode);
    return this.persistAlerts(result, "listing.created");
  }

  /** رویداد درخواست تازه → ۵ آگهی برتر → هشدار برای امتیاز ≥ ۰٫۷ */
  async onRequestCreated(requestId: string): Promise<ListenerRunReport> {
    const engine = new MatchingEngine({ db: this.db, tier: this.tier });
    const result = await engine.matchRequestToListings(requestId);
    return this.persistAlerts(result, "request.created");
  }

  /** به‌علاوهٔ رویدادها — پرکردن اولیه از دادهٔ زنده (شاهد ≥ ۵ هشدار واقعی) */
  async backfillRecent(opts: { listings?: number; requests?: number } = {}): Promise<ListenerRunReport> {
    const engine = new MatchingEngine({ db: this.db, tier: this.tier });
    let evaluated = 0;
    let alertsCreated = 0;
    const topScores: number[] = [];

    // تازه‌ترین آگهی‌های منتشرشده
    const listings = await this.db.propertyRecord.findMany({
      where: { status: "منتشر شده" },
      select: { propertyCode: true },
      orderBy: { syncedAt: "desc" },
      take: opts.listings ?? 12,
    });
    for (const l of listings) {
      const result = await engine.matchListingToRequests(l.propertyCode);
      const r = await this.persistAlerts(result, "backfill");
      evaluated += result.candidates.length;
      alertsCreated += r.alertsCreated;
      topScores.push(...r.topScores);
    }

    // تازه‌ترین درخواست‌های فعال
    const requests = await this.db.requestRecord.findMany({
      where: { status: { in: ["سرنخ", "فرصت", "در انتظار تایید"] } },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: opts.requests ?? 6,
    });
    for (const rq of requests) {
      const result = await engine.matchRequestToListings(rq.id);
      const r = await this.persistAlerts(result, "backfill");
      evaluated += result.candidates.length;
      alertsCreated += r.alertsCreated;
      topScores.push(...r.topScores);
    }
    return { source: "backfill", evaluated, alertsCreated, topScores: topScores.sort((a, b) => b - a).slice(0, 10) };
  }

  /** ذخیرهٔ هشدارها — صفر اجرای خودکار؛ فقط ردیف هشدار */
  private async persistAlerts(result: MatchResult, source: ListenerRunReport["source"]): Promise<ListenerRunReport> {
    let alertsCreated = 0;
    const topScores: number[] = [];
    for (const c of result.candidates) {
      topScores.push(c.score);
      if (c.score < ALERT_SCORE_THRESHOLD) continue;
      await this.db.opportunityAlert.create({
        data: {
          direction: result.direction,
          listingCode: result.direction === "listing_to_request" ? result.listingCode : (c.listingCode ?? null),
          requestId: result.direction === "request_to_listing" ? result.requestId : c.requestId,
          matchScore: c.score,
          matchReasons: JSON.stringify({ reasons: c.reasons, hardFilters: c.hardFilterNotes, source }),
        },
      });
      alertsCreated += 1;
    }
    return { source, evaluated: result.candidates.length, alertsCreated, topScores };
  }

  /** خواندن هشدارها برای UI — تازه‌ها اول */
  async alerts(limit = 20): Promise<OpportunityAlertView[]> {
    const rows = await this.db.opportunityAlert.findMany({
      where: { status: "new" },
      orderBy: [{ matchScore: "desc" }, { emittedAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => {
      let reasons: OpportunityAlertView["matchReasons"] = [];
      try {
        const parsed = JSON.parse(r.matchReasons);
        reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
      } catch { /* خام */
      }
      return {
        id: r.id,
        direction: r.direction as OpportunityAlertView["direction"],
        listingCode: r.listingCode,
        requestId: r.requestId,
        matchScore: r.matchScore,
        matchReasons: reasons,
        status: r.status,
        emittedAt: r.emittedAt.toISOString(),
      };
    });
  }

  /** علامت‌گذاری دیده‌شدن (فقط وضعیت هشدار — نه هیچ کنش اجرایی) */
  async markSeen(ids: string[]): Promise<number> {
    const r = await this.db.opportunityAlert.updateMany({ where: { id: { in: ids }, status: "new" }, data: { status: "seen", seenAt: new Date() } });
    return r.count;
  }
}
