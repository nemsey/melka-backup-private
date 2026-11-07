// تشخیص: کدام بررسی‌های P10 روی test.db اکنون fail/warn اند؟ (رفع شکست ح-۱۶/۱۷/د-۲)
import { runIntelligenceCoreCycle } from "@/lib/intelligence/core-cycle";
import { existsSync, readdirSync } from "node:fs";

const backupsCount = existsSync("/home/z/my-project/backups") ? readdirSync("/home/z/my-project/backups").filter((f) => f.endsWith(".db")).length : 0;
console.log("backups/*.db (cwd):", backupsCount);

process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";
process.env.MELK_TOKEN_KEY = process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret";

const r = await runIntelligenceCoreCycle();
const flagged = r.p10.checks.filter((c) => c.status !== "pass");
console.log("realProblems:", r.p10.realProblems.length);
for (const c of flagged) console.log(`  ${c.status.toUpperCase()}  ${c.id} — ${c.details}`);
console.log("proposals:", r.p11.proposals.length);
