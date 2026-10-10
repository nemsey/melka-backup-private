/**
 * P6.5-11 (نکتهٔ ۳) — حالت شبانهٔ انتقال کامل اطلاعات با «ازسرگیری» (بند ب)
 * ---------------------------------------------------------------------------
 * پنجرهٔ شبانهٔ ۲۲:۰۰ تا ۰۶:۰۰ تهران (سرور ARM شب‌ها پایدار است — شاهد P6.5-10):
 *   ۱) همگام‌سازی اصلی (معاملات/کارشناسان/قراردادها/تعاملات/بازدیدها/عرضه‌وتقاضا)
 *   ۲) کاتالوگ درخواست‌های ARM — لایهٔ ۱ از checkpoint تا تکمیل (صفحه‌به‌صفحه، نرخ‌محدود)
 *   ۳) غنی‌سازی تماس (لایهٔ ۲) برش‌به‌برش تا اتمام پنجره یا اتمام کار
 *
 * ازسرگیری: هر صفحهٔ «کامل-ذخیره‌شده» جلو می‌رود؛ قطعی/خروج/ری‌استارت ⇒ اجرای
 * مجدد همین اسکریپت از همان صفحه ادامه می‌دهد — هرگز از ابتدا.
 *
 * اجرا: bun scripts/p6511-night-transfer.ts [--night] [--max-minutes N]
 *   --night        فقط داخل پنجرهٔ ۲۲-۰۶ تهران اجرا می‌شود (خارج پنجره: خروج بی‌ضرر)
 *   --max-minutes  سقف اجرا (پیش‌فرض: تا ۰۵:۵۰ تهران یا ۵۴۰ دقیقه)
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } },
});

// ---------- پنجرهٔ شبانه (تهران = UTC+3:30) ----------
function tehranHourUtc3h30(d: Date): number {
  // دقیق: UTC+3:30 — دقیقه‌ها هم شیفت می‌شوند (رفع باگ: پیش‌تر فقط ساعت گرد می‌شد
  // و پنجره برای X:31–X:59 اشتباه «خارج» تشخیص داده می‌شد)
  return ((d.getUTCHours() * 60 + d.getUTCMinutes() + 210) / 60) % 24;
}
function inNightWindow(d: Date): boolean {
  const h = tehranHourUtc3h30(d);
  return h >= 22 || h < 6;
}

const args = process.argv.slice(2);
const NIGHT_ONLY = args.includes("--night");
const maxMinutesIdx = args.indexOf("--max-minutes");
const MAX_MINUTES = maxMinutesIdx >= 0 ? Number(args[maxMinutesIdx + 1] ?? 540) : 540;

// ---------- توکن ARM از صندوقچهٔ ماندگار (بند ث) ----------
async function vaultToken(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { decryptSecret } = await import("../src/lib/auth/crypto");
  const row = await db.armConnection.findFirst({ where: { status: "connected", tokenEnc: { not: null } }, orderBy: { updatedAt: "desc" } });
  if (!row?.tokenEnc) return null;
  const accessToken = decryptSecret(row.tokenEnc);
  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? "" : "";
  return accessToken ? { accessToken, refreshToken } : null;
}

async function main() {
  const startedAt = Date.now();
  if (NIGHT_ONLY && !inNightWindow(new Date())) {
    console.log("[night] خارج از پنجرهٔ ۲۲:۰۰-۰۶:۰۰ تهران — خروج بی‌ضرر (دوباره در پنجره اجرا کنید).");
    return;
  }
  console.log(`[night] شروع انتقال شبانهٔ P6.5-11 — ${new Date().toISOString()}`);
  console.log(`[night] سقف اجرا: ${MAX_MINUTES} دقیقه · ازسرگیری از checkpoint فعال (بند ب)`);

  const creds = await vaultToken();
  if (!creds) {
    console.error("[night] صندوقچهٔ ARM خالی است — ابتدا از تنظیمات عمومی به ARM متصل شوید (یک بار برای همیشه).");
    process.exit(1);
  }

  // ماژول‌های خط لوله (پس از آماده‌شدن DB)
  const { syncWithRefresh } = await import("../src/lib/melk-api/sync");
  const { syncArmRequestsCatalog, enrichArmListings, enrichArmRequests } = await import("../src/lib/melk-api/arm-catalog");

  const deadline = () => Date.now() - startedAt > MAX_MINUTES * 60_000;

  // ---- ۱) همگام‌سازی اصلی ----
  try {
    const { sync } = await syncWithRefresh(creds.accessToken, creds.refreshToken);
    console.log(`[main] ok=${sync.ok} tx=${sync.transactions} ex=${sync.experts} ct=${sync.contracts} vi=${sync.visits} sd=${sync.supplyDemand}${sync.errorCode ? ` err=${sync.errorCode}` : ""}`);
  } catch (e) {
    console.error("[main] خطا (ادامه با کاتالوگ):", e instanceof Error ? e.message : e);
  }

  // ---- ۲) کاتالوگ درخواست‌ها — تا تکمیل یا مهلت (هر برش ۲۰ صفحه) ----
  let guard = 0;
  while (!deadline() && guard < 200) {
    guard += 1;
    const cp = await db.syncCheckpoint.findUnique({ where: { id: "requests" } });
    if (cp?.phase === "complete" && cp.totalAtSource > 0 && cp.lastCompletedPage >= cp.totalPages) {
      console.log("[requests] چرخهٔ کاتالوگ کامل است — رفرش نوبتی صفحه‌های آغازین برای دادهٔ تازه...");
    }
    const res = await syncArmRequestsCatalog(creds.accessToken, { maxPages: 20 }).catch((e) => {
      console.error("[requests] خطا:", e instanceof Error ? e.message : e);
      return null;
    });
    if (!res) break;
    console.log(
      `[requests] صفحه ${res.checkpoint?.lastCompletedPage ?? "?"}/${res.checkpoint?.totalPages ?? "?"} · +${res.fetched} (چرخهٔ ${res.cycleId?.slice(0, 12)}…${res.resumedFromPage ? ` ازسرگیری از ${res.resumedFromPage}` : ""})${res.errorCode ? ` err=${res.errorCode}` : ""}`
    );
    if (res.checkpoint?.phase === "complete") {
      console.log("[requests] ✓ چرخهٔ کامل شد (۲۰٬۴۰۰+ رکورد) — پایان لایهٔ ۱ درخواست‌ها");
      break;
    }
    if (res.errorCode === "UNAUTHORIZED") {
      console.error("[requests] توکن منقضی — با اتصال تازه از تنظیمات ادامه دهید (checkpoint محفوظ است).");
      break;
    }
  }

  // ---- ۳) غنی‌سازی تماس تا اتمام پنجره ----
  while (!deadline()) {
    const before = await db.syncCheckpoint.findUnique({ where: { id: "enrich-probe" } }).catch(() => null);
    void before;
    const [el, er] = await Promise.all([
      enrichArmListings(creds.accessToken, { maxRows: 200 }).catch(() => null),
      enrichArmRequests(creds.accessToken, { maxRows: 200 }).catch(() => null),
    ]);
    const doneL = el ? el.remaining === 0 : true;
    const doneR = er ? er.remaining === 0 : true;
    console.log(
      `[enrich] آگهی‌ها +${el?.enriched ?? 0} (ماند ${el?.remaining ?? "?"}) · درخواست‌ها +${er?.enriched ?? 0} (ماند ${er?.remaining ?? "?"})`
    );
    if (doneL && doneR) {
      console.log("[enrich] ✓ غنی‌سازی تماس هر دو کاتالوگ کامل شد");
      break;
    }
    if (el?.errorCode === "UNAUTHORIZED" || er?.errorCode === "UNAUTHORIZED") {
      console.error("[enrich] توکن منقضی — checkpoint محفوظ؛ با اتصال تازه ادامه دهید.");
      break;
    }
  }

  const mins = Math.round((Date.now() - startedAt) / 60_000);
  console.log(`[night] پایان اجرا (${mins} دقیقه) — هر اجرای بعدی از همین نقطه ادامه می‌یابد.`);
}

main()
  .catch((e) => {
    console.error("[night] خطای مهلک:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
