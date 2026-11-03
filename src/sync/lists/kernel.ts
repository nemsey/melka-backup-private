/**
 * kernel.ts — PN-051 · فرمان ۴/۵ — هستهٔ مشترک خط‌لوله‌های فهرست (LCPP)
 * ---------------------------------------------------------------------------
 * ابزارهای مشترک پنج ماژول مستقل فهرست (M1/M2/M7/M8/M9):
 *   ۱) SqlBulkWriter  — SQLite خام (سازگار دو-درایوره — پایین) · upsert انبوه با
 *                       Chunkهای ۵۰۰تایی (خط قرمز: Prisma در حلقه‌های تکراری ممنوع)
 *                       INSERT … ON CONFLICT(natural_key) DO UPDATE با محافظ
 *                       «null هرگز روی پر نمی‌نشیند» (قانون ۰۴) — CHECKPOINT پس از
 *                       هر Chunk = کامیت تراکنش همان Chunk (قانون بقا ۲)
 *   ۲) runPool        — p-limit(3) + تأخیر تطبیقی: موفقیت → ۲۰٪ کم (کف ۱۰۰ms) ·
 *                       429/5xx → ۵۰٪ بیشتر (سقف ۲s) (خط قرمز: بیش از ۵ ممنوع)
 *   ۳) DeltaState     — فرمان ۵: lastSyncTime + هش صفحات (MD5) — صفحهٔ بی‌تغییر =
 *                       صفر نوشتن DB
 *   ۴) LcppStatus     — وضعیت فاز A/B برای نشانگر UI (فرمان ۴ بند ۴)
 *
 * ⊙ سازگاری درایور (ADR-051-03 · درس زندهٔ تست ۲۰۲۶-۱۰-۲۸):
 *   better-sqlite3 v13 در Bun v1.3.14 با NAPI FATAL می‌اشکند (شاهد bun.report)
 *   ولی در Node v24 سالم است؛ Worker ملکا روی Bun اجراست (1-web-1-worker).
 *   درمان: درایور دوجهته — در Bun: ماژول بومی «bun:sqlite» (همان کلاس ابزارِ
 *   خام/همگام/تراکنشی = همان مقصود حکم)، در Node: better-sqlite3.
 *   بارگذاری فقط لحظهٔ ساخت نویسنده (نه سطح-ماژول) — کدهای UI/route هرگز
 *   ماژول بومی را لود نمی‌کنند. SQL هر دو درایور یکسان است (SQLite استاندارد).
 *
 * قوانین حاکم:
 *   · ۰۴ null-on-nonnull ممنوع (CASE WHEN در SQL) · ۱۴ additive-only (صفر DELETE)
 *   · بقا ۲: WAL + synchronous=FULL + wal_autocheckpoint=100 + commit-per-chunk
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pLimit from "p-limit";

// ───────────────────────── مسیرها (تنبل — قابل ایزوله در تست) ─────────────────────────

const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";

/** دایرکتوری فایل‌های وضعیت/delta — لحظهٔ فراخوانی حل می‌شود (تست: MELK_LCPP_RUNTIME_DIR) */
function runtimeDir(): string {
  return process.env.MELK_LCPP_RUNTIME_DIR ?? join(REPO_ROOT, "upload", ".runtime");
}
function statusPath(): string {
  return join(runtimeDir(), "lcpp-status.json");
}
function deltaPath(): string {
  return join(runtimeDir(), "lcpp-delta.json");
}
function forceFlagPath(): string {
  return join(runtimeDir(), "lcpp-force.flag");
}

/** حل مسیر دیتابیس زنده — همان قرارداد liveDbPath (jobs.ts · PN-041-R فاز ۴) */
export function liveDbPath(): string {
  const envUrl = process.env.DATABASE_URL ?? "";
  if (envUrl.startsWith("file:")) {
    const bare = envUrl.slice(5).split("?")[0];
    if (bare && !bare.includes("test")) return bare;
  }
  return join(REPO_ROOT, "db", "custom.db");
}

