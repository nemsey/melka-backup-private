/**
 * DIR-CHANGES-EXEC-001 · probe4 — جستجوی کددرخواست 56031 با فیلتر کدِ خود سامانه
 * (requests/list?code= — همان فیلتر UI آرم) + همسایه‌ها برای زمینه.
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

  for (const code of ["56032", "56029", "56031"]) {
    for (const q of [{ page: "1", limit: "25", code }, { page: "1", limit: "25", "code[]": code }]) {
      try {
        const r = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: q, timeoutMs: 180_000, maxRetries: 0 });
        const list = (r.data as any)?.list ?? [];
        const hit = list.find((x: any) => String(x.code ?? x.requestCode ?? "") === code);
        console.log(`code=${code} (${Object.keys(q)[2]}): list=${list.length} ${hit ? "→ FOUND _id=" + hit._id + " title=" + (hit.title ?? "?") : "→ not found"}`);
        if (hit) break;
      } catch (e) {
        console.log(`code=${code} (${Object.keys(q)[2]}): ERR ${(e as Error).message.slice(0, 80)}`);
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
