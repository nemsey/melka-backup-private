/**
 * PrismaIntegrationRepository — پیاده‌سازی Prisma قرارداد IntegrationRepository
 * P6.5-11: صندوقچهٔ ماندگار ARM (ArmConnection) + نقطهٔ ازسرگیری (SyncCheckpoint)
 */
import type { Prisma } from "@prisma/client";
import type {
  PmConnectionDTO,
  PmConnectionUpsertInput,
  ArmConnectionDTO,
  ArmConnectionUpsertInput,
  SyncCheckpointDTO,
  SyncCheckpointUpsertInput,
  IntegrationRepository,
} from "../interfaces";
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

  // ---- P6.5-11 (بند ث) — صندوقچهٔ ماندگار ARM ----

  async getArmConnection(ownerKey: string): Promise<ArmConnectionDTO | null> {
    return this.client.armConnection.findUnique({ where: { ownerKey } });
  }

  async getLatestArmConnection(): Promise<ArmConnectionDTO | null> {
    return this.client.armConnection.findFirst({
      where: { status: "connected", tokenEnc: { not: null } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async upsertArmConnection(input: ArmConnectionUpsertInput): Promise<void> {
    const base = {
      personnelCode: input.personnelCode ?? undefined,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.userType !== undefined ? { userType: input.userType } : {}),
      ...(input.tokenEnc !== undefined ? { tokenEnc: input.tokenEnc } : {}),
      ...(input.refreshTokenEnc !== undefined ? { refreshTokenEnc: input.refreshTokenEnc } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.lastRefreshedAt !== undefined ? { lastRefreshedAt: input.lastRefreshedAt } : {}),
      ...(input.lastRestoredAt !== undefined ? { lastRestoredAt: input.lastRestoredAt } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    };
    await this.client.armConnection.upsert({
      where: { ownerKey: input.ownerKey },
      create: { ownerKey: input.ownerKey, ...base },
      update: base,
    });
  }

  async clearArmConnectionTokens(ownerKey: string): Promise<void> {
    await this.client.armConnection.updateMany({
      where: { ownerKey },
      data: { tokenEnc: null, refreshTokenEnc: null, status: "disconnected" },
    });
  }

  // ---- P6.5-11 (بند ب) — نقطهٔ ازسرگیری همگام‌سازی ----

  async getSyncCheckpoint(id: string): Promise<SyncCheckpointDTO | null> {
    return this.client.syncCheckpoint.findUnique({ where: { id } });
  }

  async upsertSyncCheckpoint(input: SyncCheckpointUpsertInput): Promise<void> {
    // cycleId در create الزامی است (بدون default) — پیش‌فرض امن فقط برای create؛
    // در update فقط وقتی واقعاً داده شده بازنویسی می‌شود (upsert جزئی مقدار قبلی را نگه می‌دارد)
    const rest = {
      ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
      ...(input.lastCompletedPage !== undefined ? { lastCompletedPage: input.lastCompletedPage } : {}),
      ...(input.totalPages !== undefined ? { totalPages: input.totalPages } : {}),
      ...(input.totalAtSource !== undefined ? { totalAtSource: input.totalAtSource } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    };
    await this.client.syncCheckpoint.upsert({
      where: { id: input.id },
      create: { id: input.id, cycleId: input.cycleId ?? "legacy", ...rest },
      update: { ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}), ...rest },
    });
  }
}
