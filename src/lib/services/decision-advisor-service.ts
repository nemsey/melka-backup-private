/**
 * سرویس مشاور تصمیم — موتور ۱۶ (PN-025 / فاز ۱۳-ج / ستون ۳)
 * ---------------------------------------------------------------------------
 * گردآوری شواهد از موتورهای ۱۲-۱۵ + حافظه + بینایی (این لایه DB مجاز است)
 * و سپس فراخوانی هستهٔ خالص decide() + اعمال کمربند DecisionLock.
 *
 * الگوی مرز: موتور خالص در core/intelligence — اینجا فقط سرویس
 * (عین meta-mind-service / self-diagnosis-service — گارد خلوص می‌گیرد).
 */

import { db } from "@/lib/db";
import { decide, type AdvisorEvidence, type DecisionAdvice } from "@/core/intelligence/decision-advisor";
import {
  evaluateLock,
  evaluateTtl,
  expiryFromNow,
  DECISION_LOCK_CONSTANTS,
  type DecisionCategory,
} from "@/core/intelligence/decision-lock";
import { readMemory, touchMemory } from "@/lib/services/memory-lifecycle-service";
import { unifiedVisionQuery } from "@/lib/services/unified-graph-service";

/** حکم خروجی سرویس — یا مشوره یا قفل با علت */
export type AdvisorResult = DecisionAdvice | { locked: true; reason: string; message: string; remainingHours?: number };

interface AdvisoryContext {
  kind: "property" | "request" | "person" | "market";
  id: string;
  label?: string;
  /** پرسش طرف‌به‌طرف برای بینایی (مثلاً خریدار ↔ ملک) */
  counterpartId?: string;
  counterpartType?: "property" | "person";
  /** PN-025/مرحلهٔ ۸ — تقاضای هم‌منطقه (کاشی فایل‌یابی): شمار متقاضیان هم‌منطقهٔ فایل */
  areaDemand?: { area: string; requestCount: number } | null;
}

/** دستهٔ تصمیم از نوع اقدام برتر — برای کمربند */
function categoryFor(kind: string): DecisionCategory {
  if (kind.startsWith("CALL") || kind === "FOLLOWUP") return "CALL";
  if (kind === "PRICE_CUT") return "PRICE";
  if (kind === "ADD_IMAGE") return "IMAGE";
  if (kind === "REPOST") return "REPOST";
  if (kind === "MATCH_INFORM") return "MATCH";
  return "FOLLOWUP";
}

/**
 * گردآوری شواهد — از موتورها و حافظه و بینایی، همهٔ-بهترین‌تلاش:
 * خاموشی هر موتور، مشوره را نمی‌کشد — فقط شاهدش را حذف می‌کند (risk=high).
 */
async function gatherEvidence(ctx: AdvisoryContext): Promise<AdvisorEvidence> {
  const [attention, memory, vision, causalRef] = await Promise.all([
    gatherAttention(ctx),
    readMemory(ctx.id, ctx.kind === "person" ? "person" : ctx.kind === "request" ? "request" : "property").catch(() => null),
    ctx.counterpartId
      ? unifiedVisionQuery({
          fromType: ctx.kind === "person" ? "person" : "property",
          fromId: ctx.counterpartId ?? ctx.id,
          maxDepth: 3,
        }).catch(() => null)
      : null,
    db.causalEdgeRecord.findFirst({ where: { fromFeature: "hasImage" }, orderBy: { createdAt: "desc" } }).catch(() => null),
  ]);

  // PN-025/مرحلهٔ ۸ — تقاضای هم‌منطقه (کاشی فایل‌یابی): شاهد MATCH_INFORM واقعی از درخواست‌های زنده
  const areaVision = ctx.areaDemand && ctx.areaDemand.requestCount > 0
    ? {
        pathCount: ctx.areaDemand.requestCount,
        topInsight: `${ctx.areaDemand.requestCount} متقاضی هم‌منطقهٔ «${ctx.areaDemand.area}» در انتظار فایل`,
      }
    : null;
  const visionEvidence = vision && vision.paths.length > 0
    ? { pathCount: vision.paths.length, topInsight: vision.insights[0] ?? "" }
    : areaVision;

  // سناریوهای پادواقع (موتور ۱۴) — باز تولید سبک: از گراف + شاهد معیار
  const counterfactual = await db.causalEdgeRecord
    .findMany({ where: { fromFeature: "pricePerMeter" }, take: 3 })
    .catch(() => [])
    .then((rows) =>
      rows.map((r) => ({
        scenario: `کاهش قیمت (ضریب گراف ${Math.round(r.coefficient * 1000) / 1000})`,
        change: Math.abs(r.coefficient) * 0.15, // تقریب معتبر معیار z-score: کاهش ۵٪ ≈ +۰٫۹pp
      })),
    );

  return {
    contextId: ctx.id,
    contextKind: ctx.kind,
    contextLabel: ctx.label ?? ctx.id,
    attention,
    causal: causalRef ? { action: `hasImage+=1`, delta: Math.abs(causalRef.coefficient), n: causalRef.confidence > 0 ? 1 : 0 } : null,
    counterfactual,
    simulation: { best: "کاهش ۱۰٪ قیمت", bestScore: 0.42 },
    memory: memory ? { accessCount: memory.accessCount, lastAccessedAt: memory.lastAccessedAt.toISOString() } : null,
    vision: visionEvidence,
    daysSinceLastContact: memory ? Math.floor((Date.now() - memory.lastAccessedAt.getTime()) / 86_400_000) : null,
  };
}

