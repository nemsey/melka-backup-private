/**
 * ایجنت هوشمند کاشی «قراردادها و اسناد»
 * ------------------------------------------------------
 * تخصص: تحلیل چرخه کامل عمر قراردادهای ملکی (صورت وضعیت‌های سامانه ARM) —
 * قیف ۹ مرحله‌ای، شناسایی گلوگاه‌های اداری، راکدماندگی قراردادها،
 * حق‌السهم مشاوران و پیگیری اسناد ناقص — با یادگیری از بازخورد مدیر.
 */

import { getContractRepository, type ContractRepository } from "@/core/repositories";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { CONTRACT_FUNNEL_ORDER, CONTRACT_REJECT_STATUSES, CONTRACT_STATUS_FA, type ContractRealtorShare } from "@/lib/melk-api/types";
import { faNumber, faPercent } from "@/lib/format";

function parseShares(raw: string | null | undefined): ContractRealtorShare[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ContractRealtorShare[];
  } catch {
    return [];
  }
}

/** وابستگی‌های تزریق‌پذیر ایجنت قراردادها */
export interface ContractAgentDeps {
  contracts?: ContractRepository;
}

export class ContractAgent extends BaseLearningAgent {
  readonly tileId = "contracts";
  readonly name = "ایجنت تحلیل قراردادها و اسناد";
  readonly insightDomains = ["FUNNEL", "BOTTLENECK", "STALLED", "SHARE", "DOCUMENT", "REJECT"] as const;

  private readonly contracts: ContractRepository;

