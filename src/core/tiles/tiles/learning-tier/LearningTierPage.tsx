"use client";

/**
 * کاشی M8 «مغز ملکا — یادگیری و Tier» — P6545/گام۲ BLOCK 2.4
 * ---------------------------------------------------------------------------
 * ۱) Tier فعلی با نوار پیشرفت + n نتیجهٔ باقی‌مانده تا Tier بعدی
 * ۲) روند Brier (خام و کالیبره‌شده — ترمیم مصوب جلسه ۰۳۳)
 * ۳) تصمیم‌ها/ترمیم‌های در انتظار تأیید شورا
 * ۴) رویدادهای بین‌کاشی — نمایشگر تختهٔ سیاه
 * ۵) خلاصهٔ ۲۵ بررسی خودتشخیصی
 * رنگ: فیروزه‌ای تیره #0D9488 (sec-m8)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, RefreshCw, ClipboardCheck, Clock, Layers, Gem, Radar, Workflow, GitCompareArrows, FlaskConical } from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { faDigits } from "@/lib/format";

interface BrainStatusCoreCycle {
  tier: number;
  tierBasis: { linkedOutcomes: number; distinctPeriods: number };
  p7: {
    outcomesCollected: number;
    coveragePercent: number;
    evaluation: { metrics: { brierScore: number; lift: number; ece: number }; verdict: string };
    calibration?: { applied: boolean; mapVersion: string | null; rawBrier: number; calibratedBrier: number; rawLift: number; calibratedLift: number };
    brierTarget: number;
  };
  p10: { systemHealth: string; overallScore: number; checks: Array<{ id: string; name: string; status: string; details: string }> };
  p11: { proposals: Array<{ id: string; sourceCheckId: string; severity: string; status: string; rationale: string }>; executedCount: number };
}
interface BlackboardEntryView { namespace: string; engineId: string; at: string; hash: string; payload: unknown }

/** PN-024 ثانیاً — فرا-ذهن (موتورهای ۱۲-۱۵) برای تب تازهٔ کاشی M6 */
interface MetaMindView {
  ranAt: string;
  engines: {
    attention: { alive: boolean; top: Array<{ itemId: string; total: number; reason: string }>; considered: number; budget: number; budgetLevel: string };
    causal: { alive: boolean; nodes: number; edges: number; sampleSize: number; dagVerified: boolean; refIntervention: { feature: string; delta: number; totalEffect: number; paths: number } | null };
    counterfactual: { alive: boolean; scenarios: Array<{ scenario: string; baseline: number; counterfactual: number; delta: number; confidence: number; reason: string }>; evidenceNote: string };
    simulation: { alive: boolean; comparison: { results: Array<{ action: { label: string }; simulatedProbability: number; delta: number; confidence: number; risks: string[]; autoExecute: false; reason: string }>; best: { action: { label: string }; delta: number } | null; recommendation: string } | null };
  };
  marketPressure: number;
  notes: string[];
}

const TIER_TARGETS = [30, 30, 25, 22, 20];
const TIER_MIN_OUTCOMES = [0, 10, 20, 50, 70];

