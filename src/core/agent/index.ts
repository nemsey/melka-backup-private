/**
 * لایه ایجنت‌های هوشمند — نقطه ورود واحد
 * رجیستری ایجنت‌ها: هر کاشی با شناسه خود به ایجنتش دسترسی دارد.
 * افزودن ایجنت جدید = افزودن یک کلاس و ثبت در agentRegistry.
 *
 * P6.5-11 (بندهای پ و ج):
 *   · ایجنت ادغامی جدید «transactions-contracts» (۲۱ دامنهٔ بینش — الزام ≥۱۵)
 *   · کاشی‌های transactions / contracts / finance-commission ادغام شدند؛
 *     ایجنت‌های قدیمی در رجیستری می‌مانند تا حافظه/بازخورد/نسخه‌های سیاستشان
 *     از مسیر API در دسترس بماند (نکتهٔ بسیار مهم ۲ — داده هرگز حذف نمی‌شود).
 *   · ایجنت بازدیدها از رجیستری خارج شد (کاشی حذف شد — بند ج)؛ بینش‌هایش به
 *     ایجنت ادغامی (VISIT_*) و ایجنت کارشناسان و ایجنت آگهی‌های ARM مهاجرت کرد.
 * P6530/گام ۵: ایجنت‌های M5 (شاخص قیمت)، M6 (عرضه و تقاضا) و M7 (استخراج)
 *   به‌طور کامل حذف شدند — حافظه/بازخورد/سیاست آن‌ها در DB ماندگار است (دادهٔ مقدس).
 */

import { BaseLearningAgent } from "./base-agent";
import { transactionAgent } from "./transaction-agent";
import { expertAgent } from "./expert-agent";
import { divarAgent } from "./divar-agent";
import { contractAgent } from "./contract-agent";
import { customerClubAgent } from "./customer-club-agent";
import { financeAgent } from "./finance-agent";
import { listingAgent } from "./listing-agent";
import { requestAgent } from "./request-agent";
import { armListingAgent } from "./arm-listing-agent";
import { armRequestAgent } from "./arm-request-agent";
import { transactionsContractsAgent } from "./transactions-contracts-agent";
// PN-011 خامسا-۲ — ایجنت کاشی تطبیق هوشمند (M5): بدون آن، روت بازخورد تطبیق 404 می‌داد
// و حلقهٔ یادگیری وزن‌ها هرگز تغذیه نمی‌شد (کشف زندهٔ PN-011 — شکاف نهفته از P6545).
import { smartMatchingAgent } from "./smart-matching-agent";
// PN-014 — ایجنت‌های سبک سه کاشی تحلیلی: بدون آن‌ها TileCard برای نشان ایجنت این سه
// کاشی، /api/agent/<id>/stats می‌خواند و 404 می‌گرفت (عین شکاف نهفتهٔ PN-011).
import { marketIndexAgent, dataCoverageAgent, learningTierAgent } from "./lite-agents";
import type { BaseLearningAgent as Agent } from "./base-agent";

const agents = new Map<string, Agent>([
  // P6.5-11 — ایجنت کاشی ادغامی «معاملات و قراردادهای ملک تبریز» (بند پ)
  [transactionsContractsAgent.tileId, transactionsContractsAgent],
  [expertAgent.tileId, expertAgent],
  [divarAgent.tileId, divarAgent],
  [customerClubAgent.tileId, customerClubAgent],
  [listingAgent.tileId, listingAgent],
  [requestAgent.tileId, requestAgent],
  [armListingAgent.tileId, armListingAgent],
  [armRequestAgent.tileId, armRequestAgent],
  [smartMatchingAgent.tileId, smartMatchingAgent],
  // PN-014 — سه کاشی تحلیلی: بستن شکاف 404 آمار ایجنت (کشف زندهٔ شواهد بصری همین پرونده)
  [marketIndexAgent.tileId, marketIndexAgent],
  [dataCoverageAgent.tileId, dataCoverageAgent],
  [learningTierAgent.tileId, learningTierAgent],
  // P6.5-12: کاشی مشتریان حذف شد (بند ب مرحلهٔ قبل) — ایجنت در رجیستری می‌ماند
  // تا حافظه/بازخورد/نسخه‌های سیاستش از مسیر API در دسترس بماند (نکتهٔ ۲)
  // ایجنت‌های کاشی‌های ادغام‌شده — حفظ‌شده برای دسترسی تاریخچهٔ یادگیری (نکتهٔ ۲)
  [transactionAgent.tileId, transactionAgent],
  [contractAgent.tileId, contractAgent],
  [financeAgent.tileId, financeAgent],
]);

/** دسترسی به ایجنت یک کاشی — null اگر کاشی ایجنت ندارد */
export function getAgent(tileId: string): Agent | null {
  return agents.get(tileId) ?? null;
}

export function listAgents(): { tileId: string; name: string }[] {
  return [...agents.values()].map((a) => ({ tileId: a.tileId, name: a.name }));
}

export { BaseLearningAgent };
export * from "./analyzers";
export type { InsightCard, RenderedInsight, MemorySnippet } from "./base-agent";
export type { AgentPolicyContent, AgentPolicyRecord } from "./policy";
