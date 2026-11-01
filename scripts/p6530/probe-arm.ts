// Live probe of ARM requests/list + properties/list totals with stored token
import { getIntegrationRepository } from "@/core/repositories";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { decryptSecret } from "@/lib/auth/crypto";
import { db } from "@/lib/db";

async function main() {
  const conn = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  if (!conn) { console.log("NO ArmConnection record"); process.exit(0); }
  const token = decryptSecret(conn.tokenEnc);
  if (!token) { console.log("TOKEN DECRYPT FAILED"); process.exit(0); }
  const cfg = getMelkApiConfig();
  console.log("token len:", token.length, "| status:", conn.status, "| personnel:", conn.personnelCode, "| lastError:", conn.lastError ?? "none");
  for (const [name, path, limit] of [["requests", MELK_ENDPOINTS.arm.requestsList, 2], ["properties", MELK_ENDPOINTS.arm.propertiesList, 2]] as const) {
    try {
      const res = await armCall<any>({ path, baseUrl: cfg.armApiBase, token, query: { page: 1, limit }, timeoutMs: 30000, maxRetries: 0 });
      const d = res.data as any;
      console.log(`--- ${name} page1: total=${d?.count ?? d?.total} totalPages=${d?.totalPages} rows=${(d?.list ?? d?.data ?? []).length}`);
      const rows = d?.list ?? d?.data ?? [];
      if (rows[0]) {
        console.log("row keys:", Object.keys(rows[0]).join(","));
        console.log("row sample:", JSON.stringify(rows[0]).slice(0, 1200));
      }
    } catch (e: any) {
      console.log(`--- ${name} FAILED:`, e?.code, e?.httpStatus, (e?.message ?? "").slice(0, 200));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
