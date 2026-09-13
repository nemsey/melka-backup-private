/**
 * لایه ایجنت‌های هوشمند — نقطه ورود واحد
 * رجیستری ایجنت‌ها: هر کاشی با شناسه خود به ایجنتش دسترسی دارد.
 * افزودن ایجنت جدید = افزودن یک کلاس و ثبت در agentRegistry.
 */

import { BaseLearningAgent } from "./base-agent";
import { transactionAgent } from "./transaction-agent";
import { expertAgent } from "./expert-agent";
import { extractionAgent } from "./extraction-agent";
import { visitsAgent } from "./visits-agent";
import { supplyDemandAgent } from "./supply-demand-agent";
import { divarAgent } from "./divar-agent";
import type { BaseLearningAgent as Agent } from "./base-agent";

const agents = new Map<string, Agent>([
  [transactionAgent.tileId, transactionAgent],
  [expertAgent.tileId, expertAgent],
  [extractionAgent.tileId, extractionAgent],
  [visitsAgent.tileId, visitsAgent],
  [supplyDemandAgent.tileId, supplyDemandAgent],
  [divarAgent.tileId, divarAgent],
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
