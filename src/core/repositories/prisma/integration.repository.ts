/**
 * PrismaIntegrationRepository — پیاده‌سازی Prisma قرارداد IntegrationRepository
 */
import type { PmConnectionDTO, PmConnectionUpsertInput, IntegrationRepository } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaIntegrationRepository implements IntegrationRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async getPmConnection(): Promise<PmConnectionDTO | null> {
    return this.client.pmConnection.findFirst();
  }

  async upsertPmConnection(input: PmConnectionUpsertInput): Promise<void> {
    const base = {
      status: input.status,
      personnelCode: input.personnelCode,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.tokenEnc !== undefined ? { tokenEnc: input.tokenEnc } : {}),
      ...(input.refreshTokenEnc !== undefined ? { refreshTokenEnc: input.refreshTokenEnc } : {}),
      ...(input.lastCheckedAt !== undefined ? { lastCheckedAt: input.lastCheckedAt } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    };
    await this.client.pmConnection.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...base },
      update: base,
    });
  }

  async deletePmConnection(): Promise<void> {
    await this.client.pmConnection.deleteMany({});
  }
}