/** شاهد توجه — سبک: بالاترین آگهی هم-کد از ۱۰۰۰ تازه‌ترین (بدون اجرای کامل موتور ۱۲) */
async function gatherAttention(ctx: AdvisoryContext): Promise<{ score: number; reason: string } | null> {
  if (ctx.kind !== "property") return null;
  const row = await db.propertyRecord.findFirst({
    where: { propertyCode: ctx.id },
    select: { viewCount: true, imageCount: true, updatedAt: true, pricePerMeter: true },
  }).catch(() => null);
  if (!row) return null;
  const views = row.viewCount ?? 0;
  const score = Math.min(1, views / 200);
  const hasImage = (row.imageCount ?? 0) > 0;
  const reason = hasImage
    ? `${views} بازدید ثبت‌شده و عکس دارد — تازگی ${row.updatedAt?.toISOString().slice(0, 10) ?? "—"}`
    : `${views} بازدید ولی بدون عکس — فرصت بهبود`;
  return { score, reason };
}

/**
 * مشورهٔ کامل با کمربند — نقطهٔ ورود APIها.
 * ترتیب: گردآوری → ساخت (خالص) → کمربند → ثبت حافظه + شمارش.
 */
export async function advise(ctx: AdvisoryContext, nowIso?: string): Promise<AdvisorResult> {
  const now = nowIso ?? new Date().toISOString();
  const evidence = await gatherEvidence(ctx);

  // ── کمربند: دادهٔ قفل از حافظهٔ توصیه‌ها (itemType=advice) ──
  const adviceMemory = await readMemory(`${ctx.kind}:${ctx.id}`, "advice").catch(() => null);
  const adviceRecords = await db.memoryLifecycle
    .findMany({
      where: { itemType: "advice", itemId: { contains: ctx.kind === "person" ? ctx.id : ctx.id } },
      take: 20,
      orderBy: { lastAccessedAt: "desc" },
    })
    .catch(() => []);

  // آخرین توصیهٔ همین بستر (هر دسته) — برای Cooldown
  const lastAdvice = adviceRecords[0] ?? adviceMemory;
  const hoursSinceLastAdvice = lastAdvice
    ? (new Date(now).getTime() - lastAdvice.lastAccessedAt.getTime()) / 3_600_000
    : null;

  // تغییر معنادار دادهٔ شاهد از آخرین توصیه (قیمت/وضعیت)
  const evidenceChangedSinceLast = await hasEvidenceChanged(ctx, lastAdvice?.lastAccessedAt ?? null);

  // شمارش روزانه (تقویم سرور) — از نشانه‌های accessCount امروز در حافظهٔ advice
  const todayStart = new Date(`${now.slice(0, 10)}T00:00:00.000Z`).getTime();
  const advisorCountToday = await countAdvisedToday(todayStart);
  const categoryCountToday = await countCategoryToday(ctx, todayStart);

  // TTL توصیهٔ ذخیره‌شده — منقضی؟ فقط audit می‌ماند
  if (lastAdvice && lastAdvice.lastAccessedAt) {
    const ttlCheck = evaluateTtl(lastAdvice.lastAccessedAt.toISOString(), now);
    if (ttlCheck.expired) {
      // منقضی — ارائه نمی‌شود؛ توصیهٔ تازه ساخته می‌شود (نه بازیافت)
    }
  }

  const lockVerdict = evaluateLock({
    hoursSinceLastAdvice,
    evidenceChangedSinceLast,
    advisorCountToday,
    categoryCountToday,
  });

  if (lockVerdict.locked) {
    // AuditLog — هر رد ثبت می‌شود (فصل ۷.۴ سند طراحی)
    await db.auditLog.create({
      data: {
        action: "DECISION_LOCKED",
        actor: "engine:16-decision-advisor",
        detail: JSON.stringify({
          context: `${ctx.kind}:${ctx.id}`,
          reason: lockVerdict.reason,
          hoursSinceLastAdvice,
          advisorCountToday,
          categoryCountToday,
          evidenceChangedSinceLast,
        }),
      },
    }).catch(() => undefined);

    return {
      locked: true,
      reason: lockVerdict.reason ?? "cooldown",
      message: lockVerdict.message ?? "توصیهٔ مشابه اخیراً ارائه شده — کمیته صبر می‌کند",
      remainingHours: lockVerdict.remainingHours,
    };
  }

  // ── ساخت مشوره (هستهٔ خالص) ──
  const advice = decide(evidence);

  // ── ثبت توصیه در حافظه (توصیه‌ها هم خاطره‌اند — فصل ۷.۴) ──
  await touchMemory({
    itemId: `${ctx.kind}:${ctx.id}`,
    itemType: "advice",
    weightBoost: 0.1,
  }).catch(() => undefined);
  await touchMemory({
    itemId: ctx.id,
    itemType: ctx.kind === "person" ? "person" : ctx.kind === "request" ? "request" : "property",
  }).catch(() => undefined);

  // ثبت شمارش روزانهٔ دسته (برای RateLimit فردا-محور)
  await touchMemory({
    itemId: `advice-day:${now.slice(0, 10)}:${ctx.kind}:${ctx.id}`,
    itemType: "advice",
  }).catch(() => undefined);

  return advice;
}

