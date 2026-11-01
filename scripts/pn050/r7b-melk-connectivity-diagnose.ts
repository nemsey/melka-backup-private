/**
 * PN-050-R7-ب — تشخیص زندهٔ مسیر ملک‌تبریز (بدون HTTP auth — فراخوانی مستقیم lib)
 * خروجی: وضعیت رله + وضعیت همگام‌سازی + تست دروازهٔ ARM از مسیر رله
 */
import { relayOverview, runRelayGateTest, anyRelayDeviceOnline, RELAY_ONLINE_WINDOW_MS } from "@/lib/melk-api/relay";
import { getSyncState } from "@/lib/melk-api/sync";

async function main() {
  console.log("== 1) relay overview ==");
  const ov = await relayOverview();
  console.log("mode:", ov.mode, "· active:", ov.active);
  for (const d of ov.devices.slice(0, 5)) {
    console.log(`  ${d.deviceId} (${d.label}) online=${d.online} served=${d.servedCount} err=${d.errorCount} rtt=${d.lastRoundtripMs}ms lastSeen=${d.lastSeenAt} revoked=${d.revoked}`);
  }
  console.log("queue:", JSON.stringify(ov.queue));

  console.log("\n== 2) online window check ==");
  const online = await anyRelayDeviceOnline();
  console.log(`anyRelayDeviceOnline()=${online} (window=${RELAY_ONLINE_WINDOW_MS / 1000}s)`);

  console.log("\n== 3) sync state ==");
  const st = await getSyncState();
  console.log(JSON.stringify(st, null, 1).slice(0, 1200));

  console.log("\n== 4) ARM gate test through relay (GET arus-api root) ==");
  const t0 = Date.now();
  try {
    const r = await runRelayGateTest(45_000);
    console.log(`ok=${r.ok} http=${r.httpStatus} in ${Date.now() - t0}ms`, JSON.stringify(r).slice(0, 300));
  } catch (e) {
    console.log(`GATE TEST THREW after ${Date.now() - t0}ms:`, String(e).slice(0, 300));
  }
}

main().catch((e) => { console.error("CRASH:", e); process.exit(1); });
