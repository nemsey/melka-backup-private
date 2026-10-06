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
  for (const attempt of [1, 2]) {
    const t0 = Date.now();
    try {
      const res = await armCall<unknown>({ path: `${MELK_ENDPOINTS.arm.requestsList}?page=1&limit=50`, baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 90_000, maxRetries: 1 });
      const d = (res.data ?? {}) as Record<string, unknown>;
      const list = (d["list"] ?? []) as unknown[];
      console.log(`attempt ${attempt}: OK in ${((Date.now()-t0)/1000).toFixed(1)}s — ${list.length} rows`);
    } catch (e) {
      console.log(`attempt ${attempt}: FAILED after ${((Date.now()-t0)/1000).toFixed(1)}s —`, (e as Error).message?.slice(0, 100));
    }
  }
  await db.$disconnect();
}
main();
