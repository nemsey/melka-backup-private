import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
const db = new PrismaClient();
async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  const cfg = getMelkApiConfig();
  const res = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: ARM_TOKEN, query: { page: 1, limit: 5 }, timeoutMs: 90_000, maxRetries: 1 });
  const d = (res.data ?? {}) as Record<string, unknown>;
  const list = (d["list"] ?? []) as Record<string, unknown>[];
  for (const r of list.slice(0, 3)) {
    console.log(JSON.stringify({
      tradeType: r.tradeType, buildingType: r.buildingType, propertyType: r.propertyType,
      userPaymentMethod: r.userPaymentMethod, userSeriousity: r.userSeriousity,
      urgent: r.urgent, luxury: r.luxury, changeable: r.changeable,
      totalPrice_from: r.totalPrice_from, totalPrice_to: r.totalPrice_to,
    }));
  }
  await db.$disconnect();
}
main();
