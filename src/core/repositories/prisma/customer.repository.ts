/**
 * PrismaCustomerRepository — پیاده‌سازی Prisma قرارداد CustomerRepository
 */
import type { Prisma } from "@prisma/client";
import type {
  CustomerRepository,
  CustomerScopeQuery,
  EventArmSyncUpdate,
  RequestEventDTO,
  RequestRecordDTO,
  RequestRecordWithEventsDTO,
  ScopeFilter,
  ScopedCustomerRepository,
} from "../interfaces";
import { personalScopeClause } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";
import { auditAccess } from "@/lib/audit";

export class PrismaCustomerRepository implements ScopedCustomerRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async listRecentRequests(take: number): Promise<RequestRecordDTO[]> {
    return this.client.requestRecord.findMany({ orderBy: { updatedAt: "desc" }, take });
  }

  async listRecentEvents(take: number): Promise<RequestEventDTO[]> {
    return this.client.requestEventRecord.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  async findById(id: string): Promise<RequestRecordDTO | null> {
    return this.client.requestRecord.findUnique({ where: { id } });
  }

  async findByIdWithEvents(id: string): Promise<RequestRecordWithEventsDTO | null> {
    return this.client.requestRecord.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  }

  async updateEventArmSync(eventId: string, data: EventArmSyncUpdate): Promise<void> {
    await this.client.requestEventRecord.update({
      where: { id: eventId },
      data: {
        armEventId: data.armEventId,
        armSyncedAt: data.armSyncedAt,
        armPropertyId: data.armPropertyId,
        armSyncJson: data.armSyncJson,
      },
    });
  }

  /**
   * P6.5-02 (§۵.۲/§۵.۳ + انحراف مصوب §۱۲-۵) — فهرست Scope-دار دامنه مشتری.
   * دامنه فعلی مشتری = RequestRecord (فرم ۴ گامی)؛ CustomerRecord (رجیستری
   * جدید P6.5) پس از پرشدگی Bulk در گام‌های بعد به همین قرارداد добавه می‌شود.
   * ماتریس: شخصی (actorCode) ⇒ CONSULTANT خودش · BRANCH شعبه · OWNER همه.
   * مرتب‌سازی عین listRecentRequests (updatedAt نزولی). AuditLog هر فراخوانی (§۶.۲).
   * tenantId حمل می‌شود اما فیلتر فعال نیست — مصوبه §۱۴ شورا (PHASE 8+).
   */
  async findWithScope(query: CustomerScopeQuery, scope: ScopeFilter): Promise<RequestRecordDTO[]> {
    const clause = personalScopeClause(scope);
    if (clause.kind === "DENY_ALL") {
      await auditAccess(scope, "READ", "customer", 0, "deny-closed:no-personnel-code", { client: this.client });
      return [];
    }
    const where: Prisma.RequestRecordWhereInput =
      clause.kind === "PERSONAL"
        ? { actorCode: clause.code }
        : clause.kind === "BRANCH"
          ? { branchId: clause.branchId }
          : {};
    const rows = await this.client.requestRecord.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
    await auditAccess(scope, "READ", "customer", rows.length, undefined, { client: this.client });
    return rows;
  }
}