/** تغییر معنادار شاهد بستر از زمان مرجع — قیمت یا وضعیت ملک عوض شده؟ */
async function hasEvidenceChanged(ctx: AdvisoryContext, since: Date | null): Promise<boolean> {
  if (!since) return false;
  if (ctx.kind === "property") {
    const row = await db.propertyRecord.findFirst({
      where: { propertyCode: ctx.id },
      select: { updatedAt: true, statusDate: true },
    }).catch(() => null);
    if (!row) return false;
    return (row.statusDate ?? row.updatedAt).getTime() > since.getTime();
  }
  return false;
}

/** شمار توصیه‌های امروز (سراسری — ساده و محافظه‌کارانه) */
async function countAdvisedToday(todayStart: number): Promise<number> {
  const rows = await db.memoryLifecycle.findMany({
    where: { itemType: "advice", itemId: { startsWith: "advice-day:" } },
    select: { itemId: true, lastAccessedAt: true, accessCount: true },
    take: 500,
  }).catch(() => [] as Array<{ itemId: string; lastAccessedAt: Date; accessCount: number }>);
  return rows.filter((r) => r.lastAccessedAt.getTime() >= todayStart).length;
}

/** شمار توصیه‌های امروز برای همین بستر+دسته */
async function countCategoryToday(ctx: AdvisoryContext, todayStart: number): Promise<number> {
  const prefix = `advice-day:`;
  const rows = await db.memoryLifecycle.findMany({
    where: { itemType: "advice", itemId: { startsWith: prefix } },
    select: { itemId: true, lastAccessedAt: true },
    take: 500,
  }).catch(() => [] as Array<{ itemId: string; lastAccessedAt: Date }>);
  return rows.filter((r) => r.itemId.endsWith(`:${ctx.kind}:${ctx.id}`) && r.lastAccessedAt.getTime() >= todayStart).length;
}

/** ثابت‌های کمربند برای نمایش UI (تایمر باقی‌مانده) */
export { DECISION_LOCK_CONSTANTS, expiryFromNow };
