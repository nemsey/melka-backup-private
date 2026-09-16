/**
 * PrismaPolicyRepository — پیاده‌سازی Prisma قرارداد PolicyRepository
 * ------------------------------------------------------
 * تراکنش فعال‌سازی (پیشتر db.$transaction در base-agent.ts) اینجاست —
 * تنها مکان مجاز $transaction در لایه Repository.
 */
import type { AgentPolicyVersionDTO, PolicyRepository, PolicyVersionInput } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

export class PrismaPolicyRepository implements PolicyRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findActive(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    return this.client.agentPolicyVersion.findFirst({ where: { tileId, active: true } });
  }

  async findLatest(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    return this.client.agentPolicyVersion.findFirst({
      where: { tileId },
      orderBy: { version: "desc" },
    });
  }

  async findByTileAndVersion(tileId: string, version: number): Promise<AgentPolicyVersionDTO | null> {
    return this.client.agentPolicyVersion.findUnique({
      where: { tileId_version: { tileId, version } },
    });
  }

  async listVersions(tileId: string): Promise<AgentPolicyVersionDTO[]> {
    return this.client.agentPolicyVersion.findMany({
      where: { tileId },
      orderBy: { version: "desc" },
    });
  }

  async createVersion(input: PolicyVersionInput): Promise<AgentPolicyVersionDTO> {
    return this.client.agentPolicyVersion.create({
      data: {
        tileId: input.tileId,
        version: input.version,
        content: input.content,
        rationale: input.rationale,
        active: input.active,
        activatedAt: input.activatedAt,
      },
    });
  }

  async activateVersion(tileId: string, versionId: string, activatedAt: Date): Promise<void> {
    // عین $transaction قبلی base-agent: غیرفعال‌سازی همه فعال‌ها + فعال‌سازی هدف
    await this.client.$transaction([
      this.client.agentPolicyVersion.updateMany({ where: { tileId, active: true }, data: { active: false } }),
      this.client.agentPolicyVersion.update({ where: { id: versionId }, data: { active: true, activatedAt } }),
    ]);
  }

  async countVersions(tileId: string): Promise<number> {
    return this.client.agentPolicyVersion.count({ where: { tileId } });
  }
}
