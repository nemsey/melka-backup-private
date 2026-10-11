/**
 * موتور ۱۶ — مشاور تصمیم (PN-025 / فاز ۱۳-ج / ستون ۳)
 * ---------------------------------------------------------------------------
 * از پانزده موتور می‌خواند، سناریو می‌سازد و یک توصیهٔ فارسی ساده می‌دهد:
 * توصیه + دلیل + ریسک + بدیل‌ها (≥۳) — با قید مطلق:
 *   · صفر LLM (روایت فقط قالب فارسی + متغیرهای واقعی)
 *   · صفر auto_execute (قفل نوع TypeScript — قانون ۱۱ ابدی)
 *
 * خلوص لایهٔ هوش: هیچ وابستگی به DB و هیچ فراخوانی شبکه‌ای (گارد audit-intelligence-boundary).
 * گردآوری شواهد در سرویس: src/lib/services/decision-advisor-service.ts
 */

import { narrate, type TemplateId } from "./decision-templates";
import type { NeverExecute } from "./decision-lock";

// ═══════════════ قرارداد خروجی (عین سفارش — ستون ۳) ═══════════════

export interface DecisionAlternative {
  action: AdvisorActionKind;
  label: string;         // فارسی — عنوان بدیل
  score: number;         // 0..1
  rationale: string;     // فارسی — یک جمله
}

export type AdvisorActionKind = "CALL_BUYER" | "CALL_OWNER" | "ADD_IMAGE" | "PRICE_CUT" | "REPOST" | "MATCH_INFORM" | "FOLLOWUP" | "WAIT";

export interface DecisionAdvice extends NeverExecute {
  decisionId: string;
  recommendation: string;   // «تماس بگیر» — فعل مشخص
  narrative: string;        // فارسی، ۳-۵ جمله
  confidence: number;      // 0..1
  basedOn: {
    attention?: string;      // شاهد موتور ۱۲
    causal?: string;         // شاهد موتور ۱۳
    counterfactual?: string;  // شاهد موتور ۱۴
    simulation?: string;      // شاهد موتور ۱۵
    memory?: string;          // شاهد حافظه (ستون ۱)
    vision?: string;          // شاهد بینایی (ستون ۲)
  };
  alternatives: DecisionAlternative[];  // ≥۳ — همیشه
  risk: "low" | "medium" | "high";
  expiresAt: string;        // TTL — کمربند
  requiresApproval: true;   // قید لفظی
  autoExecute: false;       // قید لفظی — قانون ۱۱ ابدی
}

/** ورودی مشاور — شواهد گردآوری‌شدهٔ سرویس (صفر DB در این لایه) */
export interface AdvisorEvidence {
  /** شناسهٔ بستر — کد ملک / نام شخص / … */
  contextId: string;
  contextKind: "property" | "request" | "person" | "market";
  /** نام نمایشی بستر برای روایت (مثلاً «خریدار احمدی») */
  contextLabel: string;
  /** موتور ۱۲ — نمرهٔ توجه بستر (null = خاموش/ناموجود) */
  attention?: { score: number; reason: string } | null;
  /** موتور ۱۳ — آخرین مداخلهٔ معتبر (null = گراف خالی) */
  causal?: { action: string; delta: number; n: number } | null;
  /** موتور ۱۴ — سناریوهای پادواقع مرتبط */
  counterfactual?: Array<{ scenario: string; change: number }> | null;
  /** موتور ۱۵ — بهترین اقدام از مقایسهٔ استاندارد */
  simulation?: { best: string; bestScore: number } | null;
  /** حافظه — سابقهٔ بستر */
  memory?: { accessCount: number; lastAccessedAt: string } | null;
  /** بینایی — مسیرهای ارتباطی (پرسش طرف‌به‌طرف) */
  vision?: { pathCount: number; topInsight: string } | null;
  /** بازار — جهت شاخص منطقهٔ بستر (M7) */
  market?: { area: string; horizonDays: number; trendPercent: number } | null;
  /** پیام روزها از آخرین تماس (برای FOLLOWUP) */
  daysSinceLastContact?: number | null;
  /** زمان مرجع (تزریق برای تست‌پذیری) */
  nowIso?: string;
}

