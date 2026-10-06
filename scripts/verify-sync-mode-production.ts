/**
 * verify-sync-mode-production.ts — شاهد بخش B (ملکا-شورا-۰۰۶)
 * ----------------------------------------------------------------
 * اثبات فعال‌بودن MELK_SYNC_MODE=incremental روی production، از مسیر کد واقعی:
 *
 *   محیط : ‎.env.local واقعی production (bun run خودکار بارگذاری می‌کند)
 *   پایگاه: کپی موقت از db/custom.db — صفر نوشتن روی پایگاه اصلی
 *   شبکه : globalThis.fetch جایگزین پاسخ خالی NestJS — صفر تماس با سامانه مبدأ
 *           (قواعد ۵/۷/۹/۱۰ محرمانگی: هیچ درخواست واقعی، هیچ trace)
 *   شاهد : خط لاگ ساختاریافتهٔ واقعی logSync("sync-run", { mode: "incremental" })
 *           از دل تابع واقعی doSyncFromArm — نه شبیه‌سازی
 *
 * خروجی: PASS/FAIL + خطوط شاهد لاگ + فهرست endpointهای مسیر واقعی؛ exit 1 در شکست.
 * استفاده: bun scripts/verify-sync-mode-production.ts
 */
import { copyFileSync, rmSync, existsSync } from "fs";
import { resolve } from "path";

const PROD_DB = resolve(process.cwd(), "db/custom.db");
const TMP_DB = resolve(process.cwd(), "db/witness-sync-mode.tmp.db");

function fail(msg: string): never {
  console.error(`\n✗ WITNESS FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  // ---- ۱) محیط production ----
  const mode = process.env.MELK_SYNC_MODE;
  console.log("env.MELK_SYNC_MODE =", JSON.stringify(mode));
  if (mode !== "incremental") fail(".env.local production مقدار incremental ندارد.");
  console.log("env.DATABASE_URL    =", process.env.DATABASE_URL ?? "(unset)");
  if (!existsSync(PROD_DB)) fail("پایگاه production پیدا نشد.");
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("custom.db")) {
    fail("این اسکریپت باید با محیط production اجرا شود (custom.db).");
  }

  // ---- ۲) کپی موقت پایگاه (صفر اثر روی اصلی) ----
  copyFileSync(PROD_DB, TMP_DB);
  process.env.DATABASE_URL = `file:${TMP_DB}`;
  console.log("temp DB copy        =", TMP_DB);

  // ---- ۳) مرز شبکه stub — پاسخ خالی معتبر NestJS برای هر endpoint ----
  const fetchedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    fetchedUrls.push(url);
    const method = init?.method ?? (typeof input === "object" ? input?.method : "GET") ?? "GET";
    if (method !== "GET") fail(`مسیر sync متد غیر GET صادر کرد: ${method} ${url}`);
    const body = JSON.stringify({
      statusCode: 200,
      status: "success",
      data: { list: [], docs: [], total: 0, totalPages: 1, page: 1 },
      message: "witness-zero-network-stub",
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  };

  // ---- ۴) شکار لاگ ساختاریافته از process.stdout (تنها نقطه خروجی لاگ) ----
  const captured: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
    const s = typeof chunk === "string" ? chunk : String(chunk);
    if (s.startsWith("{")) captured.push(s.trim());
    return originalWrite(chunk, ...rest);
  };

  // ---- ۵) اجرای مسیر واقعی syncFromArm (پس از تنظیم env — ایمپورت داینامیک) ----
  let result;
  let dbModule: typeof import("@/lib/db") | null = null;
  try {
    const sync = await import("@/lib/melk-api/sync");
    result = await sync.syncFromArm("witness-zero-network-token");
  } finally {
    (globalThis as any).fetch = originalFetch;
    (process.stdout as any).write = originalWrite;
    try {
      dbModule = await import("@/lib/db");
      await dbModule.db.$disconnect();
    } catch {
      /* singleton ممکن است در این مسیر ساخته نشده باشد */
    }
  }

  // ---- ۶) راستی‌آزمایی شاهد ----
  const syncLines = captured.filter((l) => l.includes('"category":"sync"') || l.includes("sync-run"));
  console.log("\n--- شاهد لاگ sync-run (خروجی واقعی logSync) ---");
  for (const l of syncLines) console.log(l);

  const startLine = syncLines.find((l) => l.includes('"status":"start"'));
  if (!startLine) fail("خط لاگ sync-run start دریافت نشد.");
  if (!startLine.includes('"mode":"incremental"')) {
    fail(`mode در لاگ incremental نیست: ${startLine}`);
  }

  console.log("\n--- endpointهای مسیر واقعی (از رجیستری MELK_ENDPOINTS) ---");
  for (const u of fetchedUrls) console.log("GET", u);

  console.log("\nSyncResult:", JSON.stringify(result));
  if (!result?.ok) fail(`اجرای sync (روی کپی/شبکه-stub) ناموفق بود: ${result?.error ?? "?"}`);

  // ---- ۷) پاک‌سازی ----
  try {
    rmSync(TMP_DB, { force: true });
    rmSync(TMP_DB + "-journal", { force: true });
  } catch {
    /* بی‌اثر */
  }

  console.log("\n=== WITNESS PASS: MELK_SYNC_MODE=incremental در مسیر کد واقعی sync فعال است ===");
  console.log(`شاهد: ${syncLines.length} خط لاگ sync-run · ${fetchedUrls.length} فراخوانی GET (همه stub-شده، صفر شبکه واقعی)`);
}

main().catch((e) => fail(e instanceof Error ? e.stack ?? e.message : String(e)));
