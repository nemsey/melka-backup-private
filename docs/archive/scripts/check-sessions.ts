import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const now = new Date();
const ss = await p.session.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, createdAt: true, expiresAt: true, revoked: true, armUserType: true, armTokenEnc: true, lastSeenAt: true } });
for (const s of ss) {
  console.log(
    `createdAt=${s.createdAt.toISOString()} expiresAt=${s.expiresAt.toISOString()} revoked=${s.revoked}` +
    ` expired=${s.expiresAt < now} armUserType=${s.armUserType ?? "-"} armTokenLen=${s.armTokenEnc?.length ?? 0} lastSeen=${s.lastSeenAt?.toISOString() ?? "-"}`
  );
}
await p.$disconnect();