/** اندازهٔ Chunk — عین حکم فرمان ۴: ۵۰۰تایی */
export const CHUNK_SIZE = 500;
/** سقف همزمانی — عین حکم فرمان ۴ (۳ · خط قرمز ≤۵) */
export const CONCURRENCY = 3;

// ───────────────────────── رابط ساختاری SQLite دو-درایوره ─────────────────────────

/** کدک مقدار → بایند SQLite — سازگار با ذخیره‌سازی Prisma:
 *  DateTime = INTEGER epoch-ms · Boolean = INTEGER 0/1 (شاهد: typeof(syncedAt)→integer) */
export function sqlValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? Math.round(t) : null;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

interface StatementLike {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}
interface DatabaseLike {
  prepare(sql: string): StatementLike;
  exec(sql: string): unknown;
  transaction<T2>(fn: (arg: T2) => unknown): (arg: T2) => unknown;
  close(): void;
}

/** سازندهٔ درایور متناسب با ران‌تایم (ADR-051-03) — بارگذاری تنبلِ ناهمگام.
 *  import با شناسهٔ متغیر — از گراف باندلر Turbopack پنهان (مسیر Node هرگز
 *  bun:sqlite را رزولو نمی‌کند؛ مسیر Bun هرگز better-sqlite3 را لود نمی‌کند). */
let driverCtor: (new (p: string) => DatabaseLike) | null = null;
let driverLoading: Promise<void> | null = null;

async function loadDriver(): Promise<void> {
  if (driverCtor) return;
  if (!driverLoading) {
    driverLoading = (async () => {
      const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
      if (isBun) {
        const modId = ["bun", "sqlite"].join(":"); // turbopackIgnore: شناسهٔ متغیر
        const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ modId)) as unknown as {
          Database: new (p: string) => DatabaseLike;
        };
        driverCtor = mod.Database;
        return;
      }
      const mod = (await import("better-sqlite3")) as unknown as {
        default: new (p: string) => DatabaseLike;
      };
      driverCtor = mod.default;
    })();
  }
  await driverLoading;
}

/** کارخانهٔ نویسندهٔ Bulk — گاتوی رسمی ساخت (ران‌تایم‌آمین · درایور پیش‌لود) */
export async function createBulkWriter(dbPath = liveDbPath()): Promise<SqlBulkWriter> {
  await loadDriver();
  const Ctor = driverCtor as (new (p: string) => DatabaseLike);
  return new SqlBulkWriter(new Ctor(dbPath));
}

// ───────────────────────── ۱) نویسندهٔ Bulk خام ─────────────────────────

export interface BulkTableSpec {
  /** نام فیزیکی جدول SQLite */
  table: string;
  /** کلید طبیعی → ستون ON CONFLICT (باید UNIQUE index داشته باشد) */
  naturalKey: string;
  /** ستون‌های قابل‌نوشتن با سینک فهرست — whitelist (ستون‌های مقدس غایبند) */
  columns: readonly string[];
  /** ستون‌های متادیتای سینک که همروط بازنویسی می‌شوند */
  metaColumns?: readonly string[];
}

export interface BulkUpsertResult {
  written: number;
  chunks: number;
  durationMs: number;
  lastError: string | null;
}

/**
 * محافظ قانون ۰۴ در سطح SQL:
 *   SET col = CASE WHEN excluded.col IS NULL OR excluded.col = '' THEN Table.col ELSE excluded.col END
 * رشتهٔ خالی مثل null (هم‌ارز normValue در merge.ts).
 */
function coalesceExpr(table: string, col: string): string {
  return `${col} = CASE WHEN excluded.${col} IS NULL OR excluded.${col} = '' THEN ${table}.${col} ELSE excluded.${col} END`;
}

/** نویسندهٔ Bulk — یک اتصال با کشِ statement آماده (دو-درایوره · ADR-051-03) */
export class SqlBulkWriter {
  private db: DatabaseLike;
  private stmtCache = new Map<string, StatementLike>();

