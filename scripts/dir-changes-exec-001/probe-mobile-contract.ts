/**
 * DIR-CHANGES-EXEC-001 · probe3 — آزمون تعیین‌کنندهٔ قرارداد mobileNumber در users/update
 * گام‌ها (هر یک با خواندن پسینی users/info برای اثبات ماندگاری):
 *   A) mobileNumber به‌صورت عدد 989144018677 (قالب ذخیره‌شده)
 *   B) mobileNumber به‌صورت رشتهٔ "989144018677" (بین‌المللی)
 * خروجی: هر گام چه چیزی ماند.
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

  async function readInfo() {
    const r = await armCall({ method: "GET", path: `users/info/${cust}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0 }).catch((e: Error) => ({ err: e.message }));
    const d = (r as any).data ?? r;
    return { fullName: d?.fullName, mobile: d?.mobileNumber };
  }

  console.log("پیش از آزمون:", JSON.stringify(await readInfo()));

  // A) عدد 989144018677
  try {
    const a = await armCall({ method: "PUT", path: `users/update/${cust}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0, body: { firstName: "احد", lastName: "شریفی", mobileNumber: 989144018677 } });
    console.log("A) PUT عدد:", (a as any).message, "| echo mobile:", (a as any).data?.mobileNumber);
  } catch (e) { console.log("A) PUT خطا:", (e as Error).message); }
  console.log("A) خواندن پسینی:", JSON.stringify(await readInfo()));

  // B) رشتهٔ بین‌المللی "989144018677"
  try {
    const b = await armCall({ method: "PUT", path: `users/update/${cust}`, baseUrl: base, token: resolved.token, timeoutMs: 180_000, maxRetries: 0, body: { firstName: "احد", lastName: "شریفی", mobileNumber: "989144018677" } });
    console.log("B) PUT رشتهٔ 98:", (b as any).message, "| echo mobile:", (b as any).data?.mobileNumber);
  } catch (e) { console.log("B) PUT خطا:", (e as Error).message); }
  console.log("B) خواندن پسینی:", JSON.stringify(await readInfo()));

  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
