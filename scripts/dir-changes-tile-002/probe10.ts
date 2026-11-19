/**
 * DIR-CHANGES-TILE-002 — پراب دهم — خانوادهٔ ads (آگهی) + statuses/{id} + واریانت‌های پایانی
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
  const call = async (p: string, opts: { query?: Record<string, string> } = {}, tries = 4): Promise<any> => {
    for (let i = 1; i <= tries; i++) {
      try {
        return await armCall({ method: "GET", path: p, baseUrl: cfg.armApiBase, token: resolved.token, query: opts.query, timeoutMs: 100_000, maxRetries: 0 });
      } catch (e) {
        const msg = String((e as Error).message);
        if (i === tries) throw e;
        if (!msg.includes("برقرار نشد")) throw e; // فقط خطای شبکه تلاش مجدد
        await new Promise((r) => setTimeout(r, 18_000));
      }
    }
  };

  const out: Record<string, unknown> = {};
  const probe = async (label: string, p: string, opts: { query?: Record<string, string> } = {}) => {
    try {
      const v = await call(p, opts);
      out[label] = v;
      console.log(`[${label}] OK:`, JSON.stringify(v).slice(0, 400));
    } catch (e) {
      const err = e as { message?: string; httpStatus?: number };
      out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
      console.error(`[${label}] ERR:`, err.message);
    }
  };

  // خانوادهٔ ads (آگهی = ad)
  await probe("ads-history", `ads/history/${PID}`);
  await probe("ad-history", `ad/history/${PID}`);
  await probe("ads-statuses", `ads/statuses/${PID}`);
  await probe("ads-info", `ads/info/${PID}`);
  await probe("ad-status-list", "ad-status/list", { query: { property: PID } });
  await probe("adStatuses-list", "adStatuses/list", { query: { property: PID } });

  // statuses/{id} — کنترلر وضعیت‌ها با شناسهٔ آگهی
  await probe("statuses-pid", `statuses/${PID}`);
  await probe("status-pid", `status/${PID}`);

  // واریانت‌های پایانی
  await probe("get-history", `properties/get-history/${PID}`);
  await probe("all-status", `properties/all-status/${PID}`);
  await probe("properties-history-bare", "properties/history");
  await probe("workflow-list", "workflow/list", { query: { property: PID } });
  await probe("inboxes-list", "inboxes/list");
  await probe("props-statuses", `properties/statuses`, { query: { property: PID } });
  await probe("history-props", "history/list", { query: { property: PID } });

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe10.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
