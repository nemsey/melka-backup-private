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
  const res = await armCall<unknown>({ path: MELK_ENDPOINTS.armPublic.enums, baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 60_000, maxRetries: 1 });
  const d = (res.data ?? {}) as Record<string, unknown>;
  const keys = Object.keys(d);
  console.log("enums keys:", keys.join(", ").slice(0, 500));
  // جست‌وجوی نگاشت شناسه‌های موردنیاز
  for (const k of ["tradeType", "tradeTypes", "buildingType", "buildingTypes", "propertyType", "propertyTypes", "userPaymentMethod", "userSeriousity"]) {
    if (d[k] !== undefined) {
      console.log(`${k}:`, JSON.stringify(d[k]).slice(0, 300));
    }
  }
  await db.$disconnect();
}
main();
