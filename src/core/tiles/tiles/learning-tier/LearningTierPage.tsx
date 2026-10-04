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
import { Brain, RefreshCw, ClipboardCheck, Clock, Layers } from "lucide-react";
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

const TIER_TARGETS = [30, 30, 25, 22, 20];
const TIER_MIN_OUTCOMES = [0, 10, 20, 50, 70];

export function LearningTierPage({ onBack }: TilePageProps) {
  const [cycle, setCycle] = useState<BrainStatusCoreCycle | null>(null);
  const [board, setBoard] = useState<BlackboardEntryView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [status, blackboard] = await Promise.all([
        api<{ ok: boolean; coreCycle: BrainStatusCoreCycle }>("/api/intelligence/status"),
        api<{ ok: boolean; entries: BlackboardEntryView[] }>("/api/intelligence/blackboard?limit=30"),
      ]);
      setCycle(status.coreCycle);
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
    <div className="space-y-4 p-4 md:p-6">
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
                  <p className="font-bold">≤ {faDigits(cycle.p7.brierTarget.toFixed(2))}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Brier فعال {cycle.p7.calibration?.applied ? "(کالیبره)" : ""}</p>
                  <p className="font-bold">{faDigits(cycle.p7.evaluation.metrics.brierScore.toFixed(4))}</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Lift</p>
                  <p className="font-bold">+{faDigits(cycle.p7.evaluation.metrics.lift.toFixed(1))}٪</p>
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
            <TabsList className="grid w-full max-w-xl grid-cols-3">
              <TabsTrigger value="checks" className="gap-1"><ClipboardCheck className="size-4" /> خودتشخیصی ({faDigits(checks.length)})</TabsTrigger>
              <TabsTrigger value="pending" className="gap-1"><Clock className="size-4" /> در انتظار شورا ({faDigits(cycle.p11.proposals.length)})</TabsTrigger>
              <TabsTrigger value="board" className="gap-1"><Layers className="size-4" /> تختهٔ سیاه</TabsTrigger>
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
          </Tabs>
        </>
      ) : null}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default LearningTierPage;
