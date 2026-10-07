/**
 * pn016-seed.ts — مرحلهٔ ۳: Seed رجیستری کاربران از دادهٔ واقعی موجود
 * ---------------------------------------------------------------------------
 * منابع (بند ۵.۳ شورا):
 *   ۱) هر Session معتبر → User (هر انسانی که تا امروز وارد شده)
 *   ۲) هر PersonnelAccess قدیمی → UserPermission (امروز: ۰ رکورد — مستند)
 *   ۳) کد مالک env → User با نقش OWNER (قانون هویت دوگانه)
 * نقش صریح: کاربران پرسنلی واقعی امروز = EXPERT (طبق آزمون مرحلهٔ ۸ سند)
 * خروجی: download/pn016/seed.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();

const OWNER_ENV_CODES = "410031320";

/** نقش صریح کاربران شناخته‌شدهٔ امروز (از AuditLog واقعی — مرحلهٔ ۱) */
const EXPLICIT_ROLES: Record<string, { role: string; fullName: string }> = {
  "410031320": { role: "OWNER", fullName: "سید نعمت اله سیدی" },
  "410031338": { role: "EXPERT", fullName: "سید امیرمحمد سیدی" },
  "410031319": { role: "EXPERT", fullName: "نرگس یاوری" },
};

/** مجوزهای پیش‌فرض نقش — عین src/lib/users/user-model.ts (کپی صریح برای seed مستقل) */
const MANAGEABLE = [
  "arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching",
  "learning-tier", "market-index", "data-coverage", "file-finder", "management-dashboard",
];
const ROLE_OPS: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean; canExport: boolean; canSync: boolean }> = {
  OWNER: { canRead: true, canWrite: true, canDelete: true, canExport: true, canSync: true },
  MANAGER: { canRead: true, canWrite: true, canDelete: false, canExport: true, canSync: true },
  EXPERT: { canRead: true, canWrite: true, canDelete: false, canExport: true, canSync: false },
  VIEWER: { canRead: true, canWrite: false, canDelete: false, canExport: false, canSync: false },
  GUEST: { canRead: false, canWrite: false, canDelete: false, canExport: false, canSync: false },
};
const ROLE_TILES: Record<string, string[]> = {
  OWNER: MANAGEABLE,
  MANAGER: MANAGEABLE,
  EXPERT: ["arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching", "file-finder", "listing", "request"],
  VIEWER: MANAGEABLE,
  GUEST: [],
};
function permsFor(role: string) {
  const ops = ROLE_OPS[role] ?? ROLE_OPS.VIEWER;
  return ROLE_TILES[role].map((tileId) => ({ tileId, ...ops }));
}

