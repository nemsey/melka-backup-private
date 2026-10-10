import { runIntelligenceCoreCycle } from "../src/lib/intelligence/core-cycle";
const r = await runIntelligenceCoreCycle();
console.log("shadow:", JSON.stringify(r.p7.shadow));
console.log("calibration:", JSON.stringify(r.p7.calibration));
console.log("brierTarget:", r.p7.brierTarget, "| drift:", JSON.stringify(r.p7.drift));
console.log("p10 problems:", r.p10.realProblems.map((p: any) => p.checkId).join(", "));
