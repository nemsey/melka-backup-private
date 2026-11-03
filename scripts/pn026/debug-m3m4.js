// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Database } = require("bun:sqlite");
const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const tx = db.query("SELECT DISTINCT ownerName FROM TransactionRecord WHERE ownerName IS NOT NULL LIMIT 5").all();
console.log("tx owners:", JSON.stringify(tx));
for (const t of tx) {
  const m = db.query("SELECT COUNT(*) c FROM ExpertProfile WHERE fullName LIKE ?").get("%" + t.ownerName + "%");
  const m2 = db.query("SELECT COUNT(*) c FROM ExpertRecord WHERE fullName LIKE ?").get("%" + t.ownerName + "%");
  console.log(t.ownerName, "→ ExpertProfile:", m.c, "· ExpertRecord:", m2.c);
}
