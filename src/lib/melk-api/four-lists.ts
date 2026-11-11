/**
 * four-lists.ts — PN-083 · هماهنگ‌ساز فراجامع بروزرسانی چهار فهرست داشبورد ملک تبریز
 * ---------------------------------------------------------------------------
 * دستور مالک: «بخش بروزرسانی هر چهار فهرست … به‌گونه‌ای بهینه شود که هماهنگی
 * کامل بین (۱) بخش بروزرسانی فهرست‌های چهارگانه، (۲) بخش بروزرسانی دستی و
 * (۳) بخش کارهای پس‌زمینهٔ تنظیمات ایجاد شود.»
 *
 * چهار فهرست (منبع یگانه — TenantDashboard · TabsList چهارگانه):
 *   M1 آگهی‌ها (arm-listings) · M2 درخواست‌ها (arm-requests)
 *   M3 معاملات (transactions-contracts) · M4 مشاوران (experts)
 *
 * سه لایهٔ هماهنگی:
 *   ┌─ لایهٔ ۱ · اجرا — قفل بین‌فرایندی JobLock با شناسهٔ update:m1..m4:
 *   │   هر مسیر بروزرسانی (چرخهٔ خودکار Worker LCPP · دکمهٔ دستی هر صفحه ·
 *   │   بروزرسانی دستی جامع · برش‌های پایدارساز کاتالوگ) پیش از لمس سامانهٔ
 *   │   مبدأ، قفل همان فهرست را می‌گیرد → صفر اجرای موازی روی یک منبع،
 *   │   صفر آشفتگی نرخ‌محدود (درس ترموکس: ۴۰۱/502 = فشار هم‌زمان).
 *   ├─ لایهٔ ۲ · وضعیت — SyncJobState (پایدار در برابر ری‌استارت) با
 *   │   شناسه‌های list-m1..m4: هر اجرا از هر مسیری، وضعیت/پیشرفت/منبع را در
 *   │   همین ردیف‌ها می‌نویسد → یک حقیقت برای هر سه سطح UI.
 *   └─ لایهٔ ۳ · نمایش — نوار داشبورد (FourListsUpdateBar) · بخش بروزرسانی
 *       هر فهرست · کارهای پس‌زمینهٔ تنظیمات؛ همه از GET /api/sync/four-lists.
 *
 * مرزها:
 *   · صفر تغییر در توابع موجود (fastPass/deepPass/syncArmCatalog/…) — فقط
 *     پوشش قفل + ثبت وضعیت دور آن‌ها (additive-only).
 *   · پرچم درخواست فوری مشاوران (experts-force.flag) عین الگوی kernel.ts
 *     (lcpp-force.flag) — همان دایرکتوری اجرایی، همان گارد پنج‌دقیقه‌ای.
 *   · شناسه‌ها/برچسب‌ها فقط از همین فایل — هیچ رشته‌ای در UI هاردکد نیست.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { withLock, type WithLockResult } from "@/core/runtime/joblock";
import { JobStateService, JOB_IDS, type JobStateView, type SyncJobStatus } from "./job-state";
import { readLcppStatus } from "@/sync/lists/kernel";

/* ═══════════════════════════ تعریف یکتای چهار فهرست ═══════════════════════════ */

export type FourListId = "m1" | "m2" | "m3" | "m4";

export interface FourListDef {
  /** کلید کوتاه — همان که UI و API می‌پذیرند */
  id: FourListId;
  /** ردیف SyncJobState (لایهٔ ۲ — منبع یگانهٔ وضعیت) */
  jobId: string;
  /** ردیف JobLock (لایهٔ ۱ — هماهنگی بین‌فرایندی) */
  lockId: string;
  /** شناسهٔ فهرست در lcpp-status.json (فاز A/B) — M4 چنین فازی ندارد */
  lcppListId: string | null;
  /** برچسب کامل فارسی */
  label: string;
  /** برچسب کوتاه چیپ UI */
  shortLabel: string;
  /** مدل شمارش رکورد برای «تازگی» (نمایش تعداد ردیف زنده) */
  countModel: "propertyRecord" | "requestRecord" | "transactionRecord" | "expertProfile";
  /** فاصلهٔ چرخهٔ کامل خودکار (دقیقه) — پیش‌فرض · با env قابل تنظیم */
  cycleIntervalEnv: string;
  cycleIntervalDefaultMin: number;
}

