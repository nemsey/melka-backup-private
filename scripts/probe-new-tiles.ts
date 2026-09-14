/**
 * پروب زنده نقاط اتصال کشف‌شده برای چهار کاشی جدید:
 *   ۱) قراردادها و اسناد — trade-overviews
 *   ۲) باشگاه مشتریان — user-characters / user-jobs / user-roles / user-seriousness
 *   ۳) مالی و کمیسیون — businesses/info/own + acc commission configList
 *   ۴) شاخص قیمت روز مناطق — configs/current-prices
 * توکن ARM رمزنگاری‌شده از SyncState خوانده می‌شود.
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";

const ARM = "https://arus-api.melketabriz.ir/api/apm";

async function main() {
  const prisma = new PrismaClient();
  const state = await prisma.syncState.findUnique({ where: { id: "singleton" } });
  const token = decryptSecret(state?.armTokenEnc);
  if (!token) {
    console.log("NO_ARM_TOKEN — ورود موفق ثبت نشده است");
    await prisma.$disconnect();
    return;
  }
  console.log("ARM token found, len =", token.length);

  const calls: { name: string; path: string; query?: string }[] = [
    { name: "trade-overviews/list", path: "trade-overviews/list", query: "?page=1&limit=5" },
    { name: "trade-overviews/contribution", path: "trade-overviews/contribution" },
    { name: "user-characters/list", path: "user-characters/list" },
    { name: "user-jobs/list", path: "user-jobs/list" },
    { name: "user-roles/list", path: "user-roles/list" },
    { name: "user-seriousness/list", path: "user-seriousness/list" },
    { name: "businesses/info/own", path: "businesses/info/own" },
    { name: "configs/current-prices/list", path: "configs/current-prices/list" },
    { name: "global-settings", path: "global-settings" },
  ];

  for (const c of calls) {
    const url = `${ARM}/${c.path}${c.query ?? ""}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      console.log("\n===", c.name, "→", res.status, "len", text.length);
      console.log(text.slice(0, 1500));
    } catch (e) {
      console.log("\n===", c.name, "→ ERROR", (e as Error).message);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
