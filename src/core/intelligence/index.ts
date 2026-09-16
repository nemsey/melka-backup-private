/**
 * لایه هوشمندی (Intelligence Layer) — نقطه ورود واحد (PHASE 3 + PHASE 4)
 * ------------------------------------------------------
 * BaseIntelligentAgent با ۱۱ قرارداد موتور (PHASE 3) + بدنه موتورهای
 * Context و Memory (PHASE 4) — قابل‌تزریق، اثبات‌شده، هنوز مصرف‌نشده در خروجی.
 */

export { BaseIntelligentAgent, type BaseIntelligentAgentOptions } from "./base-intelligent-agent";
export {
  createDefaultEngineDeps,
  PassthroughContextEngine,
  type EngineDeps,
} from "./engine-deps";
export * from "./engines";
export * from "./memory";
export * from "./context";
