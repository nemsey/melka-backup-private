/**
 * DIR-CHANGES-TILE-002 — پراب هشتم — یافتن آگهیِ اسکرین‌شات (رویدادهای 55772/55381/51723)
 * + بررسی کامل آن آگهی (تاریخچه/مالک/رویداد)
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
  if (!resolved || !resolved.token) throw new Error("no token");
  const cfg = getMelkApiConfig();
  const call = <T>(method: "GET", p: string, opts: { query?: Record<string, string> } = {}) =>
    armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, query: opts.query, timeoutMs: 90_000, maxRetries: 0 });

  const out: Record<string, unknown> = {};
  const wanted = new Set(["55772", "55381", "51723"]);
  const found: any[] = [];
  for (let page = 1; page <= 6; page++) {
    const res: any = await call("GET", "request-events/list", { query: { page: String(page), limit: "50" } });
    const list = res?.data?.list ?? [];
    console.log(`[p${page}] ${list.length} events`);
    for (const e of list) {
      const rc = String(e?.requestProperty?.code ?? "");
      if (wanted.has(rc)) found.push(e);
    }
    if (found.length >= 3) break;
  }
  out.foundEvents = found.map((e) => ({
    _id: e._id,
    eventType: e.eventType?.name,
    date: e.date,
    hour: e.hour,
    requestCode: e.requestProperty?.code,
    property: { _id: e.property?._id, code: e.property?.code, title: e.property?.title },
    realtor: e.realtor?.fullName ?? null,
    keys: Object.keys(e),
  }));
  console.log("FOUND:", JSON.stringify(out.foundEvents, null, 1).slice(0, 1500));

  // آگهی مقصد (اگر یافت شد) — بررسی کامل (خطای دسترسی = شفاف ثبت شود)
  const target = found.find((e) => e.property?._id)?.property;
  if (target?._id) {
    const tid = String(target._id);
    const tcode = String(target.code ?? "");
    out.targetProperty = { id: tid, code: tcode, title: target.title };
    fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe8.json"), JSON.stringify(out, null, 2), "utf8");
    try {
      const bc: any = await call("GET", `properties/info/by-code/${tcode}`);
      const row = bc.data ?? {};
      out.targetByCode = {
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        statusLen: (row.status ?? []).length,
        status: row.status,
        relatedRealtor: row.relatedRealtor,
      };
      console.log("TARGET:", JSON.stringify(out.targetByCode, null, 1).slice(0, 900));
    } catch (e) {
      out.targetByCodeError = String(e);
      console.error("[target-bycode] ERR:", String(e));
    }
  }

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe8.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