/** وزن‌های امتیاز ترکیبی — fail-loud (جمع = ۱) */
export const ADVISOR_WEIGHTS = { attention: 0.3, causal: 0.3, counterfactual: 0.2, simulation: 0.2 } as const;
const weightSum = ADVISOR_WEIGHTS.attention + ADVISOR_WEIGHTS.causal + ADVISOR_WEIGHTS.counterfactual + ADVISOR_WEIGHTS.simulation;
if (Math.abs(weightSum - 1) > 1e-9) throw new Error(`[decision-advisor] وزن‌ها باید جمعاً ۱ باشند — الان ${weightSum}`);

// ═══════════════ سناریوسازی — امتیاز هر اقدام ═══════════════

/** نرمال‌سازی دلتا به [0,1] — دلتاها برحسب واحد احتمال (۰..۱) هستند */
function normDelta(delta: number): number {
  return Math.min(1, Math.max(0, delta));
}

/** نمرجهٔ توجه به [0,1] */
function normAttention(score: number): number {
  return Math.min(1, Math.max(0, score));
}

export interface ActionCandidate {
  kind: AdvisorActionKind;
  label: string;
  score: number;
  rationale: string;
}

/**
 * ساخت فهرست اقدامات مرتبط با شواهد و امتیازدهی ترکیبی (فصل ۵.۲ سند طراحی).
 * خالص: هر بار با همان شواهد، همان خروجی (تست قطعیت).
 */
export function buildActionCandidates(ev: AdvisorEvidence): ActionCandidate[] {
  const cands: ActionCandidate[] = [];

  // تماس/پیگیری — عمدتاً برای بستر شخص/درخواست
  if (ev.contextKind === "person" || ev.contextKind === "request") {
    const att = ev.attention ? normAttention(ev.attention.score) : 0.5;
    const memBoost = ev.memory ? Math.min(1, ev.memory.accessCount / 20) : 0;
    const followDue = ev.daysSinceLastContact !== null && ev.daysSinceLastContact !== undefined && ev.daysSinceLastContact >= 7 ? 0.25 : 0;
    cands.push({
      kind: "CALL_BUYER",
      label: "تماس با متقاضی",
      score: Math.min(1, 0.45 * att + 0.25 * memBoost + followDue),
      rationale: ev.attention?.reason ?? "نمرهٔ توجه متوسط",
    });
    if (followDue > 0) {
      cands.push({
        kind: "FOLLOWUP",
        label: "پیگیری سررسیده",
        score: Math.min(1, 0.5 + followDue),
        rationale: `آخرین تماس ${ev.daysSinceLastContact} روز پیش بود`,
      });
    }
  }

  // تصویر — اثر علّی do(hasImage+=1) روی ملک بدون عکس (از شاهد causal)
  if (ev.causal && ev.causal.action.toLowerCase().includes("hasimage")) {
    cands.push({
      kind: "ADD_IMAGE",
      label: "افزودن نخستین عکس",
      score: normDelta(ev.causal.delta),
      rationale: `اثر علّی بر احتمال معامله: +${Math.round(ev.causal.delta * 1000) / 10} واحد درصدی`,
    });
  }

  // کاهش قیمت — بهترین سناریوی پادواقع معتبر
  const bestCf = (ev.counterfactual ?? []).slice().sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (bestCf && bestCf.change > 0) {
    cands.push({
      kind: "PRICE_CUT",
      label: "کاهش قیمت (سناریوی پادواقع)",
      score: normDelta(bestCf.change),
      rationale: bestCf.scenario,
    });
  }

  // بازنشر — از شبیه‌سازی
  if (ev.simulation && /بازنشر|repost/i.test(ev.simulation.best)) {
    cands.push({
      kind: "REPOST",
      label: "بازنشر آگهی",
      score: normDelta(ev.simulation.bestScore),
      rationale: `بهترین اقدام در مقایسهٔ شبیه‌سازی — ${ev.simulation.best}`,
    });
  }

  // تطبیق — مسیرهای بینایی
  if (ev.vision && ev.vision.pathCount > 0) {
    cands.push({
      kind: "MATCH_INFORM",
      label: "پیشنهاد تطبیق",
      score: Math.min(1, ev.vision.pathCount / 5),
      rationale: ev.vision.topInsight,
    });
  }

  // تماس مالک — برای بستر ملک با توجه بالا
  if (ev.contextKind === "property" && ev.attention && ev.attention.score >= 0.5) {
    cands.push({
      kind: "CALL_OWNER",
      label: "تماس با مالک",
      score: normAttention(ev.attention.score),
      rationale: ev.attention.reason,
    });
  }

  // همیشه: صبر (بدیل بی‌خطر پایه — تضمین ≥۳ بدیل)
  cands.push({ kind: "WAIT", label: "فعلاً صبر — بدون اقدام", score: 0.2, rationale: "وضعیت پایدار است؛ اقدام فوری ضرورت ندارد" });

  // مرتب‌سازی نزولی و کلمپ
  return cands.map((c) => ({ ...c, score: Math.round(c.score * 1e4) / 1e4 })).sort((a, b) => b.score - a.score);
}

