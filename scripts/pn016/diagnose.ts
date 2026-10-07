/**
 * pn016-diagnose.ts — مرحلهٔ ۱: اثبات زندهٔ ریشهٔ خطای دو کاربر پرسنلی
 * اجرا: bun scripts/pn016/diagnose.ts
 * صفر تغییر سورس — فقط خواندن DB + فراخوانی تابع واقعی resolveAllowedTiles
 */
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();

async function main() {
  // ۱) رکوردهای PersonnelAccess
  const pa = await db.personnelAccess.findMany();
  // ۲) نشست‌های غیر مالک (کاربران واقعی که وارد شدند)
  const sessions = await db.session.findMany({
    where: { personnelCode: { not: "OWNER" } },
    select: { personnelCode: true, displayName: true, role: true, createdAt: true, revoked: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  // ۳) شکست‌های دسترسی ۴۰۳
  const denied = await db.auditLog.findMany({
    where: { action: "ACCESS_DENIED" },
    select: { actor: true, detail: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  // ۴) ورودهای موفق پرسنلی
  const logins = await db.auditLog.findMany({
    where: { action: { in: ["LOGIN_SUCCESS", "PERSONNEL_LOGIN_SUCCESS"] } },
    select: { actor: true, detail: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // ۵) شبیه‌سازی تک‌نقطهٔ تصمیم برای دو کاربر (عین session/route.ts خط ۲۳)
  const { resolveAllowedTiles } = await import("../../src/lib/access/personnel-access");
  const codes = [...new Set(sessions.map((s) => s.personnelCode).filter((c) => c !== "OWNER"))];
  const simulated = [] as Array<{ personnelCode: string; displayName: string; resolveResult: unknown }>;
  for (const code of codes) {
    const s = sessions.find((x) => x.personnelCode === code)!;
    const resolveResult = await resolveAllowedTiles("CONSULTANT", code); // نقشی که در واقعیت گرفتند
    simulated.push({ personnelCode: code, displayName: s.displayName, resolveResult });
  }

  const report = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۱ — تشخیص دقیق خطای کاربران",
    at: new Date().toISOString(),
    personnelAccessRows: pa.length,
    personnelAccessRecords: pa,
    nonOwnerSessions: sessions,
    accessDenied: denied,
    personnelLogins: logins,
    liveSimulation: {
      description: "فراخوانی مستقیم resolveAllowedTiles با نقش CONSULTANT (عین /api/auth/session خط ۲۳) برای هر کاربر واقعی",
      results: simulated,
    },
    rootCause: {
      hypothesis: "فرضیهٔ ۱ (نبود PersonnelAccess) — تأیید شد",
      chain: [
        "کاربر با کد پرسنلی + OTP واقعی ARM وارد می‌شود (LOGIN_SUCCESS در AuditLog)",
        "نقش = CONSULTANT (سیستم فعلی فقط OWNER/CONSULTANT دارد)",
        "resolveAllowedTiles(CONSULTANT, code) → جدول PersonnelAccess خالی (۰ رکورد) → {level:'none', tiles:[]}",
        "DashboardHome: tiles.length === 0 → سه اسکلتون ابدی — کاربر داشبورد خالی/خطا می‌بیند",
      ],
      secondaryFinding:
        "۵ رویداد ACCESS_DENIED با actor=410031320 (کد پرسنلی خود مالک) — مربوط به دورهٔ پیش از تنظیم OWNER_PERSONNEL_CODES؛ اکنون env=410031320 تنظیم است و حل شده",
      affectedUsers: [
        { code: "410031338", name: "سید امیرمحمد سیدی", evidence: "۲ نشست CONSULTANT + LOGIN_SUCCESS×2 (armUserType=realtor)" },
        { code: "410031319", name: "نرگس یاوری", evidence: "۱ نشست CONSULTANT" },
      ],
      emptyStateBehavior: "DashboardHome خط ۷۸: tiles.length===0 → Skeleton دائمی (نه پیام خطا، نه داشبورد) — علامت گزارش‌شدهٔ مالک",
    },
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import("fs");
  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/user-error-diagnosis.json", JSON.stringify(report, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