  constructor(deps?: ContractAgentDeps) {
    super();
    this.contracts = deps?.contracts ?? getContractRepository();
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const rows = await this.contracts.findAll();
    const cards: InsightCard[] = [];
    if (rows.length === 0) return cards;

    const total = rows.length;
    const statusCounts = new Map<string, number>();
    for (const r of rows) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
    const share = (s: string) => Math.round(((statusCounts.get(s) ?? 0) / total) * 100);

    // ---- FUNNEL: قیف چرخه عمر ----
    const funnel = CONTRACT_FUNNEL_ORDER.map((s) => ({ status: s, label: CONTRACT_STATUS_FA[s], count: statusCounts.get(s) ?? 0 }));
    const reachedFinance = (statusCounts.get("confirmedByFinance") ?? 0) + (statusCounts.get("waitingForDocument") ?? 0) + (statusCounts.get("finished") ?? 0) + (statusCounts.get("payed") ?? 0);
    const conversion = total > 0 ? Math.round((reachedFinance / total) * 100) : 0;
    cards.push({
      key: "contract-funnel",
      domain: "FUNNEL",
      title: "قیف چرخه عمر قراردادها",
      body: `از ${faNumber(total)} قرارداد ثبت‌شده، ${faNumber(reachedFinance)} قرارداد به مرحله «تایید شده مالی» یا پس از آن رسیده‌اند (نرخ عبور ${faPercent(conversion)}). مراحل پرتراکم: ${funnel.filter((f) => f.count > 0).slice(0, 3).map((f) => `${f.label} (${faNumber(f.count)})`).join("، ")}.`,
      severity: conversion >= 60 ? "positive" : conversion >= 30 ? "info" : "warning",
      metrics: [
        { label: "کل قراردادها", value: faNumber(total) },
        { label: "نرخ عبور به تایید مالی", value: faPercent(conversion) },
        { label: "در انتظار تنظیم سند", value: faNumber(statusCounts.get("waitingForDocument") ?? 0) },
      ],
    });

    // ---- BOTTLENECK: گلوگاه اداری ----
    const waiting = CONTRACT_FUNNEL_ORDER.filter((s) => s.startsWith("waitingFor")).map((s) => ({ status: s, label: CONTRACT_STATUS_FA[s], count: statusCounts.get(s) ?? 0 }));
    const bottleneck = waiting.sort((a, b) => b.count - a.count)[0];
    if (bottleneck && bottleneck.count > 0) {
      const bnShare = share(bottleneck.status);
      cards.push({
        key: "contract-bottleneck",
        domain: "BOTTLENECK",
        title: `گلوگاه اداری: «${bottleneck.label}»`,
        body: `${faNumber(bottleneck.count)} قرارداد (${faPercent(bnShare)}) در مرحله «${bottleneck.label}» متوقف مانده‌اند — بیشترین تراکم بین مراحل انتظار. ${bnShare >= 50 ? "این انباشت بحرانی است؛ اختصاص منابع پیگیری فوری توصیه می‌شود." : "پایش دوره‌ای این مرحله و پیگیری مسؤولان مربوط توصیه می‌شود."}`,
        severity: bnShare >= 50 ? "critical" : bnShare >= 25 ? "warning" : "info",
        metrics: [
          { label: "قرارداد در این مرحله", value: faNumber(bottleneck.count) },
          { label: "سهم از کل", value: faPercent(bnShare) },
        ],
      });
    }

    // ---- STALLED: قراردادهای راکد ----
    const now = Date.now();
    const STALL_DAYS = 14;
    const stalled = rows.filter((r) => {
      if (!r.status.startsWith("waitingFor")) return false;
      const t = (r.contractDate ?? r.createdAt)?.getTime();
      return t != null && now - t > STALL_DAYS * 86400000;
    });
    if (stalled.length > 0) {
      cards.push({
        key: "contract-stalled",
        domain: "STALLED",
        title: "قراردادهای راکد (بیش از دو هفته در انتظار)",
        body: `${faNumber(stalled.length)} قرارداد بیش از ${faNumber(STALL_DAYS)} روز است در مراحل انتظار مانده‌اند. قدیمی‌ترین مورد ${stalled
          .slice()
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0]
          ?.contractHolo ?? "بدون هولوگرام"} است. فهرست کامل با تاریخ در جدول کاشی قابل پیگیری است.`,
        severity: stalled.length >= Math.max(3, total * 0.2) ? "warning" : "info",
        metrics: [
          { label: "قرارداد راکد", value: faNumber(stalled.length) },
          { label: "سهم از کل", value: faPercent(Math.round((stalled.length / total) * 100)) },
        ],
      });
    }

    // ---- SHARE: حق‌السهم مشاوران ----
    const consultantMap = new Map<string, { count: number; totalPercent: number; pending: number }>();
    for (const r of rows) {
      for (const s of parseShares(r.realtorListJson)) {
        const e = consultantMap.get(s.name) ?? { count: 0, totalPercent: 0, pending: 0 };
        e.count += 1;
        e.totalPercent += s.unitPercent;
        if (s.confirmation !== "confirm") e.pending += 1;
        consultantMap.set(s.name, e);
      }
    }
    const topConsultants = [...consultantMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    if (topConsultants.length > 0) {
      cards.push({
        key: "contract-share",
        domain: "SHARE",
        title: "حق‌السهم مشاوران در قراردادها",
        body: `${faNumber(consultantMap.size)} مشاور در ${faNumber(total)} قرارداد حق‌السهم دارند. پرحجم‌ترین: ${topConsultants
          .map(([name, e]) => `${name} (${faNumber(e.count)} قرارداد، میانگین ${faPercent(Math.round(e.totalPercent / e.count))})`)
          .join("؛ ")}. ${[...consultantMap.values()].some((e) => e.pending > 0) ? "برخی تأییدها هنوز باز است — پیگیری تأیید حق‌السهم توصیه می‌شود." : "همه سهم‌های ثبت‌شده تأیید شده‌اند."}`,
        severity: "info",
        metrics: topConsultants.slice(0, 3).map(([name, e]) => ({ label: name, value: `${faNumber(e.count)} قرارداد` })),
      });
    }

    // ---- DOCUMENT: اسناد ناقص ----
    const missingDoc = rows.filter(
      (r) => (r.status === "confirmedByFinance" || r.status === "waitingForDocument") && !r.documentDate
    );
    if (missingDoc.length > 0) {
      cards.push({
        key: "contract-document",
        domain: "DOCUMENT",
        title: "قراردادهای تاییدشده بدون تاریخ سند",
        body: `${faNumber(missingDoc.length)} قرارداد با وضعیت «تایید شده مالی» یا «در انتظار تنظیم سند» هنوز تاریخ تنظیم سند ندارند — یعنی سند رسمی ثبت نشده است. هماهنگی با دفتر اسناد رسمی و طرفین برای تکمیل فرآیند تنظیم سند ضروری است.`,
        severity: missingDoc.length >= 3 ? "warning" : "info",
        metrics: [
          { label: "قرارداد بدون تاریخ سند", value: faNumber(missingDoc.length) },
          { label: "سهم از تاییدشده‌ها", value: faPercent(reachedFinance > 0 ? Math.round((missingDoc.length / Math.max(1, reachedFinance)) * 100) : 0) },
        ],
      });
    }

    // ---- REJECT: رد و فسخ ----
    const rejectedTotal = CONTRACT_REJECT_STATUSES.reduce((sum, s) => sum + (statusCounts.get(s) ?? 0), 0);
    if (rejectedTotal > 0) {
      const rejectBreakdown = CONTRACT_REJECT_STATUSES
        .map((s) => `${CONTRACT_STATUS_FA[s]}: ${faNumber(statusCounts.get(s) ?? 0)}`)
        .filter((s) => !s.endsWith("۰"))
        .join("، ");
      cards.push({
        key: "contract-reject",
        domain: "REJECT",
        title: "قراردادهای رد/فسخ‌شده",
        body: `${faNumber(rejectedTotal)} قرارداد (${faPercent(Math.round((rejectedTotal / total) * 100))}) به پایان منفی رسیده‌اند (${rejectBreakdown}). بررسی الگوی دلایل رد — به‌ویژه «رد شده مالی» — برای اصلاح فرآیند ثبت مالی توصیه می‌شود.`,
        severity: rejectedTotal / total >= 0.2 ? "warning" : "info",
        metrics: [
          { label: "مجموع رد/فسخ", value: faNumber(rejectedTotal) },
          { label: "رد شده مالی", value: faNumber(statusCounts.get("rejectedByFinance") ?? 0) },
        ],
      });
    }

    return cards;
  }
}

export const contractAgent = new ContractAgent();
