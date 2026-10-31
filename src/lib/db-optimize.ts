/**
 * PN-041-R (شورا-ن۰۶۸ · فاز ۴) — بهینه‌سازی SQLite در هر بوت
 * ---------------------------------------------------------------------------
 * بند ۴.۱/۴.۲/۴.۳ سند: چهار پراگمای مصوب شورا:
 *   · busy_timeout = 10000  — مهلت قفل نوشتن (۱۰ ثانیه)
 *   · cache_size   = -20000 — کش ۲۰MB
 *   · mmap_size    = 268435456 — mmap ۲۵۶MB (خواندن سریع‌تر DB ۴۰۰MB)
 *   · synchronous  = NORMAL  — تعادل ایمنی/سرعت (استاندارد WAL)
 * + wal_autocheckpoint=1000 — WAL جمع نمی‌شود (چک‌پوینت هر ۱۰۰۰ صفحه)
 *
 * اجرا از instrumentation.register() — پیش از نخستین کوئری واقعی.
 * اتصال یگانه (DATABASE_URL × connection_limit=1) ⇒ پراگماها برای کل
 * عمر پروسه روی «همان» اتصال چسبیده می‌مانند (شورا-ن۰۶۸).
 * journal_mode=WAL خودش در فایل ماندگار است (ensure-wal.ts نگهبان).
 *
 * شکست هر پراگما هرگز بوت را نمی‌شکند (بهترین-تلاش + شاهد لاگ).
 */

export interface SqliteOptimizeResult {
  ok: boolean;
  applied: string[];
  failed: string[];
  journalMode: string | null;
  note: string;
}

const PRAGMAS: ReadonlyArray<{ sql: string; label: string }> = [
  { sql: "PRAGMA busy_timeout=10000", label: "busy_timeout=10000" },
  { sql: "PRAGMA cache_size=-20000", label: "cache_size=-20000 (20MB)" },
  { sql: "PRAGMA mmap_size=268435456", label: "mmap_size=268435456 (256MB)" },
  { sql: "PRAGMA synchronous=NORMAL", label: "synchronous=NORMAL" },
  { sql: "PRAGMA wal_autocheckpoint=1000", label: "wal_autocheckpoint=1000" },
];

export async function optimizeSqliteOnBoot(prisma?: { $queryRawUnsafe: (q: string) => Promise<unknown> }): Promise<SqliteOptimizeResult> {
  const result: SqliteOptimizeResult = {
    ok: true,
    applied: [],
    failed: [],
    journalMode: null,
    note: "PN-041-R فاز ۴ — پراگماهای شورا-ن۰۶۸ روی اتصال یگانه",
  };
  const db = prisma ?? (await (await import("@/lib/db")).db);
  for (const p of PRAGMAS) {
    try {
      await db.$queryRawUnsafe(p.sql);
      result.applied.push(p.label);
    } catch {
      result.failed.push(p.label);
      result.ok = false;
    }
  }
  try {
    // ENGINE: sqlite-only (پراگمای sqlite — سوییچ PN-022-C)
    const mode = (await db.$queryRawUnsafe("PRAGMA journal_mode")) as Array<{ journal_mode?: string }>;
    result.journalMode = String(mode?.[0]?.journal_mode ?? "unknown");
  } catch {
    result.journalMode = null;
  }
  return result;
}
