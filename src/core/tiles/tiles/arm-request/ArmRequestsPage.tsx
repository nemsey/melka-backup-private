"use client";

/**
 * کاشی «درخواست ملک تبریز» — صفحه داخلی (P6.5-10 + P6521/M2 + P6530/گام ۲)
 * ------------------------------------------------------
 * فهرست ستون‌ها (PN-020/گام اول-ب — چهار اصلاح مالک):
 *   ردیف · کد درخواست · کارشناس · شعبه · متقاضی (نام + موبایل زیر نام) ·
 *   قیمت از...تا... (کاما + تومان) · مناطق (نکته ۲ — فقط نام مناطق؛
 *   >۳ منطقه = فایل مناطق P6526/ب) · نوع ملک · نوع ساختمان · دسته‌بندی ·
 *   وضعیت (شش‌حالته) · فوریت (رنگی: فوری=نارنجی · عادی=خاکستری) ·
 *   متراژ · اتاق · طبقه · ساخت (سال — بدون کاما) · سند ·
 *   نوع ساخت (رنگی: شخصی/مجتمع/برج) · جهت (رنگی + >۳ جهت = فایل جهات) ·
 *   معاوضه · **تاریخ ثبت (آخرین ستون — بند ۴)**
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// P6549/قانون ۰۳۵-B — کشیدن برای تازه‌سازی + حالت‌های طراحی‌شده
import { usePullToRefresh, PtrIndicator } from "@/hooks/use-pull-to-refresh";
// PN-011 خامسا-۲ — پیوند عمیق از کاشی تطبیق (M5): بار یک‌بارمصرف کد از پیش‌جست‌وجوشده
import { useAppStore } from "@/lib/client/store";
import { EmptyState, ErrorState } from "@/components/app/shared/list-states";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, ClipboardList, Users, Phone, RefreshCw, Hash, CheckCircle2, Zap, FileSpreadsheet,
  Landmark, PieChart, Banknote, Tag, CalendarDays, Network, Filter, MapPinned, Award, Building2, Home,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, TopRankingTable, TileCoverageTable, ExcelImportButton, FilterChip, FilterGroup, OwnerNoteCell } from "@/components/app/shared";
// PN-011 ثالثاً — شعبه چندانتخابی چیپی؛ Select تک‌انتخابی حذف شد
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, apiSync, apiBlob, downloadBlob, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber, faAmountFull } from "@/lib/format";
// P6547/گام پنجم-ب — نظام رنگ متمایز هر مقدار + هارمونی فیلتر↔فهرست
import { valueSoftClass, valueSolidClass, branchBadgeClass, requestStateBadgeClass } from "@/lib/value-colors";
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
import { SideFileCell, parseNameList } from "./SideFileCell";

interface RequestRow {
  id: string;
  requestCode: string;
  title: string | null;
  status: string | null;
  actorName: string | null;
  /** P6547/گام دوم — فوریت درخواست (urgent خود ردیف فهرست ARM) */
  urgent: boolean | null;
  /** P6547/گام دوم — جدیت متقاضی (userSeriousity.name از رجیستری ARM) */
  seriousnessName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  tradeTypeName: string | null;
  /** P6546/گام دوم — نوع ملک درخواستی + نوع ساختمان (از جزئیات ARM) */
  propertyTypeName: string | null;
  buildingTypeName: string | null;
  /** PN-039 (گام ۴) — یادداشت مالک (آخرین ستون فهرست) */
  ownerNote: string | null;
  areaNames: string[];
  lineNames: string[];
  branch: string;
  enrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
  // ===================== PN-002 گام ۲ — ستون‌های تازه از inputs خود ردیف فهرست ARM =====================
  spaceFrom: number | null;
  spaceTo: number | null;
  roomsFrom: number | null;
  roomsTo: number | null;
  floorFrom: number | null;
  floorTo: number | null;
  buildYearFrom: number | null;
  buildYearTo: number | null;
  sanadNames: string | null;
  constructTypeNames: string | null;
  sideNames: string | null;
  occasion: boolean | null;
  deposit: boolean | null;
  confirmSms: boolean | null;
  notifyMe: boolean | null;
  changeWithNames: string | null;
  armBranchTitle: string | null;
  stateName: string | null;
  cityName: string | null;
  platform: string | null;
  customerDescription: string | null;
  luxury: boolean | null;
  changeable: boolean | null;
  paymentMethodName: string | null;
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

/** دسته‌بندی درخواست‌های ملک تبریز — عین نکته ۴ دستور مالک */
const TRADE_CATEGORIES: readonly string[] = ["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"];

