"use client";

/**
 * کاشی «بازدیدها و پیگیری‌ها» — صفحه داخلی (بر پایه ساختار واقعی سامانه ARM)
 * ------------------------------------------------------
 * عین «بازدیدها و نظرات» خود سامانه ملک تبریز:
 *   • شاخص‌ها: کل بازدیدها، بررسی‌شده، در انتظار بررسی، مشتری متمایز
 *   • فیلترها: کد آگهی، درخواست‌دهنده، بررسی‌کننده، وضعیت، بازه تاریخ (هجری شمسی)
 *   • جدول: کد آگهی، درخواست‌دهنده، بررسی‌کننده، مشاور آگهی،
 *     زمان ثبت/بررسی (هجری شمسی)، وضعیت
 *   • نمودار: روند ماهانه ثبت بازدید (ماه‌های هجری شمسی)
 *   • شفافیت منبع داده
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Filter, RotateCcw, Eye, CheckCircle2, Clock, Users, Hash, CalendarRange, Home, UserCheck, Database, AlertTriangle,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faJalaliShortDateTime, faMonthLabel } from "@/lib/format";
import { faDigits, dateToJalali } from "@/lib/jalali";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface ViRow {
  id: string;
  propertyCode: string;
  requesterName: string;
  checkerName: string;
  propertyRealtorName: string;
  checkTime: string | null;
  createdAt: string;
  status: string;
}

interface Summary {
  totalCount: number;
  checkedCount: number;
  distinctPropertyCodes: number;
  distinctRequesters: number;
}

interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt: string | null;
  liveError: string | null;
}

const EMPTY = { propertyCode: "", requester: "", checker: "", status: "", dateFrom: "", dateTo: "" };
type Filters = typeof EMPTY;

/** سری ماهانه از ردیف‌ها (کلید ماه جلالی) — سمت کلاینت برای نمودار */
function monthlyKeys(rows: ViRow[]): { key: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const iso = new Date(r.createdAt);
    if (Number.isNaN(iso.getTime())) continue;
    // کلید ماه جلالی «yyyy-mm» با ارقام لاتین (قابل تحلیل در faMonthLabel)
    const j = dateToJalali(iso);
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-9)
    .map(([key, count]) => ({ key, label: faMonthLabel(key), count }));
}

export function VisitsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<ViRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [source, setSource] = useState<DataSourceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const showCharts = settings.showCharts !== false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.propertyCode) params.set("propertyCode", applied.propertyCode.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
      if (applied.requester) params.set("requester", applied.requester);
      if (applied.checker) params.set("checker", applied.checker);
      if (applied.status) params.set("status", applied.status);
      if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) params.set("dateTo", applied.dateTo);
      params.set("limit", "1000");

      const res = await api<{ rows: ViRow[]; total: number; summary: Summary; dataSource: DataSourceInfo }>(
        `/api/crm/visits?${params.toString()}`
      );
      setRows(res.rows);
      setSummary(res.summary);
      setSource(res.dataSource);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت بازدیدها", description: e.message, variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => (rows ? monthlyKeys(rows) : []), [rows]);
  const maxCount = Math.max(1, ...chartData.map((c) => c.count));

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="visits" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "کل بازدیدها", value: summary?.totalCount, icon: Eye, tone: "bg-primary/10 text-primary" },
          { label: "بررسی‌شده", value: summary?.checkedCount, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
          { label: "آگهی متمایز", value: summary?.distinctPropertyCodes, icon: Hash, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
          { label: "مشتری متمایز", value: summary?.distinctRequesters, icon: Users, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
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
                    faNumber(kpi.value)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* فیلترها — عین ستون‌های خود سامانه */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" aria-hidden />
            فیلترهای بازدیدها
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vi-code">کد آگهی</Label>
              <Input id="vi-code" value={filters.propertyCode} onChange={(e) => setF("propertyCode", e.target.value)} placeholder="نمونه: ۱۲۳۴۵" inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vi-requester">درخواست‌دهنده</Label>
              <Input id="vi-requester" value={filters.requester} onChange={(e) => setF("requester", e.target.value)} placeholder="نام مشتری" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vi-checker">بررسی‌کننده</Label>
              <Input id="vi-checker" value={filters.checker} onChange={(e) => setF("checker", e.target.value)} placeholder="نام کارشناس" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vi-status">وضعیت</Label>
              <Input id="vi-status" value={filters.status} onChange={(e) => setF("status", e.target.value)} placeholder="مثلاً: تأیید شده" />
            </div>
            <div className="space-y-1.5">
              <Label>از تاریخ (هجری شمسی)</Label>
              <JalaliDatePicker value={filters.dateFrom} onChange={(v) => setF("dateFrom", v ?? "")} placeholder="انتخاب تاریخ آغاز" />
            </div>
            <div className="space-y-1.5">
              <Label>تا تاریخ (هجری شمسی)</Label>
              <JalaliDatePicker value={filters.dateTo} onChange={(v) => setF("dateTo", v ?? "")} placeholder="انتخاب تاریخ پایان" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setApplied({ ...filters })} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Filter className="w-4 h-4" aria-hidden />}
              اعمال فیلتر
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFilters(EMPTY);
                setApplied(EMPTY);
              }}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden /> پاک‌سازی
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* شفافیت منبع داده */}
      {source && !source.cached && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            داده واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.
            {source.liveError ? ` آخرین خطا: ${source.liveError}` : " پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."}
          </AlertDescription>
        </Alert>
      )}

      {/* نمودار روند ماهانه */}
      {showCharts && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-primary" aria-hidden />
              روند ماهانه ثبت بازدید (هجری شمسی)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40" role="img" aria-label="نمودار ستونی روند ماهانه بازدیدها">
              {chartData.map((c) => (
                <div key={c.key} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold tabular-nums">{faNumber(c.count)}</span>
                  <div
                    className="w-full rounded-t-lg bg-primary/80 hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(6, (c.count / maxCount) * 100)}%` }}
                    title={`${c.label}: ${faNumber(c.count)} بازدید`}
                  />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center" dir="rtl">{c.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* جدول بازدیدها */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" aria-hidden />
            فهرست بازدیدها — عین ستون‌های خود سامانه
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
              <p className="text-sm text-muted-foreground">
                بازدیدی برای این فیلترها یافت نشد. پس از ورود با «کد پرسنلی + پیامک»، داده‌های واقعی بازدیدها خودکار استخراج می‌شوند.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border max-h-[28rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>کد آگهی</TableHead>
                    <TableHead>درخواست‌دهنده</TableHead>
                    <TableHead>بررسی‌کننده</TableHead>
                    <TableHead>مشاور آگهی</TableHead>
                    <TableHead>زمان ثبت</TableHead>
                    <TableHead>زمان بررسی</TableHead>
                    <TableHead>وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold" dir="ltr">
                        <span className="inline-flex items-center gap-1">
                          <Home className="w-3.5 h-3.5 text-primary" aria-hidden />
                          {faDigits(r.propertyCode)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate">{r.requesterName}</TableCell>
                      <TableCell className="max-w-[9rem] truncate">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                          {r.checkerName}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[9rem] truncate text-muted-foreground">{r.propertyRealtorName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{faJalaliShortDateTime(r.createdAt)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.checkTime ? (
                          <span className="text-emerald-600 font-bold">{faJalaliShortDateTime(r.checkTime)}</span>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Clock className="w-3 h-3" aria-hidden /> در انتظار
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
