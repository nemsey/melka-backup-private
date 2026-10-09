/**
 * سرویس حافظهٔ بلندمدت (PN-025 / فاز ۱۳-ج / ستون ۱)
 * ---------------------------------------------------------------------------
 * تنها نقطهٔ DB برای حافظه (الگوی self-diagnosis-service / meta-mind-service):
 *   · touch() — به‌روزرسانی امتیاز هر بستر هنگام نقش‌خوردن در استدلال
 *   · stats() — شمار سه سطح + آخرین تثبیت (API مالک)
 *   · runConsolidation() — تثبیت شبانه (کار Worker) + شاهد ConsolidationRun
 *
 * هستهٔ خالص در src/core/intelligence/memory-lifecycle.ts — گارد خلوص می‌گیرد.
 */

import { db } from "@/lib/db";
import {
  computeImportance,
  decideTransition,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_RETENTION_COMPRESSION,
  CONSOLIDATION_BATCH_LIMIT,
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryItemType,
} from "@/core/intelligence/memory-lifecycle";

/** نرمال‌سازی شناسهٔ بستر — trim + فشرده‌سازی فاصله (الگوی یکسان در کل ملکا) */
export function normalizeItemId(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * لمس حافظهٔ یک بستر — هر جا بستری در استدلال نقش خورد صدا می‌شود.
 * upsert idempotent بر کلید یکتای (itemType, itemId) + بازمحاسبهٔ امتیاز.
 */
export async function touchMemory(input: {
  itemId: string;
  itemType: MemoryItemType;
  hasOutcomeLink?: boolean;
  weightBoost?: number; // 0..1 — تقویت موقت امتیاز (مثلاً توصیه پذیرفته شد)
}): Promise<{ category: MemoryCategory; importanceScore: number; accessCount: number }> {
  const itemId = normalizeItemId(input.itemId);
  const existing = await db.memoryLifecycle.findUnique({ where: { itemType_itemId: { itemType: input.itemType, itemId } } });
  const now = new Date();
  const hoursSinceAccess = existing ? (now.getTime() - existing.lastAccessedAt.getTime()) / 3_600_000 : 24 * 365;
  const accessCount = (existing?.accessCount ?? 0) + 1;
  const importanceScore = Math.min(1, computeImportance({
    hoursSinceAccess: 0, // همین حالا دسترسی — تازگی کامل
    accessCount,
    hasOutcomeLink: input.hasOutcomeLink ?? false,
  }) + (input.weightBoost ?? 0));

  const row = existing
    ? await db.memoryLifecycle.update({
        where: { id: existing.id },
        data: { lastAccessedAt: now, accessCount, importanceScore },
      })
    : await db.memoryLifecycle.create({
        data: {
          category: "hot",
          itemId,
          itemType: input.itemType,
          lastAccessedAt: now,
          accessCount,
          importanceScore,
        },
      });
  return { category: row.category as MemoryCategory, importanceScore: row.importanceScore, accessCount: row.accessCount };
}

/** خواندن حافظهٔ یک بستر (برای شاهد مشاور) — null اگر هرگز لمس نشده */
export async function readMemory(itemId: string, itemType: MemoryItemType) {
  return db.memoryLifecycle.findUnique({ where: { itemType_itemId: { itemType, itemId: normalizeItemId(itemId) } } });
}

/** seed سیاست نگهداری سه سطح — idempotent (هر اجرا فقط ردیف‌های غایب را می‌سازد) */
export async function ensureRetentionSeeded(): Promise<void> {
  for (const category of MEMORY_CATEGORIES) {
    const existing = await db.retentionPolicy.findUnique({ where: { category } });
    if (!existing) {
      await db.retentionPolicy.create({
        data: {
          category,
          retentionDays: DEFAULT_RETENTION_DAYS[category],
          compression: DEFAULT_RETENTION_COMPRESSION,
          appliedBy: "seed",
        },
      });
    }
  }
}

/** آمار حافظه برای API مالک — شمار سه سطح + آخرین تثبیت + توزیع امتیاز */
export async function memoryStats() {
  const [hot, warm, cold, total, lastRun] = await Promise.all([
    db.memoryLifecycle.count({ where: { category: "hot" } }),
    db.memoryLifecycle.count({ where: { category: "warm" } }),
    db.memoryLifecycle.count({ where: { category: "cold" } }),
    db.memoryLifecycle.count(),
    db.consolidationRun.findFirst({ orderBy: { ranAt: "desc" } }),
  ]);
  const high = await db.memoryLifecycle.count({ where: { importanceScore: { gte: 0.7 } } });
  const policies = await db.retentionPolicy.findMany();
  return {
    levels: { hot, warm, cold, total },
    importance: { high: high, low: total - high },
    policies: policies.map((p) => ({ category: p.category, retentionDays: p.retentionDays })),
    lastConsolidation: lastRun
      ? {
          ranAt: lastRun.ranAt.toISOString(),
          hotToWarm: lastRun.hotToWarm,
          warmToCold: lastRun.warmToCold,
          awakened: lastRun.archived,
          durationMs: lastRun.duration,
        }
      : null,
  };
}

/**
 * تثبیت شبانه (خواب مغز) — کار Worker با id=memory-consolidation.
 * بهترین‌تلاش: خطای یک رکورد بقیه را نمی‌شکند؛ شاهد کامل ConsolidationRun.
 * سقف هر اجرا: CONSOLIDATION_BATCH_LIMIT (حفاظت شب‌های اولیه).
 */
export async function runConsolidation(): Promise<{
  hotToWarm: number;
  warmToCold: number;
  awakened: number;
  durationMs: number;
  errors: string[];
}> {
  const t0 = Date.now();
  const errors: string[] = [];
  const now = new Date();

  const before = await countsByCategory();

  // ── ارتقا hot→warm ──
  let hotToWarm = 0;
  const hotCandidates = await db.memoryLifecycle.findMany({
    where: { category: "hot", lastAccessedAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
    take: CONSOLIDATION_BATCH_LIMIT,
  });
  for (const m of hotCandidates) {
    try {
      const verdict = decideTransition({
        category: "hot",
        daysSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 86_400_000,
        hoursSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 3_600_000,
        importanceScore: m.importanceScore,
      });
      if (verdict.action === "promote") {
        await db.memoryLifecycle.update({ where: { id: m.id }, data: { category: "warm" } });
        hotToWarm += 1;
      }
    } catch (e) {
      errors.push(`hot:${m.id} — ${e instanceof Error ? e.message : "خطا"}`);
    }
  }

  // ── تنزل warm→cold ──
  let warmToCold = 0;
  const warmCandidates = await db.memoryLifecycle.findMany({
    where: { category: "warm", lastAccessedAt: { lt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) } },
    take: CONSOLIDATION_BATCH_LIMIT,
  });
  for (const m of warmCandidates) {
    try {
      const verdict = decideTransition({
        category: "warm",
        daysSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 86_400_000,
        hoursSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 3_600_000,
        importanceScore: m.importanceScore,
      });
      if (verdict.action === "demote") {
        await db.memoryLifecycle.update({ where: { id: m.id }, data: { category: "cold" } });
        warmToCold += 1;
      }
    } catch (e) {
      errors.push(`warm:${m.id} — ${e instanceof Error ? e.message : "خطا"}`);
    }
  }

  // ── بیداری cold→warm (دسترسی تازه + جهش امتیاز) ──
  let awakened = 0;
  const coldCandidates = await db.memoryLifecycle.findMany({
    where: { category: "cold", lastAccessedAt: { gt: new Date(now.getTime() - 48 * 3600 * 1000) } },
    take: CONSOLIDATION_BATCH_LIMIT,
  });
  for (const m of coldCandidates) {
    try {
      const verdict = decideTransition({
        category: "cold",
        daysSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 86_400_000,
        hoursSinceAccess: (now.getTime() - m.lastAccessedAt.getTime()) / 3_600_000,
        importanceScore: m.importanceScore,
      });
      if (verdict.action === "awaken") {
        await db.memoryLifecycle.update({ where: { id: m.id }, data: { category: "warm" } });
        awakened += 1;
      }
    } catch (e) {
      errors.push(`cold:${m.id} — ${e instanceof Error ? e.message : "خطا"}`);
    }
  }

  const after = await countsByCategory();
  const durationMs = Date.now() - t0;

  // ── شاهد کامل + بازتولیدپذیری (آستانه‌ها در evidence) ──
  await db.consolidationRun.create({
    data: {
      ranAt: now,
      hotToWarm,
      warmToCold,
      archived: awakened,
      duration: durationMs,
      summary: { before, after, topPromoted: hotCandidates.slice(0, 5).map((m) => m.itemId) },
      evidence: {
        thresholds: { promote: 0.7, demote: 0.3, hotDays: 7, warmDays: 30, awakenScore: 0.5 },
        sampled: { hotChecked: hotCandidates.length, warmChecked: warmCandidates.length, coldChecked: coldCandidates.length },
        errors: errors.slice(0, 10),
      },
    },
  });

  // AuditLog — بهترین‌تلاش (تثبیت هرگز به‌خاطر audit نمی‌شکند — الگوی backup-rotation)
  await db.auditLog.create({
    data: {
      action: "MEMORY_CONSOLIDATION",
      actor: "worker:memory-consolidation",
      detail: JSON.stringify({ hotToWarm, warmToCold, awakened, durationMs, errors: errors.length }),
    },
  }).catch(() => undefined);

  return { hotToWarm, warmToCold, awakened, durationMs, errors };
}

async function countsByCategory(): Promise<Record<MemoryCategory, number>> {
  const [hot, warm, cold] = await Promise.all([
    db.memoryLifecycle.count({ where: { category: "hot" } }),
    db.memoryLifecycle.count({ where: { category: "warm" } }),
    db.memoryLifecycle.count({ where: { category: "cold" } }),
  ]);
  return { hot, warm, cold };
}
