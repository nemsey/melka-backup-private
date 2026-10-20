"use client";

/**
 * تب «معاملات» کاشی «معاملات ملک تبریز» — P6.5-15 (ملکا-شورا-۱۴۰۵-۰۱۸ — پروندهٔ نهایی M3)
 * ------------------------------------------------------
 * قانون انواع معاملات ملکا (چهارگانه + ثبت‌نشده) در همه‌جا از classifyContract:
 *   · روند ماهانهٔ سه‌سری: مبایعه‌نامه (شامل پیش‌فروش) / اجاره (شامل تمدید) / مجموع
 *   · کارشناسان برتر سه‌ستونی — فقط نام + تعداد (BLOCK C)
 *   · فیلتر نوع قرارداد: ۵ گزینهٔ چندانتخابی (BLOCK D)
 *   · ۱۱ ستون به ترتیب دقیق دستور + ساده‌سازی کد ملک/کد درخواست (دستور ۱ و ۲ مالک)
 *   · فیلترها: اعمال خودکار debounce ۳۰۰ms + نشانگر جستجو + پیام خالی + پاک‌کردن (BLOCK F)
 * تک‌صفحه‌ای و بی‌نهایت (P6.5-09) — همهٔ ردیف‌ها در یک پاسخ واحد.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  FileText,
  Home,
  Inbox,
  ChevronDown,
  FileSpreadsheet,
  // PN-020/گام اول-ج — آیکون ستون شرایط پرداخت
  Banknote,
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
import { KpiCard, useTileData, TileCoverageTable, ExcelImportButton, FilterChip, type DataSourceInfo } from "@/components/app/shared";
import { api, apiBlob, downloadBlob } from "@/lib/client/api";
// PN-002 گام ۶-۲ — اعلان‌های خروجی اکسل
import { useToast } from "@/hooks/use-toast";
import { categorizeTxType, txTypeMonthlySeries, topExpertsByTxType } from "@/core/agent/analyzers";
import { classifyContract, CONTRACT_KIND_FILTER_LABELS, CONTRACT_KIND_FILTER_VALUES } from "@/lib/contract-classify";
import { faNumber, faJalaliShort, faMonthLabel, faPercent, faAmountFull } from "@/lib/format";
// P6547/گام پنجم — نظام رنگ مشترک فیلتر↔فهرست (هارمونی تضمینی) + شعبهٔ PM در حق‌السهم
// PN-009 مرحله E — رنگ KPI/چارت/سرستون‌ها نیز از رجیستری یگانه (قانون ۱۲/۱۴ دستور)
import { branchBadgeClass, valueSoftClass, valueSolidClass, valueIconPair, valueChartVar } from "@/lib/value-colors";
import { faDigits, dateToJalali } from "@/lib/jalali";
import { useIsMobile } from "@/hooks/use-mobile";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { ContractFileDialog, type ContractDocData } from "./ContractFileDialog";
// PN-020/گام اول-ج۱ — برچسب فارسی وضعیت معامله از لایهٔ غنی‌سازی
import { txStatusLabel } from "@/lib/melk-api/tx-enrichment";
// P6549/قانون ۰۳۵-B — کشیدن برای تازه‌سازی + حالت‌های طراحی‌شده
import { usePullToRefresh, PtrIndicator } from "@/hooks/use-pull-to-refresh";
import { EmptyState, ErrorState } from "@/components/app/shared/list-states";
// PN-046/گام اول-۲ (دستور مالک: ستون اطلاعات در «تمامی» فهرست‌ها) — فهرست معاملات (M3)
import { InfoButton } from "@/components/info/InfoButton";


/** برچسب فارسی سری‌های نمودار روند (B.۱ — ملکا-شورا-۱۴۰۵-۰۱۸) */
const SERIES_FA: Record<string, string> = {
  sale: "مبایعه‌نامه (شامل پیش‌فروش)",
  rent: "اجاره (شامل تمدید)",
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
    // P6547/گام سوم-۴ — شعبهٔ مشاور در هر سهم (قالب «سراج میزانی ارتش ۲۵٪» — شعبه از سامانهٔ PM)
    shares: { name: string; branch?: string | null; unitPercent: number; confirmation: string }[];
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
  // ---- PN-020/گام اول-ج۱ — ستون‌های تازه از صورت‌وضعیت خام ARM ----
  /** عنوان ملک معامله‌شده (property.title — پوشش ۱۰۰٪) */
  propertyTitle: string | null;
  /** آدرس ملک (tooltip ستون عنوان ملک) */
  propertyAddress: string | null;
  /** وضعیت معامله در مبدأ (کلید خام — برچسب/رنگ در UI از txStatusLabel/valueSoftClass) */
  txStatus: string | null;
  /** تاریخ سند رسمی (contractSanadDate — ISO) */
  sanadDate: string | null;
  /** حق‌الزحمه (کمیسیون) کل قرارداد — تومان */
  comisionOfContract: number | null;
  /** مالیات قرارداد — تومان (tooltip ستون حق‌الزحمه) */
  taxOfContract: number | null;
  /** خلاصهٔ شرایط پرداخت (نقد/چک طرفین) */
  paymentTerms: {
    buyerCashCount: number;
    buyerCashTotal: number;
    sellerCashCount: number;
    sellerCashTotal: number;
    buyerChequeCount: number;
    sellerChequeCount: number;
  } | null;
  /** جدول کامل پرداخت‌ها برای سند قرارداد */
  paymentSchedule: {
    buyerCash: { amount: number; date: string | null; trackingNumber: string | null }[];
    sellerCash: { amount: number; date: string | null; trackingNumber: string | null }[];
    buyerChequeCount: number;
    sellerChequeCount: number;
    janebiPrice: number | null;
    edariPrice: number | null;
    serviceDong: number | null;
  } | null;
}

