/**
 * session.ts — کاشی «تغییرات» · گام سوم (DIR-CHANGES-TILE-001)
 * ---------------------------------------------------------------------------
 * «حالت تمام‌ظرفیت» — دو ستون دستور مالک:
 *   اولاً) وقتی از قابلیت ثبت/ایجاد کد استفاده می‌شود، تمام ظرفیت ترموکس در
 *           اختیار این کاشی قرار بگیرد و بروزرسانی فهرست‌ها متوقف شود.
 *   ثانیاً) این کاشی از طریق ترموکس به‌سرعت و بدون مشکل تغییرات مالک را در
 *           سامانه ARM ایجاد کند.
 *
 * مکانیک (سرور):
 *   · فایل نشست: upload/.runtime/changes-session.json (عین الگوی پرچم‌های force)
 *   · گیت توقف فهرست‌ها: runLcppCycle · catalogDaemonTick · runExpertsListUpdate
 *     در آغاز کار خود نشست تازه را چک می‌کنند → { skipped: "changes-session" }
 *   · گیت ظرفیت رله: claimRelayBatch در نشست فعال فقط آیتم‌های اولویت ≥ تعاملی
 *     (۵) جلا می‌کند — کارهای انبوهِ صف‌شده پیش از نشست صبر می‌کنند؛ آیتم‌های
 *     کاشی تغییرات با اولویت ۱۰ مقدم بر همه‌اند (relay.ts).
 *   · انقضای خودکار: حداکثر ۳۰ دقیقه — فراموشی «پایان» هرگز سینک را گیر
 *     نمی‌اندازد (محافظ — همان فلسفهٔ TTL پرچم‌های force).
 *
 * قانون دادهٔ مقدس: این ماژول هیچ داده‌ای حذف نمی‌کند؛ فقط اجرای «چرخهٔ
 * بعدی» را به تعویق می‌اندازد. صف رله هم فقط اولویت‌بندی می‌شود، نه پاک‌سازی.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { CHANGES_SESSION_FILE, CHANGES_SESSION_MAX_MS, OWNER_IDENTITY, type ChangesSessionFile } from "./variables";

/** دایرکتوری اجرایی — عین kernel.ts/four-lists.ts (پرچم‌های force) */
function runtimeDir(): string {
  return process.env.MELK_LCPP_RUNTIME_DIR ?? join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "upload", ".runtime");
}

function sessionPath(): string {
  return join(runtimeDir(), CHANGES_SESSION_FILE);
}

/** خواندن نشست — منقضی یا خراب = null (خوددرمانی) */
export function readChangesSession(now: Date = new Date()): ChangesSessionFile | null {
  try {
    if (!existsSync(sessionPath())) return null;
    const raw = JSON.parse(readFileSync(sessionPath(), "utf8")) as ChangesSessionFile;
    if (!raw || raw.version !== 1 || !raw.startedAt || !raw.expiresAt) return null;
    // انقضای خودکار — محافظ فراموشی «پایان»
    if (new Date(raw.expiresAt).getTime() <= now.getTime()) return null;
    return raw;
  } catch {
    return null;
  }
}

/** آیا حالت تمام‌ظرفیت فعال است؟ — گیت مشترک چرخه‌های فهرست و رله */
export function isChangesSessionActive(now: Date = new Date()): boolean {
  return readChangesSession(now) !== null;
}

/** نمای خواندنی برای UI — شامل شمارش معکوس انقضا */
export function changesSessionView(now: Date = new Date()): {
  active: boolean;
  session: ChangesSessionFile | null;
  expiresInMs: number | null;
} {
  const session = readChangesSession(now);
  if (!session) return { active: false, session: null, expiresInMs: null };
  return { active: true, session, expiresInMs: new Date(session.expiresAt).getTime() - now.getTime() };
}

