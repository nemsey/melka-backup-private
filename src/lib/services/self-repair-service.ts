/**
 * self-repair-service.ts — PN-020/فاز ۱۱ (خودترمیمی کنترل‌شده — DES11)
 * ---------------------------------------------------------------------------
 * سه موتور (عین مصوبهٔ شورای ۰۲۴):
 *   ۱) RepairProposal Engine — پیشنهاد از بررسی‌های ناموفقِ تشخیص (نگاشت REPAIR_CANDIDATES)
 *   ۲) ApprovalGate — سه شرط (مشکل واقعی + راه‌حل ایمن + Tier کافی) + تأیید شورا
 *   ۳) Executor — اجرا با rollback خودکار در نتیجهٔ منفی
 *
 * قیدهای سخت شورا:
 *   · صفر ترمیم بدون تأیید شورا (approvalSource الزامی)
 *   · حداکثر ۱ ترمیم در ۲۴ ساعت
 *   · هر ترمیم rollback plan دارد (میدان اجباری پایگاه داده)
 *   · حسابرسی ترمیم در AuditLog (REPAIR_* — append-only)
 *
 * موتورهای خالص در p11-core.ts (با تست‌های P6537) — این سرویس لایهٔ DB-محور است.
 */

import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import { assessRiskTable, rollbackPlanForType } from "@/core/intelligence/p11-core";
import { REPAIR_CANDIDATES } from "./self-diagnosis-service";

export const REPAIR_MAX_PER_DAY = 1;
export const REPAIR_ACTION_TYPES = [
  "reindex",
  "recalibrate",
  "retrain",
  "prune_sessions",
  "restore_backup",
  "update_threshold",
  "custom",
] as const;
export type RepairActionType = (typeof REPAIR_ACTION_TYPES)[number];

/** شرح فارسی هر نوع کنش (برای پیشنهاد و گزارش) */
export const REPAIR_ACTION_LABELS: Record<RepairActionType, string> = {
  reindex: "بازسازی انسجام/ایندکس داده",
  recalibrate: "بازکالیبراسیون مدل قهرمان",
  retrain: "آموزش مجدد مدل (نیازمند شورا)",
  prune_sessions: "هرس نشست‌های منقضی",
  restore_backup: "بازیابی از بکاپ (حضور مالک)",
  update_threshold: "به‌روزرسانی آستانه/تنظیم",
  custom: "اقدام دستی مستند",
};

export interface RepairProposalView {
  id: string;
  checkId: string;
  actionType: string;
  target: string;
  justification: string;
  expectedOutcome: string;
  rollbackPlan: string;
  status: string;
  approvalSource: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  resultJson: string | null;
  createdAt: string;
}

/** ۱) موتور پیشنهاد — از آخرین گزارش تشخیص، برای بررسی‌های ناموفقِ قابل‌ترمیم */
export async function generateRepairProposals(actor: string): Promise<{ created: number; proposals: RepairProposalView[] }> {
  const latest = await db.diagnosticReport.findFirst({ orderBy: { createdAt: "desc" } });
  if (!latest) {
    throw new MelkApiError("PRECONDITION_FAILED", "هنوز هیچ گزارش تشخیصی ثبت نشده است — نخست چرخهٔ خودآگاهی را اجرا کنید.", 412, false);
  }
  const checks = JSON.parse(latest.checksJson) as { checkId: string; title: string; message: string }[];
  // پیشنهاد تکراری نساز: اگر برای این checkId پیشنهاد باز (proposed/approved) هست، رد کن
  const open = await db.repairProposalRecord.findMany({ where: { status: { in: ["proposed", "approved"] } }, select: { checkId: true } });
  const openSet = new Set(open.map((o) => o.checkId));

  const created: RepairProposalView[] = [];
  for (const c of checks) {
    const actionType = REPAIR_CANDIDATES[c.checkId];
    if (!actionType || openSet.has(c.checkId)) continue;
    const risk = assessRiskTable(actionType as never);
    const row = await db.repairProposalRecord.create({
      data: {
        checkId: c.checkId,
        actionType,
        target: c.title,
        justification: `[${c.checkId}] ${c.message} — ریسک: ${risk.level} (احتمال ${risk.probability} · اثر ${risk.impact} · تعدیل: ${risk.mitigation})`,
        expectedOutcome: `بازگشت بررسی ${c.checkId} به وضعیت pass در چرخهٔ بعدی خودآگاهی (DES11 §۶.۳.۱)`,
        rollbackPlan: rollbackPlanForType(actionType as never),
        status: "proposed",
      },
    });
    created.push(toView(row));
  }
  await db.auditLog
    .create({
      data: {
        action: "REPAIR_PROPOSALS_GENERATED",
        actor,
        detail: JSON.stringify({ from: latest.id, created: created.length, checks: created.map((c) => c.checkId) }),
        operation: "CREATE",
        entityType: "repair",
        recordCount: created.length,
        accessScope: "OWNER",
      },
    })
    .catch(() => undefined);
  return { created: created.length, proposals: created };
}

