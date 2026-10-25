import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
const db = new PrismaClient();
async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  const cfg = getMelkApiConfig();
  try {
    const res = await armCall<unknown>({ path: "statics/enums-persian", baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 60_000, maxRetries: 1 });
    const str = JSON.stringify(res.data ?? {});
    console.log("len:", str.length);
    console.log("first 800:", str.slice(0, 800));
    // جست‌وجوی شناسه‌های معروف
    const ids = ["614ed62da50555f0a54c1eca", "614edc35a50555f0a54c1f12", "614ee704a50555f0a54c227d", "61a39bf0f06329efdeacbbef", "61a7536b0927675c45489a59"];
    for (const id of ids) {
      const idx = str.indexOf(id);
      console.log(id, "→", idx >= 0 ? str.slice(Math.max(0, idx - 120), idx + 150) : "NOT FOUND");
    }
  } catch (e) {
    console.log("FAILED:", (e as Error).message?.slice(0, 200));
  }
  await db.$disconnect();
}
main();
