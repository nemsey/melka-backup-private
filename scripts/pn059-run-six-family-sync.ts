/**
 * PN-059 — اجرای یک‌بارهٔ سینک شش‌خانواده از مسیر رسمی (همان کد catalog-daemon)
 * با توکن خزانه — برای پاک‌سازی SyncState و اثبات پایان‌به‌پایان رفع اتصال.
 */
import { applyPlatformEnvFallbacks } from "@/lib/platform-env";

async function main() {
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const row = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
  if (!row?.tokenEnc) {
    console.log("NO VAULT TOKEN");
    process.exit(1);
  }
  const { decryptSecret } = await import("@/lib/auth/crypto");
  const accessToken = decryptSecret(row.tokenEnc);
  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) ?? "" : "";
  console.log("vault token present — starting six-family sync (relay-aware 110s + priority 2)…");
  const t0 = Date.now();
  const { syncWithRefresh } = await import("@/lib/melk-api/sync");
  const { sync } = await syncWithRefresh(accessToken, refreshToken);
  console.log(JSON.stringify({
    ok: sync.ok,
    durationMin: Math.round((Date.now() - t0) / 6000) / 10,
    transactions: sync.transactions,
    experts: sync.experts,
    interactions: sync.interactions,
    visits: sync.visits,
    supplyDemand: sync.supplyDemand,
    contracts: sync.contracts,
    error: sync.error ?? null,
    errorCode: sync.errorCode ?? null,
  }, null, 1));
  await db.$disconnect();
  process.exit(sync.ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
