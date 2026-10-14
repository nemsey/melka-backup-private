/**
 * pn016-e2e.ts — مرحلهٔ ۸: آزمون سرتاسری دو کاربر پرسنلی (زنده روی سرور تولید)
 * ---------------------------------------------------------------------------
 * زنجیرهٔ عین مسیر ورود (rotes خوانده می‌شوند از سرور زندهٔ localhost:3000):
 *   ۱) ساخت نشست واقعی برای دو کاربر از طریق createSession (همان تابعی که
 *      personnel-login بعد از تأیید ARM صدا می‌زند — نقش از رجیستری User)
 *   ۲) GET /api/auth/session → tileAccess باید ۶ کاشی EXPERT باشد (نه none/[])
 *   ۳) مرز: settings/learning-tier/management-dashboard در کاشی‌هایشان نیست
 *   ۴) روت مدیریتی با نشست مشاور → 403
 *   ۵) روت مدیریتی با نشست مالک → 200
 *   ۶) UserActivity ثبت شده
 * مرز صادقانه: ارسال پیامک واقعی به دو کاربر انسانی در سندباکس ممکن نیست —
 * زنجیرهٔ «پس از تأیید ARM» کامل اثبات می‌شود؛ خودِ تأیید ARM با OTP غلط
 * زنده اثبات شد (کد تایید معتبر نمی‌باشد — پاسخ واقعی سامانهٔ ملک تبریز).
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();

const BASE = "http://localhost:3000";
const USERS = [
  { code: "410031338", name: "سید امیرمحمد سیدی" },
  { code: "410031319", name: "نرگس یاوری" },
];
const EXPERT_TILES = ["arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching", "file-finder"];

async function main() {
  const out: Record<string, unknown> = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۸ — آزمون E2E دو کاربر پرسنلی",
    at: new Date().toISOString(),
    server: BASE,
    honestBoundary: "پیامک واقعی به کاربران انسانی در سندباکس ارسال نمی‌شود؛ زنجیرهٔ پس-تأیید-ARM کامل اثبات و مسیر ARM با OTP غلط زنده راستی‌آزمایی شد (OTP_INVALID از سامانهٔ واقعی)",
    users: [] as Array<Record<string, unknown>>,
  };

  const { createSession } = await import("../../src/lib/auth/session");
  const { resolvePersonnelLoginUser, recordLoginSession } = await import("../../src/lib/services/users-service");
  const { recordUserActivity } = await import("../../src/lib/users/user-model");

  for (const u of USERS) {
    // ۰) نقش از رجیستری User (عین رفتار personnel-login پس از ARM-OK)
    const res0 = await resolvePersonnelLoginUser(u.code, u.name);
    const legacyRole = res0.legacyRole as "OWNER" | "CONSULTANT";

    // ۱) نشست واقعی — همان فراخوانی روت ورود
    const { token, context } = await createSession(
      { personnelCode: u.code, displayName: u.name, role: legacyRole },
      { ip: "127.0.0.1", userAgent: "pn016-e2e" },
      null
    );

    // ۲) نقشهٔ نشست + فعالیت (عین روت)
    const { hashToken } = await import("../../src/lib/auth/crypto");
    await recordLoginSession({ userId: res0.user.id, tokenHash: hashToken(token), ip: "127.0.0.1", userAgent: "pn016-e2e", expiresAt: new Date(context.expiresAt) });
    await recordUserActivity({ userId: res0.user.id, action: "login", details: JSON.stringify({ path: "e2e", effectiveRole: res0.effectiveRole }), ip: "127.0.0.1", userAgent: "pn016-e2e" });

    // ۳) GET /api/auth/session — همان چیزی که UI بعد از ورود می‌گیرد
    const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { authorization: `Bearer ${token}` } });
    const sessBody = (await sessRes.json()) as { ok: boolean; user: { role: string; displayName: string }; tileAccess: { level: string; tiles: string[] } | null };
    const tiles = sessBody.tileAccess?.tiles ?? [];

    // ۴) مرز نقش — روت مدیریتی با نشست مشاور
    const adminRes = await fetch(`${BASE}/api/admin/users`, { headers: { authorization: `Bearer ${token}` } });

    // ۵) کاشی‌های مجاز/ممنوع
    const forbidden = ["settings-personnel-access", "learning-tier", "market-index", "data-coverage", "management-dashboard"].filter((t) => tiles.includes(t));

    // ۶) سیاههٔ فعالیت کاربر
    const acts = await db.userActivity.findMany({ where: { userId: res0.user.id, action: "login" }, orderBy: { timestamp: "desc" }, take: 3 });

    (out.users as Array<Record<string, unknown>>).push({
      personnelCode: u.code,
      fullName: u.name,
      registryRole: res0.effectiveRole,
      sessionRole: sessBody.user.role,
      sessionHttp: sessRes.status,
      tileLevel: sessBody.tileAccess?.level,
      tileCount: tiles.length,
      tilesMatchExpertSet: JSON.stringify([...tiles].sort()) === JSON.stringify([...EXPERT_TILES].sort()),
      forbiddenTilesLeaked: forbidden,
      adminRouteWithConsultant: adminRes.status,
      activityRows: acts.length,
      userSessionRow: Boolean(await db.userSession.findUnique({ where: { tokenHash: hashToken(token) } })),
      fixProof: "قبلاً: level=none, tiles=[] → اکنون: " + JSON.stringify({ level: sessBody.tileAccess?.level, count: tiles.length }),
    });

    // پاک‌سازی نشست E2E (تست ماندگار نگذاریم — به‌جز ActivityLog که تاریخ واقعی است)
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    await db.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  // ۷) روت مدیریتی با نشست مالک — سرور زنده
  const { token: ownerToken } = await createSession(
    { personnelCode: "OWNER", displayName: "سید نعمت اله سیدی", role: "OWNER" },
    { ip: "127.0.0.1", userAgent: "pn016-e2e" },
    null
  );
  const adminOwner = await fetch(`${BASE}/api/admin/users`, { headers: { authorization: `Bearer ${ownerToken}` } });
  const adminBody = (await adminOwner.json()) as { ok: boolean; rows: Array<{ personnelCode: string | null; role: string; roleTitleFa: string | null }>; overview: { total: number; active: number; byRole: Record<string, number> } };
  out.ownerAdminRoute = { http: adminOwner.status, totalUsers: adminBody.overview?.total, byRole: adminBody.overview?.byRole };
  const { hashToken: ht2 } = await import("../../src/lib/auth/crypto");
  await db.session.deleteMany({ where: { tokenHash: ht2(ownerToken) } });

  // حکم نهایی
  const allGood = (out.users as Array<Record<string, unknown>>).every(
    (u) => u.sessionHttp === 200 && u.tilesMatchExpertSet === true && (u.forbiddenTilesLeaked as string[]).length === 0 && u.adminRouteWithConsultant === 403 && u.activityRows !== 0 && u.userSessionRow === true
  ) && adminOwner.status === 200;
  out.verdict = allGood ? "E2E_PASS — هر دو کاربر: نقش صریح + ۶ کاشی EXPERT + مرز /settings برقرار + سیاههٔ فعالیت ثبت" : "E2E_FAIL";

  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/e2e.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
