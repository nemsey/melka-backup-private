"use client";

/**
 * کاشی «درخواست ملک تبریز» — صفحه داخلی (P6.5-10 + P6521/M2 + P6530/گام ۲)
 * ------------------------------------------------------
 * فهرست ده‌ستونی عین دستور مالک (گام ۲ — بند الف):
 *   ردیف · کد درخواست · کارشناس · شعبه · متقاضی (نام + موبایل زیر نام) ·
 *   قیمت از...تا... (کاما + تومان) · مناطق (نکته ۲ — فقط نام مناطق؛
 *   >۳ منطقه = فایل مناطق P6526/ب) · دسته‌بندی (خرید/پیش خرید/رهن و اجاره/
 *   مشارکت در ساخت — نکته ۴) · وضعیت (شش‌حالته — نکته ۳) · تاریخ ثبت
 *
 * فیلتر بر اساس تمام ستون‌های فهرست (بند ۲): کد · کارشناس · شعبه ·
 * متقاضی (نام/موبایل) · قیمت از/تا · مناطق · دسته‌بندی · وضعیت ·
 * بازهٔ تاریخ ثبت — همه با نرمال‌سازی ارقام فارسی/عربی/لاتین (P6525)
 *
 * بینش توزیع وضعیت شش‌حالته (بند ۳) — کلیک = فیلتر
 *
 * بخش بروزرسانی (بند ۴): زنجیرهٔ عین سامانه ARM (لایه ۱ فهرست + لایه ۲
 * غنی‌سازی متقاضی/مناطق/قیمت/دسته‌بندی برش‌به‌برش) + تاریخ و ساعت دقیق
 * آخرین بروزرسانی + ادامه از نقطهٔ قطع (گارد پوشش ۲۰٬۳۹۲ منبع — مهم ۳)
 *
 * نکتهٔ بسیار مهم ۴: ستون متقاضی عین الگوی فروشنده/خریدار M3 — نام + موبایل زیر نام
 * رنگ بخش: کهربایی روشن #F59E0B (گام صفر — sec-m2)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, ClipboardList, Users, Phone, RefreshCw, Hash, CheckCircle2,
  Landmark, PieChart, Banknote, Tag, CalendarDays, Network, Filter, MapPinned,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber, faAmountFull } from "@/lib/format";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه
import { normalizeFilterInput } from "@/lib/normalize-input";
// P6530/گام ۲ — وضعیت شش‌حالتهٔ درخواست‌ها
import {
  REQUEST_STATES,
  REQUEST_STATE_BY_KEY,
  classifyRequestStatus,
  requestStatusLabel,
  type RequestStateKey,
} from "@/lib/request-status";
import { TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";
import { AreasFileCell } from "./AreasFileCell";

interface RequestRow {
  id: string;
  requestCode: string;
  title: string | null;
  status: string | null;
  actorName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  tradeTypeName: string | null;
  areaNames: string[];
  branch: string;
  enrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
}

interface Enrichment {
  total: number;
  pending: number;
  complete: number;
}

/** توزیع شش‌حالته (گام ۲ بند ۳ — بینش) */
interface StatusCounts {
  traded: number;
  pendingTrade: number;
  lead: number;
  pendingApproval: number;
  lostToCompetitors: number;
  other: number;
  total: number;
}

/** وضعیت بروزرسانی — checkpoint لایه ۱ (بند ۴.۲) */
interface LastUpdate {
  phase: string;
  lastCompletedPage: number;
  totalPages: number;
  totalAtSource: number;
  updatedAt: string;
  completedAt: string | null;
}

interface RequestsResponse {
  rows: RequestRow[];
  total: number;
  enrichment: Enrichment;
  statusCounts?: StatusCounts;
  lastUpdate?: LastUpdate | null;
}

const EMPTY_FILTERS = {
  code: "",
  realtorName: "",
  branch: "",
  customerName: "",
  priceFrom: "",
  priceTo: "",
  areaName: "",
  dateFrom: "",
  dateTo: "",
};