export function LearningTierPage({ onBack }: TilePageProps) {
  const [cycle, setCycle] = useState<BrainStatusCoreCycle | null>(null);
  const [board, setBoard] = useState<BlackboardEntryView[]>([]);
  const [metaMind, setMetaMind] = useState<MetaMindView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [status, blackboard] = await Promise.all([
        api<{ ok: boolean; coreCycle: BrainStatusCoreCycle; metaMind?: MetaMindView }>("/api/intelligence/status"),
        api<{ ok: boolean; entries: BlackboardEntryView[] }>("/api/intelligence/blackboard?limit=30"),
      ]);
      setCycle(status.coreCycle);
      setMetaMind(status.metaMind ?? null);
      setBoard(blackboard.entries ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tier = cycle?.tier ?? 0;
  const outcomes = cycle?.tierBasis.linkedOutcomes ?? 0;
  const nextAt = tier < 4 ? TIER_MIN_OUTCOMES[tier + 1] : null;
  const tierProgress = nextAt ? Math.min(100, Math.round((outcomes / nextAt) * 100)) : 100;
  // صداقت Tier 4: نتیجهٔ کافی بدون ۳ دورهٔ متمایز ارتقا نمی‌دهد (نظام Tier)
  const periods = cycle?.tierBasis.distinctPeriods ?? 0;
  const tier4PeriodBlock = tier === 3 && nextAt !== null && outcomes >= nextAt && periods < 3;
  const checks = cycle?.p10.checks ?? [];
  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;

  return (
    <div data-negin="nili" className="space-y-4 p-4 md:p-6">
      {/* نگین (PN-024) — میلهٔ گوهر nili */}
      <div className="negin-bar" aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack ? <Button variant="outline" size="sm" onClick={onBack}>بازگشت</Button> : null}
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Brain className="size-5 text-sec-m8-500" /> مغز ملکا — یادگیری و Tier</h2>
            <p className="text-xs text-muted-foreground">Tier مستقل مدل‌ها · روند Brier · تصمیم‌های در انتظار شورا · تختهٔ سیاه · خودتشخیصی</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="size-4" /> بروزرسانی</Button>
      </div>

      {loading && !cycle ? <Skeleton className="h-96 w-full" /> : null}

      {cycle ? (
        <>
          {/* ۱) Tier */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Layers className="size-4 text-sec-m8-500" /> Tier فعلی: {faDigits(tier)} از ۴</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Progress value={tierProgress} className="h-2" />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{faDigits(outcomes)} نتیجهٔ واقعی پیوندشده</Badge>
                <Badge variant="outline">{faDigits(cycle.tierBasis.distinctPeriods)} دورهٔ متمایز</Badge>
                {tier4PeriodBlock
                  ? <span>نتیجه‌ها کافی است ({faDigits(outcomes)} ≥ {faDigits(nextAt)}) — مانع ارتقا به Tier ۴: دوره‌های متمایز ({faDigits(periods)} از ۳)</span>
                  : nextAt ? <span>تا Tier {faDigits(tier + 1)}: {faDigits(Math.max(0, nextAt - outcomes))} نتیجهٔ باقی‌مانده (سرحد: {faDigits(nextAt)})</span> : <span>Tier ۴ — کامل</span>}
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">هدف Brier این Tier (تصمیم ۳ جلسه ۰۳۳)</p>
                  <p className="font-bold">{cycle.p7.brierTarget != null ? `≤ ${faDigits(cycle.p7.brierTarget.toFixed(2))}` : "—"}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Brier فعال {cycle.p7.calibration?.applied ? "(کالیبره)" : ""}</p>
                  {/* حالت خالی صادقانه: بدون پیامد کافی، سنجه تهی است (INSUFFICIENT_DATA) */}
                  <p className="font-bold">{cycle.p7.evaluation.metrics.brierScore != null ? faDigits(cycle.p7.evaluation.metrics.brierScore.toFixed(4)) : "— دادهٔ کافی نیست"}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Lift</p>
                  <p className="font-bold">{cycle.p7.evaluation.metrics.lift != null ? `+${faDigits(cycle.p7.evaluation.metrics.lift.toFixed(1))}٪` : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ۲) کالیبراسیون مصوب */}
          {cycle.p7.calibration?.applied ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ترمیم مصوب جلسه ۰۳۳ — بازکالیبراسیون ({cycle.p7.calibration.mapVersion})</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded border p-2"><p className="text-muted-foreground">Brier پیش از کالیبراسیون</p><p className="font-bold">{faDigits(cycle.p7.calibration.rawBrier.toFixed(4))}</p></div>
                <div className="rounded border p-2"><p className="text-muted-foreground">Brier پس از کالیبراسیون</p><p className="font-bold text-emerald-600">{faDigits(cycle.p7.calibration.calibratedBrier.toFixed(4))}</p></div>
                <div className="rounded border p-2"><p className="text-muted-foreground">Lift خام</p><p className="font-bold">+{faDigits(cycle.p7.calibration.rawLift.toFixed(1))}٪</p></div>
                <div className="rounded border p-2"><p className="text-muted-foreground">Lift کالیبره</p><p className="font-bold text-emerald-600">+{faDigits(cycle.p7.calibration.calibratedLift.toFixed(1))}٪</p></div>
              </CardContent>
            </Card>
          ) : null}

          <Tabs defaultValue="checks">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
              <TabsTrigger value="checks" className="gap-1"><ClipboardCheck className="size-4" /> خودتشخیصی ({faDigits(checks.length)})</TabsTrigger>
              <TabsTrigger value="pending" className="gap-1"><Clock className="size-4" /> در انتظار شورا ({faDigits(cycle.p11.proposals.length)})</TabsTrigger>
              <TabsTrigger value="board" className="gap-1"><Layers className="size-4" /> تختهٔ سیاه</TabsTrigger>
              <TabsTrigger value="metamind" className="gap-1 text-negin-nili-700 dark:text-negin-nili-300"><Gem className="size-4" /> فرا-ذهن (۴ موتور)</TabsTrigger>
            </TabsList>

            {/* ۵) ۲۵ بررسی */}
            <TabsContent value="checks">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    ۲۵ بررسی خودتشخیصی — سلامت: {cycle.p10.systemHealth === "healthy" ? "سالم" : cycle.p10.systemHealth === "degraded" ? "کاهش‌یافته" : "بحرانی"} · نمره {faDigits(cycle.p10.overallScore)}/۱۰۰
                    <span className="mr-2 gap-1">
                      <Badge variant="outline" className="text-[10px] text-emerald-600">{faDigits(pass)} سبز</Badge>
                      <Badge variant="outline" className="text-[10px] text-amber-600">{faDigits(warn)} هشدار</Badge>
                      <Badge variant="outline" className="text-[10px] text-red-600">{faDigits(fail)} قرمز</Badge>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-auto">
                  <div className="space-y-1">
                    {checks.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                        <Badge className={c.status === "pass" ? "bg-emerald-600" : c.status === "warn" ? "bg-amber-500" : "bg-red-600"}>{c.status === "pass" ? "سبز" : c.status === "warn" ? "هشدار" : "قرمز"}</Badge>
                        <span className="w-24 shrink-0 text-muted-foreground" dir="ltr">{c.id}</span>
                        <span className="w-32 shrink-0 font-medium">{c.name}</span>
                        <span className="truncate text-muted-foreground">{c.details}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ۳) در انتظار شورا */}
            <TabsContent value="pending">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">تصمیم‌های در انتظار تأیید شورا — صفر اجرا (قفل ابدی)</CardTitle></CardHeader>
                <CardContent>
                  {cycle.p11.proposals.length === 0 ? <p className="text-xs text-muted-foreground">هیچ پیشنهاد ترمیمِ بازی در انتظار نیست.</p> : (
                    <div className="space-y-1">
                      {cycle.p11.proposals.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 rounded border p-2 text-xs">
                          <Badge variant={p.severity === "critical" || p.severity === "high" ? "destructive" : "outline"}>{p.severity}</Badge>
                          <div className="flex-1">
                            <p className="font-medium" dir="ltr">{p.sourceCheckId} — {p.id}</p>
                            <p className="text-muted-foreground">{p.rationale}</p>
                          </div>
                          <Badge variant="outline">{p.status === "pending" ? "در انتظار" : p.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">اجرا فقط پس از تأیید شورای عالی ملکا — auto_execute=false برای همیشه</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ۴) تختهٔ سیاه */}
            <TabsContent value="board">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">رویدادهای بین‌کاشی — تختهٔ سیاه (۳۰ رویداد اخیر)</CardTitle></CardHeader>
                <CardContent className="max-h-96 overflow-auto">
                  <div className="space-y-1">
                    {board.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border p-2 text-[11px]">
                        <Badge variant="outline">{e.namespace}</Badge>
                        <span className="text-muted-foreground" dir="ltr">{e.engineId}</span>
                        <span className="truncate" dir="ltr">{JSON.stringify(e.payload).slice(0, 90)}</span>
                        <span className="mr-auto shrink-0 text-muted-foreground" dir="ltr">{e.at.slice(0, 19).replace("T", " ")}</span>
                      </div>
                    ))}
                    {board.length === 0 ? <p className="text-xs text-muted-foreground">تخته خالی است.</p> : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ PN-024 ثانیاً — فرا-ذهن: موتورهای ۱۲ تا ۱۵ (خواستهٔ مالک جلسهٔ ۰۳۱) ═══ */}
            <TabsContent value="metamind">
              {metaMind ? (
                <div className="space-y-3" data-negin="nili">
                  {/* موتور ۱۲ — توجه */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Radar className="size-4 text-negin-nili-500" /> موتور ۱۲ — توجه: {faDigits(metaMind.engines.attention.top.length)} برتر روز با دلیل</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground mb-2">
                        از {faDigits(metaMind.engines.attention.considered)} آگهی تازه · بودجهٔ {metaMind.engines.attention.budgetLevel === "DAILY" ? "روزانه" : metaMind.engines.attention.budgetLevel} ({faDigits(metaMind.engines.attention.budget)} مورد) — چهار عامل: تازگی + اثر + تطابق + هزینه
                      </p>
                      <div className="max-h-80 overflow-auto space-y-1">
                        {metaMind.engines.attention.top.map((t, i) => (
                          <div key={t.itemId} className="flex items-start gap-2 rounded border p-2 text-xs">
                            <Badge variant="outline" className="shrink-0">{faDigits(i + 1)}</Badge>
                            <div className="flex-1">
                              <p><span className="font-bold" dir="ltr">{t.itemId}</span> — امتیاز <span className="font-bold text-negin-nili-700 dark:text-negin-nili-300">{faDigits(t.total)}</span></p>
                              <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{t.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* موتور ۱۳ — علّیت */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><Workflow className="size-4 text-negin-nili-500" /> موتور ۱۳ — علّیت: گراف DAG روی {faDigits(metaMind.engines.causal.sampleSize)} نمونهٔ واقعی</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {metaMind.engines.causal.alive ? (
                        <>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <div className="rounded border p-2 text-center"><p className="text-muted-foreground">گره</p><p className="font-bold">{faDigits(metaMind.engines.causal.nodes)}</p></div>
                            <div className="rounded border p-2 text-center"><p className="text-muted-foreground">یال علّی</p><p className="font-bold">{faDigits(metaMind.engines.causal.edges)}</p></div>
                            <div className="rounded border p-2 text-center"><p className="text-muted-foreground">نمونهٔ واقعی</p><p className="font-bold">{faDigits(metaMind.engines.causal.sampleSize)}</p></div>
                            <div className="rounded border p-2 text-center"><p className="text-muted-foreground">DAG</p><p className="font-bold">{metaMind.engines.causal.dagVerified ? "صفر چرخه ✓" : "—"}</p></div>
                          </div>
                          {metaMind.engines.causal.refIntervention && (
                            <div className="negin-glow rounded-lg border p-3">
                              <p className="font-bold">کشف کلیدی — «تصویر چند می‌ارزد؟»</p>
                              <p className="mt-1">
                                مداخلهٔ do({metaMind.engines.causal.refIntervention.feature} += ۱):
                                <span className="font-bold text-emerald-600"> +{faDigits(Math.round(metaMind.engines.causal.refIntervention.totalEffect * 1000) / 10)}٪ احتمال معامله</span>
                                <span className="text-muted-foreground"> — از {faDigits(metaMind.engines.causal.refIntervention.paths)} مسیر علّی در گراف (Pearl L2)</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-1">این پاسخ علمی است: قبلاً فقط همبستگی داشتیم؛ اکنون اثر مداخله را می‌دانیم.</p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground">گراف علّی هنوز ساخته نشده — پس از شاهد علّی نخست فعال می‌شود.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* موتور ۱۴ — پادواقع */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><GitCompareArrows className="size-4 text-negin-nili-500" /> موتور ۱۴ — پادواقع: «اگر … می‌شد چه؟» (Pearl L3)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {metaMind.engines.counterfactual.scenarios.length > 0 ? (
                        <>
                          {metaMind.engines.counterfactual.scenarios.map((s) => (
                            <div key={s.scenario} className="rounded border p-2.5">
                              <p className="font-medium">{s.scenario}</p>
                              <p className="mt-1">
                                {faDigits(Math.round(s.baseline * 1000) / 10)}٪ → <span className="font-bold">{faDigits(Math.round(s.counterfactual * 1000) / 10)}٪</span>
                                <span className={s.delta >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}> (Δ {s.delta >= 0 ? "+" : ""}{faDigits(Math.round(s.delta * 1000) / 10)}٪)</span>
                                <span className="text-muted-foreground"> · اطمینان {faDigits(s.confidence)} · روش {s.reason.includes("L3") ? "Pearl L3" : "—"}</span>
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">{s.reason}</p>
                            </div>
                          ))}
                          <p className="text-[10px] text-muted-foreground">شاهد: {metaMind.engines.counterfactual.evidenceNote} — نویز فردی بین دنیای واقعی و خیالی ثابت می‌ماند (تمایز L3 از L2)</p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">شاهد معیار کافی نیست — پس از غنی‌سازی معاملات فعال می‌شود.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* موتور ۱۵ — شبیه‌سازی */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="size-4 text-negin-nili-500" /> موتور ۱۵ — شبیه‌سازی: آزمون تصمیم پیش از اجرا</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {metaMind.engines.simulation.comparison ? (
                        <>
                          <div className="space-y-1">
                            {metaMind.engines.simulation.comparison!.results.map((r) => (
                              <div key={r.action.label} className="rounded border p-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{r.action.label}</span>
                                  <span className={r.delta > 0 ? "font-bold text-emerald-600" : r.delta < 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                    Δ {r.delta >= 0 ? "+" : ""}{faDigits(Math.round(r.delta * 1000) / 10)}٪ → احتمال {faDigits(Math.round(r.simulatedProbability * 1000) / 10)}٪
                                  </span>
                                </div>
                                {r.risks.length > 0 && (
                                  <p className="text-[10px] text-muted-foreground mt-1">ریسک: {r.risks.join(" · ")}</p>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="rounded bg-muted/50 p-2.5">
                            <p className="font-medium">{metaMind.engines.simulation.comparison!.recommendation}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">فشار بازار: {faDigits(metaMind.marketPressure)} (عرضه/تقاضا — تعدیل‌کنندهٔ Δ) · قفل ابدی: شبیه‌سازی فقط پیشنهاد، اجرا با تأیید مالک/شوراست (auto_execute=false)</p>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground">در انتظار گراف و شاهد معیار.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">فرا-ذهن در این نسخه در دسترس نیست.</CardContent></Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default LearningTierPage;
