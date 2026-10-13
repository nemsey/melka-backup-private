/**
 * pn019-live-state.js — سنجش زندهٔ زمینهٔ حاکمیت پیش از اجرای رسمی
 * اجرا از ریشهٔ پروژه با bun (تا alias @/ حل شود):
 *   bun scripts/pn019/live-state.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const DAY = 86400000;
const now = Date.now();

(async () => {
  const [
    activityRead,
    deletes7d,
    backups,
    consultUsers,
    noCouncil,
    sessionsOld,
    logins90,
    auditLogin90,
    tokenDupGroups,
    decisionsKept,
    decisionsTotal,
    repairs90,
    minVersionsPerModel,
    retiredPerChampion,
  ] = await Promise.all([
    p.userActivity.count({ where: { action: { in: ["TILE_VIEW", "DATA_READ", "DATA_EXPORT"] } } }),
    p.auditLog.count({ where: { operation: "DELETE", createdAt: { gte: new Date(now - 7 * DAY) } } }),
    p.auditLog.findMany({ where: { action: { contains: "BACKUP" } }, orderBy: { createdAt: "desc" }, take: 3, select: { action: true, createdAt: true } }),
    p.user.findMany({ where: { role: "CONSULTANT" }, select: { personnelCode: true } }),
    p.modelVersion.count({ where: { promotedAt: { not: null }, councilApproved: false } }),
    p.userSession.count({ where: { isActive: true, createdAt: { lt: new Date(now - 30 * DAY) } } }),
    p.userActivity.count({ where: { action: "LOGIN", timestamp: { gte: new Date(now - 90 * DAY) } } }),
    p.auditLog.count({ where: { action: "LOGIN", createdAt: { gte: new Date(now - 90 * DAY) } } }),
    p.userSession.groupBy({ by: ["tokenHash"], where: { isActive: true }, _count: { _all: true } }),
    p.decisionRecord.count({ where: { createdAt: { lte: new Date(now - 90 * DAY) } } }),
    p.decisionRecord.count(),
    p.auditLog.count({ where: { action: { in: ["DATA_REPAIR", "INT_OVERFLOW_REPAIR"] }, createdAt: { gte: new Date(now - 90 * DAY) } } }),
    p.modelVersion.groupBy({ by: ["modelId"] }),
    p.modelVersion.findMany({ where: { status: "champion", promotedAt: { not: null } }, select: { modelId: true } }),
  ]);

  console.log(JSON.stringify({
    activityRead,
    deletes7d,
    backupActions: backups.map((b) => ({ action: b.action, at: b.createdAt.toISOString() })),
    consultUsers: consultUsers.length,
    noCouncil,
    sessionsOld,
    logins90_userActivity: logins90,
    logins90_auditLog: auditLogin90,
    loginsMissing: Math.max(0, logins90 - auditLogin90),
    tokenDup: tokenDupGroups.filter((g) => g._count._all > 1).length,
    decisionsKept,
    decisionsTotal,
    repairs90,
    models: minVersionsPerModel.length,
    championsPromoted: retiredPerChampion.length,
  }, null, 1));

  // شمارش نسخه per مدل
  for (const g of minVersionsPerModel) {
    const c = await p.modelVersion.count({ where: { modelId: g.modelId } });
    console.log(`model ${g.modelId}: ${c} versions`);
  }
  await p.$disconnect();
})();