async function main() {
  const report: Record<string, unknown> = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۳ — Migration + Seed",
    at: new Date().toISOString(),
    sources: { sessions: 0, personnelAccessLegacy: 0 },
    created: [] as Array<Record<string, unknown>>,
    skipped: [] as Array<Record<string, unknown>>,
    permissionsCreated: 0,
  };

  // ۰) پیش‌شرط — جدول User باید وجود داشته باشد (مرحلهٔ ۲)
  const userCount0 = await db.user.count();

  // ۱) از Session — هر کد پرسنلی واقعی (نه شبه‌هویت‌های 'OWNER' ورود مدیر)
  const sessions = await db.session.findMany({
    select: { personnelCode: true, displayName: true, ip: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  const byCode = new Map<string, { displayName: string; lastIp: string | null; lastAt: Date; expiresAt: Date }>();
  for (const s of sessions) {
    if (s.personnelCode === "OWNER" || s.personnelCode.length < 4 || !/^\d+$/.test(s.personnelCode)) continue;
    const prev = byCode.get(s.personnelCode);
    if (!prev || s.createdAt > prev.lastAt) {
      byCode.set(s.personnelCode, { displayName: s.displayName, lastIp: s.ip, lastAt: s.createdAt, expiresAt: s.expiresAt });
    }
  }
  report.sources.sessions = byCode.size;

  // ۲) PersonnelAccess قدیمی → UserPermission (امروز: خالی)
  const legacyPA = await db.personnelAccess.findMany();
  report.sources.personnelAccessLegacy = legacyPA.length;

  let permsCreated = 0;
  const created: Array<Record<string, unknown>> = [];

  // ۳) ساخت/همگام‌سازی کاربران
  for (const [code, info] of byCode) {
    const explicit = EXPLICIT_ROLES[code] ?? { role: "VIEWER", fullName: info.displayName };
    const isEnvOwner = OWNER_ENV_CODES.split(",").map((s) => s.trim()).includes(code);
    const role = isEnvOwner ? "OWNER" : explicit.role;
    const existing = await db.user.findUnique({ where: { personnelCode: code } });
    if (!existing) {
      const u = await db.user.create({
        data: {
          personnelCode: code,
          fullName: explicit.fullName || info.displayName,
          role,
          isActive: true,
          createdBy: "pn016-seed",
          metadata: JSON.stringify({ source: "seed-from-sessions", lastSessionAt: info.lastAt.toISOString() }),
        },
      });
      if (role !== "OWNER") {
        const r = await db.userPermission.createMany({ data: permsFor(role).map((p) => ({ userId: u.id, ...p })) });
        permsCreated += r.count;
      }
      created.push({ personnelCode: code, fullName: u.fullName, role, permissions: role === "OWNER" ? "bypass" : permsFor(role).length });
    } else {
      (report.skipped as Array<Record<string, unknown>>).push({ personnelCode: code, reason: "already-exists" });
    }
  }

  // ۴) تضمین مالک env — حتی اگر Session نداشته باشد
  for (const code of OWNER_ENV_CODES.split(",").map((s) => s.trim()).filter(Boolean)) {
    const existing = await db.user.findUnique({ where: { personnelCode: code } });
    if (!existing) {
      const u = await db.user.create({
        data: {
          personnelCode: code,
          fullName: EXPLICIT_ROLES[code]?.fullName ?? "مالک سامانه",
          role: "OWNER",
          isActive: true,
          createdBy: "pn016-seed-env-owner",
          metadata: JSON.stringify({ source: "env-owner-code" }),
        },
      });
      created.push({ personnelCode: code, fullName: u.fullName, role: "OWNER", permissions: "bypass" });
    } else if (existing.role !== "OWNER") {
      await db.user.update({ where: { id: existing.id }, data: { role: "OWNER" } });
      created.push({ personnelCode: code, fullName: existing.fullName, role: "OWNER", permissions: "bypass", note: "role-corrected-to-OWNER" });
    }
  }

  // ۵) انتقال PersonnelAccess قدیمی (امروز ۰ — حلقهٔ صادقانه برای آینده)
  let migratedLegacy = 0;
  for (const pa of legacyPA) {
    const u = await db.user.findUnique({ where: { personnelCode: pa.personnelCode } });
    if (!u) continue;
    const tiles = pa.level === "full" ? MANAGEABLE : pa.level === "limited" ? JSON.parse(pa.allowedTiles ?? "[]") : [];
    const ops = ROLE_OPS[u.role] ?? ROLE_OPS.VIEWER;
    const r = await db.userPermission.createMany({
      data: tiles.filter((t: string) => MANAGEABLE.includes(t)).map((tileId: string) => ({ userId: u.id, tileId, ...ops })),
      skipDuplicates: true,
    });
    migratedLegacy += r.count;
  }

  report.created = created;
  report.permissionsCreated = permsCreated;
  report.legacyPermissionsMigrated = migratedLegacy;
  report.userCountBefore = userCount0;
  report.userCountAfter = await db.user.count();
  report.permissionRows = await db.userPermission.count();
  // شاهد رفع خطا: دو کاربر حالا tiles دارند (فراخوانی تابع واقعی)
  const { resolveAllowedTiles } = await import("../../src/lib/access/personnel-access");
  const proof: Array<Record<string, unknown>> = [];
  for (const code of ["410031338", "410031319", "410031320"]) {
    proof.push({ code, resolve: await resolveAllowedTiles("CONSULTANT", code) });
  }
  report.fixProof = proof;

  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/seed.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ created: report.created, permissionsCreated: permsCreated, legacyMigrated: migratedLegacy, userCountAfter: report.userCountAfter, fixProof: proof }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
