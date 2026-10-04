/**
 * PrismaAgentMemoryRepository — پیاده‌سازی Prisma قرارداد AgentMemoryRepository
 */
import type {
  AgentFeedbackDTO,
  AgentFeedbackInput,
  AgentMemoryDTO,
  AgentMemoryRepository,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaAgentMemoryRepository implements AgentMemoryRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async append(tileId: string, kind: string, payloadJson: string): Promise<void> {
    await this.client.agentMemory.create({
      data: { tileId, kind, payload: payloadJson },
    });
  }

  async listRecent(tileId: string, take: number): Promise<AgentMemoryDTO[]> {
    return this.client.agentMemory.findMany({
      where: { tileId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async listFeedbacks(tileId: string, take: number): Promise<AgentFeedbackDTO[]> {
    return this.client.agentFeedback.findMany({
      where: { tileId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async listAllFeedbacks(tileId: string): Promise<AgentFeedbackDTO[]> {
    return this.client.agentFeedback.findMany({ where: { tileId } });
  }

  async createFeedback(input: AgentFeedbackInput): Promise<void> {
    await this.client.agentFeedback.create({
      data: {
        tileId: input.tileId,
        insightKey: input.insightKey,
        insightTitle: input.insightTitle,
        rating: input.rating,
        comment: input.comment,
        context: input.context,
      },
    });
  }

  async countMemory(tileId: string): Promise<number> {
    return this.client.agentMemory.count({ where: { tileId } });
  }

  async countFeedback(tileId: string, positiveOnly?: boolean): Promise<number> {
    return this.client.agentFeedback.count({
      where: positiveOnly ? { tileId, rating: 1 } : { tileId },
    });
  }
}
