"use client";

/**
 * کاشی «معاملات» — صفحه داخلی
 * فیلترهای کامل (تاریخ، کارشناس، کد آگهی، کد درخواست، مبلغ، محله، نوع ملک)
 * + شاخص‌ها + نمودارها + جدول صفحه‌بندی‌شده + بینش‌های ایجنت.
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Filter, RotateCcw, TrendingUp, Banknote, Calculator, Percent, Search, ChevronRight, ChevronLeft, BarChart3, MapPinned,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faToman, faNumber, faDate, faDigits, faMonthLabel } from "@/lib/format";

interface TxRow {
  id: string;
  dealDate: string;
  listingCode: string;
  requestCode: string | null;
  expertCode: string;
  expertName: string;
  price: number;
  district: string;
  propertyType: string;
  area: number;
  commission: number;
}

interface Meta {
  districts: string[];
  propertyTypes: string[];
}

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  expertName: "",
  listingCode: "",
  requestCode: "",
  priceMinM: "",
  priceMaxM: "",
  district: "all",
  propertyType: "all",
};

type Filters = typeof EMPTY_FILTERS;

export function TransactionsPage({ settings, onSettingsChange, userRole: _userRole, onBack: _onBack }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const pageSize = Number(settings.pageSize ?? 10);
  const sortBy = String(settings.sortBy ?? "dealDate");
  const showCharts = settings.showCharts !== false;
  const showCommission = settings.showCommission !== false;

  useEffect(() => {
    api<{ districts: string[]; propertyTypes: string[] }>("/api/crm/meta")
      .then(setMeta)
      .catch(() => setMeta({ districts: [], propertyTypes: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
      if (applied.dateTo) params.set("dateTo", applied.dateTo);
      if (applied.expertName) params.set("expertName", applied.expertName);
      if (applied.listingCode) params.set("listingCode", applied.listingCode);
      if (applied.requestCode) params.set("requestCode", applied.requestCode);
      if (applied.priceMinM) params.set("priceMin", String(Number(applied.priceMinM) * 1_000_000));
      if (applied.priceMaxM) params.set("priceMax", String(Number(applied.priceMaxM) * 1_000_000));
      if (applied.district !== "all") params.set("district", applied.district);
      if (applied.propertyType !== "all") params.set("propertyType", applied.propertyType);
      params.set("limit", "2000");
      params.set("offset", "0");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortBy === "price" || sortBy === "dealDate" ? "desc" : "asc");

      const res = await api<{ rows: TxRow[]; total: number }>(`/api/crm/transactions?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
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

  const kpis = useMemo(() => {
    if (!rows) return null;
    const totalValue = rows.reduce((a, t) => a + t.price, 0);
    const totalCommission = rows.reduce((a, t) => a + t.commission, 0);
    return {
      count: rows.length,
      totalValue,
      avg: rows.length ? totalValue / rows.length : 0,
      commission: totalCommission,
    };
  }, [rows]);

  const monthly = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { count: number; value: number }>();
    for (const t of rows) {
      const d = new Date(t.dealDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = map.get(key) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += t.price;
      map.set(key, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        month: faMonthLabel(k),
        count: v.count,
        valueB: Math.round(v.value / 1e9 * 10) / 10,
      }));
  }, [rows]);

  const byDistrict = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, number>();
    for (const t of rows) map.set(t.district, (map.get(t.district) ?? 0) + t.price);
    return [...map.entries()]
      .map(([name, v]) => ({ name, valueB: Math.round(v / 1e9 * 10) / 10 }))
      .sort((a, b) => b.valueB - a.valueB)
      .slice(0, 8);
  }, [rows]);

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

      {/* شاخص‌ها */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">تعداد معاملات</p>
                <p className="text-lg font-extrabold">{faNumber(kpis.count)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <Banknote className="w-5 h-5 text-emerald-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">ارزش کل</p>
                <p className="text-lg font-extrabold">{faToman(kpis.totalValue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-amber-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">میانگین هر معامله</p>
                <p className="text-lg font-extrabold">{faToman(kpis.avg)}</p>
              </div>
            </CardContent>
          </Card>
          {showCommission && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                  <Percent className="w-5 h-5 text-teal-600" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">مجموع کمیسیون</p>
                  <p className="text-lg font-extrabold">{faToman(kpis.commission)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* فیلترها */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" aria-hidden /> فیلترهای معاملات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...filters });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="f-dateFrom">از تاریخ</Label>
              <Input id="f-dateFrom" type="date" dir="ltr" value={filters.dateFrom} onChange={(e) => setF("dateFrom", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-dateTo">تا تاریخ</Label>
              <Input id="f-dateTo" type="date" dir="ltr" value={filters.dateTo} onChange={(e) => setF("dateTo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-expertName">کارشناس معامله‌کننده</Label>
              <Input id="f-expertName" placeholder="نام و نام خانوادگی" value={filters.expertName} onChange={(e) => setF("expertName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-listingCode">کد آگهی</Label>
              <Input id="f-listingCode" placeholder="MT-94xxx" dir="ltr" className="text-left" value={filters.listingCode} onChange={(e) => setF("listingCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-requestCode">کد درخواست خرید</Label>
              <Input id="f-requestCode" placeholder="RF-31xxx" dir="ltr" className="text-left" value={filters.requestCode} onChange={(e) => setF("requestCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-priceMin">حداقل مبلغ (میلیون تومان)</Label>
              <Input id="f-priceMin" inputMode="numeric" dir="ltr" className="text-left" placeholder="مثال: ۲۰۰۰" value={filters.priceMinM} onChange={(e) => setF("priceMinM", e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-priceMax">حداکثر مبلغ (میلیون تومان)</Label>
              <Input id="f-priceMax" inputMode="numeric" dir="ltr" className="text-left" placeholder="مثال: ۱۵۰۰۰" value={filters.priceMaxM} onChange={(e) => setF("priceMaxM", e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-district">محله</Label>
              <Select value={filters.district} onValueChange={(v) => setF("district", v)}>
                <SelectTrigger id="f-district">
                  <SelectValue placeholder="همه محله‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه محله‌ها</SelectItem>
                  {meta?.districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-propertyType">نوع ملک</Label>
              <Select value={filters.propertyType} onValueChange={(v) => setF("propertyType", v)}>
                <SelectTrigger id="f-propertyType">
                  <SelectValue placeholder="همه انواع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه انواع</SelectItem>
                  {meta?.propertyTypes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
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

      {/* نمودارها */}
      {showCharts && rows && rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" aria-hidden /> روند ماهانه (تعداد و ارزش)
              </CardTitle>
            </CardHeader>
            <CardContent className="chart-ltr h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" angle={-20} textAnchor="end" height={48} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={32} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={40} />
                  <RTooltip
                    formatter={(value: number, name: string) => [
                      name === "valueB" ? `${faNumber(value)} میلیارد تومان` : faNumber(value),
                      name === "valueB" ? "ارزش" : "تعداد",
                    ]}
                    contentStyle={{ direction: "rtl", borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend formatter={(v) => (v === "valueB" ? "ارزش (میلیارد)" : "تعداد")} wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="count" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" type="monotone" dataKey="valueB" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPinned className="w-4 h-4 text-primary" aria-hidden /> ارزش معاملات به تفکیک محله (میلیارد تومان)
              </CardTitle>
            </CardHeader>
            <CardContent className="chart-ltr h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={byDistrict} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground)" }} width={90} />
                  <RTooltip formatter={(v: number) => [`${faNumber(v)} میلیارد تومان`, "ارزش"]} contentStyle={{ direction: "rtl", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="valueB" fill="var(--chart-3)" radius={[0, 6, 6, 0]} maxBarSize={20} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* جدول */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm">فهرست معاملات</CardTitle>
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
              هیچ معامله‌ای با این فیلترها یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[28rem]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">کد آگهی</TableHead>
                    <TableHead className="text-right">کد درخواست</TableHead>
                    <TableHead className="text-right">کارشناس</TableHead>
                    <TableHead className="text-right hidden md:table-cell">محله</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">نوع ملک</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">متراژ</TableHead>
                    <TableHead className="text-right">مبلغ</TableHead>
                    {showCommission && <TableHead className="text-right hidden md:table-cell">کمیسیون</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap text-xs">{faDate(t.dealDate)}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs text-left">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{t.listingCode}</span>
                          </TooltipTrigger>
                          <TooltipContent>کد پرسنلی کارشناس: {t.expertCode}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs text-left text-muted-foreground">
                        {t.requestCode ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-medium whitespace-nowrap">{t.expertName}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs">{t.district}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">{t.propertyType}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{faDigits(t.area.toLocaleString("en-US"))} م²</TableCell>
                      <TableCell className="text-xs font-bold whitespace-nowrap">{faToman(t.price)}</TableCell>
                      {showCommission && <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">{faToman(t.commission)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        داده‌ها از سامانه ملک تبریز (arm.melketabriz.ir) استخراج و به‌صورت محلی کش می‌شوند. تاریخ‌ها میلادی ثبت و شمسی
        نمایش داده می‌شوند.
      </p>
    </div>
  );
}