interface Summary {
  totalCount: number;
  hasRequestEvent: number;
  hasSuggestedProperty: number;
  hasBoth: number;
  withHolo: number;
  withRequest: number;
}

/**
 * فیلترها — contractTypes آرایه است (multi-select نوع قرارداد — D.۱؛
 * تهی = همه). اعمال خودکار با debounce ۳۰۰ms (BLOCK F).
 */
const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  propertyCode: "",
  requestCode: "",
  contractHolo: "",
  expertName: "",
  personnelCode: "",
  // P6530/گام ۳ (بند ۲) — فیلتر تمام ستون‌ها: فروشنده/خریدار/قیمت/فایل قرارداد
  sellerName: "",
  buyerName: "",
  priceFrom: "",
  priceTo: "",
  // PN-011 ثالثاً — فایل قرارداد چندانتخابی چیپی (همانند دسته‌بندی): [] = همه · ["yes"] = دارد · ["no"] = ندارد
  hasContracts: [] as string[],
  contractTypes: [] as string[],
};

type Filters = typeof EMPTY_FILTERS;

/** پاسخ کامل روت معاملات — شیء یگانه داده هوک */
interface TxResponse {
  rows: TxRow[];
  total: number;
  summary: Summary;
  dataSource: DataSourceInfo;
}

const EMPTY_RESPONSE: TxResponse = { rows: [], total: 0, summary: null as unknown as Summary, dataSource: null as unknown as DataSourceInfo };