// ═══════════════ سطح ریسک (فصل ۵.۳ سند طراحی) ═══════════════

export function assessRisk(top: ActionCandidate, ev: AdvisorEvidence): "low" | "medium" | "high" {
  if (top.score < 0.4) return "high";
  const evidenceMissing = !ev.attention || !ev.causal;
  if (evidenceMissing) return "high";
  if (top.kind === "PRICE_CUT") return "high"; // حساس مالی
  if (top.score < 0.7) return "medium";
  return "low";
}

// ═══════════════ روایت ۳-۵ جمله‌ای (صفر LLM — قالب + متغیر) ═══════════════

const RECOMMENDATION_FA: Readonly<Record<AdvisorActionKind, string>> = {
  CALL_BUYER: "به متقاضی زنگ بزن",
  CALL_OWNER: "با مالک تماس بگیر",
  ADD_IMAGE: "برای آگهی نخستین عکس را بگذار",
  PRICE_CUT: "قیمت را کاهش بده",
  REPOST: "آگهی را بازنشر کن",
  MATCH_INFORM: "این تطبیق را به طرف مقابل پیشنهاد بده",
  FOLLOWUP: "پیگیری را انجام بده",
  WAIT: "فعلاً صبر کن",
};

function templateFor(kind: AdvisorActionKind): TemplateId {
  switch (kind) {
    case "CALL_BUYER": return "T_CALL_BUYER";
    case "CALL_OWNER": return "T_CALL_OWNER";
    case "ADD_IMAGE": return "T_ADD_IMAGE";
    case "PRICE_CUT": return "T_PRICE_CUT";
    case "REPOST": return "T_REPOST";
    case "MATCH_INFORM": return "T_MATCH_INFORM";
    case "FOLLOWUP": return "T_FOLLOWUP";
    default: return "E_DATA_MISSING";
  }
}

