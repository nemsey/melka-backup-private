/**
 * PrismaIntegrationRepository — پیاده‌سازی Prisma قرارداد IntegrationRepository
 */
import type { Prisma } from "@prisma/client";
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

  /** P6.5-03 — checkpoint یکپارچه Bulk Import (فقط همین ستون؛ فیلدهای sync منظم دست‌نخورده — §۱.۵) */
  async getBulkImportCheckpoint(): Promise<string | null> {
    const state = await this.client.syncState.findUnique({ where: { id: "singleton" }, select: { bulkImportCheckpoint: true } });
    return state?.bulkImportCheckpoint ?? null;
  }

  async setBulkImportCheckpoint(json: string): Promise<void> {
    await this.client.syncState.upsert({
      where: { id: "singleton" },
      update: { bulkImportCheckpoint: json },
      create: { id: "singleton", bulkImportCheckpoint: json },
    });
  }
}
