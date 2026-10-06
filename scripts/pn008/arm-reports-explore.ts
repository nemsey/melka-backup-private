#!/usr/bin/env bun
/** PN-008 ثانیاً-۲ — تکمیل بُعد E: تمدید توکن ARM + گزارش‌های معاملات (شمارش مبایعه/اجاره) */
import { readFileSync, writeFileSync } from "node:fs";
const platform = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf-8"));
for (const k of ["MELK_TOKEN_KEY"]) if (!process.env[k] && platform[k]) process.env[k] = platform[k];
if (!process.env.DATABASE_URL && platform.DATABASE_URL) process.env.DATABASE_URL = platform.DATABASE_URL;

const { PrismaClient } = await import("@prisma/client");
const { decryptSecret, encryptSecret } = await import("../../src/lib/auth/crypto");
const { armCall } = await import("../../src/lib/melk-api/client");
const { MELK_ENDPOINTS } = await import("../../src/lib/melk-api/endpoints");

const db = new PrismaClient();
const ARM = "https://arus-api.melketabriz.ir/api/apm/";
const PM = "https://pm-api.melketabriz.ir/api/";
const out: any = { at: new Date().toISOString() };

const arm = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
let armToken = decryptSecret(arm?.tokenEnc ?? "") ?? "";
const armRefresh = decryptSecret(arm?.refreshTokenEnc ?? "") ?? "";
out.armVault = { tokenChars: armToken.length, refreshChars: armRefresh.length, business: arm?.businessId ?? null };

// آزمون توکن فعلی
async function testArm(t: string): Promise<string> {
  try {
    const r = await armCall({ path: MELK_ENDPOINTS.arm.realtorsList, baseUrl: ARM, token: t, timeoutMs: 20000, maxRetries: 0, query: { page: 1, limit: 2 } });
    return (r.data as any)?.list ? "OK" : "SHAPE";
  } catch (e: any) { return "FAIL:" + String(e?.code ?? e?.message ?? e).slice(0, 80); }
}
out.tokenTest = await testArm(armToken);

// تمدید در صورت نیاز
if (!out.tokenTest.startsWith("OK") && armRefresh) {
  try {
    const r = await armCall<any>({ method: "POST", path: MELK_ENDPOINTS.arm.refreshToken, baseUrl: ARM, body: { refreshToken: armRefresh }, timeoutMs: 25000, maxRetries: 0 });
    const nt = r.data?.accessToken ?? r.data?.token ?? null;
    const nrt = r.data?.refreshToken ?? armRefresh;
    if (nt) {
      armToken = nt;
      await db.armConnection.update({ where: { id: arm!.id }, data: { tokenEnc: encryptSecret(nt), refreshTokenEnc: encryptSecret(nrt), lastRefreshedAt: new Date() } });
      out.tokenAfterRefresh = await testArm(armToken);
      out.vaultUpdated = true;
    } else out.refreshShape = Object.keys(r.data ?? {});
  } catch (e: any) { out.refreshError = String(e?.message ?? e).slice(0, 140); }
}

// گزارش‌ها (تایم‌اوت بلند — ARM امروز کند است)
const maskObj = (o: any, d = 0): any => {
  if (Array.isArray(o)) return o.slice(0, 2).map((x) => maskObj(x, d + 1));
  if (o && typeof o === "object" && d < 6) { const r: any = {}; for (const [k, v] of Object.entries(o).slice(0, 30)) r[k] = /mobile/i.test(k) ? "***" : maskObj(v, d + 1); return r; }
  return o;
};
for (const [label, path, query] of [
  ["tradedCountTotal", MELK_ENDPOINTS.arm.tradedTotal, { page: 1, limit: 3 }],
  ["tradedCount", MELK_ENDPOINTS.arm.tradedCount, {}],
  ["realtorInteractions", MELK_ENDPOINTS.arm.realtorInteractions, { page: 1, limit: 3 }],
] as const) {
  try {
    const r = await armCall<any>({ path, baseUrl: ARM, token: armToken, timeoutMs: 75000, maxRetries: 1, query: query as any });
    out[label] = { keys: Object.keys(r.data ?? {}), shape: maskObj(r.data) };
  } catch (e: any) { out[label] = { error: String(e?.code ?? e?.message ?? e).slice(0, 120) }; }
}

writeFileSync("/home/z/my-project/download/pn008/arm-reports-exploration.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ tokenTest: out.tokenTest, refreshed: out.vaultUpdated, after: out.tokenAfterRefresh, tct: out.tradedCountTotal?.keys ?? out.tradedCountTotal?.error, tc: out.tradedCount?.keys ?? out.tradedCount?.error, ri: out.realtorInteractions?.keys ?? out.realtorInteractions?.error }, null, 1));
await db.$disconnect();
