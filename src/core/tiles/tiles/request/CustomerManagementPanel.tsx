"use client";

/**
 * پنل «مدیریت مشتریان» — شاهکار ایجنت کاشی درخواست ملک
 * ------------------------------------------------------
 * پروفایل ۳۶۰ درجه هر مشتری: درخواست‌ها + رویدادها + آگهی‌های مالک + معامله‌ها
 * امتیاز سلامت (۵ مؤلفه) + چرخه عمر + بخش A/B/C + اقدام بعدی هوشمند + تطبیق درخواست↔آگهی
 */

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HeartPulse, Users, Flame, TrendingUp, Trophy, PhoneCall, Home, Link2, Sparkles, ChevronDown, ChevronLeft,
} from "lucide-react";
import { faNumber } from "@/lib/format";
import type { CustomerProfile, CustomerManagementSummary, LifecycleStage } from "@/lib/request/customer-mgmt";
import { LIFECYCLE_FA, LIFECYCLE_COLOR } from "@/lib/request/customer-mgmt";

export function CustomerManagementPanel({
  summary,
  loading,
  onSelectRequest,
}: {
  summary: CustomerManagementSummary | null;
  loading: boolean;
  onSelectRequest?: (requestId: string) => void;
}) {
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "ALL">("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = summary?.stats;
  const customers = useMemo(() => {
    if (!summary) return [];
    if (stageFilter === "ALL") return summary.customers;
    return summary.customers.filter((c) => c.stage === stageFilter);
  }, [summary, stageFilter]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIهای مدیریت مشتریان */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "کل مشتریان", value: stats?.totalCustomers ?? 0, icon: Users, cls: "from-teal-600 to-cyan-500" },
          { label: "مشتریان فعال", value: stats?.activeCustomers ?? 0, icon: Flame, cls: "from-teal-600 to-cyan-500" },
          { label: "میانگین سلامت", value: `${faNumber(stats?.avgHealth ?? 0)}٪`, icon: HeartPulse, cls: "from-rose-600 to-rose-400" },
          { label: "قهرمانان A", value: stats?.segmentA ?? 0, icon: Trophy, cls: "from-amber-600 to-amber-400" },
          { label: "تطبیق‌های قوی", value: stats?.strongMatches ?? 0, icon: Link2, cls: "from-teal-700 to-cyan-500" },
          { label: "بی‌تماس +۱۴ روز", value: stats?.overdueContacts ?? 0, icon: PhoneCall, cls: "from-rose-700 to-rose-500" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="border-border/60">
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.cls} flex items-center justify-center shadow shrink-0`}>
                  <Icon className="w-4.5 h-4.5 text-white" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground leading-3 truncate">{kpi.label}</p>
                  <p className="text-lg font-extrabold leading-6">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* فیلتر چرخه عمر — عین کاشی‌های مدیریتی */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={stageFilter === "ALL" ? "default" : "outline"} onClick={() => setStageFilter("ALL")}>
          همه ({faNumber(stats?.totalCustomers ?? 0)})
        </Button>
        {(Object.keys(LIFECYCLE_FA) as LifecycleStage[]).map((st) => {
          const count = stats?.stageCounts[st] ?? 0;
          return (
            <Button
              key={st}
              size="sm"
              variant={stageFilter === st ? "default" : "outline"}
              onClick={() => setStageFilter(st)}
              className="gap-1"
              disabled={count === 0}
            >
              {LIFECYCLE_FA[st]} ({faNumber(count)})
            </Button>
          );
        })}
      </div>

      {/* کارت‌های مشتری ۳۶۰ درجه */}
      {customers.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground leading-relaxed">
            هنوز مشتری‌ای از درخواست‌ها ساخته نشده — با «ثبت دستی» یا «ثبت اتوماتیک» درخواست ثبت کنید تا ایجنت مدیریت مشتریان پروفایل ۳۶۰ درجه بسازد.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {customers.map((c, i) => (
            <CustomerCard
              key={c.mobile}
              customer={c}
              index={i}
              expanded={expanded === c.mobile}
              onToggle={() => setExpanded((e) => (e === c.mobile ? null : c.mobile))}
              onSelectRequest={onSelectRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== کارت مشتری ۳۶۰ درجه =====================

function CustomerCard({
  customer: c,
  index,
  expanded,
  onToggle,
  onSelectRequest,
}: {
  customer: CustomerProfile;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onSelectRequest?: (requestId: string) => void;
}) {
  return (
    <Card className="tile-pop shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* سربرگ: نام + موبایل + مرحله + بخش */}
        <div className="flex items-start gap-2.5">
          <span
            className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-teal-600/10 border border-teal-600/25 text-[10px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums shrink-0"
            aria-label={`مشتری ${faNumber(index + 1)}`}
          >
            {faNumber(index + 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="font-bold text-sm">{c.name}</h4>
              <Badge variant="outline" className="text-[9px]" dir="ltr">{c.mobile}</Badge>
              <span className={`text-[9px] rounded-full border px-2 py-0.5 ${LIFECYCLE_COLOR[c.stage]}`}>{LIFECYCLE_FA[c.stage]}</span>
              <Badge className={`text-[9px] ${c.segment === "A" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : c.segment === "B" ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" : "bg-muted text-muted-foreground"}`}>
                بخش {c.segment}
              </Badge>
              {c.convertedDeals > 0 && <Badge className="text-[9px] gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"><Trophy className="w-2.5 h-2.5" aria-hidden /> معامله‌شده</Badge>}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-4">
              {faNumber(c.requestCount)} درخواست · {faNumber(c.eventCount)} رویداد
              {c.ownedListings.length > 0 && ` · ${faNumber(c.ownedListings.length)} آگهی به‌عنوان مالک`}
              {c.daysSinceInteraction != null && ` · آخرین تعامل ${faNumber(c.daysSinceInteraction)} روز پیش`}
            </p>
          </div>
        </div>

        {/* امتیاز سلامت با تفکیک */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1 font-bold text-foreground">
              <HeartPulse className="w-3 h-3 text-rose-600" aria-hidden /> امتیاز سلامت مشتری
            </span>
            <span className="tabular-nums">{faNumber(c.healthScore)} از ۱۰۰</span>
          </div>
          <Progress
            value={c.healthScore}
            indicatorClassName={c.healthScore >= 70 ? "bg-gradient-to-l from-teal-600 to-cyan-500" : c.healthScore >= 40 ? "bg-gradient-to-l from-amber-600 to-amber-400" : "bg-gradient-to-l from-rose-600 to-rose-400"}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
            {c.healthBreakdown.map((b) => (
              <span key={b.label} title={`${b.label}: ${b.got} از ${b.max}`}>{b.label} {faNumber(b.got)}/{faNumber(b.max)}</span>
            ))}
          </div>
        </div>

        {/* اقدام بعدی (Next Best Action) — شاهکار */}
        {c.nextActions.length > 0 && (
          <div className="space-y-1.5">
            {c.nextActions.map((a) => (
              <div
                key={a.kind + a.title.slice(0, 20)}
                className={`rounded-lg border p-2.5 text-[10px] leading-4 flex items-start gap-2 ${a.priority === 1 ? "border-rose-300 bg-rose-50/70 dark:bg-rose-950/40" : a.priority === 2 ? "border-amber-300 bg-amber-50/70 dark:bg-amber-950/40" : "border-border bg-muted/40"}`}
              >
                <Sparkles className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.priority === 1 ? "text-rose-600" : a.priority === 2 ? "text-amber-600" : "text-teal-600"}`} aria-hidden />
                <div className="min-w-0">
                  <p className="font-bold text-[11px]">{a.title}</p>
                  <p className="text-muted-foreground mt-0.5">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* تطبیق‌های برتر (شاهکار) */}
        {c.bestMatches.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold flex items-center gap-1">
              <Link2 className="w-3 h-3 text-teal-600" aria-hidden /> تطبیق درخواست با آگهی‌های دفتر
            </p>
            <div className="space-y-1">
              {c.bestMatches.slice(0, 2).map((m) => (
                <div key={m.requestId + m.listingId} className="rounded-lg border px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-2">
                  <span className="truncate min-w-0">
                    <TrendingUp className="w-3 h-3 inline me-1 text-teal-600" aria-hidden />
                    {m.listingTitle}
                  </span>
                  <Badge className={`text-[9px] shrink-0 ${m.band === "عالی" ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" : m.band === "خوب" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-muted"}`}>
                    {faNumber(m.score)}٪ {m.band}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* جزئیات کامل — بازشونده */}
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-[10px] text-muted-foreground" onClick={onToggle} aria-expanded={expanded}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" aria-hidden /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden />}
          {expanded ? "بستن جزئیات" : "جزئیات کامل مشتری (درخواست‌ها و آگهی‌ها)"}
        </Button>

        {expanded && (
          <div className="space-y-3 border-t pt-3">
            {/* درخواست‌های مشتری */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold">درخواست‌ها ({faNumber(c.requests.length)})</p>
              {c.requests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectRequest?.(r.id)}
                  className="w-full text-right rounded-lg border bg-muted/30 px-2.5 py-2 text-[10px] leading-4 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">{r.title}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {r.armRegistered && <Badge className="text-[8px] bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">آرم</Badge>}
                      {r.topMatchScore != null && <Badge variant="outline" className="text-[8px]">تطبیق {faNumber(r.topMatchScore)}٪</Badge>}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {faNumber(r.completeness.completeCount)} گام از ۴ · جدیت {r.seriousnessName} · پرداخت {r.paymentMethodName} · {faNumber(r.eventCount)} رویداد
                  </p>
                </button>
              ))}
            </div>

            {/* آگهی‌های مالک (سمت فروش ۳۶۰ درجه) */}
            {c.ownedListings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold flex items-center gap-1"><Home className="w-3 h-3" aria-hidden /> آگهی‌های این مشتری به‌عنوان مالک ({faNumber(c.ownedListings.length)})</p>
                {c.ownedListings.map((l) => (
                  <div key={l.id} className="rounded-lg border bg-muted/30 px-2.5 py-1.5 text-[10px] flex items-center justify-between gap-2">
                    <span className="truncate">{l.title}</span>
                    {l.price && <span className="shrink-0 tabular-nums">{l.price}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* تفکیک کامل تطبیق برتر */}
            {c.bestMatches[0] && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold">تفکیک امتیاز بهترین تطبیق ({faNumber(c.bestMatches[0].score)}٪)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {c.bestMatches[0].breakdown.map((b) => (
                    <div key={b.label} className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[10px] flex items-center justify-between">
                      <span>{b.label}</span>
                      <span className="tabular-nums">{faNumber(b.got)}/{faNumber(b.max)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