/** حداکثر برش‌های خودکار غنی‌سازی در هر باز شدن کاشی (هر برش = ۲۵ درخواست) */
const MAX_AUTO_SLICES = 10;
const AUTO_SLICE_ROWS = 25;

export function ArmRequestsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back, tenantId }: TilePageProps) {
  const { toast } = useToast();
  // PN-011 خامسا-۲ — بار کاشی از M5 (کد درخواست) یک‌بار در ساخت مقصد مصرف می‌شود؛
  // فیلتر و اعمال هر دو از همان ابتدا پر می‌شوند ⇒ اولین واکشی خودش جست‌وجو است.
  const initialDeepCode = useRef<string | null>(null);
  if (initialDeepCode.current === null) {
    const p = useAppStore.getState().consumeTileParams("arm-requests");
    initialDeepCode.current = typeof p?.code === "string" && p.code.trim() ? p.code.trim() : "";
  }
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, code: initialDeepCode.current ?? "" }));
  const [applied, setApplied] = useState<Filters>(() => ({ ...EMPTY_FILTERS, code: initialDeepCode.current ?? "" }));
  /** وضعیت‌های انتخاب‌شدهٔ فیلتر چندانتخابی (کلیدهای canonical شش‌حالته) */
  const [selectedStates, setSelectedStates] = useState<RequestStateKey[]>([]);
  /** دسته‌بندی‌های انتخاب‌شدهٔ فیلتر چندانتخابی */
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  /** شعبه‌های انتخاب‌شدهٔ فیلتر چندانتخابی (PN-011 ثالثاً — چیپ همانند دسته‌بندی) */
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  /** PN-039 (گام ۶) — نوع‌های ملک انتخاب‌شدهٔ فیلتر چندانتخابی (چیپ) */
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(
    // قانون ۰۳۵-B/ت-۵: آکاردئون در موبایل (پیش‌فرض بسته) · همیشه باز در دسکتاپ
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const autoSliceCount = useRef(0);
  const autoSliceBusy = useRef(false);
  const showTitles = settings.showTitles !== false;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    // PN-044/فاز ۴ — فیلتر چند-مستأجری: داشبورد ملکتون فقط دادهٔ ملکتون می‌بیند
    params.set("tenantId", tenantId ?? "tabriz");
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
    // PN-011 ثالثاً — شعبه چندانتخابی (چیپ): چند مقدار هم‌زمان
    for (const b of selectedBranches) params.append("branch", b);
    // PN-039 (گام ۶) — نوع ملک چندانتخابی (چیپ)
    for (const t of selectedPropertyTypes) params.append("propertyType", t);
    try {
      const res = await api<RequestsResponse>(`/api/crm/arm-catalog/requests?${params.toString()}`);
      setData(res);
      setLoadError(false);
    } catch {
      setData({ rows: [], total: 0, enrichment: { total: 0, pending: 0, complete: 0 }, lastUpdate: null });
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [applied, selectedStates, selectedTrades, selectedBranches, selectedPropertyTypes, tenantId]);

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

  /** تاگل یک شعبه در فیلتر چندانتخابی (اعمال خودکار — PN-011 ثالثاً) */
  const toggleBranch = useCallback((b: string) => {
    setSelectedBranches((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }, []);

  /** PN-039 (گام ۶) — تاگل یک نوع ملک در فیلتر چندانتخابی (اعمال خودکار) */
  const togglePropertyType = useCallback((t: string) => {
    setSelectedPropertyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }, []);

  /** PN-039 (گام ۴) — به‌روزرسانی یادداشت ردیف در state پس از ذخیرهٔ موفق */
  const updateRowNote = useCallback((id: string, note: string | null) => {
    setData((prev) => (prev ? { ...prev, rows: prev.rows.map((r) => (r.id === id ? { ...r, ownerNote: note } : r)) } : prev));
    toast({ title: "یادداشت ذخیره شد", description: "یادداشت مالک روی درخواست ثبت شد." });
  }, [toast]);

  /** PN-039 (گام ۶) — وجه نوع ملک برای چیپ‌ها: مقادیر یکتای فهرست بارخورده + انتخاب‌های جاری */
  const propertyTypeFacet = useMemo(() => {
    const set = new Set<string>(selectedPropertyTypes);
    for (const r of data?.rows ?? []) if (r.propertyTypeName) set.add(r.propertyTypeName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fa"));
  }, [data, selectedPropertyTypes]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      // P6546/گام پنجم-پ — لایهٔ فهرست: ۵۰ صفحه/کلیک · لایهٔ جزئیات: ≈۵۰۰ رکورد/کلیک
      // P6546/گام پنجم-پ-۳ — تاب‌آور: تا ۳ تلاش خودکار روی 502/504/مهلت (هر تلاش از checkpoint ادامه می‌یابد)
      const res = await apiSync<{ lists: Array<{ fetched: number; totalAtSource: number; ok: boolean }>; enrich?: Array<{ enriched: number; remaining: number }> }>(
        "/api/crm/arm-catalog/sync",
        { method: "POST", body: { entity: "requests", mode: "both", maxRows: 500 } },
        (attempt) => toast({ title: `ادامهٔ بروزرسانی از نقطهٔ قطع (تلاش ${attempt + 1} از ۳)`, description: "سرور ملک تبریز لحظه‌ای کند بود؛ همان نقطهٔ قبلی ازسرگیری شد — هیچ داده‌ای از ابتدا شروع نمی‌شود." })
      );
      const list = res.lists?.[0];
      toast({
        title: "بروزرسانی درخواست‌ها از سامانه‌های ملک تبریز انجام شد",
        description: list
          ? `${faNumber(list.fetched)} درخواست از مجموع ${faNumber(list.totalAtSource)} درخواست سامانه ARM در این برش (۵۰ صفحه) خوانده شد و برش تکمیل جزئیات (حدود ۵۰۰ رکورد: متقاضی، مناطق، قیمت، دسته‌بندی، نوع ملک) هم اجرا شد. ادامهٔ بروزرسانی از همان صفحه‌ای که تمام شده بود، ازسر گرفته می‌شود.`
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
    selectedBranches.length > 0 ||
    Object.values(applied).some((v) => v !== "");
  // PN-009 مرحله D — شمارندهٔ فیلترهای فعال برای سربرگ آکاردئون موبایل (الگوی [فیلترها ۵] دستور بند ۶.۱)
  const activeFilterCount =
    selectedStates.length +
    selectedTrades.length +
    selectedBranches.length +
    Object.values(applied).filter((v) => v !== "").length;

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  // P6546/گام دوم-۲ — بینش ۱۰ کارشناس پردرخواست (تجمیع زندهٔ فهرست)
  const topRealtors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.actorName) counts.set(r.actorName, (counts.get(r.actorName) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fa"));
  }, [rows]);

  // P6546/گام دوم-۳ — بینش ۱۰ قطب درخواست در مناطق تبریز (تجمیع زنده از areaNames)
  const topHubs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const a of r.areaNames ?? []) {
        if (a.trim()) counts.set(a.trim(), (counts.get(a.trim()) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fa"));
  }, [rows]);

  /** نمایش بازهٔ قیمت متقاضی — PN-009 مرحله D (بند ۹ دستور): دوخطی «از X» / «تا Y» — نه تک‌خط با خط تیره/اسلش */
  const priceRange = (r: RequestRow): { from: string | null; to: string | null } => ({
    from: r.priceFrom !== null ? faAmountFull(r.priceFrom, "") : null,
    to: r.priceTo !== null ? faAmountFull(r.priceTo, "") : null,
  });
  const hasPriceRange = (r: RequestRow): boolean => r.priceFrom !== null || r.priceTo !== null;
  const priceRangeTooltip = (r: RequestRow): string => {
    if (r.priceFrom !== null && r.priceTo !== null) return `از ${faAmountFull(r.priceFrom, "")} تا ${faAmountFull(r.priceTo, "")} — تومان`;
    if (r.priceFrom !== null) return `از ${faAmountFull(r.priceFrom, "")} — تومان`;
    return `تا ${faAmountFull(r.priceTo!, "")} — تومان`;
  };

  // قانون ۰۳۵-B/ج-۸ — کشیدن برای تازه‌سازی
  const { ptrRef, refreshing: ptrSpinning } = usePullToRefresh(() => void load());

  return (
    <div data-negin="marjan-daryayi" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر marjan-daryayi */}
      <div className="negin-bar" aria-hidden />
      <PtrIndicator innerRef={ptrRef} spinning={ptrSpinning} />
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
                  className={`rounded-xl border p-2.5 text-start sec-motion ${requestStateBadgeClass(s.key)} ${
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

      {/* ============ جداول و نمودارها (P6546 — ترتیب الزامی: بینش‌ها → جداول → پوشش → بروزرسانی → فیلتر → فهرست) ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="m2-tables-section">
        {/* P6546/گام دوم-۲ — جدول ۱۰ کارشناسان پردرخواست */}
        <TopRankingTable
          id="m2-top-realtors"
          title="جدول ۱۰ کارشناسان پردرخواست ملک تبریز"
          rows={topRealtors}
          countLabel="کارشناس"
          icon={Award}
          accentClass="text-sec-m2-700"
        />
        {/* P6546/گام دوم-۳ — جدول ۱۰ قطب‌های درخواست */}
        <TopRankingTable
          id="m2-top-hubs"
          title="جدول ۱۰ قطب‌های درخواست در مناطق تبریز"
          rows={topHubs}
          countLabel="منطقه"
          icon={MapPinned}
          accentClass="text-sec-m2-700"
        />
      </div>

      {/* P6546/گام پنجم-الف-۲ — جدول پوشش اطلاعات فهرست (تمام ستون‌ها) */}
      <TileCoverageTable tileKey="m2" accentClass="text-sec-m2-700" />

      {/* بخش بروزرسانی درخواست‌ها (گام ۲ بند ۴) */}
      <Card className="border-sec-m2-200 bg-sec-m2-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardList className="w-5 h-5 text-sec-m2-700 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">بروزرسانی درخواست‌ها از سامانه‌های ملک تبریز</p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-2 shrink-0 bg-sec-m2-500 hover:bg-sec-m2-500/90 text-sec-m2-fg">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>

          {/* بند ۴.۲ — تاریخ و ساعت دقیق آخرین بروزرسانی + پوشش منبع (مهم ۳: شفافیت ۲۰،۳۹۲) */}
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
                {/* PN-003 گام ۴-۱ — توضیح متنی حذف شد؛ فقط وضعیت زندهٔ غنی‌سازی می‌ماند */}
                {enriching && (
                  <span className="inline-flex items-center gap-1 text-sec-m2-700">
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
            فیلتر فهرست درخواست
            {anyFilterActive && <Badge variant="secondary" className="gap-1">فیلترها ({faNumber(activeFilterCount)})</Badge>}
            <span className="text-muted-foreground text-xs me-auto">{filtersOpen ? "بستن" : "باز کردن"}</span>
          </button>

          {filtersOpen && (
            <>
              {/* PN-009 مرحله D — گروه‌بندی منطقی فیلترها (قانون ۶.۱): وضعیت → دسته‌بندی → شناسه و اشخاص → قیمت و بازه */}
              <FilterGroup
                label="وضعیت درخواست (چندانتخابی — شش‌حالته)"
                hint={stateFilterActive ? `${faNumber(selectedStates.length)} حالت انتخاب شده — ${faNumber(rows.length)} درخواست مطابق` : undefined}
                action={
                  stateFilterActive ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                      onClick={() => setSelectedStates([])}
                      aria-label="پاک کردن فیلتر وضعیت"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden /> پاک کردن وضعیت
                    </Button>
                  ) : undefined
                }
              >
                <div className="flex flex-wrap gap-1.5" id="arm-request-states-filter">
                  {REQUEST_STATES.map((s) => (
                    <FilterChip
                      key={s.key}
                      label={s.label}
                      active={selectedStates.includes(s.key)}
                      onToggle={() => toggleState(s.key)}
                      title={s.hint}
                      softClass={requestStateBadgeClass(s.key)}
                      solidClass={requestStateBadgeClass(s.key)}
                    />
                  ))}
                </div>
              </FilterGroup>

              {/* دسته‌بندی — چندانتخابی (نکته ۴) */}
              <FilterGroup
                label="دسته‌بندی درخواست (چندانتخابی)"
                hint={selectedTrades.length > 0 ? `${faNumber(selectedTrades.length)} دسته انتخاب شده` : undefined}
              >
                <div className="flex flex-wrap gap-1.5" id="arm-request-trades-filter">
                  {/* P6547/گام پنجم-ب — رنگ متمایز هر دسته از رجیستری (خرید=سبز روشن، پیش خرید=آبی، رهن و اجاره=بنفش، مشارکت=کهربایی) */}
                  {TRADE_CATEGORIES.map((t) => (
                    <FilterChip
                      key={t}
                      label={t}
                      active={selectedTrades.includes(t)}
                      onToggle={() => toggleTrade(t)}
                      softClass={valueSoftClass(t)}
                      solidClass={valueSolidClass(t)}
                    />
                  ))}
                </div>
              </FilterGroup>

              {/* PN-039 (گام ۶) — نوع ملک — چندانتخابی چیپی (مقادیر از کاتالوگ زنده) */}
              <FilterGroup
                label="نوع ملک (چندانتخابی)"
                hint={selectedPropertyTypes.length > 0 ? `${faNumber(selectedPropertyTypes.length)} نوع انتخاب شده` : undefined}
              >
                <div className="flex flex-wrap gap-1.5" id="arm-request-property-types-filter">
                  {propertyTypeFacet.map((t) => (
                    <FilterChip
                      key={t}
                      label={t}
                      active={selectedPropertyTypes.includes(t)}
                      onToggle={() => togglePropertyType(t)}
                      softClass={valueSoftClass(t)}
                      solidClass={valueSolidClass(t)}
                    />
                  ))}
                </div>
              </FilterGroup>

              {/* شعبه — PN-011 ثالثاً: فیلتر چندانتخابی چیپی (همانند دسته‌بندی — دستور مالک) */}
              <FilterGroup
                label="شعبهٔ ثبت‌کننده (چندانتخابی)"
                hint={selectedBranches.length > 0 ? `${faNumber(selectedBranches.length)} شعبه انتخاب شده` : undefined}
                action={
                  selectedBranches.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
                      onClick={() => setSelectedBranches([])}
                      aria-label="پاک کردن فیلتر شعبه"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden /> پاک کردن شعبه
                    </Button>
                  ) : undefined
                }
              >
                <div className="flex flex-wrap gap-1.5" id="arm-request-branches-filter">
                  {TABRIZ_BRANCHES.map((b) => (
                    <FilterChip
                      key={b}
                      label={b}
                      active={selectedBranches.includes(b)}
                      onToggle={() => toggleBranch(b)}
                      title={`شعبهٔ ${b}`}
                      softClass={branchBadgeClass(b)}
                      solidClass={valueSolidClass(b)}
                    />
                  ))}
                  <FilterChip
                    label={BRANCH_UNSET}
                    active={selectedBranches.includes("unset")}
                    onToggle={() => toggleBranch("unset")}
                    title="درخواست‌های بدون شعبهٔ مشخص"
                    softClass={branchBadgeClass(BRANCH_UNSET)}
                    solidClass={valueSolidClass(BRANCH_UNSET)}
                  />
                </div>
              </FilterGroup>

              {/* فیلترهای متنی/عددی تمام ستون‌ها — P6546/گام پنجم-ب: چیدمان جمع‌وجور + بازه‌های روبروهم */}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied({ ...filters });
                }}
              >
              <FilterGroup label="شناسه، اشخاص و مناطق">
                {/* PN-028/خامساً-ف (دستور مالک) — فیلدهای متنی دوتایی: هر ردیف دو فیلد روبروهم */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
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
                </div>
              </FilterGroup>
              {/* P6546/گام پنجم-ب-۲ — فیلد دوعاملی بازه‌ای روبروهم: قیمت: از … تا … */}
              <FilterGroup label="قیمت و بازهٔ ثبت">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>قیمت (تومان)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="arm-request-price-from"
                      aria-label="قیمت از (تومان)"
                      value={filters.priceFrom}
                      onChange={(e) => setF("priceFrom", e.target.value)}
                      placeholder="از ۹،۰۰۰،۰۰۰،۰۰۰"
                      inputMode="numeric"
                      autoComplete="off"
                      className="font-bold text-[11px]"
                    />
                    <Input
                      id="arm-request-price-to"
                      aria-label="قیمت تا (تومان)"
                      value={filters.priceTo}
                      onChange={(e) => setF("priceTo", e.target.value)}
                      placeholder="تا ۱۲،۰۰۰،۰۰۰،۰۰۰"
                      inputMode="numeric"
                      autoComplete="off"
                      className="font-bold text-[11px]"
                    />
                  </div>
                </div>
                {/* بازهٔ تاریخ ثبت — روبروهم */}
                <div className="space-y-1.5">
                  <Label>تاریخ ثبت</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <JalaliDatePicker
                      value={filters.dateFrom}
                      onChange={(v) => setF("dateFrom", v)}
                      placeholder="از تاریخ"
                      id="arm-request-date-from"
                    />
                    <JalaliDatePicker
                      value={filters.dateTo}
                      onChange={(v) => setF("dateTo", v)}
                      placeholder="تا تاریخ"
                      id="arm-request-date-to"
                    />
                  </div>
                </div>
                </div>
              </FilterGroup>
                <div className="flex gap-2">
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
                      setSelectedBranches([]);
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
      ) : loadError ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <ErrorState onRetry={() => void load()} />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              hasFilters={Boolean(
                applied.code || applied.realtorName || applied.branch || applied.customerName ||
                applied.areaName || applied.priceFrom || applied.priceTo || applied.dateFrom || applied.dateTo ||
                selectedStates.length > 0 || selectedTrades.length > 0
              )}
              onClearFilters={() => {
                setFilters(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
                setSelectedStates([]);
                setSelectedTrades([]);
                setSelectedBranches([]);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* PN-028/خامساً-ب (دستور مالک) — چیدمان الزامی سربرگ فهرست:
              ردیف ۱: عنوان «فهرست درخواست» وسط‌چین
              ردیف ۲: «اکسل کل فهرست» (راست) + «بارگذاری اکسل» (چپ) */}
          <CardHeader className="py-4 flex flex-col items-center gap-2">
            <CardTitle className="text-base text-center">فهرست درخواست</CardTitle>
            <div className="w-full flex items-center justify-between gap-3 flex-wrap">
              {/* PN-002 گام ۶-۲ — خروجی اکسل کل فهرست */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-[11px]"
                onClick={() => {
                  const p = new URLSearchParams();
                  // PN-044/فاز ۴ — خروجی اکسل هم tenant همین رندر را می‌گیرد
                  p.set("tenantId", tenantId ?? "tabriz");
                  if (applied.code) p.set("code", applied.code);
                  if (applied.realtorName) p.set("realtorName", applied.realtorName);
                  if (applied.customerName) p.set("customerName", applied.customerName);
                  if (applied.areaName) p.set("areaName", applied.areaName);
                  apiBlob(`/api/crm/export/requests?${p.toString()}`)
                    .then((blob) => {
                      downloadBlob(blob, `melka-requests-${new Date().toISOString().slice(0, 10)}.xlsx`);
                      toast({ title: "خروجی اکسل آماده شد", description: "کل فهرست درخواست‌ها (با فیلترهای فعال) دانلود شد." });
                    })
                    .catch((e) => toast({ title: "خروجی اکسل ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" }));
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden /> اکسل کل فهرست
              </Button>
              {/* PN-003 گام ۴-۲ — بارگذاری اکسل کل فهرست (ایمپورت) */}
              <ExcelImportButton entity="requests" compact onImported={() => void load()} />
            </div>
            {rows.length > 0 && (
              <Badge variant="secondary">{faNumber(rows.length)} ردیف — تک‌صفحه‌ای</Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead className="min-w-20">کد درخواست</TableHead>
                    <TableHead className="min-w-28">کارشناس</TableHead>
                    <TableHead className="min-w-24">شعبه</TableHead>
                    <TableHead className="min-w-36">متقاضی</TableHead>
                    {/* P6546/گام پنجم-ت-۴ — ستون قیمت با نام «قیمت» و قالب از/تا */}
                    <TableHead className="min-w-40">قیمت</TableHead>
                    <TableHead className="min-w-36">مناطق</TableHead>
                    {/* P6546/گام دوم — ستون‌های غنی‌شده از ساختار ثبت درخواست ARM */}
                    <TableHead className="min-w-24">نوع ملک</TableHead>
                    {/* PN-039 (گام ۷) — ستون «نوع ساختمان» به دستور مالک حذف شد (داده در API/اکسل دست‌نخورده) */}
                    <TableHead className="min-w-24">دسته‌بندی</TableHead>
                    <TableHead className="min-w-28">وضعیت</TableHead>
                    {/* P6547/گام دوم — ستون سند/نوع ساخت/جهت (PN-028/خامساً-پ — دستور مالک:
                        سند، نوع ساخت و جهت بی‌درنگ پس از وضعیت و پیش از فوریت) */}
                    <TableHead className="min-w-28">سند</TableHead>
                    <TableHead className="min-w-24">نوع ساخت</TableHead>
                    <TableHead className="min-w-28">جهت</TableHead>
                    {/* P6547/گام دوم — ستون فوریت (urgent خود ردیف فهرست ARM — PN-020/گام اول-ب: رنگی) */}
                    <TableHead className="min-w-20">فوریت</TableHead>
                    {/* PN-002 گام ۲ — ستون‌های تازه از inputs خود ردیف فهرست ARM */}
                    <TableHead className="min-w-24">متراژ</TableHead>
                    <TableHead className="min-w-20">اتاق</TableHead>
                    <TableHead className="min-w-20">طبقه</TableHead>
                    <TableHead className="min-w-24">ساخت</TableHead>
                    <TableHead className="min-w-24">معاوضه</TableHead>
                    {/* PN-020/گام اول-ب (بند ۴) — تاریخ ثبت، آخرین ستون فهرست است */}
                    <TableHead className="min-w-28">تاریخ ثبت</TableHead>
                    {/* PN-039 (گام ۴) — یادداشت مالک — آخرین ستون فهرست (دستور مالک) */}
                    <TableHead className="min-w-32">یادداشت</TableHead>
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
                            <Badge variant="outline" className={`gap-1 text-[11px] border-0 ${branchBadgeClass(r.branch)}`} title="شعبهٔ کارشناس — از سامانهٔ PM">
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
                        {/* ۶ — قیمت — PN-009 مرحله D (بند ۹ دستور): نمایش دوخطی «از X» / «تا Y» */}
                        <TableCell>
                          {hasPriceRange(r) ? (
                            (() => { const pr = priceRange(r); return (
                            <span className="inline-flex flex-col items-start leading-tight font-bold tabular-nums text-[11px]" title={priceRangeTooltip(r)}>
                              {pr.from !== null && <span>از {pr.from}</span>}
                              {pr.to !== null && <span>تا {pr.to}</span>}
                            </span>
                            ); })()
                          ) : (
                            <span className="text-muted-foreground text-[10px]">در نوبت تکمیل</span>
                          )}
                        </TableCell>
                        {/* ۷ — مناطق (نکته ۲: فقط نام مناطق؛ >۳ = فایل مناطق P6526/ب) */}
                        <TableCell className="whitespace-normal">
                          <AreasFileCell requestCode={r.requestCode} areaNames={r.areaNames} />
                        </TableCell>
                        {/* ۷-ب — نوع ملک درخواستی (P6546/گام دوم — از جزئیات ARM) */}
                        {/* PN-011 ثانیاً — رنگ از رجیستری (قانون ۱۲): هر مقدار نوع ملک رنگ یکتای خود را دارد */}
                        <TableCell className="whitespace-nowrap">
                          {r.propertyTypeName ? (
                            <Badge variant="secondary" className={`gap-1 text-[10px] border-0 ${valueSoftClass(r.propertyTypeName)}`}>
                              <Building2 className="w-2.5 h-2.5" aria-hidden /> {r.propertyTypeName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* PN-039 (گام ۷) — سلول «نوع ساختمان» به دستور مالک حذف شد */}
                        {/* ۸ — دسته‌بندی (نکته ۴) */}
                        <TableCell className="whitespace-nowrap">
                          {r.tradeTypeName ? (
                            <Badge variant="secondary" className={`gap-1 text-[11px] border-0 ${valueSoftClass(r.tradeTypeName)}`}>
                              <Tag className="w-3 h-3" aria-hidden /> {r.tradeTypeName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">در نوبت تکمیل</span>
                          )}
                        </TableCell>
                        {/* ۹ — وضعیت (شش‌حالته) */}
                        <TableCell>
                          {r.status ? (
                            <Badge variant="secondary" className={`text-[11px] border ${requestStateBadgeClass(stateKey)}`} title={REQUEST_STATE_BY_KEY.get(stateKey)?.hint}>
                              {requestStatusLabel(r.status)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* ۱۰ — سند (جلسهٔ ۰۳۳ / ثانیاً-الف: رنگی — هر سند رنگ یکتای خود از رجیستری: شش‌دانگ/در دست اقدام/قراردادی/قولنامه) */}
                        <TableCell className="whitespace-normal max-w-32">
                          {r.sanadNames ? (
                            <span className="inline-flex flex-wrap items-center justify-center gap-1 leading-relaxed">
                              {parseNameList(r.sanadNames).map((name, idx) => (
                                <Badge key={`${name}-${idx}`} variant="secondary" className={`gap-1 text-[10px] border-0 ${valueSoftClass(name)}`} title={`نوع سند درخواستی: ${name} — عین فرم ثبت ARM`}>
                                  {name}
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۱ — نوع ساخت (PN-020/گام اول-ب: رنگی — هر مقدار نشان رنگی یکتا از رجیستری: شخصی/مجتمع/برج) */}
                        <TableCell className="whitespace-normal max-w-28">
                          {r.constructTypeNames ? (
                            <span className="inline-flex flex-wrap items-center justify-center gap-1 leading-relaxed">
                              {parseNameList(r.constructTypeNames).map((name, idx) => (
                                <Badge key={`${name}-${idx}`} variant="secondary" className={`gap-1 text-[10px] border-0 ${valueSoftClass(name)}`} title={`نوع ساخت: ${name} — عین فرم ثبت ARM`}>
                                  {name}
                                </Badge>
                              ))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۲ — جهت (PN-020/گام اول-ب: رنگی + فایل‌گونه برای موارد زیاد — عین الگوی فایل مناطق) */}
                        <TableCell className="whitespace-normal max-w-32">
                          <SideFileCell requestCode={r.requestCode} sideNames={r.sideNames} />
                        </TableCell>
                        {/* P6547/گام دوم — فوریت + جدیت (PN-020/گام اول-ب: هر دو حالت رنگی از رجیستری — فوری=نارنجی · عادی=خاکستری) */}
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col items-center gap-0.5">
                            {r.urgent ? (
                              <Badge variant="secondary" className={`gap-0.5 text-[10px] border-0 ${valueSoftClass("فوری")}`} title="درخواست فوری (urgent در سامانه ARM)">
                                <Zap className="w-2.5 h-2.5" aria-hidden /> فوری
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className={`text-[10px] border-0 ${valueSoftClass("عادی")}`} title="درخواست عادی — غیرفوری (urgent در سامانه ARM)">
                                عادی
                              </Badge>
                            )}
                            {r.seriousnessName ? (
                              <span className="text-[9px] text-muted-foreground" title="جدیت متقاضی از رجیستری ARM">جدیت: {r.seriousnessName}</span>
                            ) : null}
                          </div>
                        </TableCell>
                        {/* PN-002 گام ۲ — ستون‌های تازه از inputs خود ردیف فهرست ARM */}
                        {/* ۱۴ — متراژ (از/تا) */}
                        <TableCell className="whitespace-nowrap text-[10px]">
                          {r.spaceFrom !== null || r.spaceTo !== null ? (
                            <span className="tabular-nums font-medium" title="متراژ درخواستی (از/تا) — عین فرم ثبت سامانه ARM">
                              {r.spaceFrom !== null ? faNumber(r.spaceFrom) : "۰"} — {r.spaceTo !== null ? faNumber(r.spaceTo) : "∞"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۵ — اتاق (از/تا) */}
                        <TableCell className="whitespace-nowrap text-[10px]">
                          {r.roomsFrom !== null || r.roomsTo !== null ? (
                            <span className="tabular-nums">
                              {r.roomsFrom !== null ? faNumber(r.roomsFrom) : "۰"} — {r.roomsTo !== null ? faNumber(r.roomsTo) : "∞"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۶ — طبقه (از/تا) */}
                        <TableCell className="whitespace-nowrap text-[10px]">
                          {r.floorFrom !== null || r.floorTo !== null ? (
                            <span className="tabular-nums">
                              {r.floorFrom !== null ? faNumber(r.floorFrom) : "۰"} — {r.floorTo !== null ? faNumber(r.floorTo) : "∞"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۷ — سال ساخت (از/تا — جلالی · PN-020/گام اول-ب: بدون کاما — سال با جداکنندهٔ هزارگان «۱،۴۰۳» غلط است) */}
                        <TableCell className="whitespace-nowrap text-[10px]">
                          {r.buildYearFrom !== null || r.buildYearTo !== null ? (
                            <span className="tabular-nums">
                              {r.buildYearFrom !== null ? faDigits(r.buildYearFrom) : "—"} — {r.buildYearTo !== null ? faDigits(r.buildYearTo) : "∞"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۸ — معاوضه */}
                        <TableCell className="whitespace-normal text-[10px] max-w-24">
                          {r.changeWithNames && r.changeWithNames !== "مایل نیستم" ? (
                            <span className="font-medium" title="مایل به معاوضه با">{r.changeWithNames}</span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۹ — تاریخ ثبت (PN-020/گام اول-ب بند ۴: عین دستور مالک — اکنون پیش از یادداشت) */}
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden />
                            {r.createdAt ? faDateTime(r.createdAt) : "—"}
                          </span>
                        </TableCell>
                        {/* ۲۰ — PN-039 (گام ۴) — یادداشت مالک: آخرین ستون فهرست · قابل ویرایش inline */}
                        <TableCell className="whitespace-normal" data-owner-note-column-cell={r.id}>
                          <OwnerNoteCell
                            id={r.id}
                            entity="request"
                            value={r.ownerNote}
                            onSaved={(note) => updateRowNote(r.id, note)}
                            onError={(msg) => toast({ title: "خطا در ذخیرهٔ یادداشت", description: msg, variant: "destructive" })}
                          />
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


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default ArmRequestsPage;
