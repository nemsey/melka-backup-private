/**
 * DIR-CHANGES-EXEC-001 · probe7 — قفل‌کردن زنجیرهٔ حل: آیا مشتری «سیدنعمت‌اله سیدی»
 * (شناسهٔ ARM 6a28765ecf701057bebf0cda) بیش از یک درخواست دارد؟ آیا 56031 در
 * سامانهٔ عمومی ملک‌تبریز هست؟ هویت درخواست‌دهندهٔ 48968 چیست؟
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
  const cfg = getMelkApiConfig();
  const base = cfg.armApiBase;
  const CUST = "6a28765ecf701057bebf0cda";
  const REQ = "6a42a5c12c4b2e2f7fea5172";

  console.log("═══ ۱) فیلتر customer=<شناسهٔ مشتری> — همهٔ درخواست‌های این مشتری ═══");
  for (const f of [{ customer: CUST }, { customerId: CUST }, { "customer[]": CUST }, { customer: CUST, limit: "100" }]) {
    const r = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: { page: "1", limit: "25", ...f }, timeoutMs: 180_000, maxRetries: 0 }).catch((e: any) => ({ err: String(e.message).slice(0, 100) }));
    if ((r as any).err) { console.log(`  ${JSON.stringify(f)}: ERR ${(r as any).err}`); continue; }
    const list = (r?.data as any)?.list ?? [];
    const total = (r?.data as any)?.total ?? null;
    console.log(`  ${JSON.stringify(f)}: rows=${list.length}${total != null ? ` total=${total}` : ""}`);
    for (const row of list) console.log(`     · code=${row.code} _id=${row._id} title=${row.title} createdAt=${row.createdAt} realtor=${row.relatedRealtor}`);
  }

  console.log("═══ ۲) هویت درخواست‌دهندهٔ 48968 (requests/applicant) ═══");
  const app = await armCall({ method: "GET", path: `requests/applicant/${REQ}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);
  console.log("  applicant:", JSON.stringify(app?.data ?? null, null, 1).slice(0, 600));

  console.log("═══ ۳) 56031 در سامانهٔ عمومی ملک‌تبریز (آزمون زنده) ═══");
  const pub = getMelkApiConfig().melkPublicApiBase;
  console.log("  public base:", pub);
  for (const code of ["56031", "48968"]) {
    const r = await armCall({ method: "GET", path: `requests/info/by-code/${code}`, baseUrl: pub, timeoutMs: 60_000, maxRetries: 0 }).catch((e: any) => ({ err: String(e.message).slice(0, 120) }));
    if ((r as any).err) { console.log(`  by-code/${code}: ERR ${(r as any).err}`); continue; }
    console.log(`  by-code/${code}:`, JSON.stringify(r?.data ?? null).slice(0, 300));
  }

  console.log("═══ ۴) آزمون فیلتر customer با نام کامل/موبایل در قالب‌های دیگر ═══");
  for (const f of [
    { customer: "سیدنعمت اله  سیدی" }, { customer: "سیدنعمت اله سیدی" }, { customer: "09148412583" }, { customer: "989148412583" },
    { search: "سیدنعمت" }, { search: "سیدی" , limit: "100"}, { fullName: "سیدی" }, { name: "سیدی" },
  ]) {
    const r = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: { page: "1", limit: "25", ...f }, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);
    const list = (r?.data as any)?.list ?? [];
    const total = (r?.data as any)?.total ?? null;
    console.log(`  ${JSON.stringify(f)}: rows=${list.length}${total != null ? ` total=${total}` : ""}${list.length ? " codes=" + list.slice(0, 6).map((x: any) => x.code).join(",") : ""}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
