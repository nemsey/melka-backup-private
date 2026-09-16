/**
 * لایه هوشمندی (Intelligence Layer) — نقطه ورود واحد (PHASE 3)
 * ------------------------------------------------------
 * اسکلت BaseIntelligentAgent با ۱۱ قرارداد موتور.
 * ⚠️ PHASE 3 فقط «شکل» را می‌سازد — بدنه موتورها در PHASE 4 تا 8.
 */

export { BaseIntelligentAgent, type BaseIntelligentAgentOptions } from "./base-intelligent-agent";
export {
  createDefaultEngineDeps,
  PassthroughContextEngine,
  type EngineDeps,
} from "./engine-deps";
export * from "./engines";
