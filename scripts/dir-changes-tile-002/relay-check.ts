/**
 * DIR-CHANGES-TILE-002 — چک سلامت رله (کوچک‌ترین فراخوانی + چندتلاش)
 */
async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const { relayOverview, relayModeActive } = await import("@/lib/melk-api/relay");

  console.log("relayModeActive:", relayModeActive());
  const ov = await relayOverview();
  console.log("mode:", ov.mode, "active:", ov.active);
  console.log("devices:", JSON.stringify(ov.devices.filter((d) => d.online).map((d) => ({ label: d.label, lastSeenAt: d.lastSeenAt, lastRoundtripMs: d.lastRoundtripMs }))));
  console.log("queue:", JSON.stringify(ov.queue));

  const resolved = await resolveBestArmToken(db);
  if (!resolved) throw new Error("no token");
  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    try {
      const r = await armCall({ method: "GET", path: "user-seriousness/list", baseUrl: getMelkApiConfig().armApiBase, token: resolved.token, timeoutMs: 130_000, maxRetries: 0 });
      console.log(`[try ${i}] OK in ${Date.now() - t0}ms — list len:`, (r.data as any)?.list?.length ?? "?");
      break;
    } catch (e) {
      console.error(`[try ${i}] FAIL in ${Date.now() - t0}ms:`, (e as Error).message);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
