"use client";

/**
 * تب «معاملات» کاشی «معاملات ملک تبریز» — P6.5-12
 * ------------------------------------------------------
 * دستور مالک ۱۴۰۵/۰۷/۰۱ + دستورهای مرحلهٔ قبل (ادغام‌شده):
 *   · ستون «درخواست» (تغییر نام از «کد درخواست / درخواست‌دهنده»)
 *   · کد ملک و درخواست با نام+موبایل تو در تو (لایهٔ غنی‌سازی)
 *   · ستون‌های «نوع قرارداد» + «مبلغ قرارداد» (با جداکنندهٔ «،») + «فایل قرارداد»
 *   · «تجمیع حق‌السهم مشاوران» — درصد حق‌السهم در مقابل نام هر مشاور (بند ب)
 *   · فیلترها بالای فهرست: تاریخ + کدها + هولوگرام + نام کارشناس + کد پرسنلی + نوع قرارداد
 *   · حذف ستون‌های خریدار/فروشنده (برچسب نقش — نه نام واقعی) و فیلتر نوع تطبیق
 * تک‌صفحه‌ای و بی‌نهایت (P6.5-09) — همهٔ ردیف‌ها در یک پاسخ واحد.
 */

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2,
  Filter,
  RotateCcw,
  TrendingUp,
  Calculator,
  Percent,
  Search,
  BarChart3,
  FileCheck2,
  Users,
  Phone,
  FileText,
  Home,
  Inbox,
  ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { KpiCard, DataSourceWarning, useTileData, type DataSourceInfo } from "@/components/app/shared";
import { api } from "@/lib/client/api";
import { categorizeTxType, txTypeMonthlySeries, topExpertsByTxType } from "@/core/agent/analyzers";
import { faNumber, faJalaliShort, faMonthLabel, faPercent, faAmountFull } from "@/lib/format";
import { faDigits, dateToJalali } from "@/lib/jalali";
import { useIsMobile } from "@/hooks/use-mobile";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { ContractFileDialog, type ContractDocData } from "./ContractFileDialog";

/** برچسب فارسی سری‌های نمودار روند (A.۳) */
const SERIES_FA: Record<string, string> = {
  sale: "مبایعه‌نامه",
  rent: "اجاره",
  total: "مجموع",
};

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
  // ---- ستون‌های غنی‌سازی ----
  ownerName: string | null;
  ownerMobile: string | null;
  requesterName: string | null;
  requesterMobile: string | null;
  // ---- P6.5-14 (BLOCK C) — فروشنده/خریدار مستقل از صورت‌وضعیت خود معامله ----
  sellerName: string | null;
  sellerMobile: string | null;
  buyerName: string | null;
  buyerMobile: string | null;
  infoMatch: boolean;
  contractText: string | null;
  consultantsShareSummary: {
    count: number;
    totalPercent: number;
    confirmed: number;
    pending: number;
    names: string[];
    shares: { name: string; unitPercent: number; confirmation: string }[];
  } | null;
  // ---- P6.5-12 ----
  contractType: string | null;
  contractAmount: number | null;
  agency: {
    id: string;
    realtorName: string | null;
    creatorName: string | null;
    payPercent: number | null;
    sellPrice: number | null;
    detailsJson: string | null;
    createdAt: string | null;
  } | null;
  contractMatchBy: "holo" | "propertyCode" | "requestCode" | null;
}

interface Summary {
  totalCount: number;
  hasRequestEvent: number;
  hasSuggestedProperty: number;
  hasBoth: number;
  withHolo: number;
  withRequest: number;
}

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  propertyCode: "",
  requestCode: "",
  contractHolo: "",
  expertName: "",
  personnelCode: "",
  contractType: "all",
};

type Filters = typeof EMPTY_FILTERS;

const CONTRACT_TYPE_FA: Record<string, string> = {
  all: "همه انواع",
  "مبایعه نامه": "مبایعه نامه",
  "اجاره نامه": "اجاره نامه",
  "نامشخص": "بدون قرارداد ثبت‌شده",
};

/** پاسخ کامل روت معاملات — شیء یگانه داده هوک */
interface TxResponse {
  rows: TxRow[];
  total: number;
  summary: Summary;
  dataSource: DataSourceInfo;
  /** P6.5-14 (A.۵) — نگاشت نام کارشناس → کد پرسنلی (برای سه ستون کارشناسان برتر) */
  expertCodeByName?: Record<string, string>;
}

