/**
 * DIR-CHANGES-EXEC-001 · probe2 — پس از users/update موفق:
 * users/info/{customerId} و properties/owner/{id} و by-code را مستقیم می‌خواند
 * تا منبع تأخیر خواندن (رکورد کاربر vs نمای مالک آگهی) معلوم شود.
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
  const cust = "67c40bf04450822bfc10a50a";
  const prop = "6a3261ddc034cf27f2afdee5";

  async function get(path: string) {
    const t0 = Date.now();
    try {
      const r = await armCall({ method: "GET", path, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0 });
      return { ms: Date.now() - t0, data: r.data };
    } catch (e) {
      return { ms: Date.now() - t0, err: (e as Error).message };
    }
  }

  const u = await get(`users/info/${cust}`);
  console.log("users/info:", (u as any).ms + "ms");
  if ((u as any).err) console.log("  ERR:", (u as any).err);
  else console.log("  fullName:", (u as any).data?.fullName, "| firstName:", (u as any).data?.firstName, "| lastName:", (u as any).data?.lastName, "| mobile:", (u as any).data?.mobileNumber);

  const o = await get(`properties/owner/${prop}`);
  console.log("properties/owner:", (o as any).ms + "ms");
  if ((o as any).err) console.log("  ERR:", (o as any).err);
  else console.log("  fullName:", (o as any).data?.fullName, "| mobile:", (o as any).data?.mobileNumber);

  const b = await get("properties/info/by-code/54402");
  console.log("by-code:", (b as any).ms + "ms");
  if ((b as any).err) console.log("  ERR:", (b as any).err);
  else {
    const cust2 = (b as any).data?.customer;
    console.log("  customer.fullName:", cust2?.fullName ?? cust2?.lastName, "| mobile:", cust2?.mobileNumber);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
