/**
 * DIR-CHANGES-EXEC-001 · probe6 — سرنخ تازهٔ مالک: «کددرخواست ۵۶۰۳۱ متعلق به مشتری
 * سیدنعمت‌اله سیدی است» — راستی‌آزمایی زندهٔ چندوجهی:
 *   ۱) بازتأیید غیبت 56031 با فیلتر کدِ خود سامانه (هر دو قالب param)
 *   ۲) یافتن درخواست زندهٔ همین مشتری (کد 48968 در آینهٔ محلی) در ARM + تاریخچه‌اش
 *   ۳) اسکن ۱۲ صفحه × ۵۰ تازه‌ترین درخواست: هر ردیفی که مشتری‌اش «سیدی» است
 *   ۴) کشف پارامترهای فیلتر مشتری/موبایل در requests/list
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
  const q = (query: Record<string, string>) =>
    armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);

  console.log("═══ ۱) بازتأیید غیبت 56031 (فیلتر کدِ خود سامانه) ═══");
  for (const f of [{ code: "56031" }, { "code[]": "56031" }]) {
    const r = await q({ page: "1", limit: "25", ...f });
    const list = (r?.data as any)?.list ?? [];
    const hit = list.find((x: any) => String(x.code ?? x.requestCode ?? "") === "56031");
    console.log(`  filter ${JSON.stringify(f)}: rows=${list.length} → ${hit ? "FOUND _id=" + hit._id : "not found"}`);
  }

  console.log("═══ ۲) درخواست زندهٔ مشتری (کد آینهٔ محلی 48968) ═══");
  let seydiRow: any = null;
  for (const f of [{ code: "48968" }, { "code[]": "48968" }]) {
    const r = await q({ page: "1", limit: "25", ...f });
    const list = (r?.data as any)?.list ?? [];
    const hit = list.find((x: any) => String(x.code ?? x.requestCode ?? "") === "48968");
    console.log(`  filter ${JSON.stringify(f)}: rows=${list.length} → ${hit ? "FOUND _id=" + hit._id : "not found"}`);
    if (hit) { seydiRow = hit; break; }
  }
  if (seydiRow) {
    const brief = { _id: seydiRow._id, code: seydiRow.code, title: seydiRow.title, relatedCustomer: seydiRow.relatedCustomer, relatedRealtor: seydiRow.relatedRealtor, createdAt: seydiRow.createdAt, customer: seydiRow.customer ?? null };
    console.log("  row:", JSON.stringify(brief, null, 1).slice(0, 700));
    const h = await armCall({ method: "GET", path: `requests/history/${encodeURIComponent(String(seydiRow._id))}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);
    const hist = (h?.data as any)?.list ?? [];
    console.log(`  تاریخچهٔ زنده: ${hist.length} مدخل`);
    for (const e of hist) {
      console.log(`    · ${e.actionType?.name ?? "?"} | ${e.realtor?.fullName ?? "?"} | date=${e.date ?? "?"} | customer=${typeof e.customer === "object" && e.customer ? (e.customer.fullName ?? e.customer.firstName ?? "?") : e.customer ?? "?"}`);
    }
  }

  console.log("═══ ۳) اسکن ۱۲ صفحه × ۵۰ تازه‌ترین — ردیف‌های مشتری «سیدی» ═══");
  const seydiHits: any[] = [];
  let scanned = 0;
  for (let page = 1; page <= 12; page++) {
    const r = await q({ page: String(page), limit: "50" });
    const list = (r?.data as any)?.list ?? [];
    if (list.length === 0) break;
    scanned += list.length;
    for (const row of list) {
      const cust = String(row.relatedCustomer ?? "");
      const custObj = typeof row.customer === "object" && row.customer ? String(row.customer.fullName ?? row.customer.firstName ?? row.customer.lastName ?? "") : "";
      if (cust.includes("سیدی") || custObj.includes("سیدی") || cust.includes("سيدی")) {
        seydiHits.push({ code: row.code, _id: row._id, relatedCustomer: cust, customerObj: custObj, title: row.title, createdAt: row.createdAt });
      }
    }
  }
  console.log(`  اسکن‌شده: ${scanned} ردیف — «سیدی»: ${seydiHits.length}`);
  for (const h of seydiHits) console.log("   ", JSON.stringify(h).slice(0, 260));

  console.log("═══ ۴) کشف فیلترهای مشتری/موبایل در requests/list ═══");
  const variants: Record<string, string>[] = [
    { mobile: "09148412583" }, { mobileNumber: "09148412583" }, { phone: "09148412583" },
    { customer: "سیدی" }, { customerName: "سیدی" }, { fullName: "سیدنعمت اله سیدی" },
    { search: "سیدی" }, { text: "سیدی" }, { q: "سیدی" },
    { mobile: "989148412583" }, { nationalCode: "سیدی" },
  ];
  for (const v of variants) {
    const r = await q({ page: "1", limit: "25", ...v });
    const list = (r?.data as any)?.list ?? [];
    const total = (r?.data as any)?.total ?? null;
    const sampleCusts = list.slice(0, 3).map((x: any) => String(x.relatedCustomer ?? x.code ?? "?")).join(",");
    console.log(`  ${JSON.stringify(v)}: rows=${list.length}${total != null ? ` total=${total}` : ""}${list.length ? ` sample=[${sampleCusts}]` : ""}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
