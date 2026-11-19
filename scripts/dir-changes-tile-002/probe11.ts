/**
 * DIR-CHANGES-TILE-002 — پراب یازدهم — الگوی REST خالص: DELETE properties/{id} · DELETE requests/{id}
 */
import fs from "fs";
import path from "path";

const FAKE = "5f0000000000000000000001";

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
  const out: Record<string, unknown> = {};
  const probe = async (label: string, method: "GET" | "POST" | "PUT" | "DELETE", p: string, body?: unknown) => {
    for (let i = 1; i <= 4; i++) {
      try {
        const v: any = await armCall({ method, path: p, baseUrl: cfg.armApiBase, token: resolved.token, body, timeoutMs: 100_000, maxRetries: 0 });
        out[label] = v;
        console.log(`[${label}] OK:`, JSON.stringify(v).slice(0, 300));
        return;
      } catch (e) {
        const err = e as { message?: string; httpStatus?: number };
        const msg = String(err.message);
        if (i === 4 || !msg.includes("برقرار نشد")) {
          out[label] = { __error: { message: err.message, httpStatus: err.httpStatus } };
          console.error(`[${label}] ERR:`, err.message);
          return;
        }
        await new Promise((r) => setTimeout(r, 18_000));
      }
    }
  };

  await probe("del-properties-bare", "DELETE", `properties/${FAKE}`);
  await probe("del-requests-bare", "DELETE", `requests/${FAKE}`);
  await probe("get-properties-bare", "GET", `properties/${FAKE}`);
  await probe("put-properties-bare", "PUT", `properties/${FAKE}`, {});
  await probe("del-prop-info-code", "DELETE", `properties/info/by-code/${FAKE}`);
  await probe("del-requestevents-bare", "DELETE", `request-events/${FAKE}`);

  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "probe11.json"), JSON.stringify(out, null, 2), "utf8");
  console.log("SAVED");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
