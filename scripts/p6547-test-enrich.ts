import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  try {
    const experts = await db.expertRecord.findMany({ take: 5 });
    const listRows = experts.map((e) => ({
      id: e.id, personnelCode: e.personnelCode, fullName: e.fullName, mobile: e.mobile, role: e.role,
      businessTitle: e.businessTitle, creator: e.creator, active: e.active, createdAt: e.createdAt, interactionTotal: 0,
    }));
    const { enrichExpertRows } = await import("../src/lib/melk-api/expert-enrichment");
    const enriched = await enrichExpertRows(listRows, null);
    console.log("ENRICH OK:", JSON.stringify(enriched.rows[0], null, 1).slice(0, 600));
  } catch (e) {
    console.error("ENRICH FAILED:", (e as Error).message?.slice(0, 300));
    console.error((e as Error).stack?.split("\n").slice(0, 6).join("\n"));
  }
  await db.$disconnect();
}
main();
