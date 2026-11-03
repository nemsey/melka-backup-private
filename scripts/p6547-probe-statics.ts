import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
const db = new PrismaClient();
async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  const cfg = getMelkApiConfig();
  // کاندیداهای فهرست‌های مرجع از الگوی سامانه (N("x",{addToURL:["list"]}))
  const candidates = [
    "trade-types/list", "statics/trade-types", "statics/tradeType",
    "building-types/list", "statics/building-types",
    "property-types/list", "statics/property-types",
    "user-payment-methods/list", "payment-methods/list",
  ];
  for (const path of candidates) {
    try {
      const res = await armCall<unknown>({ path, baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 25_000, maxRetries: 0 });
      const str = JSON.stringify(res.data ?? {});
      const hasTarget = str.includes("614ed62da50555f0a54c1eca") || str.includes("614edc35a50555f0a54c1f12");
      console.log(`${path}: OK len=${str.length} ${hasTarget ? "★ HAS TARGET IDS" : ""} — ${str.slice(0, 150)}`);
    } catch (e) {
      console.log(`${path}: FAIL — ${(e as Error).message?.slice(0, 50)}`);
    }
  }
  await db.$disconnect();
}
main();
