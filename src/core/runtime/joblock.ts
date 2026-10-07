/**
 * JobLock — قفل کار توزیع‌شده با ضربان قلب (PN-010 / BLOCK 2)
 * ---------------------------------------------------------------------------
 * مسئله: پس از فاز ۲، Worker و Web دو فرایند جدا هستند؛ اگر هر دو (یا دو
 * نمونه Worker) همزمان زنده باشند، یک کار (مثلاً چرخهٔ کاتالوگ یا آینه)
 * نباید دوبار اجرا شود.
 *
 * راه‌حل: قفل ردیفی در جدول JobLock (SQLite → constraint یکتایی jobId):
 *   acquire(jobId)     — تلاش برای تصاحب؛ ردیفِ منقضی = متروکه (قابل تصرف)
 *   heartbeat(jobId)   — تمدید انقضا (فقط با instanceId خودِ دارنده)
 *   release(jobId)     — آزادسازی (فقط با instanceId خودِ دارنده)
 *   cleanup()          — حذف قفل‌های منقضی (جاروی دوره‌ای)
 *   withLock(jobId,fn) — الگوی امن: قفل → ضربان ۳۰ ثانیه → اجرا → رهاسازی
 *
 * قید شورا (جلسهٔ ۰۱۰، بند ۲.۳): ضربان قلب هر ۳۰ ثانیه؛ کار تمام‌شده = رهاسازی.
 *
 * خودترمیمی: بسته‌های بقا (پیش از PN-010) جدول JobLock ندارند؛ پس از بازیابی
 * محیط، ensureJobLockTable() جدول را در نخستین دسترسی می‌سازد (DDL یکسان با
 * خروجی prisma db push — شاهد در تست‌ها) و بوت هرگز به‌خاطر «جدول مفقود» نمی‌میرد.
 */

import type { PrismaClient } from "@prisma/client";

/** ضربان قلب پیش‌فرض — بند ۲.۳ دستور: هر ۳۰ ثانیه */
export const HEARTBEAT_INTERVAL_MS_DEFAULT = 30_000;
/** TTL پیش‌فرض قفل: ۳ ضربان (۹۰ ثانیه) — بدون ۳ ضربان پیاپی = متروکه */
export const LOCK_TTL_MS_DEFAULT = 3 * HEARTBEAT_INTERVAL_MS_DEFAULT;

/** DDL یکسان با خروجی prisma db push (شاهد: sqlite_master، تست ۲-۱۴) */
const JOBLOCK_DDL = `CREATE TABLE IF NOT EXISTS "JobLock" (
    "jobId" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "metadata" TEXT
)`;
const JOBLOCK_INDEX_DDL = `CREATE INDEX IF NOT EXISTS "JobLock_expiresAt_idx" ON "JobLock"("expiresAt")`;

