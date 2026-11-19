/**
 * DIR-CHANGES-TILE-002 — پراب نهم (نسخهٔ مقاوم) — با تلاش مجدد تا وصل رله
 */
import fs from "fs";
import path from "path";

const PID = "6a8c602a73557ed181ad4cc4"; // 57810

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

  const callR = async <T>(method: "GET", p: string, opts: { query?: Record<string, string> } = {}, tries = 6): Promise<any> => {
    for (let i = 1; i <= tries; i++) {
      try {
        return await armCall<T>({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, query: opts.query, timeoutMs: 100_000, maxRetries: 0 });
      } catch (e) {
        const msg = String((e as Error).message);
        console.error(`  [try ${i}/${tries}] ${p.slice(0, 40)} → ${msg.slice(0, 80)}`);
        if (i === tries) throw e;
        await new Promise((r) => setTimeout(r, 20_000));
      }
    }
  };

  const out: Record<string, unknown> = {};

  // ۱) requests/history با شناسهٔ آگهی (شانس بلند)
  try {
    const v = await callR("GET", `requests/history/${PID}`);
    out["req-history-with-propid"] = v;
    console.log("[req-history-with-propid] OK:", JSON.stringify(v).slice(0, 400));
  } catch (e) {
    out["req-history-with-propid"] = { __error: String(e) };
  }

  // ۲) کارگزاری‌های آگهی
  try {
    const v = await callR("GET", "special-properties/list", { query: { property: PID } });
    out["special-props"] = { count: (v?.data?.list ?? []).length, first: (v?.data?.list ?? [])[0] ?? null };
    console.log("[special-props] OK:", JSON.stringify(out["special-props"]).slice(0, 300));
  } catch (e) {
    out["special-props"] = { __error: String(e) };
  }

  // ۳) رویدادهای کامل 57810 — شکل کامل
  try {
    const v = await callR("GET", "request-events/list", { query: { property: PID, limit: "50" } });
    const list = v?.data?.list ?? [];
    out["events-57810"] = { count: list.length };
    out.eventShape = list[0] ?? null;
    console.log("[events-57810] count:", list.length);
    console.log("[eventShape]:", JSON.stringify(list[0] ?? {}, null, 1).slice(0, 1400));
  } catch (e) {
    out["events-57810"] = { __error: String(e) };
  }

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe9.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
