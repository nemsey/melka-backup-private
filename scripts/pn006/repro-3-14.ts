// PN-006 — ریشه‌یابی نوسان تست ۳-۱۴: اجرای همان توالی (integration قبل از p11)
import { SelfRepairEngineImpl, RepairExecutorImpl, RepairApprovalGateImpl } from "../../src/core/intelligence/p11-core";
import { SelfDiagnosisEngineImpl, healthySnapshot, type SystemSnapshot } from "../../src/core/intelligence/p10-core";
import type { DiagnosticReport } from "../../src/core/intelligence/contracts-p7-p11";
import { runIntelligenceCoreCycle } from "../../src/lib/intelligence/core-cycle";

const snap = (over: Partial<SystemSnapshot> = {}): SystemSnapshot => ({ ...healthySnapshot(), ...over } as SystemSnapshot);
const diag = (over: Partial<SystemSnapshot> = {}): DiagnosticReport => new SelfDiagnosisEngineImpl().runFullDiagnosis(snap(over));

// توالی سوئیت: ابتدا چرخهٔ کامل (مثل p6537-integration)
const r = await runIntelligenceCoreCycle();
console.log("cycle: realProblems=", r.p10.realProblems.length, "proposals=", r.p11.proposals.length);

// سپس همان کد تست ۳-۱۴
const realDiagnosis = () => diag({ brierScore: 0.2255, worstCalibrationGap: 0.508, dataAgeHours: 30 } as never);
const firstProposal = () => new SelfRepairEngineImpl().proposeRepairs(realDiagnosis(), {}, 4)[0];
const p = firstProposal();
console.log("proposal[0]:", p.sourceCheckId, "type:", p.proposedAction.type, "risk:", p.riskAssessment.level, "requiredTier:", p.requiredTier);

const e = new RepairExecutorImpl(new RepairApprovalGateImpl());
const res = e.execute(p, { councilApproved: true, approvedBy: "شورا", diagnosisWitness: true, currentTier: 4 as never, outcomePositive: true });
console.log("execute:", JSON.stringify(res));

const rb = e.rollback(p, "شورا");
console.log("rollback.from:", rb.from);