const EMPTY_RESPONSE: TxResponse = { rows: [], total: 0, summary: null as unknown as Summary, dataSource: null as unknown as DataSourceInfo };

export function TransactionsTab({ sortBy, showCharts }: { sortBy: string; showCharts: boolean }) {
  const isMobile = useIsMobile();
  // B.۱ (ملکا-شورا-۱۴۰۵-۰۱۷) — فیلترها در موبایل جمع‌شونده؛ در دسکتاپ همیشه باز
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [contractDoc, setContractDoc] = useState<ContractDocData | null>(null);
  const [contractOpen, setContractOpen] = useState(false);

  const fetchTransactions = useCallback(async (): Promise<TxResponse> => {
    const params = new URLSearchParams();
    if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) params.set("dateTo", applied.dateTo);
    if (applied.propertyCode) params.set("propertyCode", applied.propertyCode);
    if (applied.requestCode) params.set("requestCode", applied.requestCode);
    if (applied.contractHolo) params.set("contractHolo", applied.contractHolo);
    if (applied.expertName) params.set("expertName", applied.expertName);
    if (applied.personnelCode) params.set("personnelCode", applied.personnelCode);
    if (applied.contractType !== "all") params.set("contractType", applied.contractType);
    params.set("limit", "5000");
    params.set("offset", "0");
    params.set("sortBy", sortBy);
    params.set("sortDir", "desc");

    const res = await api<TxResponse>(`/api/crm/transactions?${params.toString()}`);
    return res;
  }, [applied, sortBy]);

  const { data, loading, reload } = useTileData(fetchTransactions, {
    errorTitle: "خطا در دریافت معاملات",
    errorValue: (prev) => (prev ? { ...prev, rows: [] } : { ...EMPTY_RESPONSE }),
  });

  const rows = data?.rows ?? null;
  const summary = data?.summary ?? null;
  const source = data?.dataSource ?? null;
  const total = data?.total ?? 0;

  // P6.5-14 (A.۲) — سری ماهانهٔ سه‌سری: مبایعه‌نامه / اجاره / مجموع (فروردین ۱۴۰۴ → ماه جاری)
  const monthly = useMemo(() => {
    const j = dateToJalali(new Date());
    const currentKey = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    const typed = (rows ?? []).map((t) => ({ contractDate: t.contractDate, contractType: t.contractType, propertyTitle: null }));
    return txTypeMonthlySeries(typed, { fromKey: "1404-01", toKey: currentKey }).map((p) => ({
      month: faMonthLabel(p.key),
      sale: p.sale,
      rent: p.rent,
      total: p.total,
    }));
  }, [rows]);

  // P6.5-14 — شمارش نوع‌ها برای KPI (از ردیف‌های غنی‌شدهٔ فهرترشده)
  const typeCounts = useMemo(() => {
    let sale = 0;
    let rent = 0;
    let other = 0;
    for (const t of rows ?? []) {
      const cat = categorizeTxType({ contractDate: t.contractDate, contractType: t.contractType });
      if (cat === "sale") sale += 1;
      else if (cat === "rent") rent += 1;
      else other += 1;
    }
    return { sale, rent, other, total: sale + rent + other };
  }, [rows]);

  // P6.5-14 (A.۵) — کارشناسان برتر سه‌ستونی (۱۰ نفر هر ستون)
  const topExperts = useMemo(() => {
    const shared = (rows ?? []).map((t) => ({
      contractDate: t.contractDate,
      contractType: t.contractType,
      propertyTitle: null,
      realtorSharesJson: null,
      shareNames: t.consultantsShareSummary?.names ?? [],
    }));
    return topExpertsByTxType(shared, 10);
  }, [rows]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  /** باز کردن سند قرارداد (بند ت — فایل قرارداد هر معامله) */
  const openContractDoc = (t: TxRow) => {
    let agencyDetails: string[] | null = null;
    if (t.agency?.detailsJson) {
      try {
        const parsed = JSON.parse(t.agency.detailsJson) as string[];
        agencyDetails = Array.isArray(parsed) ? parsed : null;
      } catch {
        agencyDetails = null;
      }
    }
    setContractDoc({
      txId: t.id,
      contractDate: t.contractDate,
      propertyCode: t.propertyCode,
      requestCode: t.requestCode,
      contractHolo: t.contractHolo,
      contractType: t.contractType,
      contractAmount: t.contractAmount,
      contractText: t.contractText,
      matchBy: t.contractMatchBy,
      seller: { name: t.ownerName, mobile: t.ownerMobile, role: "فروشنده" },
      buyer: { name: t.requesterName, mobile: t.requesterMobile, role: "خریدار" },
      shares: t.consultantsShareSummary?.shares ?? [],
      agency: t.agency
        ? {
            realtorName: t.agency.realtorName,
            creatorName: t.agency.creatorName,
            payPercent: t.agency.payPercent,
            sellPrice: t.agency.sellPrice,
            detailsHtml: agencyDetails,
            createdAt: t.agency.createdAt,
          }
        : null,
      property: null,
    });
    setContractOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* شاخص‌های چهارجانی — P6.5-14: کل / مبایعه‌نامه / اجاره / سایر */}
      {rows && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="تعداد کل معاملات"
            value={faNumber(typeCounts.total)}
            icon={Calculator}
            iconAs="div"
            iconWrapperClassName="bg-primary/10"
            iconColorClassName="text-primary"
          />
          <KpiCard
            label="معاملات مبایعه‌نامه"
            value={faNumber(typeCounts.sale)}
            icon={Home}
            iconAs="div"
            iconWrapperClassName="bg-teal-100 dark:bg-teal-950"
            iconColorClassName="text-teal-600 dark:text-teal-400"
          />
          <KpiCard
            label="معاملات اجاره"
            value={faNumber(typeCounts.rent)}
            icon={TrendingUp}
            iconAs="div"
            iconWrapperClassName="bg-amber-100 dark:bg-amber-950"
            iconColorClassName="text-amber-600"
          />
          <KpiCard
            label="سایر / نامشخص"
            value={faNumber(typeCounts.other)}
            icon={Percent}
            iconAs="div"
            iconWrapperClassName="bg-muted"
            iconColorClassName="text-muted-foreground"
          />
        </div>
      )}

      {/* نمودار روند سه‌سری (A.۳) + کارشناسان برتر (A.۵) */}
      {showCharts && rows && rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" aria-hidden /> روند ماهانه معاملات — مبایعه‌نامه، اجاره و مجموع (فروردین ۱۴۰۴ تاکنون)
              </CardTitle>
            </CardHeader>
            <CardContent className="chart-ltr h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" angle={-20} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={32} />
                  <RTooltip formatter={(value: number, name: string) => [faNumber(value), SERIES_FA[name as "sale" | "rent" | "total"] ?? name]} contentStyle={{ direction: "rtl", borderRadius: 12, fontSize: 12 }} />
                  <Legend formatter={(v: string) => SERIES_FA[v as "sale" | "rent" | "total"] ?? v} wrapperStyle={{ direction: "rtl", fontSize: 12 }} />
                  <Line type="monotone" dataKey="sale" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--chart-1)" }} />
                  <Line type="monotone" dataKey="rent" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--chart-2)" }} />
                  <Line type="monotone" dataKey="total" stroke="var(--chart-3)" strokeWidth={3.5} dot={{ r: 3.5, fill: "var(--chart-3)" }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {/* سه ستون کارشناسان برتر (A.۵) — نام + کد پرسنلی + تعداد */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" aria-hidden /> کارشناسان برتر بر اساس تعداد معاملات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {([
                  ["مبایعه‌نامه", topExperts.sale],
                  ["اجاره", topExperts.rent],
                  ["مجموع", topExperts.total],
                ] as const).map(([title, list]) => (
                  <div key={title} className="min-w-0">
                    <div className="text-center text-[11px] font-bold rounded-md bg-primary/10 text-primary py-1 mb-2">۱۰ برتر — {title}</div>
                    {list.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">معامله‌ای با مشاور ثبت‌شده نیست</p>
                    ) : (
                      <ol className="space-y-1">
                        {list.map((e, i) => (
                          <li key={`${title}-${e.name}`} className="flex items-center justify-between gap-1 border-b border-border/40 pb-0.5">
                            <span className="truncate" title={`${e.name}${data?.expertCodeByName?.[e.name] ? ` — کد پرسنلی: ${data.expertCodeByName[e.name]}` : ""}`}>
                              <span className="text-muted-foreground text-[10px] ml-0.5">{faNumber(i + 1)}.</span> {e.name}
                              {data?.expertCodeByName?.[e.name] ? <span className="text-[9px] text-muted-foreground font-mono" dir="ltr"> {faDigits(data.expertCodeByName[e.name])}</span> : null}
                            </span>
                            <span className="font-bold shrink-0 tabular-nums">{faNumber(e.count)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* شفافیت منبع داده */}
      <DataSourceWarning source={source} />

      {/* فیلترها — B.۱: فوراً بالای فهرست معاملات · موبایل جمع‌شونده · دسکتاپ همیشه باز */}
      <Card id="m3-filters-card">
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" aria-hidden /> فیلترهای فهرست معاملات
            {isMobile ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px] mr-auto" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-controls="m3-filters-form">
                <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} aria-hidden />
                {filtersOpen ? "بستن" : "باز کردن"}
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        {(!isMobile || filtersOpen) && (
        <CardContent>
          <form
            id="m3-filters-form"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...filters });
            }}
          >
            <div className="space-y-1.5">
              <JalaliDatePicker id="f-dateFrom" label="از تاریخ" placeholder="از تاریخ" value={filters.dateFrom} onChange={(v) => setF("dateFrom", v)} />
            </div>
            <div className="space-y-1.5">
              <JalaliDatePicker id="f-dateTo" label="تا تاریخ" placeholder="تا تاریخ" value={filters.dateTo} onChange={(v) => setF("dateTo", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-propertyCode">کد ملک</Label>
              <Input id="f-propertyCode" placeholder="نمونه: ۱۲۳۴۵" value={filters.propertyCode} onChange={(e) => setF("propertyCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-requestCode">کد درخواست</Label>
              <Input id="f-requestCode" placeholder="نمونه: ۶۷۸۹" value={filters.requestCode} onChange={(e) => setF("requestCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-contractHolo">شماره هولوگرام</Label>
              <Input id="f-contractHolo" placeholder="نمونه: ۹۸۷۶۵" value={filters.contractHolo} onChange={(e) => setF("contractHolo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-expertName">نام کارشناس</Label>
              <Input id="f-expertName" placeholder="نمونه: بابایان" value={filters.expertName} onChange={(e) => setF("expertName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-personnelCode">کد پرسنلی کارشناس</Label>
              <Input id="f-personnelCode" placeholder="نمونه: ۴۱۰۰۳۱۳۲۰" value={filters.personnelCode} onChange={(e) => setF("personnelCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>نوع قرارداد</Label>
              <Select value={filters.contractType} onValueChange={(v) => setF("contractType", v)}>
                <SelectTrigger aria-label="نوع قرارداد">
                  <SelectValue placeholder="همه انواع" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_TYPE_FA).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
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
              <Button type="button" variant="ghost" className="gap-2" onClick={() => void reload()} disabled={loading}>
                <RotateCcw className="w-4 h-4" aria-hidden /> بارگذاری مجدد
              </Button>
              {total > 0 && (
                <Badge variant="secondary" className="mb-1">
                  {faNumber(total)} معامله منطبق
                </Badge>
              )}
            </div>
          </form>
        </CardContent>
        )}
      </Card>

      {/* جدول فهرست معاملات — ساختار P6.5-14 (BLOCK B)؛ بدون صفحه‌بندی (تک‌صفحه‌ای) */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">فهرست معاملات — تمامی کارشناسان ملک تبریز</CardTitle>
            {rows && rows.length > 0 && (
              <Badge variant="secondary">{faNumber(rows.length)} ردیف — تک‌صفحه‌ای</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows === null ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm leading-relaxed">
              {loading
                ? "در حال دریافت…"
                : "هیچ معامله‌ای با این فیلترها یافت نشد. با پاک‌سازی فیلترها همهٔ معاملات را ببینید یا با دکمه «بروزرسانی از سامانه» انتقال اطلاعات را آغاز کنید."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[32rem]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="text-right w-12">ردیف</TableHead>
                    <TableHead className="text-right">تاریخ معامله</TableHead>
                    {/* ۱ — کد ملک — با نام و موبایل مالک تو در تو */}
                    <TableHead className="text-right min-w-40">
                      <span className="flex items-center gap-1"><Home className="w-3.5 h-3.5" aria-hidden /> کد ملک</span>
                    </TableHead>
                    {/* ۲ — فروشنده (P6.5-14 BLOCK B) — نام و موبایل مستقل */}
                    <TableHead className="text-right min-w-36">فروشنده</TableHead>
                    {/* ۳ — درخواست — کد درخواست + نام و موبایل درخواست‌دهنده تو در تو */}
                    <TableHead className="text-right min-w-40">
                      <span className="flex items-center gap-1"><Inbox className="w-3.5 h-3.5" aria-hidden /> درخواست</span>
                    </TableHead>
                    {/* ۴ — خریدار (P6.5-14 BLOCK B) — نام و موبایل مستقل */}
                    <TableHead className="text-right min-w-36">خریدار</TableHead>
                    {/* ۵ — تجمیع حق‌السهم مشاوران (B.۲: قبل از شماره هولوگرام) */}
                    <TableHead className="text-right min-w-48">تجمیع حق‌السهم مشاوران</TableHead>
                    {/* ۶ — شماره هولوگرام (B.۲: بعد از تجمیع حق‌السهم — عین دستور مالک) */}
                    <TableHead className="text-right">شماره هولوگرام</TableHead>
                    {/* ۷ — نوع قرارداد */}
                    <TableHead className="text-right">نوع قرارداد</TableHead>
                    {/* ۸ — مبلغ قرارداد */}
                    <TableHead className="text-right min-w-44">مبلغ قرارداد</TableHead>
                    {/* ۹ — فایل قرارداد */}
                    <TableHead className="text-right min-w-32">فایل قرارداد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t, i) => (
                    <TableRow key={t.id} className="hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                          {faNumber(i + 1)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-medium">{faJalaliShort(t.contractDate)}</TableCell>
                      {/* کد ملک + نام/موبایل مالک تو در تو */}
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono font-semibold">{faDigits(t.propertyCode)}</span>
                          {t.ownerName ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="w-3 h-3 shrink-0" aria-hidden />
                              <span className="truncate max-w-36" title={t.ownerName}>{t.ownerName}</span>
                              {t.ownerMobile ? (
                                <a href={`tel:${t.ownerMobile}`} dir="ltr" className="font-mono text-teal-700 dark:text-teal-300 hover:underline shrink-0" title={`تماس با مالک: ${t.ownerMobile}`}>
                                  <Phone className="w-3 h-3" aria-hidden />
                                </a>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">مالک: در انتظار غنی‌سازی</span>
                          )}
                        </div>
                      </TableCell>
                      {/* ۲ — فروشنده (P6.5-14) — نام و موبایل مستقل از صورت‌وضعیت */}
                      <TableCell className="text-xs">
                        {t.sellerName ? (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate max-w-36" title={t.sellerName}>{t.sellerName}</span>
                            {t.sellerMobile ? (
                              <a href={`tel:${t.sellerMobile}`} dir="ltr" className="font-mono text-teal-700 dark:text-teal-300 hover:underline shrink-0" title={`تماس با فروشنده: ${t.sellerMobile}`}>
                                <Phone className="w-3 h-3" aria-hidden />
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">در انتظار غنی‌سازی</span>
                        )}
                      </TableCell>
                      {/* ۳ — درخواست (بند الف: تغییر نام) + نام/موبایل درخواست‌دهنده تو در تو */}
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          {t.requestCode ? (
                            <span className="font-mono font-semibold">{faDigits(t.requestCode)}</span>
                          ) : (
                            <span className="text-muted-foreground">— بدون درخواست</span>
                          )}
                          {t.requestCode && (t.requesterName || t.requesterMobile) ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="w-3 h-3 shrink-0" aria-hidden />
                              {t.requesterName ? <span className="truncate max-w-36" title={t.requesterName}>{t.requesterName}</span> : null}
                              {t.requesterMobile ? (
                                <a href={`tel:${t.requesterMobile}`} dir="ltr" className="font-mono text-teal-700 dark:text-teal-300 hover:underline shrink-0" title={`تماس با درخواست‌دهنده: ${t.requesterMobile}`}>
                                  <Phone className="w-3 h-3" aria-hidden />
                                </a>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      {/* ۴ — خریدار (P6.5-14) — نام و موبایل مستقل از صورت‌وضعیت */}
                      <TableCell className="text-xs">
                        {t.buyerName ? (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="truncate max-w-36" title={t.buyerName}>{t.buyerName}</span>
                            {t.buyerMobile ? (
                              <a href={`tel:${t.buyerMobile}`} dir="ltr" className="font-mono text-teal-700 dark:text-teal-300 hover:underline shrink-0" title={`تماس با خریدار: ${t.buyerMobile}`}>
                                <Phone className="w-3 h-3" aria-hidden />
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">در انتظار غنی‌سازی</span>
                        )}
                      </TableCell>
                      {/* ۵ — تجمیع حق‌السهم مشاوران — با درصد هر مشاور (بند ب) — B.۲: قبل از هولوگرام */}
                      <TableCell className="text-xs">
                        {t.consultantsShareSummary && t.consultantsShareSummary.shares.length > 0 ? (
                          <div className="flex flex-col gap-1 min-w-44">
                            <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[11px] gap-1 w-fit">
                              <Users className="w-3 h-3" aria-hidden /> {faNumber(t.consultantsShareSummary.count)} مشاور — {faPercent(t.consultantsShareSummary.totalPercent)}
                            </Badge>
                            <ul className="text-muted-foreground text-[10px] leading-relaxed space-y-0.5">
                              {t.consultantsShareSummary.shares.slice(0, 4).map((s, idx) => (
                                <li key={`${s.name}-${idx}`} className="flex items-center justify-between gap-2">
                                  <span className="truncate max-w-28" title={s.name}>{s.name}</span>
                                  <span className="font-semibold text-foreground shrink-0">{faPercent(s.unitPercent)}</span>
                                </li>
                              ))}
                              {t.consultantsShareSummary.shares.length > 4 ? (
                                <li className="text-[10px]">+ {faNumber(t.consultantsShareSummary.shares.length - 4)} مشاور دیگر…</li>
                              ) : null}
                            </ul>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* ۶ — شماره هولوگرام (B.۲: بعد از تجمیع حق‌السهم) */}
                      <TableCell className="text-xs font-mono whitespace-nowrap" dir="rtl">
                        {t.contractHolo ? (
                          <span className="flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
                            {faDigits(t.contractHolo)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* ۷ — نوع قرارداد (P6.5-12) */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {t.contractType ? (
                          <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[11px]">{t.contractType}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">— بدون قرارداد ثبت‌شده</span>
                        )}
                      </TableCell>
                      {/* ۸ — مبلغ قرارداد — با جداکنندهٔ «،» (نکتهٔ ۱) */}
                      <TableCell className="text-xs whitespace-nowrap font-semibold">
                        {t.contractAmount !== null ? (
                          faAmountFull(t.contractAmount)
                        ) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </TableCell>
                      {/* ۹ — فایل قرارداد (بند ت — مهم‌ترین ستون) */}
                      <TableCell className="text-xs">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-[11px] px-2"
                          onClick={() => openContractDoc(t)}
                          title="مشاهده و دانلود فایل قرارداد (تولیدی از داده‌های سامانه ملک تبریز)"
                        >
                          <FileText className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
                          {t.contractType || t.agency ? "مشاهده و دانلود" : "مشاهده سند"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ فایل قرارداد (بند ت) */}
      <ContractFileDialog open={contractOpen} onOpenChange={setContractOpen} data={contractDoc} />

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        داده‌ها عین «گزارش تطابق معاملات» سامانه ملک تبریز استخراج می‌شوند؛ «نوع قرارداد»، «مبلغ قرارداد» و «حق‌السهم مشاوران» از
        صورت‌وضعیت‌های ثبت‌شده در خود سامانه (تطبیق هولوگرام &gt; کد ملک &gt; کد درخواست) و «فایل قرارداد» از داده‌های واقعی قرارداد و
        کارگزاری‌های صادره تولید می‌شود — همان تکنیک چاپ اسناد خود سامانه ملک تبریز. هیچ دادهٔ خامی تغییر نمی‌کند (قانون دادهٔ مقدس).
      </p>
    </div>
  );
}
