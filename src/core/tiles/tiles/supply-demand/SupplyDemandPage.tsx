"use client";

/**
 * کاشی «عرضه و تقاضا» — صفحه داخلی (بر پایه گزارش واقعی سامانه ARM)
 * ------------------------------------------------------
 * عین «گزارش عرضه و تقاضا» خود سامانه ملک تبریز:
 *   • شاخص‌ها: شاخص تعادل بازار، مجموع آگهی‌ها، بازه‌های گرم/سرد
 *   • جدول عین خود سامانه: بازه × تعداد آگهی × درصد درخواست × وضعیت
 *   • نمودار مقایسه عرضه/تقاضا در بازه‌ها
 *   • شفافیت منبع داده
 */

import { useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RotateCcw, Scale, Home, Flame, Snowflake, TrendingUp, BarChart3 } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceAlert, useTileData, type DataSourceInfo } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { demandLevel, marketTilt, type DemandLevel, type MarketTilt } from "@/core/agent/analyzers";
import { faNumber, faPercent } from "@/lib/format";

interface SdRow {
  id: string;
  rangeTitle: string;
  propertyCount: number;
  requestPercent: number;
  status: string;
}

interface SdSummary {
  rangeCount: number;
  totalAds: number;
  avgRequestPercent: number;
  highDemandCount: number;
  lowDemandCount: number;
  topDemand: { rangeTitle: string; requestPercent: number; propertyCount: number } | null;
  topSupply: { rangeTitle: string; propertyCount: number; requestPercent: number } | null;
}

