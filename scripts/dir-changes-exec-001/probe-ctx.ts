/**
 * DIR-CHANGES-EXEC-001 · probe9 — حلقهٔ پایانی زمینه‌ای:
 *   ۱) آیا کدآگهی 56031 در ARM موجود است؟ (احتمال آمیختن کدآگهی/کددرخواست)
 *   ۲) تاریخچهٔ آگهی 54402 (گام اول) — آیا مشاورش «سید نعمت اله سیدی» است؟
 *      (تطبیق با اسکرین‌شات ۱۴۰۵/۰۸/۲۹ مالک)
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
  const pub = getMelkApiConfig().melkPublicApiBase;

  console.log("═══ ۱) کدآگهی 56031 در ARM (apm) ═══");
  const r1 = await armCall({ method: "GET", path: "properties/info/by-code/56031", baseUrl: base, token: resolved.token, timeoutMs: 60_000, maxRetries: 0 })
    .then((r: any) => ({ ok: true, data: r.data })).catch((e: any) => ({ ok: false, err: String(e.message).slice(0, 120) }));
  if (r1.ok) {
    const d: any = (r1 as any).data;
    console.log("FOUND:", JSON.stringify({ _id: d._id, code: d.code, title: d.title, relatedRealtor: d.relatedRealtor, createdAt: d.createdAt }).slice(0, 300));
  } else console.log("not found →", (r1 as any).err);

  console.log("═══ ۱-ب) کدآگهی 56031 در عمومی (apu) ═══");
  const r1p = await armCall({ method: "GET", path: "properties/info/by-code/56031", baseUrl: pub, timeoutMs: 60_000, maxRetries: 0 })
    .then((r: any) => ({ ok: true, data: r.data })).catch((e: any) => ({ ok: false, err: String(e.message).slice(0, 120) }));
  if (r1p.ok) {
    const d: any = (r1p as any).data;
    console.log("FOUND public:", JSON.stringify({ _id: d._id, code: d.code, title: d.title, relatedRealtor: d.relatedRealtor, createdAt: d.createdAt }).slice(0, 300));
  } else console.log("not found →", (r1p as any).err);

  console.log("═══ ۲) آگهی 54402 — مشاور و تاریخچهٔ رویدادها ═══");
  const r2 = await armCall({ method: "GET", path: "properties/info/by-code/54402", baseUrl: base, token: resolved.token, timeoutMs: 60_000, maxRetries: 0 })
    .then((r: any) => r.data).catch((e: any) => null);
  if (r2) {
    console.log("54402:", JSON.stringify({ _id: r2._id, code: r2.code, title: r2.title, relatedRealtor: r2.relatedRealtor, createdAt: r2.createdAt, customer: r2.customer?.fullName ?? r2.customer }).slice(0, 400));
    const ev = await armCall({ method: "GET", path: "request-events/list", baseUrl: base, token: resolved.token, query: { property: String(r2._id), limit: "100" }, timeoutMs: 120_000, maxRetries: 0 }).catch(() => null);
    const list = (ev?.data as any)?.list ?? [];
    console.log(`  رویدادهای آگهی: ${list.length}`);
    for (const e of list.slice(0, 12)) console.log(`    · ${e.eventType?.name ?? "?"} | ${e.realtor?.fullName ?? e.actor?.fullName ?? "?"} | date=${e.date ?? "?"} hour=${e.hour ?? "?"}`);
  } else console.log("54402 not found");

  console.log("═══ ۳) درخواست 48968 — رویدادهای ثبت‌شده (request-events) ═══");
  const ev48 = await armCall({ method: "GET", path: "request-events/list", baseUrl: base, token: resolved.token, query: { requestProperty: "6a42a5c12c4b2e2f7fea5172", limit: "100" }, timeoutMs: 120_000, maxRetries: 0 }).catch(() => null);
  const list48 = (ev48?.data as any)?.list ?? [];
  console.log(`  رویدادهای درخواست 48968: ${list48.length}`);
  for (const e of list48) console.log(`    · ${e.eventType?.name ?? "?"} | ${e.realtor?.fullName ?? "?"} | date=${e.date ?? "?"} hour=${e.hour ?? "?"} property=${e.property?.code ?? "-"}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