export const FOUR_LISTS: Record<FourListId, FourListDef> = {
  m1: {
    id: "m1", jobId: JOB_IDS.listM1, lockId: "update:m1", lcppListId: "m1-arm-listings",
    label: "فهرست آگهی‌ها (M1)", shortLabel: "آگهی‌ها",
    countModel: "propertyRecord",
    cycleIntervalEnv: "MELK_LCPP_INTERVAL_MINUTES", cycleIntervalDefaultMin: 30,
  },
  m2: {
    id: "m2", jobId: JOB_IDS.listM2, lockId: "update:m2", lcppListId: "m2-arm-requests",
    label: "فهرست درخواست‌ها (M2)", shortLabel: "درخواست‌ها",
    countModel: "requestRecord",
    cycleIntervalEnv: "MELK_LCPP_INTERVAL_MINUTES", cycleIntervalDefaultMin: 30,
  },
  m3: {
    id: "m3", jobId: JOB_IDS.listM3, lockId: "update:m3", lcppListId: "m9-transactions",
    label: "فهرست معاملات (M3)", shortLabel: "معاملات",
    countModel: "transactionRecord",
    cycleIntervalEnv: "MELK_LCPP_INTERVAL_MINUTES", cycleIntervalDefaultMin: 30,
  },
  m4: {
    id: "m4", jobId: JOB_IDS.listM4, lockId: "update:m4", lcppListId: null,
    label: "فهرست مشاوران (M4)", shortLabel: "مشاوران",
    countModel: "expertProfile",
    cycleIntervalEnv: "MELK_EXPERTS_SYNC_INTERVAL_MINUTES", cycleIntervalDefaultMin: 30,
  },
};

export const FOUR_LIST_IDS: readonly FourListId[] = ["m1", "m2", "m3", "m4"];

/** ترجمهٔ امن ورودی UI/API → FourListId (چیزی خارج از چهار فهرست پذیرفته نیست) */
export function parseFourListId(v: unknown): FourListId | null {
  return typeof v === "string" && (FOUR_LIST_IDS as readonly string[]).includes(v) ? (v as FourListId) : null;
}

/* ═══════════════════════════ لایهٔ ۱ — قفل بین‌فرایندی ═══════════════════════════ */

/** پوشش قفل‌دارِ اجرای بروزرسانی یک فهرست — هر برنده فقط یک اجرا (عین withLock) */
export async function withListLock<T>(
  db: PrismaClient,
  listId: FourListId,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; metadata?: Record<string, unknown> } = {},
): Promise<WithLockResult<T>> {
  return withLock(db, FOUR_LISTS[listId].lockId, fn, {
    ttlMs: opts.ttlMs,
    metadata: { list: listId, ...(opts.metadata ?? {}) },
  });
}

/** چه کسی الان قفل این فهرست را دارد؟ (پرس‌وجو — بدون تصرف) */
export async function listLockHolder(
  db: PrismaClient,
  listId: FourListId,
): Promise<{ instanceId: string; expiresAt: Date; stale: boolean; metadata: string | null } | null> {
  const { JobLockService } = await import("@/core/runtime/joblock");
  const svc = new JobLockService(db);
  return svc.holderOf(FOUR_LISTS[listId].lockId);
}

/* ═══════════════════════════ لایهٔ ۲ — وضعیت یکپارچه (SyncJobState) ═══════════════════════════ */

export interface FourListStatePatch {
  status?: SyncJobStatus;
  /** پیشرفت صوری مرحله‌ای (۱..totalPages) — صرفاً نمایشی، صادرکنندهٔ حقیقت همان اجراست */
  lastCompletedPage?: number;
  totalPages?: number;
  detail?: Record<string, unknown>;
}

/** منبع اجرا — در detail ثبت می‌شود تا UI صادقانه «چه چیزی، چه زمانی» را بگوید */
export type UpdateSource = "auto" | "manual" | "forced";

export const SOURCE_LABELS: Record<UpdateSource, string> = {
  auto: "چرخهٔ خودکار",
  manual: "بروزرسانی دستی",
  forced: "درخواست فوری مالک",
};

/** نوشتن وضعیت یکپارچهٔ یک فهرست — تنها گیت رسمی همهٔ مسیرهای بروزرسانی */
export async function upsertFourListState(db: PrismaClient, listId: FourListId, patch: FourListStatePatch): Promise<void> {
  const jobs = new JobStateService(db);
  await jobs.upsert({
    jobId: FOUR_LISTS[listId].jobId,
    jobKind: "sync",
    ...patch,
  });
}

/* ═══════════════════════════ پرچم درخواست فوری مشاوران (عین kernel.ts) ═══════════════════════════ */

function runtimeDir(): string {
  return process.env.MELK_LCPP_RUNTIME_DIR ?? join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "upload", ".runtime");
}
function expertsForcePath(): string {
  return join(runtimeDir(), "experts-force.flag");
}

/** درخواست اجرای فوری چرخهٔ مشاوران (پرچم — lcppWatch در ≤۶۰ث برمی‌دارد) */
export function requestExpertsForceRefresh(): boolean {
  try {
    mkdirSync(runtimeDir(), { recursive: true });
    writeFileSync(expertsForcePath(), new Date().toISOString(), "utf8");
    return true;
  } catch {
    return false;
  }
}

