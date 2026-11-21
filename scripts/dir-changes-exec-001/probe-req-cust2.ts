/**
 * DIR-CHANGES-EXEC-001 · probe8 — قفل نهایی: فیلتر customer=<شناسه> در requests/list
 * با خروجی کامل — آیا مشتری سیدنعمت‌اله سیدی بیش از یک درخواست دارد؟
 */
async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");

  const resolved = await resolveBestArmToken(db);
  if (!resolved) throw new Error("no token");
  const base = getMelkApiConfig().armApiBase;
  const CUST = "6a28765ecf701057bebf0cda";

  for (const f of [{ customer: CUST }, { customerId: CUST }]) {
    const r = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: { page: "1", limit: "50", ...f }, timeoutMs: 180_000, maxRetries: 0 }).catch((e: any) => ({ err: String(e.message).slice(0, 100) }));
    if ((r as any).err) { console.log(`${JSON.stringify(f)} → ERR ${(r as any).err}`); continue; }
    const data = r?.data as any;
    const list = data?.list ?? [];
    const total = data?.total ?? null;
    const codes = list.map((x: any) => x.code).join(",");
    const custs = list.slice(0, 5).map((x: any) => x.relatedCustomer).join(" | ");
    console.log(`${JSON.stringify(f)} → rows=${list.length} total=${total}`);
    console.log(`   codes=[${codes}]`);
    console.log(`   first customers=[${custs}]`);
  }
  // کنترل منفی: همان فیلتر با شناسهٔ ناموجود
  const r2 = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: { page: "1", limit: "50", customer: "5f0000000000000000000000" }, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);
  const list2 = (r2?.data as any)?.list ?? [];
  console.log(`negative control (fake id) → rows=${list2.length} codes=[${list2.slice(0, 5).map((x: any) => x.code).join(",")}]`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