type Filters = typeof EMPTY_FILTERS;

/** رنگ Badge هر حالت — کلیدواژهٔ بصری ثابت در فیلتر/ستون/بینش */
const STATE_BADGE_CLASS: Record<RequestStateKey, string> = {
  traded: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  pendingTrade: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  lead: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  pendingApproval: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  lostToCompetitors: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  other: "bg-stone-500/15 text-stone-700 dark:text-stone-400 border-stone-500/30",
};

/** دسته‌بندی درخواست‌های ملک تبریز — عین نکته ۴ دستور مالک */
const TRADE_CATEGORIES: readonly string[] = ["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"];

/** حداکثر برش‌های خودکار غنی‌سازی در هر باز شدن کاشی (هر برش = ۲۵ درخواست) */
const MAX_AUTO_SLICES = 10;
const AUTO_SLICE_ROWS = 25;

export function ArmRequestsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  /** وضعیت‌های انتخاب‌شدهٔ فیلتر چندانتخابی (کلیدهای canonical شش‌حالته) */
  const [selectedStates, setSelectedStates] = useState<RequestStateKey[]>([]);
  /** دسته‌بندی‌های انتخاب‌شدهٔ فیلتر چندانتخابی */
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const autoSliceCount = useRef(0);
  const autoSliceBusy = useRef(false);
  const showTitles = settings.showTitles !== false;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    // P6525 — نرمال‌سازی مرکزی
    if (applied.code) params.set("code", normalizeFilterInput(applied.code));
    if (applied.realtorName) params.set("realtorName", normalizeFilterInput(applied.realtorName));
    if (applied.branch) params.set("branch", applied.branch);
    if (applied.customerName) params.set("customerName", normalizeFilterInput(applied.customerName));
    if (applied.areaName) params.set("areaName", normalizeFilterInput(applied.areaName));
    if (applied.priceFrom) params.set("priceFrom", applied.priceFrom);
    if (applied.priceTo) params.set("priceTo", applied.priceTo);
    if (applied.dateFrom) params.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) params.set("dateTo", applied.dateTo);
    // فیلترهای چندانتخابی — اعمال خودکار
    if (selectedStates.length > 0) params.set("states", selectedStates.join(","));
    for (const t of selectedTrades) params.append("tradeType", t);
    try {
      const res = await api<RequestsResponse>(`/api/crm/arm-catalog/requests?${params.toString()}`);
      setData(res);
    } catch {
      setData({ rows: [], total: 0, enrichment: { total: 0, pending: 0, complete: 0 }, lastUpdate: null });
    } finally {
      setLoading(false);
    }
  }, [applied, selectedStates, selectedTrades]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  /** برش خودکار غنی‌سازی — تا MAX_AUTO_SLICES برش در هر باز شدن کاشی
   *  P6527: پس از هر برش فقط شمارنده‌ها به‌روز می‌شود؛ بار کامل فقط پس از آخرین برش */
  const autoEnrichSlice = useCallback(async (): Promise<void> => {
    if (autoSliceBusy.current || autoSliceCount.current >= MAX_AUTO_SLICES) return;
    autoSliceBusy.current = true;
    autoSliceCount.current += 1;
    setEnriching(true);
    try {
      const res = await api<{ enrich?: Array<{ entity: string; enriched: number; remaining: number }> }>(
        "/api/crm/arm-catalog/sync",
        { method: "POST", body: { entity: "requests", mode: "enrich", maxRows: AUTO_SLICE_ROWS } },
      );
      const e = res.enrich?.find((x) => x.entity === "requests");
      if (e) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                enrichment: {
                  total: prev.enrichment.total,
                  complete: Math.min(prev.enrichment.complete + (e.enriched ?? 0), prev.enrichment.total),
                  pending: e.remaining ?? Math.max(0, prev.enrichment.pending - (e.enriched ?? 0)),
                },
              }
            : prev,
        );
        if ((e.remaining ?? 0) === 0) await load();
      }
    } catch {
      /* برش خودکار بهترین-تلاش است — با شکست، حلقه در همین‌جا می‌ایستد */
    } finally {
      setEnriching(false);
      autoSliceBusy.current = false;
    }
  }, [load]);

  // تکمیل خودکار: اگر ردیف در انتظار غنی‌سازی هست، برش بعدی را بی‌صدا پیش ببر
  useEffect(() => {
    if (loading || !data) return;
    if (data.enrichment.pending > 0 && autoSliceCount.current < MAX_AUTO_SLICES) {
      const t = setTimeout(() => void autoEnrichSlice(), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [loading, data, autoEnrichSlice]);

  /** تاگل یک حالت در فیلتر چندانتخابی وضعیت (اعمال خودکار) */
  const toggleState = useCallback((key: RequestStateKey) => {
    setSelectedStates((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  /** تاگل یک دسته‌بندی (اعمال خودکار) */
  const toggleTrade = useCallback((t: string) => {
    setSelectedTrades((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }, []);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api<{ lists: Array<{ fetched: number; totalAtSource: number; ok: boolean }>; enrich?: Array<{ enriched: number; remaining: number }> }>(
        "/api/crm/arm-catalog/sync",
        { method: "POST", body: { entity: "requests", mode: "both", maxRows: 150 } }
      );
      const list = res.lists?.[0];
      toast({
        title: "بروزرسانی درخواست‌ها از سامانه ملک تبریز انجام شد",
        description: list
          ? `${faNumber(list.fetched)} درخواست از مجموع ${faNumber(list.totalAtSource)} درخواست سامانه ARM در این برش خوانده شد و برش غنی‌سازی متقاضی/مناطق/قیمت هم اجرا شد. ادامهٔ بروزرسانی از همان صفحه‌ای که تمام شده بود، ازسر گرفته می‌شود.`
          : "بروزرسانی اجرا شد.",
      });
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بروزرسانی ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [toast, load]);

  const rows = data?.rows ?? [];
  const enrichment = data?.enrichment ?? { total: 0, pending: 0, complete: 0 };
  const statusCounts = data?.statusCounts;
  const lastUpdate = data?.lastUpdate ?? null;
  const coveragePct = enrichment.total > 0 ? Math.round((enrichment.complete / enrichment.total) * 100) : 0;
  const todayCount = rows.filter((r) => r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 86400_000).length;
  const activeRealtors = new Set(rows.map((r) => r.actorName).filter(Boolean)).size;
  const stateFilterActive = selectedStates.length > 0;
  const anyFilterActive =
    stateFilterActive ||
    selectedTrades.length > 0 ||
    Object.values(applied).some((v) => v !== "");

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  /** نمایش بازهٔ قیمت متقاضی: «از ۹،۰۰۰،۰۰۰،۰۰۰ تا ۱۲،۰۰۰،۰۰۰،۰۰۰ تومان» */
  const priceRangeLabel = (r: RequestRow): string | null => {
    if (r.priceFrom === null && r.priceTo === null) return null;
    if (r.priceFrom !== null && r.priceTo !== null) {
      return `${faAmountFull(r.priceFrom, "")} تا ${faAmountFull(r.priceTo)}`;
    }
    if (r.priceFrom !== null) return `از ${faAmountFull(r.priceFrom)}`;
    return `تا ${faAmountFull(r.priceTo!)}`;
  };

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند یادگیرندهٔ مولتی‌بینش */}
      <AgentPanel tileId="arm-requests" />

      {/* شاخص‌ها — رنگ بخش M2 (کهربایی روشن) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل درخواست‌های ملک تبریز" value={loading ? undefined : faNumber(data?.total ?? 0)} icon={ClipboardList} iconWrapperClassName="bg-sec-m2-50" iconColorClassName="text-sec-m2-700" />
        <KpiCard label="اطلاعات متقاضی و مناطق تکمیل‌شده" value={loading ? undefined : `${faNumber(coveragePct)}٪`} sub={loading ? undefined : `${faNumber(enrichment.complete)} از ${faNumber(enrichment.total)}`} icon={Phone} iconWrapperClassName="bg-sec-m2-50" iconColorClassName="text-sec-m2-700" />
        <KpiCard label="درخواست امروز" value={loading ? undefined : faNumber(todayCount)} icon={CalendarDays} iconWrapperClassName="bg-sec-m2-50" iconColorClassName="text-sec-m2-700" />
        <KpiCard label="کارشناسان ثبت‌کننده" value={loading ? undefined : faNumber(activeRealtors)} icon={Users} iconWrapperClassName="bg-sec-m2-50" iconColorClassName="text-sec-m2-700" />
      </div>

      {/* بینش توزیع وضعیت شش‌حالته (گام ۲ بند ۳) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <PieChart className="w-5 h-5 text-sec-m2-700 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-bold">توزیع وضعیت درخواست‌ها (نظام شش‌حالته)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                شمار و درصد درخواست‌های سامانه ARM بر پایهٔ وضعیت‌های شش‌گانهٔ دستور مالک — از کل {statusCounts ? faNumber(statusCounts.total) : faNumber(data?.total ?? 0)} درخواست رجیستری.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" id="arm-request-states-insight">
            {REQUEST_STATES.map((s) => {
              const n = statusCounts?.[s.key] ?? 0;
              const pct = statusCounts && statusCounts.total > 0 ? Math.round((n / statusCounts.total) * 100) : 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleState(s.key)}
                  aria-pressed={selectedStates.includes(s.key)}
                  title={s.hint}
                  className={`rounded-xl border p-2.5 text-start sec-motion ${STATE_BADGE_CLASS[s.key]} ${
                    selectedStates.includes(s.key) ? "ring-2 ring-offset-1 ring-offset-background ring-current" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  <p className="text-[11px] font-medium leading-4">{s.label}</p>
                  <p className="text-base font-extrabold tabular-nums mt-0.5">{statusCounts ? faNumber(n) : "…"}</p>
                  <p className="text-[10px] tabular-nums opacity-80">{statusCounts ? `${faNumber(pct)}٪` : ""}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* بخش بروزرسانی درخواست‌ها (گام ۲ بند ۴) */}
      <Card className="border-sec-m2-200 bg-sec-m2-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardList className="w-5 h-5 text-sec-m2-700 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">بروزرسانی درخواست‌ها از سامانه‌های ملک تبریز</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  فهرست کامل (کد، کارشناس، وضعیت، تاریخ ثبت) از لایهٔ ۱ سامانه ARM؛ نام و موبایل متقاضی و مناطق منتخب و بازهٔ قیمت و دسته‌بندی برش‌به‌برش با زنجیرهٔ عین خود سامانه‌های ARM و PM تکمیل می‌شود.
                </p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-2 shrink-0 bg-sec-m2-500 hover:bg-sec-m2-500/90 text-sec-m2-fg">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>

          {/* بند ۴.۲ — تاریخ و ساعت دقیق آخرین بروزرسانی + پوشش منبع (مهم ۳: شفافیت ۲۰٬۳۹۲) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" id="arm-request-last-update">
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">آخرین بروزرسانی فهرست</p>
              <p className="font-bold mt-0.5">
                {lastUpdate?.completedAt || lastUpdate?.updatedAt
                  ? faDateTime(lastUpdate.completedAt ?? lastUpdate.updatedAt)
                  : "هنوز انجام نشده"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">پوشش فهرست منبع (ARM)</p>
              <p className="font-bold mt-0.5">
                {lastUpdate
                  ? `${faNumber(lastUpdate.lastCompletedPage)} از ${faNumber(Math.max(lastUpdate.totalPages, lastUpdate.lastCompletedPage))} صفحه — ${lastUpdate.phase === "complete" ? "چرخهٔ کامل" : "در ادامه از همین نقطه"}`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">درخواست‌های منبع (ARM)</p>
              <p className="font-bold mt-0.5 tabular-nums">{lastUpdate?.totalAtSource ? faNumber(lastUpdate.totalAtSource) : "—"}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">
                تکمیل اطلاعات متقاضی، مناطق، قیمت و دسته‌بندی
                {enriching && (
                  <span className="inline-flex items-center gap-1 text-sec-m2-700 ms-2">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> در حال تکمیل خودکار…
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">
                {faNumber(enrichment.complete)} / {faNumber(enrichment.total)} ({faNumber(coveragePct)}٪)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-l from-sec-m2-700 to-sec-m2-500 transition-all duration-500" style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فیلترها — تمام ستون‌های فهرست (گام ۲ بند ۲) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-bold w-full"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <Filter className="w-4 h-4 text-sec-m2-700" aria-hidden />
            فیلتر فهرست درخواست — بر اساس تمام ستون‌ها
            {anyFilterActive && <Badge variant="secondary" className="gap-1">فیلتر فعال</Badge>}
            <span className="text-muted-foreground text-xs me-auto">{filtersOpen ? "بستن" : "باز کردن"}</span>
          </button>

          {filtersOpen && (
            <>
              {/* وضعیت شش‌حالته — چندانتخابی */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>وضعیت درخواست (چندانتخابی — شش‌حالته)</Label>
                  {stateFilterActive && (
                    <span className="text-xs text-muted-foreground">
                      {faNumber(selectedStates.length)} حالت انتخاب شده — {faNumber(rows.length)} درخواست مطابق
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2" id="arm-request-states-filter">
                  {REQUEST_STATES.map((s) => {
                    const active = selectedStates.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleState(s.key)}
                        aria-pressed={active}
                        title={s.hint}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold sec-motion ${STATE_BADGE_CLASS[s.key]} ${
                          active ? "ring-2 ring-offset-1 ring-offset-background ring-current" : "opacity-80 hover:opacity-100"
                        }`}
                      >
                        {active ? "✓ " : ""}{s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* دسته‌بندی — چندانتخابی (نکته ۴) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>دسته‌بندی درخواست (چندانتخابی)</Label>
                  {selectedTrades.length > 0 && (
                    <span className="text-xs text-muted-foreground">{faNumber(selectedTrades.length)} دسته انتخاب شده</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2" id="arm-request-trades-filter">
                  {TRADE_CATEGORIES.map((t) => {
                    const active = selectedTrades.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTrade(t)}
                        aria-pressed={active}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold sec-motion ${
                          active
                            ? "bg-sec-m2-500 text-sec-m2-fg border-sec-m2-500"
                            : "bg-sec-m2-50 text-sec-m2-700 border-sec-m2-200 opacity-80 hover:opacity-100"
                        }`}
                      >
                        {active ? "✓ " : ""}{t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* فیلترهای متنی/عددی تمام ستون‌ها */}
              <form
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied({ ...filters });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-code">کد درخواست</Label>
                  <Input
                    id="arm-request-code"
                    value={filters.code}
                    onChange={(e) => setF("code", e.target.value)}
                    placeholder="نمونه: ۹۹۸۸۷۷"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-realtor">کارشناس</Label>
                  <Input
                    id="arm-request-realtor"
                    value={filters.realtorName}
                    onChange={(e) => setF("realtorName", e.target.value)}
                    placeholder="نمونه: شهریار بابایان"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>شعبه</Label>
                  <Select value={filters.branch || "all"} onValueChange={(v) => setF("branch", v === "all" ? "" : v)}>
                    <SelectTrigger aria-label="فیلتر شعبه">
                      <SelectValue placeholder="همهٔ شعب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همهٔ شعب</SelectItem>
                      {TABRIZ_BRANCHES.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                      <SelectItem value="unset">{BRANCH_UNSET}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-customer">متقاضی (نام یا موبایل)</Label>
                  <Input
                    id="arm-request-customer"
                    value={filters.customerName}
                    onChange={(e) => setF("customerName", e.target.value)}
                    placeholder="نمونه: رضا محمدی یا ۰۹۱۴…"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-price-from">قیمت از (تومان)</Label>
                  <Input
                    id="arm-request-price-from"
                    value={filters.priceFrom}
                    onChange={(e) => setF("priceFrom", e.target.value)}
                    placeholder="نمونه: ۵۰۰٬۰۰۰٬۰۰۰"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-price-to">قیمت تا (تومان)</Label>
                  <Input
                    id="arm-request-price-to"
                    value={filters.priceTo}
                    onChange={(e) => setF("priceTo", e.target.value)}
                    placeholder="نمونه: ۹٬۰۰۰٬۰۰۰٬۰۰۰"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-request-area">مناطق</Label>
                  <Input
                    id="arm-request-area"
                    value={filters.areaName}
                    onChange={(e) => setF("areaName", e.target.value)}
                    placeholder="نمونه: خاوران"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">تاریخ ثبت از</Label>
                    <JalaliDatePicker
                      value={filters.dateFrom}
                      onChange={(v) => setF("dateFrom", v)}
                      placeholder="از تاریخ"
                      id="arm-request-date-from"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">تا</Label>
                    <JalaliDatePicker
                      value={filters.dateTo}
                      onChange={(v) => setF("dateTo", v)}
                      placeholder="تا تاریخ"
                      id="arm-request-date-to"
                    />
                  </div>
                </div>
                <div className="flex gap-2 lg:col-span-4">
                  <Button type="submit" className="gap-2 flex-1 bg-sec-m2-500 hover:bg-sec-m2-500/90 text-sec-m2-fg">
                    <Search className="w-4 h-4" aria-hidden /> اعمال فیلتر
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setApplied(EMPTY_FILTERS);
                      setSelectedStates([]);
                      setSelectedTrades([]);
                    }}
                    className="gap-2"
                    aria-label="پاک کردن فیلترها"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden /> پاک کردن
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {/* لیست تک‌صفحه‌ای — ده ستون عین دستور مالک */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm font-bold">هیچ درخواستی مطابق پیدا نشد</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data?.total === 0
                ? "هنوز کاتالوگ درخواست‌های ملک تبریز استخراج نشده است — دکمه «بروزرسانی از سامانه» را بزنید."
                : "فیلترها را تغییر دهید یا آن‌ها را پاک کنید تا همهٔ درخواست‌ها دیده شوند."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="py-4 flex flex-col items-center gap-1">
            <CardTitle className="text-base text-center">فهرست درخواست‌ها — کاتالوگ سامانه ARM ملک تبریز</CardTitle>
            {rows.length > 0 && (
              <Badge variant="secondary">{faNumber(rows.length)} ردیف — تک‌صفحه‌ای</Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead className="min-w-24">کد درخواست</TableHead>
                    <TableHead className="min-w-36">کارشناس</TableHead>
                    <TableHead className="min-w-28">شعبه</TableHead>
                    <TableHead className="min-w-40">متقاضی</TableHead>
                    <TableHead className="min-w-48">قیمت از...تا...</TableHead>
                    <TableHead className="min-w-40">مناطق</TableHead>
                    <TableHead className="min-w-28">دسته‌بندی</TableHead>
                    <TableHead className="min-w-32">وضعیت</TableHead>
                    <TableHead className="min-w-32">تاریخ ثبت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
                  {(r, i) => {
                    const stateKey = classifyRequestStatus(r.status);
                    return (
                      <TableRow key={r.id}>
                        {/* ۱ — ردیف */}
                        <TableCell className="text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                        {/* ۲ — کد درخواست */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" dir="ltr">
                            <Hash className="w-3.5 h-3.5 text-sec-m2-700" aria-hidden />
                            {faDigits(r.requestCode)}
                          </span>
                          {showTitles && r.title && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-44 truncate mx-auto">{r.title}</p>}
                        </TableCell>
                        {/* ۳ — کارشناس */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-bold">
                            <Landmark className="w-3.5 h-3.5 text-sec-m2-700 shrink-0" aria-hidden />
                            {r.actorName ?? "ثبت نشده در سامانه"}
                          </span>
                        </TableCell>
                        {/* ۴ — شعبه */}
                        <TableCell>
                          {r.branch && r.branch !== BRANCH_UNSET ? (
                            <Badge variant="outline" className="gap-1 text-[11px] border-sec-m2-200 bg-sec-m2-50 text-sec-m2-700">
                              <Network className="w-3 h-3" aria-hidden /> {r.branch}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">{BRANCH_UNSET}</span>
                          )}
                        </TableCell>
                        {/* ۵ — متقاضی: نام + موبایل زیر نام (نکته ۱ + مهم ۴ — عین الگوی M3) */}
                        <TableCell className="whitespace-normal">
                          {r.customerName ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1.5 truncate max-w-40 font-medium" title={r.customerName}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-sec-m2-700 shrink-0" aria-hidden /> {r.customerName}
                              </span>
                              {r.customerMobile ? (
                                <a
                                  href={`tel:${r.customerMobile}`}
                                  dir="ltr"
                                  className="font-mono text-[11px] text-sec-m2-700 hover:underline w-fit tabular-nums"
                                  title={`تماس با متقاضی: ${faDigits(r.customerMobile)}`}
                                >
                                  {faDigits(r.customerMobile)}
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">موبایل ثبت‌نشده</span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sec-m2-700">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در نوبت تکمیل از سامانه
                            </span>
                          )}
                        </TableCell>
                        {/* ۶ — قیمت از...تا... (نکتهٔ بسیار مهم ۵: کاما + تومان) */}
                        <TableCell className="whitespace-nowrap">
                          {priceRangeLabel(r) ? (
                            <span className="inline-flex items-center gap-1.5 font-bold tabular-nums" title={priceRangeLabel(r)!}>
                              <Banknote className="w-3.5 h-3.5 text-sec-m2-700 shrink-0" aria-hidden />
                              {priceRangeLabel(r)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">در نوبت تکمیل از سامانه</span>
                          )}
                        </TableCell>
                        {/* ۷ — مناطق (نکته ۲: فقط نام مناطق؛ >۳ = فایل مناطق P6526/ب) */}
                        <TableCell className="whitespace-normal">
                          <AreasFileCell requestCode={r.requestCode} areaNames={r.areaNames} />
                        </TableCell>
                        {/* ۸ — دسته‌بندی (نکته ۴) */}
                        <TableCell className="whitespace-nowrap">
                          {r.tradeTypeName ? (
                            <Badge variant="secondary" className="gap-1 text-[11px]">
                              <Tag className="w-3 h-3" aria-hidden /> {r.tradeTypeName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">در نوبت تکمیل</span>
                          )}
                        </TableCell>
                        {/* ۹ — وضعیت (شش‌حالته) */}
                        <TableCell>
                          {r.status ? (
                            <Badge variant="secondary" className={`text-[11px] border ${STATE_BADGE_CLASS[stateKey]}`} title={REQUEST_STATE_BY_KEY.get(stateKey)?.hint}>
                              {requestStatusLabel(r.status)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* ۱۰ — تاریخ ثبت */}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            {r.createdAt ? faDateTime(r.createdAt) : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBodyVirtual>
              </Table>
            </div>
            <p className="p-3 text-xs text-muted-foreground text-center border-t">
              {faNumber(rows.length)} درخواست در یک صفحه — لیست تک‌صفحه‌ای و بی‌نهایت (بدون صفحه‌بندی)
              {stateFilterActive && ` · فیلتر وضعیت: ${selectedStates.map((k) => REQUEST_STATE_BY_KEY.get(k)!.label).join(" + ")}`}
              {selectedTrades.length > 0 && ` · دسته‌بندی: ${selectedTrades.join(" + ")}`}
              {enrichment.pending > 0 && ` · ${faNumber(enrichment.pending)} درخواست در نوبت تکمیل اطلاعات متقاضی و مناطق`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
