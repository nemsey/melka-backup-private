// check-arm-token.ts — آیا توکن ARM کارایی دارد؟ (برای شتاب‌دهی غنی‌سازی امروز)
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../../src/lib/auth/crypto";
import { armCall } from "../../src/lib/melk-api/client";
import { getMelkApiConfig } from "../../src/lib/melk-api/config";
import { MELK_ENDPOINTS } from "../../src/lib/melk-api/endpoints";
const db = new PrismaClient();
async function main() {
  const sessions = await db.session.findMany({
    where: { armTokenEnc: { not: null } },
    orderBy: { lastSeenAt: "desc" },
    take: 3,
    select: { id: true, lastSeenAt: true, expiresAt: true, revoked: true, armTokenEnc: true },
  });
  console.log("نشست‌های دارای توکن ARM:", sessions.length);
  for (const s of sessions) console.log(`  ${s.id.slice(0, 8)} lastSeen=${s.lastSeenAt?.toISOString()} expires=${s.expiresAt?.toISOString()} revoked=${s.revoked}`);
  const s = sessions[0];
  if (!s) { console.log("هیچ توکن ARM ذخیره‌شده نیست"); process.exit(2); }
  const token = decryptSecret(s.armTokenEnc ?? "") ?? "";
  if (!token) { console.log("رمزگشایی ناموفق"); process.exit(2); }
  try {
    const cfg = getMelkApiConfig();
    const res = await armCall<unknown>({ path: MELK_ENDPOINTS.arm.globalSettings, baseUrl: cfg.armApiBase, token, timeoutMs: 20_000, maxRetries: 0 });
    console.log("ARM TOKEN ALIVE ✓ — پاسخ:", JSON.stringify(res.data ?? {}).slice(0, 100));
  } catch (e) {
    console.log("ARM CALL FAILED:", (e as Error).message?.slice(0, 180));
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
