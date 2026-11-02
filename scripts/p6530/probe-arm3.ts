import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { decryptSecret } from "@/lib/auth/crypto";
import { db } from "@/lib/db";

async function main() {
  const conn = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const token = decryptSecret(conn!.tokenEnc!)!;
  const refreshToken = decryptSecret(conn!.refreshTokenEnc!);
  const cfg = getMelkApiConfig();
  console.log("status:", conn!.status, "| lastRefreshedAt:", conn!.lastRefreshedAt?.toISOString?.(), "| lastRestoredAt:", conn!.lastRestoredAt?.toISOString?.());
  // lightweight authed endpoint
  for (const [name, path, query] of [
    ["traded-count-total", "realtor-reports/traded-count-total", {}],
    ["realtors/list p1", "realtors/list", { page: 1, limit: 2 }],
  ] as const) {
    const t0 = Date.now();
    try {
      const res = await armCall<any>({ path, baseUrl: cfg.armApiBase, token, query: {...query}, timeoutMs: 20000, maxRetries: 0 });
      console.log(`${name}: OK in ${Date.now() - t0}ms —`, JSON.stringify(res.data).slice(0, 200));
    } catch (e: any) {
      console.log(`${name}: FAILED in ${Date.now() - t0}ms —`, e?.code, e?.httpStatus, (e?.message ?? "").slice(0, 100));
    }
  }
  // try refresh token
  if (refreshToken) {
    const t0 = Date.now();
    try {
      const res = await armCall<any>({ path: "authentication/refresh-token", baseUrl: cfg.armApiBase, token: refreshToken, timeoutMs: 20000, maxRetries: 0, method: "POST" });
      console.log(`refresh: OK in ${Date.now() - t0}ms —`, JSON.stringify(res.data).slice(0, 250));
    } catch (e: any) {
      console.log(`refresh: FAILED in ${Date.now() - t0}ms —`, e?.code, e?.httpStatus);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