  /** سازندهٔ داخلی — گاتوی رسمی: createBulkWriter (درایور متناسب با ران‌تایم) */
  constructor(db: DatabaseLike) {
    this.db = db;
    // قانون بقا ۲ — عین ensureDurabilityPragmas (PN-050 دستور ۵)
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA wal_autocheckpoint = 100");
    this.db.exec("PRAGMA busy_timeout = 30000"); // صلح با اتصال Prisma سرور/Worker
  }

  private stmt(spec: BulkTableSpec): StatementLike {
    const key = `${spec.table}:${spec.columns.join(",")}:${spec.metaColumns?.join(",") ?? ""}`;
    let s = this.stmtCache.get(key);
    if (!s) {
      // کلید طبیعی همیشه در INSERT است (نه در SET — مقدارش با رکورد ثابت می‌ماند)
      const cols = [spec.naturalKey, ...spec.columns, ...(spec.metaColumns ?? [])]
        .filter((c, i, arr) => arr.indexOf(c) === i);
      const placeholders = cols.map(() => "?").join(", ");
      const updates = spec.columns.map((c) => coalesceExpr(spec.table, c)).join(", ");
      const sql =
        `INSERT INTO ${spec.table} (${cols.join(", ")}) VALUES (${placeholders}) ` +
        `ON CONFLICT(${spec.naturalKey}) DO UPDATE SET ${updates}`;
      s = this.db.prepare(sql);
      this.stmtCache.set(key, s);
    }
    return s;
  }

