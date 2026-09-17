/**
 * لایه Repository — انبار مشترک داده (PHASE 2)
 * ------------------------------------------------------
 * الگوی Strangler Fig: هر Repository در کنار کد فعلی ساخته می‌شود؛
 * مصرف‌کننده‌ها به‌تدریج (P2-02 ایجنت‌ها، P2-03 روت‌ها) مهاجرت می‌کنند.
 *
 * ساختار:
 *   interfaces/  → قرارداد خالص (DTO + Interface) — صفر Prisma
 *   prisma/      → پیاده‌سازی Prisma — تنها محل فراخوانی db.*
 *
 * کارخانه: توابع getXxxRepository() نمونه پیش‌فرض (Prisma + db تولید)
 * برمی‌گردانند. برای تست، مستقیماً `new PrismaXxxRepository({ client })`
 * با کلاینت پایگاه ایزوله ساخته شود (E.3: db/test-repository.db).
 */

export * from "./interfaces";
export * from "./prisma";
export * from "./tenant";

import { PrismaTransactionRepository } from "./prisma/transaction.repository";
import { PrismaContractRepository } from "./prisma/contract.repository";
import { PrismaExpertRepository } from "./prisma/expert.repository";
import { PrismaVisitRepository } from "./prisma/visit.repository";
import { PrismaMarketRepository } from "./prisma/market.repository";
import { PrismaCustomerRepository } from "./prisma/customer.repository";
import { PrismaListingRepository } from "./prisma/listing.repository";
import { PrismaAgentMemoryRepository } from "./prisma/agent-memory.repository";
import { PrismaPolicyRepository } from "./prisma/policy.repository";
import { PrismaPredictionRepository } from "./prisma/prediction.repository";
import { PrismaOutcomeRepository } from "./prisma/outcome.repository";
import { PrismaIntegrationRepository } from "./prisma/integration.repository";
import { PrismaRequestRepository } from "./prisma/request.repository";
import { PrismaPropertyRecordRepository } from "./prisma/property.repository";
import type {
  ContractRepository,
  CustomerRepository,
  ExpertRepository,
  IntegrationRepository,
  ListingRepository,
  MarketRepository,
  PolicyRepository,
  PredictionRepository,
  OutcomeRepository,
  PropertyRecordRepository,
  TransactionRepository,
  VisitRepository,
  AgentMemoryRepository,
  RequestRepository,
} from "./interfaces";

// ===================== کارخانه (Factory) =====================

export function getTransactionRepository(): TransactionRepository {
  return new PrismaTransactionRepository();
}

export function getContractRepository(): ContractRepository {
  return new PrismaContractRepository();
}

export function getExpertRepository(): ExpertRepository {
  return new PrismaExpertRepository();
}

export function getVisitRepository(): VisitRepository {
  return new PrismaVisitRepository();
}

export function getMarketRepository(): MarketRepository {
  return new PrismaMarketRepository();
}

export function getCustomerRepository(): CustomerRepository {
  return new PrismaCustomerRepository();
}

export function getListingRepository(): ListingRepository {
  return new PrismaListingRepository();
}

export function getAgentMemoryRepository(): AgentMemoryRepository {
  return new PrismaAgentMemoryRepository();
}

export function getPolicyRepository(): PolicyRepository {
  return new PrismaPolicyRepository();
}

export function getPredictionRepository(): PredictionRepository {
  return new PrismaPredictionRepository();
}

export function getOutcomeRepository(): OutcomeRepository {
  return new PrismaOutcomeRepository();
}

export function getIntegrationRepository(): IntegrationRepository {
  return new PrismaIntegrationRepository();
}

export function getRequestRepository(): RequestRepository {
  return new PrismaRequestRepository();
}

export function getPropertyRecordRepository(): PropertyRecordRepository {
  return new PrismaPropertyRecordRepository();
}

// ===================== بسته پیش‌فرض ایجنت‌ها =====================

/**
 * بسته Repository ایجنت‌ها — تزریق‌پذیر برای تست (P2-02).
 * BaseLearningAgent و ایجنت‌های تخصصی می‌توانند override کنند.
 */
export interface AgentRepositories {
  memory: AgentMemoryRepository;
  policy: PolicyRepository;
}

export function getDefaultAgentRepositories(): AgentRepositories {
  return {
    memory: getAgentMemoryRepository(),
    policy: getPolicyRepository(),
  };
}
