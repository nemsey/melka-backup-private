/**
 * PrismaListingRepository — پیاده‌سازی Prisma قرارداد ListingRepository
 */
import type {
  InstagramConnectionDTO,
  InstagramPostLogDTO,
  ListingCrmTransferUpdate,
  ListingInstagramPublicationUpdate,
  ListingDTO,
  ListingRepository,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaListingRepository implements ListingRepository {
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
}