/** شمارنده‌های لحظه‌ای صف رله — شاهد اختصاص ظرفیت */
async function queueCounts(db: PrismaClient): Promise<{ pending: number; dispatched: number }> {
  const [pending, dispatched] = await Promise.all([
    db.relayQueue.count({ where: { status: "pending" } }),
    db.relayQueue.count({ where: { status: "dispatched" } }),
  ]).catch(() => [0, 0] as const);
  return { pending, dispatched };
}

/**
 * شروع حالت تمام‌ظرفیت — ONLY مالک.
 * فایل نشست می‌نویسد؛ چرخه‌های بعدی فهرست‌ها خودکار متوقف می‌شوند و
 * رله فقط آیتم‌های تعاملی/کاشی جلا می‌کند.
 */
export async function beginChangesSession(
  db: PrismaClient,
  actor: { code: string; name: string },
  note = "",
): Promise<{ ok: boolean; alreadyActive: boolean; session: ChangesSessionFile }> {
  const existing = readChangesSession();
  if (existing) {
    return { ok: true, alreadyActive: true, session: existing };
  }
  const counts = await queueCounts(db);
  const now = new Date();
  const session: ChangesSessionFile = {
    version: 1,
    startedAt: now.toISOString(),
    actor: actor.code || OWNER_IDENTITY.personnelCode,
    actorName: actor.name || OWNER_IDENTITY.fullName,
    note: note.trim(),
    expiresAt: new Date(now.getTime() + CHANGES_SESSION_MAX_MS).toISOString(),
    started: { queuePending: counts.pending, queueDispatched: counts.dispatched },
  };
  mkdirSync(runtimeDir(), { recursive: true });
  writeFileSync(sessionPath(), JSON.stringify(session, null, 1), "utf8");
  // شاهد ممیزی — بهترین‌تلاش
  await db.auditLog
    .create({
      data: {
        action: "CHANGES_SESSION_BEGIN",
        actor: `owner:${session.actor}`,
        detail: JSON.stringify({ note: session.note, started: session.started, expiresAt: session.expiresAt }),
      },
    })
    .catch(() => undefined);
  return { ok: true, alreadyActive: false, session };
}

/** پایان حالت تمام‌ظرفیت و بازگشت چرخه‌های عادی — ONLY مالک */
export async function endChangesSession(
  db: PrismaClient,
  actor?: { code: string; name: string },
): Promise<{ ok: boolean; wasActive: boolean; after: { pending: number; dispatched: number } | null }> {
  const existing = readChangesSession();
  if (!existing) {
    return { ok: true, wasActive: false, after: null };
  }
  try {
    if (existsSync(sessionPath())) unlinkSync(sessionPath());
  } catch {
    /* بهترین‌تلاش — انقضای خودکار به‌هرحال بسته است */
  }
  const after = await queueCounts(db);
  await db.auditLog
    .create({
      data: {
        action: "CHANGES_SESSION_END",
        actor: `owner:${actor?.code ?? existing.actor}`,
        detail: JSON.stringify({ startedAt: existing.startedAt, after }),
      },
    })
    .catch(() => undefined);
  return { ok: true, wasActive: true, after };
}

/**
 * گارت استفادهٔ عمومی — آغاز خودکارِ «نشست کوتاه» هنگام اجرای هر عملیات
 * تغییر از کاشی (اگر نشست دستی فعال نبود): تضمین می‌کند هر اجرای تغییر،
 * حتی بدون فشردن دکمهٔ شروع، در ظرفیت کامل ترموکس اجرا شود.
 * عمر نشت خودکار = همین یک عملیات نیست بلکه همان سقف ۳۰ دقیقه؛ اما معمولاً
 * مالک دکمهٔ پایان را می‌زند یا انقضا می‌رسد.
 */
export async function ensureChangesSessionForOperation(
  db: PrismaClient,
  actor: { code: string; name: string },
  operation: string,
): Promise<{ active: boolean; autoStarted: boolean }> {
  const existing = readChangesSession();
  if (existing) return { active: true, autoStarted: false };
  await beginChangesSession(db, actor, `خودکار — ${operation}`);
  return { active: true, autoStarted: true };
}
