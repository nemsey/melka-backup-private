/**
 * PN-017 S1 — ممیزی فراکامل سامانه‌های ملک تبریز (چندوجهی)
 * پاسخ به بند اول دستور مالک: «سامانه‌های ملک تبریز به صورت فراکامل و
 * فراجامع و فراعمیق و چندوجهی مورد بررسی کامل قرار گیرد»
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const out: Record<string, unknown> = {};

  // وجه ۱ — کاربران اپلیکیشن (User)
  const users = await db.user.findMany({
    include: { _count: { select: { permissions: true, sessions: true, activityLog: true } } },
    orderBy: { createdAt: "asc" },
  });
  out.users = {
    total: users.length,
    byRole: users.reduce<Record<string, number>>((a, u) => ((a[u.role] = (a[u.role] ?? 0) + 1), a), {}),
    rows: users.map((u) => ({
      personnelCode: u.personnelCode, mobile: u.mobile, fullName: u.fullName, role: u.role,
      branchTitle: u.branchTitle, roleTitleFa: u.roleTitleFa, isActive: u.isActive,
      lastLoginAt: u.lastLoginAt, permCount: u._count.permissions, sessCount: u._count.sessions,
      actCount: u._count.activityLog, metadata: u.metadata,
    })),
  };

  // وجه ۲ — پرسنل PM (ExpertProfile — دپارتمان ملک تبریز)
  const experts = await db.expertProfile.findMany();
  const byBranch: Record<string, number> = {};
  const byRoleTitle: Record<string, number> = {};
  const byManager: Record<string, number> = {};
  for (const e of experts) {
    if (e.branchTitle) byBranch[e.branchTitle] = (byBranch[e.branchTitle] ?? 0) + 1;
    if (e.roleTitle) byRoleTitle[e.roleTitle] = (byRoleTitle[e.roleTitle] ?? 0) + 1;
    if (e.headManager) byManager[e.headManager] = (byManager[e.headManager] ?? 0) + 1;
  }
  out.pmPersonnel = {
    total: experts.length,
    active: experts.filter((e) => e.active).length,
    byBranch, byRoleTitle, byManager,
    lastSyncedAt: experts.reduce<string | null>((m, e) => (e.syncedAt && (!m || e.syncedAt.toISOString() > m) ? e.syncedAt.toISOString() : m), null),
    sample: experts.slice(0, 5).map((e) => ({ personnelCode: e.personnelCode, fullName: e.fullName, branchTitle: e.branchTitle, roleTitle: e.roleTitle })),
  };

  // وجه ۳ — پیوند کاربر↔پرسنل PM (پوشش)
  const pmCodes = new Set(experts.map((e) => e.personnelCode).filter(Boolean));
  const linked = users.filter((u) => u.personnelCode && pmCodes.has(u.personnelCode));
  out.linkage = {
    usersWithPmRecord: linked.map((u) => ({ code: u.personnelCode, name: u.fullName })),
    usersWithoutPmRecord: users.filter((u) => u.personnelCode && !pmCodes.has(u.personnelCode)).map((u) => ({ code: u.personnelCode, name: u.fullName })),
    pmPersonnelWithoutUser: experts.filter((e) => e.personnelCode && !users.some((u) => u.personnelCode === e.personnelCode)).length,
  };

  // وجه ۴ — دسترسی کارشناسان (لایه قدیمی)
  const pa = await db.personnelAccess.findMany();
  out.personnelAccess = { total: pa.length, rows: pa.map((r) => ({ code: r.personnelCode, level: r.level, allowedTiles: JSON.parse(r.allowedTiles ?? "[]") })) };

  // وجه ۵ — نشست‌ها و اتصال PM
  const sessions = await db.userSession.count({ where: { isActive: true } });
  const pm = await db.pmConnection.findFirst();
  out.sessions = { active: sessions };
  out.pmConnection = pm ? { connected: pm.status === "connected", status: pm.status, displayName: pm.displayName ?? null, tokenPresent: Boolean(pm.tokenEnc), lastCheckAt: pm.lastCheckedAt?.toISOString() ?? null } : { connected: false };
  out.generatedAt = new Date().toISOString();

  console.log(JSON.stringify(out, null, 2));
}

main().finally(() => db.$disconnect());