export function TransactionsTab({ sortBy, showCharts, updateSection, syncDoneSignal, tenantId }: { sortBy: string; showCharts: boolean; updateSection?: React.ReactNode; syncDoneSignal?: number; tenantId?: "tabriz" | "melketun" }) {
  // PN-009 مرحله E — لحن‌های معنایی از رجیستری: مبایعه‌نامه=سبز، اجاره=بنفش (هم‌خانوادهٔ چیپ/ستون)
  const saleTone = valueIconPair("مبایعه‌نامه");
  const rentTone = valueIconPair("اجاره");
  const saleChartVar = valueChartVar("مبایعه‌نامه");
  const rentChartVar = valueChartVar("اجاره");
  const { toast } = useToast();
  const isMobile = useIsMobile();
  // B.۱ (ملکا-شورا-۱۴۰۵-۰۱۷) — فیلترها در موبایل جمع‌شونده؛ در دسکتاپ همیشه باز
  const [filtersOpen, setFiltersOpen] = useState(
    // قانون ۰۳۵-B/ت-۵: آکاردئون در موبایل (پیش‌فرض بسته) · همیشه باز در دسکتاپ
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
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
    // P6530/گام ۳ — فیلترهای تمام ستون‌ها
    if (applied.sellerName) params.set("sellerName", applied.sellerName);
    if (applied.buyerName) params.set("buyerName", applied.buyerName);
    if (applied.priceFrom) params.set("priceFrom", applied.priceFrom);
    if (applied.priceTo) params.set("priceTo", applied.priceTo);
    // PN-011 ثالثاً — فایل قرارداد چیپی: فقط وقتی «دقیقاً یک» گزینه انتخاب شده فیلتر می‌شود (هر دو = همه)
    if (applied.hasContracts.length === 1) params.set("hasContract", applied.hasContracts[0]);
    // BLOCK D — نوع قرارداد چندگانه: ?contractType=…&contractType=… (تهی = همه)
    for (const t of applied.contractTypes) params.append("contractType", t);
    // P6525 — قانون فهرست: تمام ردیف‌ها بدون محدودیت (سقف گارد ایمنی سرور)
    params.set("limit", "25000");
    params.set("offset", "0");
    params.set("sortBy", sortBy);
    params.set("sortDir", "desc");
    // PN-044/فاز ۴ — فیلتر چند-مستأجری: داشبورد ملکتون فقط دادهٔ ملکتون می‌بیند
    params.set("tenantId", tenantId ?? "tabriz");

    const res = await api<TxResponse>(`/api/crm/transactions?${params.toString()}`);
    return res;
  }, [applied, sortBy, tenantId]);

  const { data, loading, reload } = useTileData(fetchTransactions, {
    errorTitle: "خطا در دریافت معاملات",
    errorValue: (prev) => (prev ? { ...prev, rows: [] } : { ...EMPTY_RESPONSE }),
  });

  // PN-020/گام اول-ج۲ — بارگذاری خودکار پس از پایان بروزرسانی پس‌زمینه:
  // سیگنال شمارنده‌ای از والد (صفحهٔ کاشی) — هر تغییر (۱→۲→…) فهرست را تازه می‌کند.
  // مقدار ۰ اولیه نادیده گرفته می‌شود (بار اول خود useTileData می‌کشد).
  // (ترمیم لینت: به‌روزرسانی ref در رندر ممنوع — به اثرِ پس از رندر منتقل شد؛ رفتار یکسان)
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);
  useEffect(() => {
    if (syncDoneSignal && syncDoneSignal > 0) void reloadRef.current();
  }, [syncDoneSignal]);

  const rows = data?.rows ?? null;
  const summary = data?.summary ?? null;
  // P6546/گام سوم-۳ — پیام «استخراج زنده...در دسترس نیست» حذف شد؛ دادهٔ کش‌شده سالم سرو می‌شود
  const total = data?.total ?? 0;

  // P6.5-15 (A.۱) — سری ماهانهٔ سه‌سری با منطق خانواده‌ای:
  // مبایعه‌نامه (شامل پیش‌فروش) / اجاره (شامل تمدید) / مجموع (فروردین ۱۴۰۴ → ماه جاری)
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

  // P6.5-15 — شمارش خانواده‌ها برای KPI (از classifyContract — مبایعه+پیش‌فروش / اجاره+تمدید / ثبت‌نشده)
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

  // P6.5-15 (C.۱) — کارشناسان برتر سه‌ستونی (۱۰ نفر هر ستون — فقط نام + تعداد)
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
  /** تغییر انتخاب یک گزینهٔ نوع قرارداد (multi-select — D.۱) */
  const toggleContractKind = (value: string) =>
    setFilters((f) => ({
      ...f,
      contractTypes: f.contractTypes.includes(value)
        ? f.contractTypes.filter((v) => v !== value)
        : [...f.contractTypes, value],
    }));

  // BLOCK F (ملکا-شورا-۱۴۰۵-۰۱۸) — اعمال خودکار فیلترها با debounce ۳۰۰ms؛
  // تغییر نکردن مقدار ⇒ همان مرجع قبلی ⇒ واکشی مجدد نمی‌شود.
  useEffect(() => {
    const id = setTimeout(() => {
      setApplied((prev) => (JSON.stringify(prev) === JSON.stringify(filters) ? prev : filters));
    }, 300);
    return () => clearTimeout(id);
  }, [filters]);

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
      // PN-020/گام اول-ج — مشخصات ملک + شرایط مالی قرارداد (شاهکار)
      property: { title: t.propertyTitle, address: t.propertyAddress },
      sanadDate: t.sanadDate,
      txStatusLabel: txStatusLabel(t.txStatus),
      comisionOfContract: t.comisionOfContract,
      taxOfContract: t.taxOfContract,
      paymentSchedule: t.paymentSchedule,
    });
    setContractOpen(true);
  };

  // قانون ۰۳۵-B/ج-۸ — کشیدن برای تازه‌سازی
  const { ptrRef, refreshing: ptrSpinning } = usePullToRefresh(() => void fetchTransactions());

  return (
    <div className="space-y-6">
      <PtrIndicator innerRef={ptrRef} spinning={ptrSpinning} />
      {/* شاخص‌های چهارجانی — P6.5-15: کل / مبایعه‌نامه (با پیش‌فروش) / اجاره (با تمدید) / بدون قرارداد */}
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
            label="مبایعه‌نامه (شامل پیش‌فروش)"
            value={faNumber(typeCounts.sale)}
            icon={Home}
            iconAs="div"
            iconWrapperClassName={saleTone.wrapper}
            iconColorClassName={saleTone.icon}
          />
          <KpiCard
            label="اجاره (شامل تمدید)"
            value={faNumber(typeCounts.rent)}
            icon={TrendingUp}
            iconAs="div"
            iconWrapperClassName={rentTone.wrapper}
            iconColorClassName={rentTone.icon}
          />
          <KpiCard
            label="بدون قرارداد ثبت‌شده"
            value={faNumber(typeCounts.other)}
            icon={Percent}
            iconAs="div"
            iconWrapperClassName="bg-muted"
            iconColorClassName="text-muted-foreground"
          />
        </div>
      )}

      {/* نمودار روند سه‌سری (B.۱ — منطق خانواده‌ای) + کارشناسان برتر (C.۱ — فقط نام + تعداد) */}
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
                  <Line type="monotone" dataKey="sale" stroke={saleChartVar} strokeWidth={2} dot={{ r: 2.5, fill: saleChartVar }} />
                  <Line type="monotone" dataKey="rent" stroke={rentChartVar} strokeWidth={2} dot={{ r: 2.5, fill: rentChartVar }} />
                  <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={3.5} dot={{ r: 3.5, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {/* سه ستون کارشناسان برتر (C.۱) — فقط نام کارشناس + تعداد؛ مرتب‌سازی نزولی */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" aria-hidden /> کارشناسان برتر بر اساس تعداد معاملات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {([
                  ["مبایعه‌نامه", topExperts.sale, `${saleTone.wrapper} ${saleTone.icon}`],
                  ["اجاره", topExperts.rent, `${rentTone.wrapper} ${rentTone.icon}`],
                  ["مجموع", topExperts.total, "bg-primary/10 text-primary"],
                ] as const).map(([title, list, toneClass]) => (
                  <div key={title} className="min-w-0">
                    <div className={`text-center text-[11px] font-bold rounded-md py-1 mb-2 ${toneClass}`}>۱۰ برتر — {title}</div>
                    {list.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">معامله‌ای با مشاور ثبت‌شده نیست</p>
                    ) : (
                      <ol className="space-y-1">
                        {list.map((e, i) => (
                          <li key={`${title}-${e.name}`} className="flex items-center justify-between gap-1 border-b border-border/40 pb-0.5">
                            {/* C.۱ — فقط نام + تعداد (نه کد پرسنلی، نه چیز دیگر) */}
                            <span className="truncate" title={e.name}>
                              <span className="text-muted-foreground text-[10px] ml-0.5">{faNumber(i + 1)}.</span> {e.name}
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

      {/* P6546/گام پنجم-الف-۲ — جدول پوشش اطلاعات فهرست (تمام ستون‌های فهرست معاملات)
          ترتیب الزامی: بینش‌ها → جداول و نمودارها → پوشش → بروزرسانی → فیلتر → فهرست */}
      <TileCoverageTable tileKey="m3" accentClass="text-sec-m3-700" />

      {/* P6546/گام سوم + گام پنجم-الف-۳ — بخش بروزرسانی (از صفحه به همین‌جا منتقل شد:
          بعد از جداول/نمودارها و پوشش، قبل از فیلتر و فهرست) */}
      {updateSection}

      {/* فیلترها — B.۱ (۰۱۷): بالای فهرست · موبایل جمع‌شونده · دسکتاپ همیشه باز
          BLOCK F (۰۱۸): پاک‌کردن در بالای کارت + اعمال خودکار debounce ۳۰۰ms + نشانگر جستجو */}
      <Card id="m3-filters-card">
        <CardHeader className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" aria-hidden /> فیلترهای فهرست معاملات
            </CardTitle>
            {/* BLOCK F — دکمهٔ «پاک کردن فیلترها» در بالای کارت فیلتر */}
            <Button
              type="button"
              id="m3-clear-filters"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px] mr-auto"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden /> پاک کردن فیلترها
            </Button>
            {/* BLOCK F — نشانگر «در حال جستجو…» در طول فراخوانی */}
            {loading ? (
              <span id="m3-searching" className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در حال جستجو…
              </span>
            ) : null}
            {isMobile ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-controls="m3-filters-form">
                <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} aria-hidden />
                {filtersOpen ? "بستن" : "باز کردن"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {(!isMobile || filtersOpen) && (
        <CardContent>
          {/* PN-028/خامساً-ف (دستور مالک) — فیلدهای متنی دوتایی: هر ردیف دو فیلد روبروهم */}
          <form
            id="m3-filters-form"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
              {/* رفع F1 — placeholder با ارقام لاتین (عین شکل DB)؛ ورودی فارسی هم سمت سرور نرمال می‌شود */}
              <Input id="f-propertyCode" placeholder="نمونه: 12345" value={filters.propertyCode} onChange={(e) => setF("propertyCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-requestCode">کد درخواست</Label>
              <Input id="f-requestCode" placeholder="نمونه: 6789" value={filters.requestCode} onChange={(e) => setF("requestCode", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-contractHolo">شماره هولوگرام</Label>
              <Input id="f-contractHolo" placeholder="نمونه: 98765" value={filters.contractHolo} onChange={(e) => setF("contractHolo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-expertName">نام کارشناس</Label>
              <Input id="f-expertName" placeholder="نمونه: بابایان" value={filters.expertName} onChange={(e) => setF("expertName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-personnelCode">کد پرسنلی کارشناس</Label>
              <Input id="f-personnelCode" placeholder="نمونه: 410031320" value={filters.personnelCode} onChange={(e) => setF("personnelCode", e.target.value)} />
            </div>
            {/* P6530/گام ۳ — فروشنده (ستون ۴): نام یا موبایل */}
            <div className="space-y-1.5">
              <Label htmlFor="f-sellerName">فروشنده (نام یا موبایل)</Label>
              <Input id="f-sellerName" placeholder="نمونه: علی محمدی یا ۰۹۱۴…" value={filters.sellerName} onChange={(e) => setF("sellerName", e.target.value)} />
            </div>
            {/* P6530/گام ۳ — خریدار (ستون ۶): نام یا موبایل */}
            <div className="space-y-1.5">
              <Label htmlFor="f-buyerName">خریدار (نام یا موبایل)</Label>
              <Input id="f-buyerName" placeholder="نمونه: رضا کریمی یا ۰۹۱۴…" value={filters.buyerName} onChange={(e) => setF("buyerName", e.target.value)} />
            </div>
            {/* P6546/گام پنجم-ت-۴ — قیمت (از/تا روبروهم — ستون «قیمت») */}
            <div className="space-y-1.5">
              <Label>قیمت (تومان)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input id="f-priceFrom" aria-label="قیمت از (تومان)" inputMode="numeric" placeholder="از ۹،۰۰۰،۰۰۰،۰۰۰" value={filters.priceFrom} onChange={(e) => setF("priceFrom", e.target.value)} className="text-[11px] font-bold" />
                <Input id="f-priceTo" aria-label="قیمت تا (تومان)" inputMode="numeric" placeholder="تا ۱۲،۰۰۰،۰۰۰،۰۰۰" value={filters.priceTo} onChange={(e) => setF("priceTo", e.target.value)} className="text-[11px] font-bold" />
              </div>
            </div>
            {/* فایل قرارداد — PN-011 ثالثاً: چیپ چندانتخابی (همانند دسته‌بندی — دستور مالک) */}
            <div className="space-y-1.5">
              <span id="f-hasContract-label" className="text-xs font-bold text-foreground/80">فایل قرارداد (چندانتخابی)</span>
              <div role="group" aria-labelledby="f-hasContract-label" className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="دارد"
                  active={filters.hasContracts.includes("yes")}
                  onToggle={() => setFilters((f) => ({ ...f, hasContracts: f.hasContracts.includes("yes") ? f.hasContracts.filter((v) => v !== "yes") : [...f.hasContracts, "yes"] }))}
                  title="معامله‌های دارای فایل/متن قرارداد"
                  softClass={valueSoftClass("مبایعه‌نامه")}
                  solidClass={valueSolidClass("مبایعه‌نامه")}
                />
                <FilterChip
                  label="ندارد"
                  active={filters.hasContracts.includes("no")}
                  onToggle={() => setFilters((f) => ({ ...f, hasContracts: f.hasContracts.includes("no") ? f.hasContracts.filter((v) => v !== "no") : [...f.hasContracts, "no"] }))}
                  title="معامله‌های بدون فایل قرارداد"
                  softClass={valueSoftClass("تعیین نشده")}
                  solidClass={valueSolidClass("تعیین نشده")}
                />
              </div>
            </div>
            {/* BLOCK D — نوع قرارداد: دقیقاً ۵ گزینهٔ چندانتخابی (۴ نوع + بدون قرارداد) — PN-009: چیپ یکدست مشترک */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <span id="m3-contract-kind-label" className="text-xs font-bold text-foreground/80">نوع قرارداد (چندانتخابی)</span>
              <div id="m3-contract-kind-filters" role="group" aria-labelledby="m3-contract-kind-label" className="flex flex-wrap gap-1.5">
                {CONTRACT_KIND_FILTER_VALUES.map((value) => (
                  <FilterChip
                    key={value}
                    label={CONTRACT_KIND_FILTER_LABELS[value]}
                    active={filters.contractTypes.includes(value)}
                    onToggle={() => toggleContractKind(value)}
                    softClass={valueSoftClass(value)}
                    solidClass={valueSolidClass(value)}
                  />
                ))}
              </div>
              {filters.contractTypes.length > 0 ? (
                <p className="text-[10px] text-muted-foreground">{faNumber(filters.contractTypes.length)} گزینهٔ فعال — اعمال خودکار</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">بدون انتخاب = همهٔ انواع</p>
              )}
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
              <Button type="submit" className="gap-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                اعمال فیلتر
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

      {/* جدول فهرست معاملات — BLOCK E (ملکا-شورا-۱۴۰۵-۰۱۸): ترتیب دقیق ۱۱ ستون؛
          کد ملک/کد درخواست فقط کد (دستور ۱ و ۲ مالک)؛ بدون صفحه‌بندی (تک‌صفحه‌ای) */}
      <Card>
        {/* P6525 — قانون فهرست: عنوان فهرست وسط‌چین */}
        {/* PN-028/خامساً-ب (دستور مالک) — چیدمان الزامی سربرگ فهرست:
            ردیف ۱: عنوان «فهرست معاملات» وسط‌چین · ردیف ۲: اکسل کل فهرست + بارگذاری اکسل */}
        <CardHeader className="py-4 flex flex-col items-center gap-2">
          <CardTitle className="text-base text-center">فهرست معاملات</CardTitle>
          <div className="w-full flex items-center justify-between gap-3 flex-wrap">
            {/* PN-002 گام ۶-۲ — خروجی اکسل کل فهرست */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-[11px]"
              onClick={() => {
                apiBlob("/api/crm/export/transactions")
                  .then((blob) => {
                    downloadBlob(blob, `melka-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`);
                    toast({ title: "خروجی اکسل آماده شد", description: "کل فهرست معاملات دانلود شد." });
                  })
                  .catch((e) => toast({ title: "خروجی اکسل ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" }));
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden /> اکسل کل فهرست
            </Button>
            {/* PN-003 گام ۴-۲ — بارگذاری اکسل کل فهرست (ایمپورت) */}
            <ExcelImportButton entity="transactions" compact onImported={() => void fetchTransactions()} />
          </div>
          {rows && rows.length > 0 && (
            <Badge variant="secondary">{faNumber(rows.length)} ردیف — تک‌صفحه‌ای</Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {rows === null ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            // BLOCK F — حالت خالی طراحی‌شده (قانون ۰۳۵-B/ج-۴)
            <div id="m3-empty-state">
              <EmptyState
                hasFilters={Boolean(
                  filters.dateFrom || filters.dateTo || filters.propertyCode || filters.requestCode ||
                  filters.contractHolo || filters.expertName || filters.personnelCode ||
                  filters.sellerName || filters.buyerName || filters.priceFrom || filters.priceTo ||
                  filters.hasContracts.length > 0 || filters.contractTypes.length > 0
                )}
                onClearFilters={() => {
                  setFilters(EMPTY_FILTERS);
                  setApplied(EMPTY_FILTERS);
                }}
              />
              {/* PN-046/گام اول-۱ — صداقت ملکتون: ماژول معاملات در CRM برای این حساب در دسترس نیست */}
              {tenantId === "melketun" && (
                <p className="text-[11px] text-muted-foreground leading-relaxed text-center px-4 pb-3">
                  فهرست معاملات ملکتون: ماژول معاملات در CRM ملکتون برای حساب جاری در دسترس نیست (کشف PN-044) —
                  در انتظار تصمیم مالک برای دسترسی admin در CRM. داده‌های ملک تبریز دست‌نخورده‌اند.
                </p>
              )}
            </div>
          ) : (
            <Table>
                <TableHeader>
                  <TableRow>
                    {/* ترتیب الزامی E.۱ — ۱۶ ستون (۱۱ اصلی + ۵ تازهٔ PN-020/گام اول-ج) */}
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead>تاریخ معامله</TableHead>
                    {/* ۳ — کد ملک: فقط کد (E.۲ — دستور ۱ مالک) */}
                    <TableHead className="min-w-24">
                      <span className="inline-flex items-center gap-1"><Home className="w-3.5 h-3.5" aria-hidden /> کد ملک</span>
                    </TableHead>
                    {/* ۳-ب — عنوان ملک (PN-020/گام اول-ج — property.title صورت‌وضعیت، پوشش ۱۰۰٪) */}
                    <TableHead className="min-w-40">عنوان ملک</TableHead>
                    {/* ۴ — فروشنده: نام + موبایل زیر نام (E.۴) */}
                    <TableHead className="min-w-40">فروشنده</TableHead>
                    {/* ۵ — کد درخواست: فقط کد (E.۳ — دستور ۲ مالک) */}
                    <TableHead className="min-w-24">
                      <span className="inline-flex items-center gap-1"><Inbox className="w-3.5 h-3.5" aria-hidden /> کد درخواست</span>
                    </TableHead>
                    {/* ۶ — خریدار: نام + موبایل زیر نام (E.۵) */}
                    <TableHead className="min-w-40">خریدار</TableHead>
                    {/* ۷ — نوع قرارداد */}
                    <TableHead>نوع قرارداد</TableHead>
                    {/* ۸ — مبلغ قرارداد (با کاما) */}
                    <TableHead className="min-w-40">قیمت</TableHead>
                    {/* ۸-ب — شرایط پرداخت (PN-020/گام اول-ج — شاهکار: نقد/چک طرفین) */}
                    <TableHead className="min-w-36">شرایط پرداخت</TableHead>
                    {/* ۸-پ — تاریخ سند (contractSanadDate — پوشش ۱۰۰٪) */}
                    <TableHead>تاریخ سند</TableHead>
                    {/* ۸-ت — وضعیت معامله (رنگی از رجیستری) */}
                    <TableHead className="min-w-28">وضعیت معامله</TableHead>
                    {/* ۹ — تجمیع حق‌السهم مشاوران (نام + درصد) */}
                    <TableHead className="min-w-48">تجمیع حق‌السهم مشاوران</TableHead>
                    {/* ۹-ب — حق‌الزحمه (کمیسیون + مالیات در tooltip) */}
                    <TableHead className="min-w-32">حق‌الزحمه</TableHead>
                    {/* ۱۰ — شماره هولوگرام */}
                    <TableHead>شماره هولوگرام</TableHead>
                    {/* ۱۱ — فایل قرارداد */}
                    <TableHead className="min-w-32">فایل قرارداد</TableHead>
                    {/* ۱۲ — اطلاعات (PN-046/گام اول-۲: ستون اطلاعات در تمامی فهرست‌ها — فایل متنی کامل هر کد)
                        ⚠ قانون ساختاری (دستور مالک/گام اول-۳): ستون «اطلاعات» همیشه آخرین ستون این فهرست است —
                        هر ستون جدیدی در آینده باید «قبل از» همین ستون افزوده شود. سنجاق چپ (RTL) — همیشه قابل‌رویت. */}
                    <TableHead className="w-24">اطلاعات</TableHead>
                  </TableRow>
                </TableHeader>
                {/* P6527 — رندر پنجره‌ای: تمام ردیف‌ها در یک اسکرول، فقط دیدنی‌ها در DOM */}
                <TableBodyVirtual rows={rows} rowKey={(t) => t.id}>
                  {(t, i) => {
                    const kind = classifyContract(t.contractType).kind;
                    return (
                    <TableRow key={t.id} className="hover:bg-muted/40">
                      {/* ۱ — ردیف */}
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                          {faNumber(i + 1)}
                        </span>
                      </TableCell>
                      {/* ۲ — تاریخ معامله (جلالی) */}
                      <TableCell className="whitespace-nowrap text-xs font-medium">{faJalaliShort(t.contractDate)}</TableCell>
                      {/* ۳ — کد ملک: فقط کد — بدون نام و موبایل (E.۲؛
                          مالک = فروشنده و در ستون فروشنده می‌آید) */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <code className="font-mono font-semibold" dir="ltr">{faDigits(t.propertyCode)}</code>
                      </TableCell>
                      {/* ۳-ب — عنوان ملک (PN-020/گام اول-ج — عین عنوان ثبت‌شده در سامانه؛ آدرس کامل در tooltip) */}
                      <TableCell className="whitespace-normal max-w-48">
                        {t.propertyTitle ? (
                          <span
                            className="text-[11px] font-medium leading-relaxed"
                            title={t.propertyAddress ? `${t.propertyTitle}\n${t.propertyAddress}` : t.propertyTitle}
                          >
                            {t.propertyTitle}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>
                      {/* ۴ — فروشنده: نام + موبایل زیر نام (E.۴ — fallback به مالک در لایهٔ غنی‌سازی) */}
                      <TableCell className="whitespace-normal">
                        {t.sellerName ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="truncate max-w-40 font-medium" title={t.sellerName}>{t.sellerName}</span>
                            {t.sellerMobile ? (
                              <a href={`tel:${t.sellerMobile}`} dir="ltr" className="font-mono text-[11px] text-primary hover:underline w-fit" title={`تماس با فروشنده: ${t.sellerMobile}`}>
                                {faDigits(t.sellerMobile)}
                              </a>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">موبایل ثبت‌نشده</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">در انتظار غنی‌سازی</span>
                        )}
                      </TableCell>
                      {/* ۵ — کد درخواست: فقط کد — بدون نام و موبایل (E.۳؛
                          درخواست‌دهنده = خریدار و در ستون خریدار می‌آید) */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {t.requestCode ? (
                          <code className="font-mono font-semibold" dir="ltr">{faDigits(t.requestCode)}</code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* ۶ — خریدار: نام + موبایل زیر نام (E.۵ — fallback به درخواست‌دهنده در لایهٔ غنی‌سازی) */}
                      <TableCell className="whitespace-normal">
                        {t.buyerName ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="truncate max-w-40 font-medium" title={t.buyerName}>{t.buyerName}</span>
                            {t.buyerMobile ? (
                              <a href={`tel:${t.buyerMobile}`} dir="ltr" className="font-mono text-[11px] text-primary hover:underline w-fit" title={`تماس با خریدار: ${t.buyerMobile}`}>
                                {faDigits(t.buyerMobile)}
                              </a>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">موبایل ثبت‌نشده</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">در انتظار غنی‌سازی</span>
                        )}
                      </TableCell>
                      {/* ۷ — نوع قرارداد: یکی از چهار نوع یا «بدون قرارداد» (classifyContract) */}
                      <TableCell className="text-xs whitespace-nowrap">
                        {kind !== "ثبت‌نشده" ? (
                          <Badge variant="secondary" className={`text-[11px] border-0 ${valueSoftClass(kind)}`}>{kind}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">— بدون قرارداد</span>
                        )}
                      </TableCell>
                      {/* ۸ — قیمت (P6546/گام پنجم-ت-۴: قالب ۹،۰۰۰،۰۰۰،۰۰۰ بدون واحد) */}
                      <TableCell className="text-xs whitespace-nowrap font-semibold">
                        {t.contractAmount !== null ? (
                          faAmountFull(t.contractAmount, "")
                        ) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </TableCell>
                      {/* ۸-ب — شرایط پرداخت (PN-020/گام اول-ج — شاهکار ستون تازه):
                          خلاصهٔ نقد/چک طرفین از صورت‌وضعیت خام؛ جزئیات کامل در فایل قرارداد */}
                      <TableCell className="whitespace-nowrap">
                        {t.paymentTerms ? (
                          <span
                            className="inline-flex flex-col items-center gap-0.5 text-[10px] leading-tight"
                            title={[
                              t.paymentTerms.buyerCashCount > 0 ? `نقدی خریدار: ${faNumber(t.paymentTerms.buyerCashCount)} فقره — ${faAmountFull(t.paymentTerms.buyerCashTotal)}` : null,
                              t.paymentTerms.sellerCashCount > 0 ? `نقدی فروشنده: ${faNumber(t.paymentTerms.sellerCashCount)} فقره — ${faAmountFull(t.paymentTerms.sellerCashTotal)}` : null,
                              t.paymentTerms.buyerChequeCount > 0 ? `چک خریدار: ${faNumber(t.paymentTerms.buyerChequeCount)} فقره` : null,
                              t.paymentTerms.sellerChequeCount > 0 ? `چک فروشنده: ${faNumber(t.paymentTerms.sellerChequeCount)} فقره` : null,
                              (t.paymentSchedule?.janebiPrice ?? 0) > 0 ? `قیمت جنبی: ${faAmountFull(t.paymentSchedule!.janebiPrice!)}` : null,
                              (t.paymentSchedule?.serviceDong ?? 0) > 0 ? `دنگ خدمات: ${faAmountFull(t.paymentSchedule!.serviceDong!)}` : null,
                            ].filter(Boolean).join("\n")}
                          >
                            {t.paymentTerms.buyerCashCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300" title="پرداخت‌های نقدی خریدار">
                                <Banknote className="w-3 h-3" aria-hidden /> خریدار {faNumber(t.paymentTerms.buyerCashCount)} فقره
                              </span>
                            )}
                            {t.paymentTerms.sellerCashCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300" title="پرداخت‌های نقدی فروشنده">
                                <Banknote className="w-3 h-3" aria-hidden /> فروشنده {faNumber(t.paymentTerms.sellerCashCount)} فقره
                              </span>
                            )}
                            {(t.paymentTerms.buyerChequeCount > 0 || t.paymentTerms.sellerChequeCount > 0) && (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300" title="چک‌های صادره طرفین">
                                <FileCheck2 className="w-3 h-3" aria-hidden /> چک {faNumber(t.paymentTerms.buyerChequeCount + t.paymentTerms.sellerChequeCount)} فقره
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">ثبت نشده</span>
                        )}
                      </TableCell>
                      {/* ۸-پ — تاریخ سند (contractSanadDate — تاریخ تنظیم سند رسمی) */}
                      <TableCell className="text-xs whitespace-nowrap font-medium">
                        {t.sanadDate ? faJalaliShort(t.sanadDate) : <span className="text-muted-foreground font-normal">—</span>}
                      </TableCell>
                      {/* ۸-ت — وضعیت معامله (رنگی از رجیستری — تکمیل=سبز · فسخ=سرخ · انتظار=کهربایی) */}
                      <TableCell className="whitespace-nowrap">
                        {(() => { const label = txStatusLabel(t.txStatus); return label ? (
                          <Badge variant="secondary" className={`text-[10px] border-0 ${valueSoftClass(label)}`} title={`وضعیت در سامانه ملک تبریز: ${t.txStatus}`}>
                            {label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        ); })()}
                      </TableCell>
                      {/* ۹ — تجمیع حق‌السهم مشاوران — نام + شعبه + درصد (P6547/گام سوم-۴: قالب «سراج میزانی ارتش ۲۵٪») */}
                      <TableCell className="whitespace-normal">
                        {t.consultantsShareSummary && t.consultantsShareSummary.shares.length > 0 ? (
                          <div className="flex flex-col items-center gap-1 min-w-44">
                            <Badge className="bg-muted/70 text-foreground text-[11px] gap-1 w-fit border border-border">
                              <Users className="w-3 h-3" aria-hidden /> {faNumber(t.consultantsShareSummary.count)} مشاور — {faPercent(t.consultantsShareSummary.totalPercent)}
                            </Badge>
                            <ul className="text-muted-foreground text-[10px] leading-relaxed space-y-0.5">
                              {t.consultantsShareSummary.shares.slice(0, 4).map((s, idx) => (
                                <li key={`${s.name}-${idx}`} className="flex flex-wrap items-center justify-center gap-1">
                                  <span className="truncate max-w-28 font-medium text-foreground" title={s.name}>{s.name}</span>
                                  {/* P6547 — شعبهٔ مشاور از سامانهٔ PM (branchId.title) */}
                                  {s.branch ? (
                                    <Badge variant="outline" className={`h-4 px-1 text-[9px] border-0 ${branchBadgeClass(s.branch)}`} title={`شعبهٔ ${s.branch} — از سامانهٔ PM`}>{s.branch}</Badge>
                                  ) : null}
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
                      {/* ۹-ب — حق‌الزحمه (PN-020/گام اول-ج — comisionOfContract؛ مالیات در tooltip) */}
                      <TableCell className="text-xs whitespace-nowrap font-semibold">
                        {t.comisionOfContract !== null && t.comisionOfContract > 0 ? (
                          <span
                            title={[
                              `حق‌الزحمه (کمیسیون) قرارداد: ${faAmountFull(t.comisionOfContract)}`,
                              t.taxOfContract !== null && t.taxOfContract > 0 ? `مالیات قرارداد: ${faAmountFull(t.taxOfContract)}` : null,
                            ].filter(Boolean).join("\n")}
                          >
                            {faAmountFull(t.comisionOfContract, "")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-normal">—</span>
                        )}
                      </TableCell>
                      {/* ۱۰ — شماره هولوگرام (متن) */}
                      <TableCell className="text-xs font-mono whitespace-nowrap" dir="rtl">
                        {t.contractHolo ? (
                          <span className="inline-flex items-center gap-1.5">
                            <FileCheck2 className="w-3.5 h-3.5 text-primary" aria-hidden />
                            {faDigits(t.contractHolo)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* ۱۱ — فایل قرارداد (دکمهٔ PDF) */}
                      <TableCell className="text-xs">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-[11px] px-2"
                          onClick={() => openContractDoc(t)}
                          title="مشاهده و دانلود فایل قرارداد (تولیدی از داده‌های سامانه ملک تبریز)"
                        >
                          <FileText className="w-3.5 h-3.5 text-primary" aria-hidden />
                          {t.contractType || t.agency ? "مشاهده و دانلود" : "مشاهده سند"}
                        </Button>
                      </TableCell>
                      {/* ۱۲ — اطلاعات: همیشه آخرین سلول (قانون ساختاری گام اول-۳) — فایل متنی کامل */}
                      <TableCell>
                        <InfoButton tenant={tenantId ?? "tabriz"} type="transaction" code={t.propertyCode} />
                      </TableCell>
                    </TableRow>
                    );
                  }}
                </TableBodyVirtual>
              </Table>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ فایل قرارداد (بند ت) */}
      <ContractFileDialog open={contractOpen} onOpenChange={setContractOpen} data={contractDoc} />
    </div>
  );
}
