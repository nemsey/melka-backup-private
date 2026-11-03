/**
 * PN-050 · دستور ۵ — ژورنال سطح اپلیکیشن (دفاع در عمق)
 * ---------------------------------------------------------------------------
 * سناریوی D: kill -9 وسط batch سینک → بدون ژورنال، «آن batch چه شد؟»
 * بی‌پاسخ می‌ماند. با ژورنال:
 *   · پیش از batch      → upload/.runtime/journal/{batchId}.intent
 *   · پس از commit کامل → upload/.runtime/journal/{batchId}.committed
 *   · در بوت (startup)  → replayPendingBatches() — هر intentِ بدون committed
 *     دوباره اجرا می‌شود (upsertهای سینک ایدمپوتنت‌اند → همگرایی تضمینی).
 *
 * چرا upload/.runtime؟ لایهٔ پایدار (ossfs) — از kill -9 فرایند و ریست
 * نشست عبور می‌کند؛ دقیقاً همان چیزی که برای replay پس از رستاخیز لازم است.
 *
 * مرز صادقانه (درس PN-041-R): fsync دستی روی FUSE ممنوع (hang بی‌نهایت) —
 * writeFileSync ساده؛ kill فرایند فایل را نمی‌کُشد (فقط کرش ماشین — خارج از حوزه).
 *
 * قانون ۱۲ (PII): متا فقط شمارنده/شناسه — هرگز مقدار خام فیلدها.
 */

import fs from "fs";
import path from "path";

/** مسیر ژورنال — قابل تزریق برای تست */
export function journalDir(): string {
  return process.env.MELKA_JOURNAL_DIR ?? path.join(process.cwd(), "upload/.runtime/journal");
}

export type JournalKind = "melketun-sync" | "generic";

export interface JournalIntent {
  batchId: string;
  kind: JournalKind;
  startedAt: string; // ISO
  meta?: Record<string, unknown>;
}

export interface JournalCommitted extends JournalIntent {
  committedAt: string; // ISO
  outcome?: Record<string, unknown>;
}

/** نیت آغاز batch — پیش از هر نوشتن */
export function writeIntent(batchId: string, kind: JournalKind, meta?: Record<string, unknown>): JournalIntent {
  const dir = journalDir();
  fs.mkdirSync(dir, { recursive: true });
  const intent: JournalIntent = {
    batchId,
    kind,
    startedAt: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  };
  fs.writeFileSync(path.join(dir, `${batchId}.intent`), JSON.stringify(intent), "utf8");
  return intent;
}

/** ثبت تکمیل commit — پس از آخرین نوشتن موفق batch (سپس checkpointWal در فراخوان) */
export function writeCommitted(batchId: string, kind: JournalKind, outcome?: Record<string, unknown>): JournalCommitted {
  const dir = journalDir();
  fs.mkdirSync(dir, { recursive: true });
  const committed: JournalCommitted = {
    batchId,
    kind,
    startedAt: new Date().toISOString(), // اگر intent نبود هم معتبر بماند
    committedAt: new Date().toISOString(),
    ...(outcome ? { outcome } : {}),
  };
  fs.writeFileSync(path.join(dir, `${batchId}.committed`), JSON.stringify(committed), "utf8");
  return committed;
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/** batch های ناتمام — intent بدون committed (ترتیب قدیمی‌ترین اول) */
export function listPendingBatches(): JournalIntent[] {
  const dir = journalDir();
  if (!fs.existsSync(dir)) return [];
  const pending: JournalIntent[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".intent")) continue;
    const intent = readJson<JournalIntent>(path.join(dir, f));
    if (!intent?.batchId) continue;
    if (fs.existsSync(path.join(dir, `${intent.batchId}.committed`))) continue;
    pending.push(intent);
  }
  return pending.sort((a, b) => {
    if (a.startedAt === b.startedAt) return a.batchId < b.batchId ? -1 : 1; // tiebreak پایدار — درس تست PN-050
    return a.startedAt < b.startedAt ? -1 : 1;
  });
}

export interface ReplayResult {
  replayed: string[]; // batchId های دوباره-اجراشده و کامل‌شده
  failed: string[]; // شکست handler → می‌مانند برای بوت بعدی
  abandoned: string[]; // کهنه‌تر از ۴۸ ساعت — بایگانی (committed با پرچم abandoned)
}

export interface ReplayHandlers {
  /** اجرای دوبارهٔ batch — resolve یعنی موفق (committed می‌نویسد) · reject یعنی ناتمام می‌ماند */
  onBatch: (intent: JournalIntent) => Promise<void>;
  /** حداکثر عمر batch ناتمام پیش از بایگانی (پیش‌فرض ۴۸ ساعت — ضد حلقهٔ بی‌نهایت) */
  maxAgeMs?: number;
  /** ثبت رویداد — اختیاری (worker آن را به logger وصل می‌کند) */
  log?: (event: { level: "info" | "warn"; message: string; detail?: Record<string, unknown> }) => void;
}

/**
 * startup — وارسی ژورنال و اجرای دوبارهٔ batchهای ناتمام.
 * سناریوی D دستور ۶: sync در batch ۵ از ۱۰ · kill -9 → بوت بعدی همین تابع
 * batch را می‌بیند و دوباره اجرا می‌کند (ایدمپوتنت → هیچ داده‌ای گم نمی‌شود).
 */
export async function replayPendingBatches(handlers: ReplayHandlers): Promise<ReplayResult> {
  const maxAgeMs = handlers.maxAgeMs ?? 48 * 60 * 60 * 1000;
  const result: ReplayResult = { replayed: [], failed: [], abandoned: [] };
  const pending = listPendingBatches();
  if (pending.length === 0) return result;

  const now = Date.now();
  for (const intent of pending) {
    const ageMs = now - new Date(intent.startedAt).getTime();
    if (ageMs > maxAgeMs) {
      // کهنه — بایگانی تا هر بوت دوباره نچرخد (committed با پرچم abandoned)
      writeCommitted(intent.batchId, intent.kind, { abandoned: true, reason: "stale-intent", ageMs });
      result.abandoned.push(intent.batchId);
      handlers.log?.({ level: "warn", message: `[journal] batch کهنه بایگانی شد: ${intent.batchId}`, detail: { ageMs } });
      continue;
    }
    try {
      await handlers.onBatch(intent);
      writeCommitted(intent.batchId, intent.kind, { replayed: true });
      result.replayed.push(intent.batchId);
      handlers.log?.({ level: "info", message: `[journal] batch ناتمام دوباره اجرا و کامل شد: ${intent.batchId}` });
    } catch (e) {
      // ناتمام می‌ماند — بوت بعدی دوباره می‌کوشد (تا سقف عمر)
      result.failed.push(intent.batchId);
      handlers.log?.({
        level: "warn",
        message: `[journal] replay ناتمام: ${intent.batchId}`,
        detail: { reason: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
      });
    }
  }
  return result;
}
