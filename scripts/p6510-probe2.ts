/**
 * p6510-probe2.ts — پروب زنجیرهٔ غنی‌سازی (owner/details/applicant) + سقف limit
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { getMelkApiConfig } from "../src/lib/melk-api/config";

const prisma = new PrismaClient();

async function getArmToken(): Promise<string | null> {
  const sessions = await prisma.session.findMany({
    where: { revoked: false, armTokenEnc: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { armTokenEnc: true },
  });
  for (const s of sessions) {
    if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
    const plain = decryptSecret(s.armTokenEnc);
    if (plain && plain !== "null" && plain.length > 20) return plain;
  }
  return null;
}

async function main() {
  const token = await getArmToken();
  if (!token) {
    console.error("ABORT: no ARM token");
    process.exit(2);
  }
  const cfg = getMelkApiConfig();
  const PROP_ID = "6aaf5ab5ddf09123e06287c6";
  const REQ_ID = "6aaf01a1b2bb594693f0a054";

  const calls: Array<[string, string]> = [
    ["owner", `properties/owner/${PROP_ID}`],
    ["details", `properties/details/${PROP_ID}`],
    ["applicant", `requests/applicant/${REQ_ID}`],
    ["req-details", `requests/details/${REQ_ID}`],
  ];
  for (const [name, path] of calls) {
    try {
      const res = await armCall<unknown>({ path, baseUrl: cfg.armApiBase, token, timeoutMs: cfg.timeoutMs, maxRetries: 0 });
      console.log(`\n=== ${name} ===`);
      console.log(JSON.stringify(res.data).slice(0, 2200));
    } catch (err) {
      console.log(`\n=== ${name} ERROR === ${String(err).slice(0, 300)}`);
    }
  }

  // سقف limit فهرست
  for (const lim of [100, 200, 500]) {
    try {
      const res = await armCall<unknown>({ path: "properties/list", baseUrl: cfg.armApiBase, token, query: { page: 1, limit: lim }, timeoutMs: cfg.timeoutMs, maxRetries: 0 });
      const d = res.data as { list?: unknown[]; limit?: number; count?: number };
      console.log(`\nlimit-test ${lim}: got list=${d.list?.length} serverLimit=${d.limit} count=${d.count}`);
    } catch (err) {
      console.log(`\nlimit-test ${lim} ERROR: ${String(err).slice(0, 200)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
