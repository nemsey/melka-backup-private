/**
 * PN-059 — تست زندهٔ رفع کامل عدم اتصال به api ملک‌تبریز (۲۰۲۶-۱۱-۰۲)
 * ---------------------------------------------------------------------------
 * سناریوی عین سینک شش‌خانواده: صفحهٔ ۱ realtor-reports/traded-count از مسیر
 * رلهٔ موبایل (عین شکایت مالک). با کد تازه (مهلت رله‌آگاه ۱۱۰ث + اولویت ۲)
 * باید در همان چرخهٔ poll گوشی جواب بگیرد.
 */
import { applyPlatformEnvFallbacks } from "@/lib/platform-env";

async function main() {
  applyPlatformEnvFallbacks();
  console.log("MELK_ARM_RELAY_MODE =", process.env.MELK_ARM_RELAY_MODE);

  const { relayModeActive, relayPriorityForUrl, anyRelayDeviceOnline } = await import("@/lib/melk-api/relay");
  console.log("relayModeActive:", relayModeActive());
  console.log("priority(traded-count):", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/realtor-reports/traded-count?page=1&limit=5"));
  console.log("priority(realtors/list):", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/realtors/list?page=1&limit=100"));
  console.log("priority(visits/list):", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/visits/list?page=1&limit=100"));
  console.log("priority(details bulk):", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/details/xyz"));
  console.log("device online:", await anyRelayDeviceOnline());

  // توکن زنده از خزانه (عین catalog-daemon)
  const { db } = await import("@/lib/db");
  const row = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
  if (!row?.tokenEnc) {
    console.log("NO ARM TOKEN IN VAULT — تست صف بدون احراز انجام نمی‌شود");
    process.exit(0);
  }
  const { decryptSecret } = await import("@/lib/auth/crypto");
  const accessToken = decryptSecret(row.tokenEnc);
  console.log("vault token: present (status=", row.status, ")");

  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");
  const cfg = getMelkApiConfig();

  // عین فراخوانی سینک شش‌خانواده: صفحهٔ ۱ گزارش معاملات (پایگاه arus-api از مسیر رله)
  const t0 = Date.now();
  try {
    const res = await armCall<unknown>({
      path: "realtor-reports/traded-count",
      baseUrl: cfg.armApiBase,
      token: accessToken,
      query: { page: 1, limit: 5, startDate: new Date(Date.now() - 30 * 86400_000).toISOString(), endDate: new Date().toISOString() },
      timeoutMs: cfg.timeoutMs, // عین سینک: ۲۵ث — با رله‌آگاهیِ تازه تا ۱۱۰ث مؤثر
      maxRetries: 1,
    });
    const rows = (res.data as { data?: unknown[] })?.data ?? [];
    console.log(`✓ SUCCESS در ${Date.now() - t0}ms — صفحهٔ traded-count: ${Array.isArray(rows) ? rows.length : "?"} ردیف`);
  } catch (e) {
    console.log(`✗ FAILED در ${Date.now() - t0}ms — ${(e as Error).message}`);
    process.exit(1);
  }

  // دومین فراخوانی: realtors/list (کارشناسان)
  const t1 = Date.now();
  try {
    const res = await armCall<unknown>({
      path: "realtors/list",
      baseUrl: cfg.armApiBase,
      token: accessToken,
      query: { page: 1, limit: 5 },
      timeoutMs: cfg.timeoutMs,
      maxRetries: 1,
    });
    const rows = (res.data as { data?: unknown[] })?.data ?? [];
    console.log(`✓ SUCCESS در ${Date.now() - t1}ms — صفحهٔ realtors/list: ${Array.isArray(rows) ? rows.length : "?"} ردیف`);
  } catch (e) {
    console.log(`✗ FAILED در ${Date.now() - t1}ms — ${(e as Error).message}`);
    process.exit(1);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
