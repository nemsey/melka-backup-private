"use client";

/**
 * کاشی «معاملات» — صفحه داخلی (بازنویسی بر پایه ساختار واقعی سامانه ARM)
 * ------------------------------------------------------
 * عین «گزارش تطابق معاملات» خود سامانه ملک تبریز + تحلیل داشبورد:
 *   • شاخص‌های چهارگانه: تعداد کل، دارای رویداد، دارای آگهی پیشنهادی، هر دو
 *   • فیلتر تاریخ با «تقویم هجری شمسی» (مثل خود سامانه — startDate/endDate)
 *   • فیلترهای کد ملک، کد درخواست، شماره هولوگرام و نوع تطبیق
 *   • جدول: کد ملک/مالک، کد درخواست/درخواست‌دهنده، تاریخ معامله (جلالی)،
 *     شماره هولوگرام، آگهی پیشنهادی، رویداد
 *   • نمودار روند ماهانه (هجری شمسی) + نمودار ترکیب تطبیق
 *   • شفافیت منبع داده (آخرین استخراج موفق/خطای زنده)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Filter, RotateCcw, TrendingUp, Calculator, Percent, Search, ChevronRight, ChevronLeft, BarChart3, PieChart, Hash, FileCheck2, Sparkles, Database, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faJalaliShort, faMonthLabel } from "@/lib/format";
import { faDigits, dateToJalali } from "@/lib/jalali";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";

interface TxRow {
  id: string;
  contractDate: string;
  propertyCode: string;
  propertyCustomer: string | null;
  requestCode: string | null;
  requestCustomer: string | null;
  contractHolo: string | null;
  suggestedPropertyCount: number;
  eventsCount: number;
}

interface Summary {
  totalCount: number;
  hasRequestEvent: number;
  hasSuggestedProperty: number;
  hasBoth: number;
  withHolo: number;
  withRequest: number;
}

interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt: string | null;
  lastSyncedAt: string | null;
  liveError: string | null;
  syncAttempts: number;
}

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  propertyCode: "",
  requestCode: "",
  contractHolo: "",
  matchKind: "all",
};

type Filters = typeof EMPTY_FILTERS;

const MATCH_KIND_FA: Record<string, string> = {
  all: "همه معاملات",
  event: "فقط دارای رویداد",
  suggested: "فقط دارای آگهی پیشنهادی",
  both: "دارای هر دو",
};

export function TransactionsPage({ settings, onSettingsChange: _osc, userRole: _userRole, onBack: _onBack }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [source, setSource] = useState<DataSourceInfo | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const pageSize = Number(settings.pageSize ?? 10);
  const sortBy = String(settings.sortBy ?? "contractDate");
  const showCharts = settings.showCharts !== false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) params.set("dateTo", applied.dateTo);
      if (applied.propertyCode) params.set("propertyCode", applied.propertyCode);
      if (applied.requestCode) params.set("requestCode", applied.requestCode);
      if (applied.contractHolo) params.set("contractHolo", applied.contractHolo);
      if (applied.matchKind !== "all") params.set("matchKind", applied.matchKind);
      params.set("limit", "5000");
      params.set("offset", "0");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortBy === "contractDate" ? "desc" : "desc");

      const res = await api<{ rows: TxRow[]; total: number; summary: Summary; dataSource: DataSourceInfo }>(
        `/api/crm/transactions?${params.toString()}`
      );
      setRows(res.rows);
      setTotal(res.total);
      setSummary(res.summary);
      setSource(res.dataSource);
      setPage(0);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت معاملات", description: e.message, variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, sortBy, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // سری ماهانه — ماه‌های هجری شمسی
  const monthly = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, number>();
    for (const t of rows) {
      const j = dateToJalali(new Date(t.contractDate));
      const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ month: faMonthLabel(k), count: v }));
  }, [rows]);

  // ترکیب تطبیق برای نمودار
  const composition = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "دارای هر دو", value: summary.hasBoth, fill: "var(--chart-1)" },
      { name: "فقط رویداد", value: Math.max(0, summary.hasRequestEvent - summary.hasBoth), fill: "var(--chart-2)" },
      { name: "فقط آگهی پیشنهادی", value: Math.max(0, summary.hasSuggestedProperty - summary.hasBoth), fill: "var(--chart-3)" },
      { name: "بدون هیچ‌کدام", value: Math.max(0, summary.totalCount - summary.hasRequestEvent - summary.hasSuggestedProperty + summary.hasBoth), fill: "var(--chart-4)" },
    ];
  }, [summary]);

  const pageRows = useMemo(() => {
    if (!rows) return [];
    return rows.slice(page * pageSize, (page + 1) * pageSize);
  }, [rows, page, pageSize]);

  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="transactions" />

      {/* شاخص‌های چهارگانه — عین گزارش خود سامانه + دو سهم کلیدی */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">تعداد کل معاملات</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.totalCount)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای رویداد</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasRequestEvent)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای آگهی پیشنهادی</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasSuggestedProperty)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5 text-teal-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای هر دو</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasBoth)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* فیلترها — با تقویم هجری شمسی مثل خود سامانه */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" aria-hidden /> فیلترهای گزارش تطابق
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...filters });
            }}
          >
            <div className="space-y-1.5">
              <JalaliDatePicker
                id="f-dateFrom"
                label="از تاریخ"
                placeholder="از تاریخ"
                value={filters.dateFrom}
                onChange={(v) => setF("dateFrom", v)}
              />
            </div>
            <div className="space-y-1.5">
              <JalaliDatePicker
                id="f-dateTo"
                label="تا تاریخ"
                placeholder="تا تاریخ"
                value={filters.dateTo}
                onChange={(v) => setF("dateTo", v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-propertyCode">کد ملک</Label>
              <Input
                id="f-propertyCode"
                placeholder="نمونه: ۱۲۳۴۵"
                value={filters.propertyCode}
                onChange={(e) => setF("propertyCode", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-requestCode">کد درخواست</Label>
              <Input
                id="f-requestCode"
                placeholder="نمونه: ۶۷۸۹"
                value={filters.requestCode}
                onChange={(e) => setF("requestCode", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-contractHolo">شماره هولوگرام</Label>
              <Input
                id="f-contractHolo"
                placeholder="نمونه: ۹۸۷۶۵"
                value={filters.contractHolo}
                onChange={(e) => setF("contractHolo", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>نوع تطبیق</Label>
              <Select value={filters.matchKind} onValueChange={(v) => setF("matchKind", v)}>
                <SelectTrigger aria-label="نوع تطبیق">
                  <SelectValue placeholder="همه معاملات" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MATCH_KIND_FA).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" className="gap-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                اعمال فیلتر
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setApplied(EMPTY_FILTERS);
                }}
              >
                <RotateCcw className="w-4 h-4" aria-hidden /> پاک‌سازی
              </Button>
              {total > 0 && (
                <Badge variant="secondary" className="mb-1">
                  {faNumber(total)} معامله منطبق
                </Badge>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* شفافیت منبع داده */}
      {source && source.liveError && (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-bold">استخراج زنده از سامانه ملک تبریز در دسترس نیست</p>
              <p className="text-muted-foreground">
                {source.cached
                  ? "در حال حاضر داده‌های کش‌شده از آخرین استخراج موفق نمایش داده می‌شود."
                  : "هنوز هیچ داده‌ای از سامانه استخراج نشده است."}{" "}
                {source.liveError}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {source && source.cached && !source.liveError && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Database className="w-3.5 h-3.5" aria-hidden />
          آخرین استخراج موفق از سامانه ملک تبریز: {source.lastSuccessAt ? faJalaliShort(source.lastSuccessAt) : "—"}
        </div>
      )}

      {/* نمودارها */}
      {showCharts && rows && rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" aria-hidden /> روند ماهانه معاملات (هجری شمسی)
              </CardTitle>
            </CardHeader>
            <CardContent className="chart-ltr h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" angle={-20} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={32} />
                  <RTooltip
                    formatter={(value: number) => [faNumber(value), "تعداد معاملات"]}
                    contentStyle={{ direction: "rtl", borderRadius: 12, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary" aria-hidden /> ترکیب رویداد و آگهی پیشنهادی
              </CardTitle>
            </CardHeader>
            <CardContent className="chart-ltr h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={composition} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground)" }} width={110} />
                  <RTooltip formatter={(v: number) => [faNumber(v), "تعداد"]} contentStyle={{ direction: "rtl", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* جدول — عین ستون‌های گزارش خود سامانه */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">فهرست معاملات</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                صفحه {faNumber(page + 1)} از {faNumber(totalPages)}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="صفحه قبل">
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} aria-label="صفحه بعد">
                  <ChevronLeft className="w-4 h-4" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows === null ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm leading-relaxed">
              {loading
                ? "در حال دریافت…"
                : rows.length === 0
                  ? "هنوز معامله‌ای از سامانه ملک تبریز استخراج نشده است. با بازیابی پایگاه داده سامانه، داده‌ها به‌صورت خودکار همگام می‌شوند یا از تنظیمات، «همگام‌سازی داده‌ها» را بزنید."
                  : "هیچ معامله‌ای با این فیلترها یافت نشد."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[28rem]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-right">تاریخ معامله</TableHead>
                    <TableHead className="text-right">کد ملک / مالک</TableHead>
                    <TableHead className="text-right">کد درخواست / درخواست‌دهنده</TableHead>
                    <TableHead className="text-right hidden md:table-cell">شماره هولوگرام</TableHead>
                    <TableHead className="text-right">آگهی پیشنهادی</TableHead>
                    <TableHead className="text-right">رویداد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap text-xs font-medium">{faJalaliShort(t.contractDate)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono">{faDigits(t.propertyCode)}</span>
                          {t.propertyCustomer && (
                            <span className="text-muted-foreground text-[11px] mt-0.5">{t.propertyCustomer}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.requestCode ? (
                          <div className="flex flex-col">
                            <span className="font-mono">{faDigits(t.requestCode)}</span>
                            {t.requestCustomer && (
                              <span className="text-muted-foreground text-[11px] mt-0.5">{t.requestCustomer}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">— بدون درخواست</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs font-mono" dir="rtl">
                        {t.contractHolo ? (
                          <span className="flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                            {faDigits(t.contractHolo)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.suggestedPropertyCount > 0 ? (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px] gap-1">
                            <Hash className="w-3 h-3" aria-hidden /> {faNumber(t.suggestedPropertyCount)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.eventsCount > 0 ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] gap-1">
                            <TrendingUp className="w-3 h-3" aria-hidden /> {faNumber(t.eventsCount)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        داده‌ها عین «گزارش تطابق معاملات» سامانه ملک تبریز (arm.melketabriz.ir) استخراج و به‌صورت محلی کش
        می‌شوند. تاریخ‌ها با تقویم هجری شمسی نمایش داده می‌شوند و فیلتر تاریخ نیز با همین تقویم اعمال می‌شود.
      </p>
    </div>
  );
}
