/**
 * DIR-REG-REQ-099-001 — گام ۲: نمونهٔ خام ردیف فهرست درخواست‌ها (فقط خواندن)
 * هدف: شکل واقعی inputs (year_from? side? sanad?) + ساختار تاریخچه/کد
 */

import fs from "fs";
import path from "path";

async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");

  const resolved = await resolveBestArmToken(db);
  if (!resolved) throw new Error("no token");
  const cfg = getMelkApiConfig();

  const res = await armCall<Record<string, any>>({
    method: "GET",
    path: "requests/list",
    baseUrl: cfg.armApiBase,
    query: { page: "1", limit: "3" },
    token: resolved.token,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
  const data = res.data ?? {};
  const list = data.list ?? [];
  const out: Record<string, unknown> = { count: data.count, totalPages: data.totalPages, sampleKeys: [], rows: [] };
  if (list.length > 0) {
    (out as any).sampleKeys = Object.keys(list[0]);
    (out as any).rows = list.map((r: any) => ({
      _id: r._id,
      code: r.code,
      requestCode: r.requestCode,
      relatedRealtor: r.relatedRealtor,
      relatedCustomer: r.relatedCustomer,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      inputs: r.inputs,
      areaCount: Array.isArray(r.area) ? r.area.length : null,
      lineCount: Array.isArray(r.line) ? r.line.length : null,
      areaFirst: Array.isArray(r.area) ? r.area.slice(0, 2) : null,
      status: r.status,
      currentStatus: r.currentStatus,
      tradeType: r.tradeType,
      userPaymentMethod: r.userPaymentMethod,
      userSeriousity: r.userSeriousity,
    }));
  }
  const dir = path.join(process.cwd(), "scripts", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "request-list-sample.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log("keys:", (out as any).sampleKeys);
  for (const r of (out as any).rows as any[]) {
    console.log("---- code:", r.code ?? r.requestCode, "| realtor:", r.relatedRealtor, "| createdAt:", r.createdAt);
    console.log("     inputs:", JSON.stringify(r.inputs));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
