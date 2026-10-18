import { decide } from "../src/core/intelligence/decision-advisor";
import { sentenceCount } from "../src/core/intelligence/decision-templates";
const a = decide({
  contextId: "34826", contextKind: "property", contextLabel: "ملک ۳۴۸۲۶",
  attention: { score: 0.75, reason: "۱۲۰ بازدید و عکس دارد" },
  causal: { action: "hasImage+=1", delta: 0.293, n: 636 },
  counterfactual: [{ scenario: "کاهش ۵٪ قیمت", change: 0.009 }],
  simulation: { best: "کاهش ۱۰٪ قیمت", bestScore: 0.42 },
  memory: { accessCount: 8, lastAccessedAt: "2026-10-01T00:00:00.000Z" },
  vision: { pathCount: 4, topInsight: "۴ مسیر" },
  daysSinceLastContact: 10, nowIso: "2026-10-09T10:00:00.000Z",
});
console.log("NARRATIVE:", a.narrative);
console.log("SENTENCES:", sentenceCount(a.narrative));
console.log("ALTS:", a.alternatives.length);