  /**
   * Bulk Upsert — Chunkهای ۵۰۰تایی، هر Chunk یک تراکنش (= Checkpoint عین قانون بقا ۲).
   * شکست Chunk = کامیت‌نشده = صفر اثر جزئی (اتمی) — خطا به بالا می‌رود.
   */
  upsertBulk(
    spec: BulkTableSpec,
    rows: Array<Record<string, unknown>>,
    onChunk?: (done: number, total: number) => void
  ): BulkUpsertResult {
    const started = Date.now();
    const result: BulkUpsertResult = { written: 0, chunks: 0, durationMs: 0, lastError: null };
    if (rows.length === 0) return result;
    const statement = this.stmt(spec);
    const cols = [spec.naturalKey, ...spec.columns, ...(spec.metaColumns ?? [])]
      .filter((c, i, arr) => arr.indexOf(c) === i);
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      try {
        const tx = this.db.transaction((items: Array<Record<string, unknown>>) => {
          for (const row of items) {
            statement.run(...cols.map((c) => sqlValue(row[c])));
          }
        });
        tx(chunk);
        result.chunks += 1;
        result.written += chunk.length;
        onChunk?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
      } catch (e) {
        result.lastError = String(e).slice(0, 300);
        result.durationMs = Date.now() - started;
        throw e;
      }
    }
    result.durationMs = Date.now() - started;
    return result;
  }

  /** آیا رکوردی با این کلید طبیعی وجود دارد؟ */
  exists(spec: BulkTableSpec, key: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM ${spec.table} WHERE ${spec.naturalKey} = ? LIMIT 1`).get(key);
    return row !== undefined && row !== null;
  }

  /** مقادیر فعلی ستون‌ها برای مقایسهٔ delta در سطح ردیف */
  currentValues(spec: BulkTableSpec, key: string, columns: readonly string[]): Record<string, unknown> | null {
    const sql = `SELECT ${columns.join(", ")} FROM ${spec.table} WHERE ${spec.naturalKey} = ? LIMIT 1`;
    return (this.db.prepare(sql).get(key) as Record<string, unknown> | undefined) ?? null;
  }

  /** پرس‌وجوی خام خواندنی (فقط SELECT — گارد ساختاری) */
  rawAll<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): T[] {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error("rawAll: only SELECT allowed");
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
    this.stmtCache.clear();
  }
}

// ───────────────────────── ۲) استخر همزمانی + تأخیر تطبیقی ─────────────────────────

export interface PoolStats {
  processed: number;
  failures: number;
  delayMs: number;
}

/** اجرای موازی با سقف ۳ (خط قرمز ≤۵) و تأخیر تطبیقی 429→×۱٫۵ · موفقیت→×۰٫۸ */
export async function runPool<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  opts: { concurrency?: number; initialDelayMs?: number } = {}
): Promise<PoolStats> {
  const limit = pLimit(Math.min(opts.concurrency ?? CONCURRENCY, 5));
  const stats: PoolStats = { processed: 0, failures: 0, delayMs: opts.initialDelayMs ?? 200 };
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const tasks = items.map((item, index) =>
    limit(async () => {
      await sleep(stats.delayMs); // ادب پیش از هر فراخوانی (نرخ‌محدود)
      try {
        await worker(item, index);
        stats.delayMs = Math.max(100, stats.delayMs * 0.8); // موفق → شتاب
      } catch (e) {
        stats.failures += 1;
        const msg = String((e as Error | undefined)?.message ?? e);
        if (/\b(429|5\d\d)\b/.test(msg) || /timeout|aborted/i.test(msg)) {
          stats.delayMs = Math.min(2000, stats.delayMs * 1.5); // فشار → عقب‌کشی
        }
      } finally {
        stats.processed += 1;
      }
    })
  );
  await Promise.all(tasks);
  return stats;
}

// ───────────────────────── ۳) وضعیت Delta (فرمان ۵) ─────────────────────────

interface DeltaFile {
  version: 1;
  lists: Record<string, { lastSyncAt: string; pages: Record<string, string> }>;
}

function readDelta(): DeltaFile {
  try {
    if (existsSync(deltaPath())) {
      const d = JSON.parse(readFileSync(deltaPath(), "utf8")) as DeltaFile;
      if (d && d.version === 1) return d;
    }
  } catch { /* خواندن شکست → شروع تازه */ }
  return { version: 1, lists: {} };
}

function writeDelta(d: DeltaFile): void {
  mkdirSync(runtimeDir(), { recursive: true });
  writeFileSync(deltaPath(), JSON.stringify(d, null, 1), "utf8");
}

export interface DeltaTracker {
  lastSyncAt(): Date | null;
  pageUnchanged(listId: string, pageKey: string, payload: unknown): boolean;
  commit(listId: string): void;
}

export function openDelta(listId: string): DeltaTracker {
  return {
    lastSyncAt() {
      const d = readDelta();
      const iso = d.lists[listId]?.lastSyncAt;
      return iso ? new Date(iso) : null;
    },
    pageUnchanged(id: string, pageKey: string, payload: unknown): boolean {
      const d = readDelta();
      const md5 = createHash("md5").update(JSON.stringify(payload)).digest("hex");
      const prev = d.lists[id]?.pages?.[pageKey];
      if (prev && prev === md5) return true; // بی‌تغییر — صفر نوشتن
      const entry = d.lists[id] ?? { lastSyncAt: "", pages: {} };
      entry.pages[pageKey] = md5;
      const keys = Object.keys(entry.pages);
      if (keys.length > 500) for (const k of keys.slice(0, keys.length - 500)) delete entry.pages[k];
      d.lists[id] = entry;
      writeDelta(d);
      return false;
    },
    commit(id: string) {
      const d = readDelta();
      const entry = d.lists[id] ?? { lastSyncAt: "", pages: {} };
      entry.lastSyncAt = new Date().toISOString();
      d.lists[id] = entry;
      writeDelta(d);
    },
  };
}

// ───────────────────────── ۴) وضعیت فاز A/B برای UI (فرمان ۴ بند ۴) ─────────────────────────

export type LcppPhase = "idle" | "fast-pass" | "deep-pass" | "done" | "error";

export interface LcppListStatus {
  list: string;
  phase: LcppPhase;
  label: string;
  progressPct: number;
  fetched: number;
  written: number;
  skippedUnchanged: number;
  durationMs: number;
  updatedAt: string;
  error?: string;
}

export interface LcppStatusFile {
  version: 1;
  cycleId: string;
  running: boolean;
  phase: LcppPhase;
  startedAt: string | null;
  finishedAt: string | null;
  lists: Record<string, LcppListStatus>;
}

export const PHASE_LABELS: Record<LcppPhase, string> = {
  idle: "آماده",
  "fast-pass": "در حال دریافت اطلاعات حیاتی…",
  "deep-pass": "در حال تکمیل جزئیات…",
  done: "همگام‌سازی کامل شد",
  error: "خطا در همگام‌سازی",
};

function readStatus(): LcppStatusFile {
  try {
    if (existsSync(statusPath())) {
      const s = JSON.parse(readFileSync(statusPath(), "utf8")) as LcppStatusFile;
      if (s && s.version === 1) return s;
    }
  } catch { /* تازه */ }
  return { version: 1, cycleId: "", running: false, phase: "idle", startedAt: null, finishedAt: null, lists: {} };
}

function writeStatus(s: LcppStatusFile): void {
  mkdirSync(runtimeDir(), { recursive: true });
  writeFileSync(statusPath(), JSON.stringify(s, null, 1), "utf8");
}

/** به‌روزرسانی وضعیت یک فهرست (merge — نه بازنویسی) */
export function updateListStatus(list: string, patch: Partial<LcppListStatus> & { phase: LcppPhase }): void {
  try {
    const s = readStatus();
    const prev = s.lists[list] ?? {
      list, phase: "idle" as LcppPhase, label: PHASE_LABELS.idle, progressPct: 0,
      fetched: 0, written: 0, skippedUnchanged: 0, durationMs: 0, updatedAt: "",
    };
    s.lists[list] = { ...prev, ...patch, list, label: PHASE_LABELS[patch.phase], updatedAt: new Date().toISOString() };
    if (patch.phase === "fast-pass" || patch.phase === "deep-pass") s.phase = patch.phase;
    writeStatus(s);
  } catch { /* وضعیت UI هرگز سینک را نمی‌شکند */ }
}

export function markCycleStart(cycleId: string): void {
  const s = readStatus();
  s.cycleId = cycleId;
  s.running = true;
  s.phase = "fast-pass";
  s.startedAt = new Date().toISOString();
  s.finishedAt = null;
  writeStatus(s);
}

export function markCycleEnd(phase: "done" | "error"): void {
  const s = readStatus();
  s.running = false;
  s.phase = phase;
  s.finishedAt = new Date().toISOString();
  writeStatus(s);
}

export function readLcppStatus(): LcppStatusFile {
  return readStatus();
}

// ───────────────────────── فرمان دستی مالک (فرمان ۷ — Force Refresh) ─────────────────────────

/** درخواست اجرای فوری چرخهٔ بعدی Worker (پرچم — lcppWatch در ≤۶۰ث برمی‌دارد) */
export function requestForceRefresh(): boolean {
  try {
    mkdirSync(runtimeDir(), { recursive: true });
    writeFileSync(forceFlagPath(), new Date().toISOString(), "utf8");
    return true;
  } catch {
    return false;
  }
}

/** آیا پرچم درخواست فوری هست و تازه است؟ (≤۵ دقیقه) */
export function peekForceRefresh(): boolean {
  try {
    if (!existsSync(forceFlagPath())) return false;
    const ts = readFileSync(forceFlagPath(), "utf8").trim();
    const age = Date.now() - new Date(ts).getTime();
    if (!Number.isFinite(age) || age > 5 * 60_000) return false;
    return true;
  } catch {
    return false;
  }
}

/** پاک‌سازی پرچم پس از شروع چرخهٔ اجباری (Worker) */
export function clearForceRefresh(): void {
  try {
    if (existsSync(forceFlagPath())) unlinkSync(forceFlagPath());
  } catch { /* بی‌اهمیت */ }
}
