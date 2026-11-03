import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { decryptSecret } from "@/lib/auth/crypto";
import { db } from "@/lib/db";

async function main() {
  const conn = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const token = decryptSecret(conn!.tokenEnc!)!;
  const cfg = getMelkApiConfig();
  const t0 = Date.now();
  try {
    const res = await armCall<any>({ path: MELK_ENDPOINTS.arm.propertiesList, baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 2 }, timeoutMs: 120000, maxRetries: 0 });
    const d = res.data as any;
    console.log(`properties OK in ${Date.now() - t0}ms: total=${d?.count ?? d?.total} totalPages=${d?.totalPages}`);
  } catch (e: any) {
    console.log(`properties FAILED after ${Date.now() - t0}ms:`, e?.code, e?.httpStatus);
  }
  const t1 = Date.now();
  try {
    const res = await armCall<any>({ path: MELK_ENDPOINTS.arm.requestsList, baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 2 }, timeoutMs: 120000, maxRetries: 0 });
    const d = res.data as any;
    console.log(`requests OK in ${Date.now() - t1}ms: total=${d?.count ?? d?.total} totalPages=${d?.totalPages}`);
    const rows = d?.list ?? d?.data ?? [];
    if (rows[0]) console.log("row keys:", Object.keys(rows[0]).join(","));
  } catch (e: any) {
    console.log(`requests FAILED after ${Date.now() - t1}ms:`, e?.code, e?.httpStatus);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