/** آیا پرچم فوری مشاوران هست و تازه است؟ (≤۵ دقیقه — عین peekForceRefresh) */
export function peekExpertsForceRefresh(): boolean {
  try {
    if (!existsSync(expertsForcePath())) return false;
    const ts = readFileSync(expertsForcePath(), "utf8").trim();
    const age = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(age) || age > 5 * 60_000) return false;
    return true;
  } catch {
    return false;
  }
}

/** پاک‌سازی پرچم پس از شروع اجرای فوری (Worker) */
export function clearExpertsForceRefresh(): void {
  try {
    if (existsSync(expertsForcePath())) unlinkSync(expertsForcePath());
  } catch {
    /* بی‌اهمیت */
  }
}

/* ═══════════════════════════ اجرای سه‌مرحله‌ای مشاوران (M4) — مسیر مشترک ═══════════════════════════ */

export interface ExpertsUpdateOutcome {
  ran: boolean;
  /** علت عدم اجرا: held (قفل زندهٔ دیگری) | raced | no-token */
  reason?: string;
  stage?: Record<string, unknown>;
}

/**
 * بروزرسانی فهرست مشاوران (M4) — تنها مسیر اجرای رسمی (دستی و خودکار یکسان):
 *   قفل update:m4 → سه مرحلهٔ PM (رجیستری → عمق → شمارش) → ثبت وضعیت list-m4.
 * اگر قفل دست دیگری زنده باشد، صادقانه ran=false برمی‌گردد (صفر اجرای موازی).
 */
export async function runExpertsListUpdate(
  db: PrismaClient,
  opts: { pmToken: string | null; source: UpdateSource; deepRows?: number },
): Promise<ExpertsUpdateOutcome> {
  if (!opts.pmToken) {
    // بی‌توکن هم صادق باش: وضعیت ثبت می‌شود تا تنظیمات/داشبورد دلیل را بگویند
    await upsertFourListState(db, "m4", {
      status: "failed",
      detail: { source: opts.source, stage: "no-token", error: "توکن PM در دسترس نیست — اتصال پرسنلی تنظیمات عمومی برقرار نیست.", at: new Date().toISOString() },
    }).catch(() => undefined);
    return { ran: false, reason: "no-token" };
  }

  const res = await withListLock(
    db,
    "m4",
    async () => {
      await upsertFourListState(db, "m4", {
        status: "running", lastCompletedPage: 0, totalPages: 3,
        detail: { source: opts.source, stage: "registry", at: new Date().toISOString() },
      });
      const { syncExpertProfiles } = await import("@/lib/experts/profile-store");
      const stage = await syncExpertProfiles(opts.pmToken, { deepRows: opts.deepRows ?? 40 });
      const ok = !stage.registryError && !stage.countsError;
      await upsertFourListState(db, "m4", {
        status: ok ? "done" : "failed",
        lastCompletedPage: 3,
        totalPages: 3,
        detail: {
          source: opts.source, stage: "done", finishedAt: new Date().toISOString(),
          registryRows: stage.registryRows, deepEnriched: stage.deepEnriched,
          counts: stage.counts ? { sale: stage.counts.sale, rent: stage.counts.rent } : null,
          error: stage.registryError ?? stage.countsError ?? null,
        },
      });
      return stage as unknown as Record<string, unknown>;
    },
    { metadata: { source: opts.source, list: "m4" } },
  );

  if (!res.ran) return { ran: false, reason: res.reason ?? "held" };
  return { ran: true, stage: res.result };
}

/* ═══════════════════════════ نمای یکپارچهٔ خواندنی (GET /api/sync/four-lists) ═══════════════════════════ */

export interface FourListUnified {
  id: FourListId;
  jobId: string;
  label: string;
  shortLabel: string;
  /** وضعیت از SyncJobState (idle تا وقتی هیچ اجرایی ثبت نشده) */
  status: SyncJobStatus;
  /** فاز LCPP فایل‌محور برای M1/M2/M3 (compat) — M4: null */
  lcppPhase: string | null;
  progressPercent: number;
  /** منبع آخرین اجرا (auto/manual/forced) + برچسب فارسی */
  source: UpdateSource | null;
  sourceLabel: string | null;
  lastCompletedPage: number;
  totalPages: number;
  /** آخرین رکورد نوشته‌شده در آخرین اجرا (از detail.lastWritten) */
  lastWritten: number | null;
  /** زمان آخرین به‌روزرسانی ردیف وضعیت */
  updatedAt: string | null;
  /** برآورد چرخهٔ کامل بعدی (ISO) — از فاصلهٔ تنظیم‌شدهٔ همان فهرست */
  nextCycleAt: string | null;
  /** شمار رکورد زندهٔ فهرست (کش ۳۰ ثانیه — پرس‌وجوی سنگین نه) */
  rows: number | null;
  /** قفل این لحظهٔ فهرست در دست چه کسی است (running بین‌فرایندی) */
  lockHeldBy: string | null;
  detail: Record<string, unknown> | null;
}

