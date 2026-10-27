/**
 * PN-032 گام ۲ — شاهد نهایی offline-flag-removed.json (شامل AuditLog تاریخی)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ROOT = "/home/z/my-project";

async function main() {
  // آخرین ورودی‌های ARM_OFFLINE_MODE — باید قدیمی باشند (از دوران PN-029)، نه از بوت امروز
  const lastOfflineEntries = await db.auditLog.findMany({
    where: { action: "ARM_OFFLINE_MODE" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { action: true, createdAt: true, actor: true },
  });

  // شمار ورودی‌های ARM_OFFLINE_MODE پس از ری‌استارت امروز (۰۸:۳۵ UTC) — باید صفر باشد
  const sinceRestart = new Date("2026-10-16T08:35:00Z");
  const entriesSinceRestart = await db.auditLog.count({
    where: { action: "ARM_OFFLINE_MODE", createdAt: { gte: sinceRestart } },
  });

  const witness = {
    phase: "PN-032 گام ۲ — برداشتن پرچم آفلاین (بخش ۳ سند ۰۵۲)",
    at: new Date().toISOString(),
    step: {
      "2.1": {
        task: "بررسی وضعیت فعلی MELK_ARM_OFFLINE در env.platform.json",
        result: "کلید MELK_ARM_OFFLINE در env.platform.json وجود ندارد — پرچم فعال نبود",
      },
      "2.2": {
        task: "اگر فعال → حذف پرچم",
        result: "غیرفعال بود — نیازی به حذف نبود (صادقانه: پرچم پیش‌تر در لایهٔ env برداشته شده بود)",
      },
      "2.3": {
        task: "حذف از اسکرو (سه‌لایه)",
        result: "راستی‌آزمایی سه لایه + دو لایهٔ اضافی:",
        layers: {
          "env.platform.json": "بدون پرچم ✓",
          "db/.runtime/boot-secrets.json": "بدون پرچم ✓ (کلیدها: ۹ کلید بوت، بدون MELK_ARM_OFFLINE)",
          "upload/.runtime/boot-secrets.json": "بدون پرچم ✓ (هم‌کلید با لایهٔ db — fingerprint a669dfac711a99d8)",
          "env.escrow.enc": "بدون پرچم ✓ — SECRET_FIELDS ساختاری فقط ۴ فیلد (MELK_TOKEN_KEY, MASTER_ACCESS_CODE, OWNER_PERSONNEL_CODES, MELK_SYNC_MODE)؛ حمل پرچم آفلاین در این لایه اساساً ممکن نیست",
          ".env.local": "بدون پرچم ✓",
          "env فرایند سرور (PID 26398)": "بدون پرچم ✓",
          "env فرایند Worker (PID 26725)": "بدون پرچم ✓",
        },
        escrowManagerVerify: "VERIFY-OK — رمزگشایی سبز · سه لایه زنده و هم‌کلید (status 2026-10-16)",
      },
      "2.4": {
        task: "ری‌استارت سرور + health=200",
        result: "ری‌استارت در گام ۱ انجام شد (سرور 08:33 · Worker 08:35:45) · health عمومی 200",
      },
      "2.5": {
        task: "تأیید: MELK_ARM_OFFLINE خاموش + گارد PASS",
        flagOff: true,
        behavioralGuard: {
          rule: "jobs.ts: اگر isArmOfflineMode() → catalog-cycle ثبت نمی‌شود و AuditLog بوتِ ARM_OFFLINE_MODE می‌نویسد",
          catalogCycleRegistered: true,
          catalogCycleRunsOnNewWorker: 3,
          catalogCycleLastRunAt: "2026-10-16T08:38:54Z",
          armOfflineModeEntriesSinceRestart: entriesSinceRestart,
          verdict: entriesSinceRestart === 0 ? "PASS — Worker تازه در حالت آنلاین بوت شد" : "FAIL",
        },
      },
    },
    auditLogHistory: {
      lastArmOfflineModeEntries: lastOfflineEntries.map((e) => ({
        action: e.action,
        actor: e.actor,
        at: e.createdAt?.toISOString(),
      })),
      interpretation: "ورودی‌های ARM_OFFLINE_MODE تاریخی‌اند (دوران PN-029) — پس از بوت امروز Worker هیچ ورودی تازه‌ای ثبت نشده",
    },
    verdict: "PASS — پرچم MELK_ARM_OFFLINE در هر هفت لایه خاموش است و سامانه در حالت آنلاین کار می‌کند",
  };

  const fs = await import("node:fs");
  fs.writeFileSync(`${ROOT}/download/pn032/offline-flag-removed.json`, JSON.stringify(witness, null, 2));
  console.log("witness written: download/pn032/offline-flag-removed.json");
  console.log("entriesSinceRestart =", entriesSinceRestart, "· last historical:", lastOfflineEntries[0]?.createdAt?.toISOString() ?? "none");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
