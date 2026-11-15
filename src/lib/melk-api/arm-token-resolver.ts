/**
 * arm-token-resolver.ts — DIR-MISSING-REQ-001 (ریشهٔ B)
 * ---------------------------------------------------------------------------
 * حل‌کنندهٔ هوشمند توکن ARM برای چرخه‌های پس‌زمینه (LCPP چهار‌فهرست + دیمن کاتالوگ).
 *
 * زمینهٔ کشف (۱۴۰۵/۰۸/۲۵ · شاهد RelayQueue + JWT-exp محلی):
 *   resolver قدیمی «آخرین نشستِ دیده‌شده» را برمی‌داشت؛ پس از ورود مدیرِ
 *   (master-login) که توکنِ کهنهٔ خزانه (منقضی از ۲۰۲۶-۱۱-۰۹) را در نشستش
 *   به ارث می‌برد، همهٔ چرخه‌های خودکار از ۰۵:۳۵ همان روز با 401 مردند —
 *   در حالی که توکن زندهٔ ۲۴ساعتهٔ بعدی در نشست‌های کهنه‌تر موجود بود.
 *
 * راهکار (صفر تماس شبکه — خوانش محلی ادعای exp خود JWT):
 *   ۱) نامزدها: نشست‌های زندهٔ دارای توکن (به‌ترتیب lastSeenAt) + ردیف‌های خزانه
 *      (به‌ترتیب lastRefreshedAt) — بدون تکرار.
 *   ۲) رتبه‌بندی: توکن با exp آینده (تازه‌ترین exp بزرگ‌تر) > توکن با exp ناخوانا
 *      (ناشناخته — داوری با سرور) > توکن منقضی (هرگز، مگر هیچ گزینهٔ دیگری نباشد
 *      تا رفتار قدیمی حفظ شود).
 *   ۳) خوددرمانی خزانه (best-effort): اگر برنده از نشست مالک (OWNER) آمد و با
 *      توکن خزانهٔ master فرق داشت، همان توکن در خزانه هم نوشته می‌شود تا
 *      ورودهای بعدیِ مدیر دیگر جسد کهنه را به ارث نبرند (SEC-3: فقط OWNER).
 *   ۴) کش درون‌فرایندی کوتاه (۵ دقیقه) — رمزگشایی/پرس‌وجوی DB در هر تیک نه.
 *
 * قوانین: صفر لاگ توکن (هیچ رازی چاپ/ثابت نمی‌شود) · additive-only ·
 * شکست هر مرحله = سقوط به رفتار قدیمی (latest-session → vault).
 */

import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/auth/crypto";
import { armTokenExpiresAtMs } from "@/lib/auth/arm-token-exp";

/** نتیجهٔ حل‌کننده — source برای شفافیت وضعیت (برچسب UI/جزئیات کار) */
export interface ResolvedArmToken {
  token: string;
  source: "session" | "vault";
  /** exp به میلی‌ثانیهٔ epoch — null یعنی JWT ناخوانا (ناشناخته) */
  expMs: number | null;
  /** آیا خزانه در همین فراخوانی بهبود یافت؟ */
  vaultHealed: boolean;
}

/** عمر کش درون‌فرایندی — ۵ دقیقه */
const CACHE_TTL_MS = 5 * 60_000;
/** حاشیهٔ ایمنی اعتبار — عین arm-token-exp (۲ دقیقه) */
const VALID_MARGIN_MS = 120_000;

interface ResolverGlobal {
  __melkArmTokenResolver?: {
    cache: { at: number; value: ResolvedArmToken } | null;
  };
}
const g = globalThis as unknown as ResolverGlobal;
function state(): NonNullable<ResolverGlobal["__melkArmTokenResolver"]> {
  if (!g.__melkArmTokenResolver) g.__melkArmTokenResolver = { cache: null };
  return g.__melkArmTokenResolver;
}

/** بی‌اعتبارکردن کش (پس از 401 واقعی — فراخواننده می‌تواند صدازد) */
export function invalidateArmTokenResolverCache(): void {
  state().cache = null;
}

interface Candidate {
  token: string;
  source: "session" | "vault";
  expMs: number | null;
  /** نشست مالک؟ (برای خوددرمانی خزانه) */
  ownerSession: boolean;
  /** sessionId برای جزئیات — هرگز توکن */
  ref: string;
}

