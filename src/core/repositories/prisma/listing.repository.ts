/**
 * PrismaListingRepository — پیاده‌سازی Prisma قرارداد ListingRepository
 */
import type { Prisma } from "@prisma/client";
import type {
  InstagramConnectionDTO,
  InstagramPostLogDTO,
  ListingCrmTransferUpdate,
  ListingInstagramPublicationUpdate,
  ListingDTO,
  ListingRepository,
  ListingScopeQuery,
  ScopeFilter,
  ScopedListingRepository,
} from "../interfaces";
import { personalScopeClause } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";
import { auditAccess } from "@/lib/audit";

export class PrismaListingRepository implements ScopedListingRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async listRecent(take: number): Promise<ListingDTO[]> {
    return this.client.listingRecord.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  async listRecentPostLogs(take: number): Promise<InstagramPostLogDTO[]> {
    return this.client.instagramPostLog.findMany({ orderBy: { createdAt: "desc" }, take });
  }

  async getInstagramConnection(): Promise<InstagramConnectionDTO | null> {
    return this.client.instagramConnection.findFirst();
  }

  async findById(id: string): Promise<ListingDTO | null> {
    return this.client.listingRecord.findUnique({ where: { id } });
  }

  async updateCrmTransfer(id: string, data: ListingCrmTransferUpdate): Promise<void> {
    // عین update قدیم روت register — از جمله پاک‌سازی صریح armCustomerId
    await this.client.listingRecord.update({
      where: { id },
      data: {
        armCustomerId: data.armCustomerId !== undefined ? data.armCustomerId : null,
        armPropertyId: data.armPropertyId,
        crmTransferredAt: data.crmTransferredAt,
        crmTransferJson: data.crmTransferJson,
      },
    });
  }

  async updateInstagramPublication(id: string, data: ListingInstagramPublicationUpdate): Promise<void> {
    // عین update قدیم روت listings/[id]/instagram
    await this.client.listingRecord.update({
      where: { id },
      data: {
        instagramPublishedAt: data.instagramPublishedAt,
        instagramMediaId: data.instagramMediaId,
        instagramPostJson: data.instagramPostJson,
      },
    });
  }

  /**
   * P6.5-02 (§۵.۲/§۵.۳) — فهرست Scope-دار فایل‌های آگهی.
   * ماتریس دامنه: ListingRecord = داده «شخصی» (actorCode) ⇒
   * CONSULTANT فقط ردیف‌های خودش · BRANCH فقط شعبه خودش · OWNER همه.
   * fail-closed: کد/شعبه تهی ⇒ هیچ ردیفی (فقط OWNER بدون شرط است).
   * AuditLog برای هر فراخوانی ثبت می‌شود (§۶.۲).
   * tenantId حمل می‌شود اما فیلتر فعال نیست — مصوبه §۱۴ شورا (PHASE 8+).
   */
  async findWithScope(query: ListingScopeQuery, scope: ScopeFilter): Promise<ListingDTO[]> {
    const clause = personalScopeClause(scope);
    if (clause.kind === "DENY_ALL") {
      await auditAccess(scope, "READ", "listing", 0, "deny-closed:no-personnel-code", { client: this.client });
      return [];
    }
    const where: Prisma.ListingRecordWhereInput =
      clause.kind === "PERSONAL"
        ? { actorCode: clause.code }
        : clause.kind === "BRANCH"
          ? { branchId: clause.branchId }
          : {};
    const rows = await this.client.listingRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
    await auditAccess(scope, "READ", "listing", rows.length, undefined, { client: this.client });
    return rows;
  }
}
