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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Scale, Home, Flame, Snowflake, TrendingUp, Database, BarChart3,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
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

interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt: string | null;
  liveError: string | null;
}

/** برچسب وضعیت بازه بر اساس درصد درخواست */
function demandBadge(percent: number): { label: string; style: string } {
  if (percent >= 60) return { label: "تقاضای بالا", style: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" };
  if (percent >= 40) return { label: "متعادل", style: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
  if (percent > 0) return { label: "تقاضای پایین", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  return { label: "بدون درخواست", style: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" };
}

export function SupplyDemandPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<SdRow[] | null>(null);
  const [summary, setSummary] = useState<SdSummary | null>(null);
  const [source, setSource] = useState<DataSourceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const showCharts = settings.showCharts !== false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ rows: SdRow[]; total: number; summary: SdSummary; dataSource: DataSourceInfo }>("/api/crm/supply-demand");
      setRows(res.rows);
      setSummary(res.summary);
      setSource(res.dataSource);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت عرضه و تقاضا", description: e.message, variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

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
          <Card key={kpi.label} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${kpi.tone}`}>
                <kpi.icon className="w-5.5 h-5.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-extrabold tabular-nums">
                  {kpi.value === undefined ? (
                    <span className="inline-block h-6 w-14 animate-pulse rounded-md bg-accent align-middle" aria-hidden />
                  ) : (
                    kpi.value
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
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
                شاخص تعادل {faNumber(summary.avgRequestPercent)}٪ —{" "}
                {summary.avgRequestPercent >= 60
                  ? "بازار تقاضامحور است: اولویت با پاسخ سریع به درخواست‌هاست."
                  : summary.avgRequestPercent >= 40
                    ? "بازار نسبتاً متعادل است: قیمت‌گذاری دقیق اهرم رقابت است."
                    : "بازار عرضه‌محور است: بازنگری قیمت آگهی‌های ماندگار توصیه می‌شود."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* شفافیت منبع داده */}
      {source && !source.cached && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            گزارش واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.
            {source.liveError ? ` آخرین خطا: ${source.liveError}` : " پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."}
          </AlertDescription>
        </Alert>
      )}

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
              {rows.slice(0, 12).map((r) => (
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
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
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
            <div className="rounded-lg border max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>بازه</TableHead>
                    <TableHead>تعداد آگهی</TableHead>
                    <TableHead>درصد درخواست</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const badge = demandBadge(r.requestPercent);
                    return (
                      <TableRow key={r.id}>
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
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