export interface FourListsUnifiedView {
  running: boolean;
  lists: Record<FourListId, FourListUnified>;
  /** وضعیت فایل LCPP عیناً (compat — /api/sync/lcpp همچنان برقرار است) */
  lcpp: ReturnType<typeof readLcppStatus>;
}

/** کش شمار رکوردها — ۳۰ ثانیه؛ شمارش هر ۱۰-۳۰ثانیهٔ UI یعنی ضربهٔ DB نه */
const rowsCache = new Map<FourListId, { at: number; rows: number }>();
const ROWS_CACHE_MS = 30_000;

async function countRows(db: PrismaClient, listId: FourListId): Promise<number | null> {
  const hit = rowsCache.get(listId);
  if (hit && Date.now() - hit.at < ROWS_CACHE_MS) return hit.rows;
  try {
    const model = db[FOUR_LISTS[listId].countModel] as unknown as { count(): Promise<number> };
    const rows = await model.count();
    rowsCache.set(listId, { at: Date.now(), rows });
    return rows;
  } catch {
    return hit ? hit.rows : null;
  }
}

function envInt(name: string, def: number, min: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.floor(v) : def;
}

function nextCycleAt(listId: FourListId, refISO: string | null): string | null {
  if (!refISO) return null;
  const def = FOUR_LISTS[listId];
  const t = new Date(refISO).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + envInt(def.cycleIntervalEnv, def.cycleIntervalDefaultMin, 5) * 60_000).toISOString();
}

/** مرجع زمان «آخرین اجرا» برای برآورد چرخهٔ بعدی M1/M2/M3 = پایان آخرین چرخهٔ LCPP */
function lcppRefISO(): string | null {
  const s = readLcppStatus();
  return s.finishedAt ?? s.startedAt ?? null;
}

/**
 * نمای یکپارچهٔ چهار فهرست — ادغام SyncJobState (حقیقت اجرا) + lcpp-status.json
 * (فاز A/B) + JobLock (اجراهای زنده) + شمار رکورد (تازگی داده).
 * هر سه سطح UI فقط همین را می‌خوانند (یک حقیقت، سه نمایش).
 */
export async function readFourListsUnified(db: PrismaClient): Promise<FourListsUnifiedView> {
  const jobs = new JobStateService(db);
  const lcpp = readLcppStatus();
  const states = new Map<string, JobStateView>();
  for (const id of FOUR_LIST_IDS) {
    const st = await jobs.get(FOUR_LISTS[id].jobId).catch(() => null);
    if (st) states.set(FOUR_LISTS[id].jobId, st);
  }

  const lists = {} as Record<FourListId, FourListUnified>;
  let running = false;

  for (const id of FOUR_LIST_IDS) {
    const def = FOUR_LISTS[id];
    const st = states.get(def.jobId) ?? null;
    const detail = (st?.detail ?? null) as Record<string, unknown> | null;
    const source = (detail && (typeof detail.source === "string" ? detail.source : null)) as UpdateSource | null;
    const holder = await listLockHolder(db, id).catch(() => null);
    const lockHeldBy = holder && !holder.stale ? holder.instanceId : null;
    const isRunning = st?.status === "running" || lockHeldBy !== null;
    if (isRunning) running = true;

    lists[id] = {
      id,
      jobId: def.jobId,
      label: def.label,
      shortLabel: def.shortLabel,
      status: (st?.status ?? "idle") as SyncJobStatus,
      lcppPhase: def.lcppListId ? (lcpp.lists[def.lcppListId]?.phase ?? null) : null,
      progressPercent: st?.progressPercent ?? 0,
      source: source && source in SOURCE_LABELS ? source : null,
      sourceLabel: source && source in SOURCE_LABELS ? SOURCE_LABELS[source] : null,
      lastCompletedPage: st?.lastCompletedPage ?? 0,
      totalPages: st?.totalPages ?? 0,
      lastWritten: detail && typeof detail.lastWritten === "number" ? detail.lastWritten : null,
      updatedAt: st?.updatedAt ?? null,
      nextCycleAt: nextCycleAt(id, def.lcppListId ? lcppRefISO() : (st?.updatedAt ?? null)),
      rows: await countRows(db, id),
      lockHeldBy,
      detail,
    };
  }

  return { running: running || lcpp.running, lists, lcpp };
}
