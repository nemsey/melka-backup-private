const Database = require("better-sqlite3");
for (const p of ["/home/z/my-project/db/custom.db", "/home/z/my-project/db/test.db"]) {
  const db = new Database(p);
  db.pragma("busy_timeout = 30000");
  const upP = db.prepare("UPDATE PropertyRecord SET syncStage = CASE WHEN extractionBatchId IS NOT NULL THEN 'ALL_DONE' ELSE 'P0_DONE' END WHERE syncStage IS NULL");
  const upR = db.prepare("UPDATE RequestRecord SET syncStage = CASE WHEN extractionBatchId IS NOT NULL THEN 'ALL_DONE' ELSE 'P0_DONE' END WHERE syncStage IS NULL");
  const info1 = upP.run();
  const info2 = upR.run();
  const c = (m, s, extra) => db.prepare(`SELECT COUNT(*) n FROM ${m} ${extra || ""}`).get().n;
  console.log(p, { P_all: c("PropertyRecord", 0, "WHERE syncStage='ALL_DONE'"), P_p0: c("PropertyRecord", 0, "WHERE syncStage='P0_DONE'"), P_null: c("PropertyRecord", 0, "WHERE syncStage IS NULL"), P_total: c("PropertyRecord"), R_all: c("RequestRecord", 0, "WHERE syncStage='ALL_DONE'"), R_p0: c("RequestRecord", 0, "WHERE syncStage='P0_DONE'"), R_null: c("RequestRecord", 0, "WHERE syncStage IS NULL"), R_total: c("RequestRecord"), updated: [info1.changes, info2.changes] });
  db.close();
}