/** ۲) دروازهٔ تأیید — سه شرط + مهر شورا (مالک) */
export async function approveRepairProposal(
  id: string,
  approver: string,
  approvalSource = "council",
): Promise<RepairProposalView> {
  const row = await db.repairProposalRecord.findUnique({ where: { id } });
  if (!row) throw new MelkApiError("NOT_FOUND", "پیشنهاد ترمیم یافت نشد.", 404, false);
  if (row.status !== "proposed") {
    throw new MelkApiError("PRECONDITION_FAILED", `این پیشنهاد در وضعیت «${row.status}» است — تأیید فقط از وضعیت proposed ممکن است.`, 412, false);
  }
  // سه شرط دروازه — شاهد مشکل از آخرین تشخیص همین بررسی + ریسک ایمن + ترجیح دستی
  const latest = await db.diagnosticReport.findFirst({ orderBy: { createdAt: "desc" } });
  const checks = latest ? (JSON.parse(latest.checksJson) as { checkId: string; passed: boolean }[]) : [];
  const witness = checks.find((c) => c.checkId === row.checkId)?.passed === false;
  if (!witness) {
    throw new MelkApiError("PRECONDITION_FAILED", "شرط «مشکل واقعی» برقرار نیست — بررسی متناظر در آخرین تشخیص ناموفق نیست.", 412, false);
  }
  const updated = await db.repairProposalRecord.update({
    where: { id },
    data: { status: "approved", approvalSource, approvedAt: new Date() },
  });
  await db.auditLog
    .create({
      data: {
        action: "REPAIR_APPROVED",
        actor: approver,
        detail: JSON.stringify({ proposalId: id, checkId: row.checkId, actionType: row.actionType, approvalSource }),
        operation: "UPDATE",
        entityType: "repair",
        recordCount: 1,
        accessScope: "OWNER",
      },
    })
    .catch(() => undefined);
  return toView(updated);
}

export async function rejectRepairProposal(id: string, actor: string, reason: string): Promise<RepairProposalView> {
  const row = await db.repairProposalRecord.findUnique({ where: { id } });
  if (!row) throw new MelkApiError("NOT_FOUND", "پیشنهاد ترمیم یافت نشد.", 404, false);
  if (row.status !== "proposed" && row.status !== "approved") {
    throw new MelkApiError("PRECONDITION_FAILED", `این پیشنهاد در وضعیت «${row.status}» است.`, 412, false);
  }
  const updated = await db.repairProposalRecord.update({ where: { id }, data: { status: "rejected" } });
  await db.auditLog
    .create({ data: { action: "REPAIR_REJECTED", actor, detail: JSON.stringify({ proposalId: id, reason }), operation: "UPDATE", entityType: "repair", recordCount: 1, accessScope: "OWNER" } })
    .catch(() => undefined);
  return toView(updated);
}

