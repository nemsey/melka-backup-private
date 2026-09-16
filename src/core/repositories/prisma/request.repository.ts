/**
 * PrismaRequestRepository — پیاده‌سازی Prisma قرارداد RequestRepository
 * ------------------------------------------------------
 * کوئری‌ها عین روت‌های قبل از مهاجرت (بدون تغییر معنایی):
 *  • findById            ← db.requestRecord.findUnique({ where: { id } })
 *  • findByIdWithEventsDesc ← findUnique + include events (createdAt نزولی)
 *  • updateEventArmSync  ← db.requestEventRecord.update({ where: { id }, data })
 */
import type { RequestEventArmSyncInput, RequestRecordDTO, RequestRepository, RequestWithEventsDTO } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaRequestRepository implements RequestRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findById(id: string): Promise<RequestRecordDTO | null> {
    return this.client.requestRecord.findUnique({ where: { id } });
  }

  async findByIdWithEventsDesc(id: string): Promise<RequestWithEventsDTO | null> {
    return this.client.requestRecord.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  }

  async updateEventArmSync(eventId: string, input: RequestEventArmSyncInput): Promise<void> {
    await this.client.requestEventRecord.update({
      where: { id: eventId },
      data: {
        armEventId: input.armEventId,
        armSyncedAt: input.armSyncedAt,
        armPropertyId: input.armPropertyId,
        armSyncJson: input.armSyncJson,
      },
    });
  }
}
