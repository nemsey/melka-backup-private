/**
 * DIR-CHANGES-EXEC-001 · probe — خواندن مستقیم properties/owner/{id} برای 54402
 * عیب‌یابی: چرا fetchPropertyOwner در گام اول شکست خورد؟
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
  console.log("token source:", resolved.source ?? "?", "| expiry:", (resolved as any).expiresAt ?? "?");

  const propId = "6a3261ddc034cf27f2afdee5";
  const t0 = Date.now();
  try {
    const r = await armCall({ method: "GET", path: `properties/owner/${propId}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0 });
    console.log(`OK in ${Date.now() - t0}ms — message:`, (r as any).message);
    console.log("data:", JSON.stringify(r.data, null, 1).slice(0, 1500));
  } catch (e) {
    console.error(`FAIL in ${Date.now() - t0}ms:`, (e as Error).message);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
