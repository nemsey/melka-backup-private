/**
 * PrismaOutcomeRepository — پیاده‌سازی Prisma قرارداد OutcomeRepository
 */
import type {
  CommissionCalcInput,
  CommissionCalcLogDTO,
  DivarRejectInput,
  DivarRejectLogDTO,
  LookupLogDTO,
  LookupLogInput,
  OutcomeRepository,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaOutcomeRepository implements OutcomeRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  // ---------- استعلام‌ها ----------

  async listRecentLookups(take: number, kind?: "PROPERTY" | "REQUEST"): Promise<LookupLogDTO[]> {
    const where = kind ? { kind } : {};
    return this.client.lookupLog.findMany({ where, orderBy: { createdAt: "desc" }, take });
  }

  async countLookups(kind?: "PROPERTY" | "REQUEST"): Promise<number> {
    const where = kind ? { kind } : {};
    return this.client.lookupLog.count({ where });
  }

  async createLookup(input: LookupLogInput): Promise<LookupLogDTO> {
    return this.client.lookupLog.create({
      data: {
        kind: input.kind,
        code: input.code,
        found: input.found,
        personName: input.personName,
        personMobile: input.personMobile,
        address: input.address,
        actorCode: input.actorCode,
        errorNote: input.errorNote,
      },
    });
  }

  // ---------- رد آگهی ----------

  async listRecentRejects(take: number): Promise<DivarRejectLogDTO[]> {
    return this.client.divarRejectLog.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  async createReject(input: DivarRejectInput): Promise<DivarRejectLogDTO> {
    return this.client.divarRejectLog.create({
      data: {
        token: input.token,
        reasons: input.reasons,
        note: input.note,
        scoreSnapshotJson: input.scoreSnapshotJson,
        featureSnapshotJson: input.featureSnapshotJson,
        actorCode: input.actorCode,
      },
    });
  }

  // ---------- محاسبات کمیسیون ----------

  async createCommissionCalc(input: CommissionCalcInput): Promise<CommissionCalcLogDTO> {
    return this.client.commissionCalcLog.create({
      data: {
        contractType: input.contractType,
        inputsJson: input.inputsJson,
        resultJson: input.resultJson,
        dealValue: input.dealValue,
        vatPercent: input.vatPercent,
        actorCode: input.actorCode,
      },
    });
  }
}