export interface AcquireOptions {
  /** مدت اعتبار قفل از لحظهٔ تصاحب/ضربان (پیش‌فرض ۹۰ ثانیه) */
  ttlMs?: number;
  /** بارگذاری آزاد — JSON رشته‌شده؛ هرگز راز */
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface AcquireResult {
  acquired: boolean;
  /** علت رد در صورت عدم تصرف: held (زنده) | raced (رقابت باخت) */
  reason?: "held" | "raced";
  /** دارندهٔ فعلی قفل در صورت رد */
  holder?: { instanceId: string; expiresAt: Date; metadata: string | null };
}

const g = globalThis as unknown as { __melkJobLockTablesReady?: Set<string>; __melkBootId?: string };

/** شناسهٔ نمونه — یکتا به ازای هر فرایند/سرویس (pid + شناسهٔ تصادفی بوت) */
export function generateInstanceId(prefix = "inst"): string {
  const boot = g.__melkBootId ?? (g.__melkBootId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  return `${prefix}:${process.pid}:${boot}`;
}

/**
 * ساخت جدول در صورت نبود — مکانیزم بقای بازیابی (DB بازیابی‌شده از بستهٔ
 * بقای پیش-PN-010 فاقد JobLock است). DDL با IF NOT EXISTS همیشه ایمن و
 * ارزان است (SQLite، زیر میلی‌ثانیه) — بدون memoization چون جدول ممکن
 * است در طول عمر فرایند حذف/بازیابی شود (آزمون ۲-۱۵).
 */
export async function ensureJobLockTable(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(JOBLOCK_DDL);
  await db.$executeRawUnsafe(JOBLOCK_INDEX_DDL);
}

export class JobLockService {
  constructor(
    private readonly db: PrismaClient,
    private readonly instanceId: string = generateInstanceId("inst"),
  ) {}

  /** بند ۲.۲ — تلاش برای گرفتن قفل */
  async acquire(jobId: string, options?: AcquireOptions): Promise<AcquireResult> {
    await ensureJobLockTable(this.db);
    const now = options?.now ?? new Date();
    const ttl = options?.ttlMs ?? LOCK_TTL_MS_DEFAULT;
    const expiresAt = new Date(now.getTime() + ttl);
    const metadata = options?.metadata === undefined ? null : JSON.stringify(options.metadata);

    // ۱) تلاش مستقیم — برندهٔ constraint یکتایی = دارندهٔ قفل
    try {
      await this.db.jobLock.create({
        data: { jobId, instanceId: this.instanceId, acquiredAt: now, lastHeartbeat: now, expiresAt, metadata },
      });
      return { acquired: true };
    } catch (e) {
      const msg = String(e);
      const unique = msg.includes("Unique constraint") || msg.includes("PRIMARY KEY");
      if (!unique) throw e;
    }

    // ۲) قفل موجود — زنده است یا متروکه؟
    const existing = await this.db.jobLock.findUnique({ where: { jobId } });
    if (!existing) return { acquired: false, reason: "raced" }; // در فاصلهٔ خواندن آزاد شد → تلاش بعدی
    if (existing.expiresAt.getTime() > now.getTime()) {
      return { acquired: false, reason: "held", holder: { instanceId: existing.instanceId, expiresAt: existing.expiresAt, metadata: existing.metadata } };
    }

    // ۳) متروکه — جارو و تصرف (حذف شرطی فقط ردیف منقضی را می‌گیرد؛ برندهٔ حذف = برندهٔ قفل)
    const removed = await this.db.jobLock.deleteMany({
      where: { jobId, expiresAt: { lt: now } },
    });
    if (removed.count < 1) {
      // نمونهٔ دیگری زودتر متروکه را تصرف کرد
      const holder = await this.db.jobLock.findUnique({ where: { jobId } });
      return { acquired: false, reason: "raced", holder: holder ? { instanceId: holder.instanceId, expiresAt: holder.expiresAt, metadata: holder.metadata } : undefined };
    }
    try {
      await this.db.jobLock.create({
        data: { jobId, instanceId: this.instanceId, acquiredAt: now, lastHeartbeat: now, expiresAt, metadata },
      });
      return { acquired: true };
    } catch {
      return { acquired: false, reason: "raced" };
    }
  }

  /** بند ۲.۲ — تمدید قفل (فقط دارندهٔ واقعی) */
  async heartbeat(jobId: string, options?: { ttlMs?: number; now?: Date }): Promise<boolean> {
    const now = options?.now ?? new Date();
    const ttl = options?.ttlMs ?? LOCK_TTL_MS_DEFAULT;
    const res = await this.db.jobLock.updateMany({
      where: { jobId, instanceId: this.instanceId },
      data: { lastHeartbeat: now, expiresAt: new Date(now.getTime() + ttl) },
    });
    return res.count > 0;
  }

  /** بند ۲.۲ — آزادسازی (فقط دارندهٔ واقعی) */
  async release(jobId: string, options?: { now?: Date }): Promise<boolean> {
    await ensureJobLockTable(this.db);
    const res = await this.db.jobLock.deleteMany({
      where: { jobId, instanceId: this.instanceId },
    });
    return res.count > 0;
  }

  /** بند ۲.۲ — پاک‌سازی قفل‌های منقضی (جاروی دوره‌ای) */
  async cleanup(options?: { now?: Date }): Promise<number> {
    await ensureJobLockTable(this.db);
    const now = options?.now ?? new Date();
    const res = await this.db.jobLock.deleteMany({ where: { expiresAt: { lt: now } } });
    return res.count;
  }

  /** قفل زندهٔ دیگری دارد؟ (پرس‌وجوی وضعیت — بدون تصرف) */
  async holderOf(jobId: string): Promise<{ instanceId: string; expiresAt: Date; metadata: string | null; stale: boolean } | null> {
    const row = await this.db.jobLock.findUnique({ where: { jobId } });
    if (!row) return null;
    return { instanceId: row.instanceId, expiresAt: row.expiresAt, metadata: row.metadata, stale: row.expiresAt.getTime() <= Date.now() };
  }

  get id(): string {
    return this.instanceId;
  }
}

export interface WithLockOptions extends AcquireOptions {
  heartbeatIntervalMs?: number;
}

/**
 * بند ۲.۳ — الگوی اجرای امن کار:
 *   قفل بگیر → هر ۳۰ ثانیه ضربان بزن → کار را اجرا کن → (موفق یا خطا) قفل را رها کن.
 * اگر قفل تصاحب نشد → کار اجرا نمی‌شود (نمونهٔ دیگر در حال اجراست).
 */
export async function withLock<T>(
  db: PrismaClient,
  jobId: string,
  fn: () => Promise<T>,
  options?: WithLockOptions & { service?: JobLockService },
): Promise<{ ran: boolean; result?: T; reason?: string }> {
  const svc = options?.service ?? new JobLockService(db);
  const acq = await svc.acquire(jobId, { ttlMs: options?.ttlMs, metadata: options?.metadata });
  if (!acq.acquired) return { ran: false, reason: acq.reason ?? "held" };

  const hbMs = options?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS_DEFAULT;
  const timer = setInterval(() => {
    void svc.heartbeat(jobId, { ttlMs: options?.ttlMs }).catch(() => {
      // ضربان شکست‌خورده = قفل ممکن است منقضی شود؛ کار ادامه می‌یابد
      // (خطر اجرای موازی ناچیز است — TTL سه ضربان طول می‌کشد)
    });
  }, hbMs);

  try {
    const result = await fn();
    return { ran: true, result };
  } finally {
    clearInterval(timer);
    await svc.release(jobId).catch(() => undefined);
  }
}
