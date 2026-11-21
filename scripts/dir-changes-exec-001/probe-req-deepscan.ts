/**
 * DIR-CHANGES-EXEC-001 · probe5 — اسکن عمیق نهایی برای 56031:
 * ۱۲ صفحه × ۵۰ = ۶۰۰ تازه‌ترین درخواست + جستجوی مستقیم در هر صفحه.
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

  let found: any = null;
  const codesSeen: string[] = [];
  for (let page = 1; page <= 12; page++) {
    const r = await armCall({ method: "GET", path: "requests/list", baseUrl: base, token: resolved.token, query: { page: String(page), limit: "50" }, timeoutMs: 180_000, maxRetries: 0 }).catch(() => null);
    const list = (r?.data as any)?.list ?? [];
    if (list.length === 0) { console.log(`page ${page}: empty — stop`); break; }
    for (const row of list) {
      const c = String(row.code ?? row.requestCode ?? "");
      codesSeen.push(c);
      if (c === "56031") found = row;
    }
    console.log(`page ${page}: ${list.length} rows · codes ${list[0]?.code}..${list[list.length - 1]?.code}`);
    if (found) break;
  }
  const nums = codesSeen.map(Number).filter((n) => !isNaN(n));
  console.log("scanned:", nums.length, "· min code:", Math.min(...nums), "· max code:", Math.max(...nums));
  console.log("56031 in range?", nums.includes(56031) ? "FOUND" : "NO — و البته کدهای ۵۶۰۲۵/۲۶/۲۸/۳۰/۳۳..۳۶ هم غایب‌اند:");
  const missing = [];
  for (let c = 56020; c <= 56040; c++) if (!nums.includes(c)) missing.push(c);
  console.log("missing in 56020..56040 window:", missing.join(", "));
  if (found) console.log("FOUND:", JSON.stringify({ _id: found._id, title: found.title, createdAt: found.createdAt }).slice(0, 300));
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