/**
 * حل‌کنندهٔ اصلی — تازه‌ترین توکنِ دارای exp آینده از میان نشست‌ها و خزانه.
 * خروجی null = هیچ توکنی در دسترس نیست (رفتار قدیمی: صرف‌نظر صادقانه).
 */
export async function resolveBestArmToken(db: PrismaClient): Promise<ResolvedArmToken | null> {
  const s = state();
  if (s.cache && Date.now() - s.cache.at < CACHE_TTL_MS) return s.cache.value;

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // ── ۱) نشست‌های زندهٔ دارای توکن (تازه‌ترین دیدار اول) ──
  let sessions: Array<{
    id: string; role: string; armTokenEnc: string | null;
  }> = [];
  try {
    sessions = await db.session.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      take: 12,
      select: { id: true, role: true, armTokenEnc: true },
    });
  } catch {
    sessions = [];
  }
  for (const row of sessions) {
    const token = decryptSecret(row.armTokenEnc);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    candidates.push({
      token,
      source: "session",
      expMs: armTokenExpiresAtMs(token),
      ownerSession: row.role === "OWNER",
      ref: `session:${row.id.slice(-8)}`,
    });
  }

  // ── ۲) ردیف‌های خزانه (تازه‌ترین refresh اول) ──
  let vaults: Array<{
    ownerKey: string; tokenEnc: string | null;
  }> = [];
  try {
    vaults = await db.armConnection.findMany({
      orderBy: { lastRefreshedAt: "desc" },
      take: 4,
      select: { ownerKey: true, tokenEnc: true },
    });
  } catch {
    vaults = [];
  }
  for (const row of vaults) {
    if (!row.tokenEnc) continue;
    const token = decryptSecret(row.tokenEnc);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    candidates.push({ token, source: "vault", expMs: armTokenExpiresAtMs(token), ownerSession: false, ref: `vault:${row.ownerKey}` });
  }

  if (candidates.length === 0) return null;

  // ── ۳) رتبه‌بندی: زنده (بزرگ‌ترین exp) → ناشناخته → منقضی (آخر) ──
  const now = Date.now();
  const valid = candidates.filter((c) => c.expMs !== null && c.expMs - now > VALID_MARGIN_MS);
  const unknown = candidates.filter((c) => c.expMs === null);
  const expired = candidates.filter((c) => c.expMs !== null && c.expMs - now <= VALID_MARGIN_MS);

  let winner: Candidate | null = null;
  if (valid.length > 0) winner = valid.reduce((a, b) => ((a.expMs ?? 0) >= (b.expMs ?? 0) ? a : b));
  else if (unknown.length > 0) winner = unknown[0]; // ناشناخته — داوری با خود سامانه (رفتار قدیمی)
  else winner = expired[0] ?? null; // فقط جسد — بازگرداندن برای پیام خطای صادقانهٔ بالادست

  if (!winner) return null;

  const result: ResolvedArmToken = {
    token: winner.token,
    source: winner.source,
    expMs: winner.expMs,
    vaultHealed: false,
  };

  // ── ۴) خوددرمانی خزانه — فقط از نشست مالک و فقط با توکن زنده (SEC-3) ──
  if (winner.ownerSession && winner.expMs !== null && winner.expMs - now > VALID_MARGIN_MS) {
    try {
      // upsert جزئی از طریق مخزن — «فقط» tokenEnc/status/تازگی؛
      // refreshTokenEnc موجود هرگز بازنویسی نمی‌شود (زنجیرهٔ تمدید محفوظ می‌ماند)
      const { getIntegrationRepository } = await import("@/core/repositories");
      await getIntegrationRepository().upsertArmConnection({
        ownerKey: "master",
        tokenEnc: encryptSecret(winner.token),
        status: "connected",
        lastRefreshedAt: new Date(),
        lastError: null,
      });
      result.vaultHealed = true;
    } catch {
      /* بهترین-تلاش — شکستش هرگز حل‌کننده را نمی‌شکند */
    }
  }

  s.cache = { at: Date.now(), value: result };
  return result;
}

/**
 * پوشش سازگار با قرارداد قدیمی resolver ها (رشتهٔ خام یا null) —
 * برای جاگذاری بی‌دردسر در sync/lists و catalog-daemon.
 */
export async function resolveArmTokenString(db: PrismaClient): Promise<string | null> {
  const resolved = await resolveBestArmToken(db);
  return resolved?.token ?? null;
}
