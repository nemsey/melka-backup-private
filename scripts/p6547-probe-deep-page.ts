import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { mapArmRequestListRow } from "../src/lib/melk-api/arm-catalog";
const db = new PrismaClient();
async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  const cfg = getMelkApiConfig();
  for (const page of [300, 380, 414]) {
    const res = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token: ARM_TOKEN, query: { page, limit: 50 }, timeoutMs: 90_000, maxRetries: 1 });
    const d = (res.data ?? {}) as Record<string, unknown>;
    const list = Array.isArray(d["list"]) ? (d["list"] as Record<string, unknown>[]) : [];
    const mapped = list.map((r) => mapArmRequestListRow(r)).filter((r) => r !== null);
    const noCode = list.filter((r) => !r["code"]).length;
    console.log(`page ${page}: listLen=${list.length} mapped=${mapped.length} withoutCode=${noCode}`);
  }
  await db.$disconnect();
}
main();