/** برچسب/رنگ وضعیت بازه — نگاشت نمایشی روی سطح دامنه‌ای (آستانه‌های ۶۰/۴۰: analyzers) */
const DEMAND_UI: Record<DemandLevel, { label: string; style: string }> = {
  HIGH: { label: "تقاضای بالا", style: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  BALANCED: { label: "متعادل", style: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  LOW: { label: "تقاضای پایین", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  NONE: { label: "بدون درخواست", style: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
};

function demandBadge(percent: number): { label: string; style: string } {
  return DEMAND_UI[demandLevel(percent)];
}

/** متن هدایت راهبردی بازار — نگاشت نمایشی روی جهت دامنه‌ای */
const MARKET_TILT_FA: Record<MarketTilt, string> = {
  DEMAND_LED: "بازار تقاضامحور است: اولویت با پاسخ سریع به درخواست‌هاست.",
  BALANCED: "بازار نسبتاً متعادل است: قیمت‌گذاری دقیق اهرم رقابت است.",
  SUPPLY_LED: "بازار عرضه‌محور است: بازنگری قیمت آگهی‌های ماندگار توصیه می‌شود.",
};

/** پاسخ کامل روت عرضه و تقاضا — شیء یگانه داده هوک */
interface SdData {
  rows: SdRow[];
  total: number;
  summary: SdSummary | null;
  dataSource: DataSourceInfo | null;
}

const EMPTY_DATA: SdData = { rows: [], total: 0, summary: null, dataSource: null };

export function SupplyDemandPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const showCharts = settings.showCharts !== false;

  const fetchSupplyDemand = useCallback(async (): Promise<SdData> => {
    const res = await api<{ rows: SdRow[]; total: number; summary: SdSummary; dataSource: DataSourceInfo }>("/api/crm/supply-demand");
    return { rows: res.rows, total: res.total, summary: res.summary, dataSource: res.dataSource };
  }, []);

  const { data, loading, reload } = useTileData(fetchSupplyDemand, {
    errorTitle: "خطا در دریافت عرضه و تقاضا",
    // عین رفتار قبلی: خطا → فقط rows خالی می‌شود؛ خلاصه/منبع قبلی می‌ماند
    errorValue: (prev) => (prev ? { ...prev, rows: [] } : { ...EMPTY_DATA }),
  });

  const rows = data?.rows ?? null;
  const summary = data?.summary ?? null;
  const source = data?.dataSource ?? null;

  const maxAds = useMemo(() => Math.max(1, ...(rows ?? []).map((r) => r.propertyCount)), [rows]);
  const maxPercent = useMemo(() => Math.max(10, ...(rows ?? []).map((r) => r.requestPercent)), [rows]);

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="supply-demand" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "شاخص تعادل بازار", value: summary ? `${faNumber(summary.avgRequestPercent)}٪` : undefined, icon: Scale, tone: "bg-primary/10 text-primary" },
          { label: "مجموع آگهی‌ها", value: summary?.totalAds, icon: Home, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "بازه‌های گرم", value: summary?.highDemandCount, icon: Flame, tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
          { label: "بازه‌های سرد", value: summary?.lowDemandCount, icon: Snowflake, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
          />
        ))}
      </div>

      {/* هدایت راهبردی بازار */}
      {summary?.topDemand && (
        <Card className="border-s-4 border-s-primary/70">
          <CardContent className="p-4 flex items-start gap-3">
            <TrendingUp className="w-6 h-6 text-primary mt-0.5 shrink-0" aria-hidden />
            <div className="space-y-1.5">
              <p className="text-sm font-extrabold">هدایت راهبردی بازار</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                گرم‌ترین بازه بازار «{summary.topDemand.rangeTitle}» با {faPercent(summary.topDemand.requestPercent)} درخواست است
                {summary.topSupply && summary.topSupply.rangeTitle !== summary.topDemand.rangeTitle
                  ? `؛ پرعرضه‌ترین بازه «${summary.topSupply.rangeTitle}» با ${faNumber(summary.topSupply.propertyCount)} آگهی است.`
                  : ` و ${faNumber(summary.topDemand.propertyCount)} آگهی در همین بازه فعال است.`}{" "}
                شاخص تعادل {faNumber(summary.avgRequestPercent)}٪ — {MARKET_TILT_FA[marketTilt(summary.avgRequestPercent)]}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* شفافیت منبع داده */}
      <DataSourceAlert
        show={Boolean(source && !source.cached)}
        error={source?.liveError}
        fallback="پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."
      >
        گزارش واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.
      </DataSourceAlert>

      {/* نمودار مقایسه عرضه/تقاضا */}
      {showCharts && rows && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" aria-hidden />
              مقایسه عرضه و فشار تقاضا در بازه‌ها
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3" role="img" aria-label="نمودار مقایسه عرضه و تقاضا در بازه‌های قیمتی">
              {/* P6.5-09 — بدون سقف: همهٔ بازه‌ها در یک صفحه */}
              {rows.map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold truncate max-w-[55%]">{r.rangeTitle}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {faNumber(r.propertyCount)} آگهی · {faPercent(r.requestPercent)} درخواست
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden flex" dir="rtl">
                    <div
                      className="h-full bg-primary/80"
                      style={{ width: `${Math.max(4, (r.propertyCount / maxAds) * 100)}%` }}
                      title={`عرضه: ${r.propertyCount} آگهی`}
                    />
                    <div
                      className="h-full bg-rose-500/70 border-s-2 border-s-background"
                      style={{ width: `${Math.max(2, (r.requestPercent / maxPercent) * 30)}%` }}
                      title={`فشار تقاضا: ${r.requestPercent}٪`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary/80" aria-hidden /> عرضه (تعداد آگهی)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-rose-500/70" aria-hidden /> فشار تقاضا (درصد درخواست)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* جدول عین خود سامانه */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" aria-hidden />
              گزارش عرضه و تقاضا — عین ستون‌های خود سامانه
            </span>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
              بازخوانی
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Scale className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
              <p className="text-sm text-muted-foreground">
                گزارش عرضه و تقاضا هنوز استخراج نشده است. پس از ورود با «کد پرسنلی + پیامک»، داده واقعی خودکار استخراج می‌شود.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead>بازه</TableHead>
                    <TableHead>تعداد آگهی</TableHead>
                    <TableHead>درصد درخواست</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
                  {(r, i) => {
                    const badge = demandBadge(r.requestPercent);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                            {faNumber(i + 1)}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold">{r.rangeTitle}</TableCell>
                        <TableCell className="tabular-nums">{faNumber(r.propertyCount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-rose-500/70"
                                style={{ width: `${Math.min(100, r.requestPercent)}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold tabular-nums">{faPercent(r.requestPercent)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${badge.style}`}>{badge.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBodyVirtual>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
