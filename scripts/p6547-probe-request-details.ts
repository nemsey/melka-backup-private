#!/usr/bin/env bun
/**
 * p6547-probe-request-details.ts — کشف زندهٔ ساختار جزئیات درخواست ARM
 * هدف: گام دوم بند ۲ — چرا جدول قطب‌های عرضه درخواست خالی است؟ (areaNamesJson = 0 از ۱۰٬۳۳۹)
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
  console.log(`ARM token: ${ARM_TOKEN.length} chars`);
  if (!ARM_TOKEN) process.exit(1);
  const cfg = getMelkApiConfig();

  const reqs = await db.requestRecord.findMany({ where: { source: "arm" }, select: { armRequestId: true, requestCode: true }, take: 3 });
  for (const r of reqs) {
    const id = r.armRequestId || r.requestCode;
    if (!id) continue;
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.requestDetails(String(id)),
        baseUrl: cfg.armApiBase,
        token: ARM_TOKEN,
        timeoutMs: 45_000,
        maxRetries: 0,
      });
      const d = (res.data ?? {}) as Record<string, unknown>;
      console.log(`\n=== request ${id} ===`);
      console.log("keys:", Object.keys(d).join(", "));
      // جست‌وجوی هر چیز مرتبط با منطقه
      const str = JSON.stringify(d);
      console.log("len:", str.length);
      const areaHits = str.match(/"[^"]*(?:[Aa]rea|منطقه|محله|line)[^"]*"\s*:/g);
      console.log("area-ish keys:", JSON.stringify(areaHits?.slice(0, 20)));
      // چاپ بخش‌های شامل area
      const m = str.match(/\{[^{}]*[Aa]rea[^{}]*\}/g);
      if (m) console.log("area fragments:", m.slice(0, 4).join("\n"));
    } catch (e) {
      console.log(`=== ${id} FAILED:`, (e as Error).message?.slice(0, 150));
    }
  }
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