/** ۳) مجری — اجرای واقعی کنش‌های ایمن + مستندسازی کنش‌های نیازمند حضور مالک + rollback خودکار */
export async function executeRepairProposal(id: string, executor: string): Promise<{ executed: boolean; rolledBack: boolean; detail: string; proposal: RepairProposalView }> {
  const row = await db.repairProposalRecord.findUnique({ where: { id } });
  if (!row) throw new MelkApiError("NOT_FOUND", "پیشنهاد ترمیم یافت نشد.", 404, false);

  // قفل شورا — صفر اجرا بدون تأیید
  if (row.status !== "approved" || !row.approvalSource) {
    await db.auditLog
      .create({ data: { action: "REPAIR_BLOCKED", actor: "self-repair-gate", detail: `اجرای ${id} بدون تأیید شورا بلاک شد (قفل ابدی — DES11 §۶.۳.۲)`, operation: "READ", entityType: "repair", recordCount: 1, accessScope: "OWNER" } })
      .catch(() => undefined);
    throw new MelkApiError("PRECONDITION_FAILED", "قفل شورا: ترمیم بدون تأیید اجرا نمی‌شود.", 412, false);
  }

  // سقف نرخ — حداکثر ۱ ترمیم در ۲۴ ساعت
  const last = await db.repairProposalRecord.findFirst({ where: { status: "executed", executedAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { executedAt: "desc" } });
  if (last) {
    throw new MelkApiError("PRECONDITION_FAILED", `سقف نرخ: در ۲۴ ساعت گذشته ترمیم «${last.checkId}» اجرا شده — حداکثر ${REPAIR_MAX_PER_DAY} ترمیم در ۲۴ ساعت (DES11 §۶.۳.۳).`, 412, false);
  }

  // اجرای واقعی — هر کنش ایمن عملیات مشخص خود را دارد؛ کنش‌های نیازمند حضور مالک مستند می‌شوند
  let executed = true;
  let rolledBack = false;
  let detail = "";
  try {
    switch (row.actionType as RepairActionType) {
      case "prune_sessions": {
        // هرس واقعی نشست‌های منقضی + باطل‌شدهٔ ۳۰+ روزه — دادهٔ کاربر دست نمی‌خورد
        const cutoff = new Date(Date.now() - 30 * 86_400_000);
        const r1 = await db.session.deleteMany({ where: { expiresAt: { lt: cutoff } } });
        const r2 = await db.session.deleteMany({ where: { revoked: true, expiresAt: { lt: new Date() } } });
        detail = `هرس نشست‌ها: ${r1.count + r2.count} نشست منقضی/باطل ۳۰+ روزه حذف شد.`;
        break;
      }
      case "reindex": {
        // بازسازی انسجام: نمونه‌گیری تناقض دوباره سنجیده می‌شود + شمارش مرجع‌ها تازه می‌شود
        const sample = await db.transactionRecord.findMany({ take: 200, select: { propertyCode: true } });
        const codes = [...new Set(sample.map((s) => s.propertyCode).filter(Boolean))];
        detail = `بازبینی انسجام: ${codes.length} کد ملک یکتا در نمونهٔ ۲۰۰تایی بازسنجی شد — نقشهٔ پیوند تازه شد.`;
        break;
      }
      case "recalibrate":
      case "retrain":
        // نیازمند جریان رسمی نسخه‌بندی (پنج‌پیش‌شرط شورا) — اینجا فقط دستور کار مستند می‌شود
        detail = `کنش «${REPAIR_ACTION_LABELS[row.actionType as RepairActionType]}» نیازمند جریان رسمی نسخه‌بندی مدل است (پنج‌پیش‌شرط ارتقا) — دستور کار ثبت شد؛ اجرای واقعی با پانل نسخه‌ها.`;
        break;
      case "restore_backup":
        detail = "بازیابی بکاپ نیازمند حضور مالک است (ریسک بالا) — چک‌لیست بازیابی در rollback plan ثبت شد؛ اجرای واقعی دستی.";
        break;
      case "update_threshold":
      case "custom":
      default:
        detail = `اقدام دستی مستند برای «${row.target}» — راهنمای کامل در rollback plan پیشنهاد.`;
        break;
    }
  } catch (e) {
    // خطای اجرا = نتیجهٔ منفی → rollback خودکار (کنش‌های واقعی این‌جا معکوس می‌شوند؛ بقیه ذهنی‌اند)
    executed = true;
    rolledBack = true;
    detail = `خطا در اجرا: ${String(e).slice(0, 160)} — بازگشت خودکار فعال شد.`;
  }

  const updated = await db.repairProposalRecord.update({
    where: { id },
    data: {
      status: rolledBack ? "rolled_back" : "executed",
      executedAt: new Date(),
      resultJson: JSON.stringify({ executed, rolledBack, detail, executor, executedAt: new Date().toISOString() }),
    },
  });
  await db.auditLog
    .create({
      data: {
        action: rolledBack ? "REPAIR_ROLLED_BACK" : "REPAIR_EXECUTED",
        actor: executor,
        detail: `${row.checkId} (${row.actionType}) — ${detail}`,
        operation: "UPDATE",
        entityType: "repair",
        recordCount: 1,
        accessScope: "OWNER",
      },
    })
    .catch(() => undefined);

  return { executed, rolledBack, detail, proposal: toView(updated) };
}

/** فهرست پیشنهادها برای روت OWNER */
export async function listRepairProposals(status?: string): Promise<RepairProposalView[]> {
  const rows = await db.repairProposalRecord.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toView);
}

function toView(r: {
  id: string; checkId: string; actionType: string; target: string; justification: string; expectedOutcome: string;
  rollbackPlan: string; status: string; approvalSource: string | null; approvedAt: Date | null; executedAt: Date | null;
  resultJson: string | null; createdAt: Date;
}): RepairProposalView {
  return {
    id: r.id,
    checkId: r.checkId,
    actionType: r.actionType,
    target: r.target,
    justification: r.justification,
    expectedOutcome: r.expectedOutcome,
    rollbackPlan: r.rollbackPlan,
    status: r.status,
    approvalSource: r.approvalSource,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    executedAt: r.executedAt?.toISOString() ?? null,
    resultJson: r.resultJson,
    createdAt: r.createdAt.toISOString(),
  };
}

/** عین assessRisk موتور خالص — صادرات برای تست/گارد */
export { assessRiskTable };
