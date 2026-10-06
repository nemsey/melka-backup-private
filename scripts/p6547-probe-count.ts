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
  for (const [limit, page] of [[50, 1], [50, 410], [1, 1]] as const) {
    const res = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: ARM_TOKEN, query: { page, limit }, timeoutMs: 90_000, maxRetries: 1 });
    const d = (res.data ?? {}) as Record<string, unknown>;
    console.log(`limit=${limit} page=${page}: count=${d["count"]} totalPages=${d["totalPages"]} listLen=${Array.isArray(d["list"]) ? d["list"].length : "?"}`);
  }
  await db.$disconnect();
}
main();