function pct(n: number): string {
  return String(Math.round(n * 100)).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** ارقام لاتین → فارسی در هر رشته (قاعدهٔ زبانی فصل ۶.۴ — همهٔ اعداد فارسی) */
function faDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** روایت کامل — ۳ تا ۵ جمله از قالب‌های ثابت (فصل ۶ کتابخانهٔ ۲۴تایی) */
export function buildNarrative(top: ActionCandidate, ev: AdvisorEvidence, alternatives: readonly DecisionAlternative[]): string {
  const sentences: string[] = [];

  // ۱) جملهٔ اصلی — قالب توصیه
  const mainTemplate = templateFor(top.kind);
  const baseVars: Record<string, string | number> = {
    buyerName: ev.contextLabel,
    propertyCode: faDigits(ev.contextId),
    reason: faDigits(top.rationale),
    probability: pct(top.score),
    delta: pct(ev.causal?.delta ?? 0),
    percent: 5,
    scenario: (ev.counterfactual ?? [])[0]?.scenario ?? "—",
    pathCount: faDigits(String(ev.vision?.pathCount ?? 0)),
    daysAgo: faDigits(String(ev.daysSinceLastContact ?? 0)),
  };
  if (mainTemplate === "E_DATA_MISSING") {
    sentences.push("شاهد کافی نیست — توصیه با اطمینان پایین ارائه می‌شود.");
  } else {
    sentences.push(narrate(mainTemplate, baseVars));
  }

  // ۲) جملهٔ شاهد علّی (اگر هست)
  if (ev.causal) {
    sentences.push(narrate("E_CAUSAL_DO", { action: faDigits(ev.causal.action), delta: pct(ev.causal.delta), n: faDigits(String(ev.causal.n)) }));
  }

  // ۳) جملهٔ حافظه (اگر هست)
  if (ev.memory && ev.memory.accessCount > 0) {
    sentences.push(narrate("E_MEMORY_SEEN", { count: faDigits(String(ev.memory.accessCount)), lastAt: faDigits(ev.memory.lastAccessedAt.slice(0, 10)) }));
  }

  // ۴) جملهٔ بدیل‌ها
  if (alternatives.length > 0) {
    sentences.push(`بدیل‌ها: ${alternatives.slice(0, 3).map((a) => a.label).join(" · ")}.`);
  }

  // ۵) جملهٔ احترام (قانون کمربند — همیشه پایانی)
  sentences.push("این توصیه نیازمند تأیید شماست — سامانه هرگز خودش اجرا نمی‌کند.");

  // قاعدهٔ ۳-۵ جمله — هر جمله نقطهٔ پایانی دارد؛ قطر سرریز (هرگز بیش از ۵)
  return sentences
    .slice(0, 5)
    .map((s) => (/[.!?؟]$/.test(s.trim()) ? s : `${s.trim()}.`))
    .join(" ");
}

// ═══════════════ موتور ۱۶ — نقطهٔ ورود ═══════════════

/**
 * ساخت مشوره از شواهد — خالص و قطعی.
 * شواهد را سرویس گردآوری می‌کند (موتورها + حافظه + بینایی)؛ اینجا فقط داوری.
 */
export function decide(ev: AdvisorEvidence): DecisionAdvice {
  const candidates = buildActionCandidates(ev);
  const top = candidates[0] ?? { kind: "WAIT" as const, label: "صبر", score: 0.2, rationale: "شواهد کافی نیست" };
  const alternatives: DecisionAlternative[] = candidates.slice(1, 4).map((c) => ({
    action: c.kind,
    label: c.label,
    score: c.score,
    rationale: c.rationale,
  }));
  // تضمین ≥۳ بدیل — با پاشooterهای خنثی پر می‌شود (صبر/بازبینی)
  while (alternatives.length < 3) {
    alternatives.push({ action: "WAIT", label: "صبر و بازبینی دوره‌ای", score: 0.1, rationale: "تا تغییر معنادار داده، اقدامی لازم نیست" });
  }

  const risk = assessRisk(top, ev);
  const narrative = buildNarrative(top, ev, alternatives);
  const now = ev.nowIso ?? new Date().toISOString();
  const expiresAt = new Date(new Date(now).getTime() + 7 * 24 * 3600 * 1000).toISOString();
  const decisionId = `adv-${now.slice(0, 16)}-${ev.contextId.replace(/\s+/g, "").slice(0, 24)}-${top.kind}`;

  // شواهد به‌کاررفته — فقط کلیدهای معتبر و موجود
  const basedOn: DecisionAdvice["basedOn"] = {};
  if (ev.attention) basedOn.attention = ev.attention.reason;
  if (ev.causal) basedOn.causal = `do(${ev.causal.action}) = +${pct(ev.causal.delta)} واحد درصدی (n=${faDigits(String(ev.causal.n))})`;
  const bestCf = (ev.counterfactual ?? [])[0];
  if (bestCf) basedOn.counterfactual = bestCf.scenario;
  if (ev.simulation) basedOn.simulation = `بهترین اقدام شبیه‌سازی: ${ev.simulation.best}`;
  if (ev.memory) basedOn.memory = `${faDigits(String(ev.memory.accessCount))} بار دیده شده (آخرین: ${faDigits(ev.memory.lastAccessedAt.slice(0, 10))})`;
  if (ev.vision) basedOn.vision = ev.vision.topInsight;

  return {
    decisionId,
    recommendation: RECOMMENDATION_FA[top.kind],
    narrative,
    confidence: top.score,
    basedOn,
    alternatives,
    risk,
    expiresAt,
    requiresApproval: true,   // قید لفظی
    autoExecute: false,       // قید لفظی — قانون ۱۱ ابدی
  };
}
