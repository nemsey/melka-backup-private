/**
 * قراردادهای لایه Repository — PHASE 2
 * ------------------------------------------------------
 * نقطه واحد ورود Interfaceها + DTOها.
 * ✅ این پوشه باید ۱۰۰٪ خالص بماند: هیچ import از @prisma/client یا @/lib/db.
 *    (گارد: scripts/audit-repository-boundary.sh)
 */

export * from "./dto";
export type { TransactionRepository, TransactionListOptions, TransactionListFilter, TransactionListResult, TransactionListSummary } from "./transaction.repository";
export type { ContractRepository, ContractUpsertInput } from "./contract.repository";
export type {
  ExpertRepository,
  ExpertListOptions,
  ExpertListFilter,
  ExpertWithInteractionsDTO,
  ExpertDistinctFields,
  ExpertUpsertInput,
  InteractionUpsertInput,
  InteractionListFilter,
} from "./expert.repository";
export type { VisitRepository, VisitListFilter, VisitListSummary, VisitUpsertInput } from "./visit.repository";
export type {
  MarketRepository,
  AdWindowFilter,
  AdWindowOptions,
  AdWindowRow,
  SupplyDemandUpsertInput,
} from "./market.repository";
export type { CustomerRepository, EventArmSyncUpdate } from "./customer.repository";
export type { ListingRepository, ListingCrmTransferUpdate } from "./listing.repository";
export type { AgentMemoryRepository } from "./agent-memory.repository";
export type { PolicyRepository } from "./policy.repository";
export type { PredictionRepository } from "./prediction.repository";
export type { OutcomeRepository } from "./outcome.repository";
export type { IntegrationRepository } from "./integration.repository";
