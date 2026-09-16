/**
 * PrismaCustomerRepository — پیاده‌سازی Prisma قرارداد CustomerRepository
 */
import type {
  CustomerRepository,
  EventArmSyncUpdate,
  RequestEventDTO,
  RequestRecordDTO,
  RequestRecordWithEventsDTO,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaCustomerRepository implements CustomerRepository {
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
}
