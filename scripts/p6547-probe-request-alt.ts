#!/usr/bin/env bun
/**
 * p6547-probe-request-alt.ts — کشف نقطهٔ اتصال جایگزین برای مناطق درخواست
 * هدف: requests/details = 500 → جایگزین: requests/list payload? requests/info/{id}? apu عمومی؟
 */
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

  // ۱) ساختار requests/list — آیا خود فهرست مناطق را دارد؟
  console.log("=== requests/list structure ===");
  try {
    const res = await armCall<unknown>({
      path: `${MELK_ENDPOINTS.arm.requestsList}?page=1&limit=2`,
      baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 45_000, maxRetries: 0,
    });
    const d = (res.data ?? {}) as Record<string, unknown>;
    const list = (d["list"] ?? d["data"] ?? []) as Record<string, unknown>[];
    console.log("list wrapper keys:", Object.keys(d).join(", "));
    if (Array.isArray(list) && list[0]) {
      console.log("row keys:", Object.keys(list[0]).join(", "));
      console.log("row sample:", JSON.stringify(list[0]).slice(0, 1200));
    }
  } catch (e) { console.log("list FAILED:", (e as Error).message?.slice(0, 120)); }

  // ۲) مسیرهای جایگزین جزئیات
  const id = "21212";
  for (const path of [`requests/info/${id}`, `requests/info/by-code/${id}`, `requests/${id}`]) {
    try {
      const res = await armCall<unknown>({ path, baseUrl: cfg.armApiBase, token: ARM_TOKEN, timeoutMs: 30_000, maxRetries: 0 });
      const d = (res.data ?? {}) as Record<string, unknown>;
      console.log(`\n=== ${path} OK ===`);
      console.log("keys:", Object.keys(d).join(", ").slice(0, 400));
      const str = JSON.stringify(d);
      const areaHits = str.match(/"[^"]*(?:[Aa]rea|منطقه|محله)[^"]*"\s*:/g);
      console.log("area-ish:", JSON.stringify(areaHits?.slice(0, 10)));
    } catch (e) { console.log(`\n=== ${path} FAILED:`, (e as Error).message?.slice(0, 100)); }
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
