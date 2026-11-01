process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
export {};
async function main() {
  const { db } = await import("@/lib/db");
  const { sessionToArmTokens } = await import("@/lib/auth/session");
  const ss = await db.session.findMany({ where: { armTokenEnc: { not: null } }, orderBy: { createdAt: "desc" }, take: 3 });
  for (const s of ss) {
    const tokens = sessionToArmTokens(s);
    console.log(JSON.stringify({
      personnelCode: s.personnelCode, role: s.role, accessScope: s.accessScope,
      createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(),
      appValid: s.expiresAt.getTime() > Date.now() && !s.revoked,
      armTokenBytes: tokens?.accessToken ? Buffer.byteLength(tokens.accessToken, "utf8") : 0,
      hasRefresh: !!tokens?.refreshToken,
    }));
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
