"use client";

/**
 * کاشی «آگهی ملک تبریز» — صفحه داخلی (P6.5-10 + P6521/M1 + P6530/گام ۱)
 * ------------------------------------------------------
 * فهرست ستون‌ها (PN-020/گام اول-الف — سه ستون به دستور مالک حذف شد:
 *   آخرین وضعیت (status ده‌حالتهٔ ARM) + تصاویر + انتشار؛ بینش توزیع وضعیت
 *   و فیلتر وضعیت بالای فهرست باقی است — داده حذف نمی‌شود، فقط ستون):
 *   ردیف · کد آگهی · کارشناس · شعبه · مالک (نام + موبایل زیر نام) ·
 *   قیمت ملک (کاما + تومان — نکته ۳) · قیمت هر متر · آدرس ملک (منطقه، کوی، پلاک) ·
 *   نوع ملک · متراژ · اتاق · طبقه · ساخت (سال — PN-020: بدون کاما) ·
 *   دسته‌بندی (فروش/پیش فروش/رهن و اجاره/مشارکت در ساخت — نکته ۴) ·
 *   آخرین فعالیت · رهن/اجاره · بازدید · تاریخ وضعیت · لینک
 *
 * فیلتر بر اساس تمام ستون‌های فهرست (بند ۲): کد · کارشناس · شعبه ·
 * مالک (نام/موبایل) · قیمت از/تا · آدرس/منطقه · دسته‌بندی · وضعیت ·
 * بازهٔ آخرین فعالیت — همه با نرمال‌سازی ارقام فارسی/عربی/لاتین (P6525)
 *
 * بینش توزیع وضعیت (بند ۳): ده‌حالته + سایر — کلیک = فیلتر
 *
 * بخش بروزرسانی (بند ۴): زنجیرهٔ عین سامانه ARM (لایه ۱ فهرست کامل +
 * لایه ۲ غنی‌سازی مالک/آدرس برش‌به‌برش) + تاریخ و ساعت دقیق آخرین
 * بروزرسانی + ادامه از آخرین صفحهٔ کامل (checkpoint)
 *
 * نکته ۴: ستون مالک عین الگوی فروشنده/خریدار فهرست معاملات — نام + موبایل زیر نام
 * رنگ بخش: سبز یشمی #10B981 (گام صفر — sec-m1)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
// P6549/قانون ۰۳۵-B — کشیدن برای تازه‌سازی + حالت‌های طراحی‌شده
import { usePullToRefresh, PtrIndicator } from "@/hooks/use-pull-to-refresh";
// PN-011 خامسا-۲ — پیوند عمیق از کاشی تطبیق (M5): بار یک‌بارمصرف کد از پیش‌جست‌وجوشده
import { useAppStore } from "@/lib/client/store";
import { EmptyState, ErrorState } from "@/components/app/shared/list-states";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, Home, Users, Phone, MapPin, RefreshCw, Hash, CheckCircle2, Clock,
  Landmark, Building2, PieChart, Banknote, Tag, History, Network, Filter, Ruler, BedDouble, Layers,
  CalendarDays, TrendingUp, Award, MapPinned, Globe, FileSpreadsheet, Eye, ExternalLink,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, TopRankingTable, TileCoverageTable, ExcelImportButton, FilterChip, FilterGroup, OwnerNoteCell } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, apiSync, apiBlob, downloadBlob, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber, faAmountFull } from "@/lib/format";
// P6547/گام پنجم-ب — نظام رنگ متمایز هر مقدار + هارمونی فیلتر↔فهرست
// PN-009 مرحله C — رنگ وضعیت‌ها هم از رجیستری یگانه (منبع حقیقت واحد)
import { valueSoftClass, valueSolidClass, branchBadgeClass, listingStateBadgeClass } from "@/lib/value-colors";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه (رفع باگ تاریخی ۴/۵ در این صفحه)
import { normalizeFilterInput } from "@/lib/normalize-input";
import {
  LISTING_STATES,
  LISTING_STATE_BY_KEY,
  classifyListingStatus,
  listingStatusLabel,
  type ListingStateKey,
} from "@/lib/listing-status";
import { TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";

interface ListingRow {
  id: string;
  propertyCode: string;
  title: string | null;
  status: string | null;
  realtorName: string | null;
  ownerName: string | null;
  ownerMobile: string | null;
  price: number | null;
  tradeTypeName: string | null;
  address: string | null;
  areaName: string | null;
  lineName: string | null;
  /** P6546/گام یک — ستون‌های غنی‌شده از جزئیات ARM + سامانهٔ عمومی (apu) */
  propertyTypeName: string | null;
  meterage: number | null;
  rooms: number | null;
  floor: number | null;
  buildYear: number | null;
  pricePerMeter: number | null;
  branch: string;
  enrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
  // ===================== PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست ARM =====================
  isRental: boolean | null;
  depositPrice: number | null;
  rentPrice: number | null;
  viewCount: number | null;
  imageCount: number | null;
  addedToDivar: boolean | null;
  addedToInsta: boolean | null;
  isReposted: boolean | null;
  isTarget: boolean | null;
  armBranchTitle: string | null;
  stateName: string | null;
  cityName: string | null;
  publicUrl: string | null;
  statusDate: string | null;
  /** PN-039 (گام ۴) — یادداشت مالک (آخرین ستون فهرست) */
  ownerNote: string | null;
}

interface Enrichment {
  total: number;
  pending: number;
  complete: number;
}

/** توزیع ده‌حالته + سایر (گام ۱ بند ۳ — بینش) */
interface StatusCounts {
  traded: number;
  published: number;
  private: number;
  expired: number;
  rejectedByAdmin: number;
  pendingAdmin: number;
  pendingConsultant: number;
  pendingReview: number;
  recoverable: number;
  unrecoverable: number;
  other: number;
  total: number;
}

/** وضعیت بروزرسانی — checkpoint لایه ۱ (بند ۴.۲: تاریخ/ساعت دقیق + نقطهٔ ادامه) */
interface LastUpdate {
  phase: string;
  lastCompletedPage: number;
  totalPages: number;
  totalAtSource: number;
  updatedAt: string;
  completedAt: string | null;
}

interface ListingsResponse {
  rows: ListingRow[];
  total: number;
  enrichment: Enrichment;
  statusCounts?: StatusCounts;
  lastUpdate?: LastUpdate | null;
}

const EMPTY_FILTERS = {
  code: "",
  realtorName: "",
  branch: "",
  ownerName: "",
  priceFrom: "",
  priceTo: "",
  address: "",
  activityFrom: "",
  activityTo: "",
};

type Filters = typeof EMPTY_FILTERS;

/** دسته‌بندی آگهی ملک تبریز — عین نکته ۴ دستور مالک */
const TRADE_CATEGORIES: readonly string[] = ["فروش", "پیش فروش", "رهن و اجاره", "مشارکت در ساخت"];

/** حداکثر برش‌های خودکار غنی‌سازی در هر باز شدن کاشی (هر برش = ۲۵ آگهی) */
const MAX_AUTO_SLICES = 10;
const AUTO_SLICE_ROWS = 25;

export function ArmListingsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back, tenantId }: TilePageProps) {
  const { toast } = useToast();
  // PN-011 خامسا-۲ — بار کاشی از M5 (کد ملک) یک‌بار در ساخت مقصد مصرف می‌شود؛
  // فیلتر و اعمال هر دو از همان ابتدا پر می‌شوند ⇒ اولین واکشی خودش جست‌وجو است.
  const initialDeepCode = useRef<string | null>(null);
  if (initialDeepCode.current === null) {
    const p = useAppStore.getState().consumeTileParams("arm-listings");
    initialDeepCode.current = typeof p?.code === "string" && p.code.trim() ? p.code.trim() : "";
  }
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, code: initialDeepCode.current ?? "" }));
  const [applied, setApplied] = useState<Filters>(() => ({ ...EMPTY_FILTERS, code: initialDeepCode.current ?? "" }));
  /** وضعیت‌های انتخاب‌شدهٔ فیلتر چندانتخابی (کلیدهای canonical ده‌حالته) */
  const [selectedStates, setSelectedStates] = useState<ListingStateKey[]>([]);
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
  const [data, setData] = useState<ListingsResponse | null>(null);
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
    // P6525 — نرمال‌سازی مرکزی: نتیجهٔ ارقام فارسی/عربی/لاتین همیشه یکسان
    if (applied.code) params.set("code", normalizeFilterInput(applied.code));
    if (applied.realtorName) params.set("realtorName", normalizeFilterInput(applied.realtorName));
    if (applied.branch) params.set("branch", applied.branch);
    if (applied.ownerName) params.set("ownerName", normalizeFilterInput(applied.ownerName));
    if (applied.address) params.set("address", normalizeFilterInput(applied.address));
    if (applied.priceFrom) params.set("priceFrom", applied.priceFrom);
    if (applied.priceTo) params.set("priceTo", applied.priceTo);
    if (applied.activityFrom) params.set("activityFrom", applied.activityFrom);
    if (applied.activityTo) params.set("activityTo", applied.activityTo);
    // فیلترهای چندانتخابی — اعمال خودکار با هر کلیک
    if (selectedStates.length > 0) params.set("states", selectedStates.join(","));
    for (const t of selectedTrades) params.append("tradeType", t);
    // PN-011 ثالثاً — شعبه چندانتخابی (چیپ): چند مقدار هم‌زمان
    for (const b of selectedBranches) params.append("branch", b);
    // PN-039 (گام ۶) — نوع ملک چندانتخابی (چیپ)
    for (const t of selectedPropertyTypes) params.append("propertyType", t);
    try {
      const res = await api<ListingsResponse>(`/api/crm/arm-catalog/listings?${params.toString()}`);
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
        { method: "POST", body: { entity: "listings", mode: "enrich", maxRows: AUTO_SLICE_ROWS } },
      );
      const e = res.enrich?.find((x) => x.entity === "listings");
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
  const toggleState = useCallback((key: ListingStateKey) => {
    setSelectedStates((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  /** تاگل یک دسته‌بندی در فیلتر چندانتخابی (اعمال خودکار) */
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
    toast({ title: "یادداشت ذخیره شد", description: "یادداشت مالک روی آگهی ثبت شد." });
  }, [toast]);

  /** PN-039 (گام ۶) — وجه نوع ملک برای چیپ‌ها: مقادیر یکتای کاتالوگ بارخورده + انتخاب‌های جاری */
  const propertyTypeFacet = useMemo(() => {
    const set = new Set<string>(selectedPropertyTypes);
    for (const r of data?.rows ?? []) if (r.propertyTypeName) set.add(r.propertyTypeName);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fa"));
  }, [data, selectedPropertyTypes]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      // P6546/گام پنجم-پ — لایهٔ فهرست: ≈۵٬۰۰۰ رکورد/کلیک (۱۰ صفحه×۵۰۰) · لایهٔ جزئیات: ≈۵۰۰ رکورد/کلیک
      // P6546/گام پنجم-پ-۳ — تاب‌آور: تا ۳ تلاش خودکار روی 502/504/مهلت (هر تلاش از checkpoint ادامه می‌یابد)
      const res = await apiSync<{ lists: Array<{ fetched: number; totalAtSource: number; ok: boolean }>; enrich?: Array<{ enriched: number; remaining: number }> }>(
        "/api/crm/arm-catalog/sync",
        { method: "POST", body: { entity: "listings", mode: "both", maxRows: 500 } },
        (attempt) => toast({ title: `ادامهٔ بروزرسانی از نقطهٔ قطع (تلاش ${attempt + 1} از ۳)`, description: "سرور ملک تبریز لحظه‌ای کند بود؛ همان نقطهٔ قبلی ازسرگیری شد — هیچ داده‌ای از ابتدا شروع نمی‌شود." })
      );
      const list = res.lists?.[0];
      toast({
        title: "بروزرسانی آگهی‌ها از سامانه‌های ملک تبریز انجام شد",
        description: list
          ? `${faNumber(list.fetched)} آگهی از مجموع ${faNumber(list.totalAtSource)} آگهی سامانه ARM در این برش (حدود ۵،۰۰۰ رکورد) خوانده شد و برش تکمیل جزئیات (حدود ۵۰۰ رکورد: مالک، آدرس، متراژ، اتاق، طبقه، سال ساخت، نوع ملک) هم اجرا شد. ادامهٔ بروزرسانی از همان صفحه‌ای که تمام شده بود، ازسر گرفته می‌شود.`
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
  const activeRealtors = new Set(rows.map((r) => r.realtorName).filter(Boolean)).size;
  const stateFilterActive = selectedStates.length > 0;
  const anyFilterActive =
    stateFilterActive ||
    selectedTrades.length > 0 ||
    selectedBranches.length > 0 ||
    Object.values(applied).some((v) => v !== "");
  // PN-009 مرحله C — شمارندهٔ فیلترهای فعال برای سربرگ آکاردئون موبایل (الگوی [فیلترها ۵] دستور بند ۶.۱)
  const activeFilterCount =
    selectedStates.length +
    selectedTrades.length +
    selectedBranches.length +
    Object.values(applied).filter((v) => v !== "").length;

  // P6546/گام یک-۲ — بینش ۱۰ کارشناس پرآگهی (تجمیع زندهٔ فهرست)
  const topRealtors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (r.realtorName) counts.set(r.realtorName, (counts.get(r.realtorName) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fa"));
  }, [rows]);

  // P6546/گام یک-۳ — بینش ۱۰ قطب عرضه آگه در مناطق تبریز (تجمیع زندهٔ فهرست)
  const topHubs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const area = r.areaName ?? r.address?.split("،")[0]?.trim();
      if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fa"));
  }, [rows]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  // قانون ۰۳۵-B/ج-۸ — کشیدن برای تازه‌سازی (فهرست در پنجرهٔ لمسی)
  const { ptrRef, refreshing: ptrSpinning } = usePullToRefresh(() => void load());

  return (
    <div data-negin="zomorrod-koohi" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر zomorrod-koohi */}
      <div className="negin-bar" aria-hidden />
      <PtrIndicator innerRef={ptrRef} spinning={ptrSpinning} />
      {/* ایجنت هوشمند یادگیرندهٔ مولتی‌بینش */}
      <AgentPanel tileId="arm-listings" />

      {/* شاخص‌ها — رنگ بخش M1 (سبز یشمی) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل آگهی‌های ملک تبریز" value={loading ? undefined : faNumber(data?.total ?? 0)} icon={Home} iconWrapperClassName="bg-sec-m1-50" iconColorClassName="text-sec-m1-700" />
        <KpiCard label="اطلاعات مالک و آدرس تکمیل‌شده" value={loading ? undefined : `${faNumber(coveragePct)}٪`} sub={loading ? undefined : `${faNumber(enrichment.complete)} از ${faNumber(enrichment.total)}`} icon={Phone} iconWrapperClassName="bg-sec-m1-50" iconColorClassName="text-sec-m1-700" />
        <KpiCard label="آگهی امروز" value={loading ? undefined : faNumber(todayCount)} icon={Clock} iconWrapperClassName="bg-sec-m1-50" iconColorClassName="text-sec-m1-700" />
        <KpiCard label="کارشناسان فعال" value={loading ? undefined : faNumber(activeRealtors)} icon={Users} iconWrapperClassName="bg-sec-m1-50" iconColorClassName="text-sec-m1-700" />
      </div>

      {/* بینش توزیع وضعیت ده‌حالته (گام ۱ بند ۳) */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <PieChart className="w-5 h-5 text-sec-m1-700 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-bold">توزیع وضعیت آگهی‌ها (نظام ده‌حالته)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" id="arm-listing-states-insight">
            {LISTING_STATES.map((s) => {
              const n = statusCounts?.[s.key] ?? 0;
              const pct = statusCounts && statusCounts.total > 0 ? Math.round((n / statusCounts.total) * 100) : 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleState(s.key)}
                  aria-pressed={selectedStates.includes(s.key)}
                  title={s.hint}
                  className={`rounded-xl border p-2.5 text-start sec-motion ${listingStateBadgeClass(s.key)} ${
                    selectedStates.includes(s.key) ? "ring-2 ring-offset-1 ring-offset-background ring-current" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  <p className="text-[11px] font-medium leading-4">{s.label}</p>
                  <p className="text-base font-extrabold tabular-nums mt-0.5">{statusCounts ? faNumber(n) : "…"}</p>
                  <p className="text-[10px] tabular-nums opacity-80">{statusCounts ? `${faNumber(pct)}٪` : ""}</p>
                </button>
              );
            })}
            <div className="rounded-xl border bg-muted/40 p-2.5 text-start">
              <p className="text-[11px] font-medium leading-4 text-muted-foreground">سایر وضعیت‌ها</p>
              <p className="text-base font-extrabold tabular-nums mt-0.5 text-muted-foreground">{statusCounts ? faNumber(statusCounts.other) : "…"}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground opacity-80">
                {statusCounts && statusCounts.total > 0 ? `${faNumber(Math.round((statusCounts.other / statusCounts.total) * 100))}٪` : ""}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ جداول و نمودارها (P6546/گام پنجم-الف-۳ — ترتیب الزامی: بینش‌ها → جداول → پوشش → بروزرسانی → فیلتر → فهرست) ============ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="m1-tables-section">
        {/* P6546/گام یک-۲ — جدول ۱۰ کارشناسان پرآگهی */}
        <TopRankingTable
          id="m1-top-realtors"
          title="جدول ۱۰ کارشناسان پرآگهی ملک تبریز"
          rows={topRealtors}
          countLabel="کارشناس"
          icon={Award}
          accentClass="text-sec-m1-700"
        />
        {/* P6546/گام یک-۳ — جدول ۱۰ قطب‌های عرضه آگه */}
        <TopRankingTable
          id="m1-top-hubs"
          title="جدول ۱۰ قطب‌های عرضه آگه در مناطق تبریز"
          rows={topHubs}
          countLabel="منطقه"
          icon={MapPinned}
          accentClass="text-sec-m1-700"
        />
      </div>

      {/* P6546/گام پنجم-الف-۲ — جدول پوشش اطلاعات فهرست (تمام ستون‌ها) */}
      <TileCoverageTable tileKey="m1" accentClass="text-sec-m1-700" />

      {/* بخش بروزرسانی آگهی (گام ۱ بند ۴) — زنجیرهٔ ARM + تاریخ دقیق + ادامه از نقطهٔ قطع */}
      <Card className="border-sec-m1-200 bg-sec-m1-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Building2 className="w-5 h-5 text-sec-m1-700 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">بروزرسانی آگهی‌ها از سامانه‌های ملک تبریز</p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-2 shrink-0 bg-sec-m1-500 hover:bg-sec-m1-500/90 text-sec-m1-fg">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>

          {/* بند ۴.۲ — تاریخ و ساعت دقیق آخرین بروزرسانی + نقطهٔ ادامه */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" id="arm-listing-last-update">
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
              <p className="text-muted-foreground">آگهی‌های منبع (ARM)</p>
              <p className="font-bold mt-0.5 tabular-nums">{lastUpdate?.totalAtSource ? faNumber(lastUpdate.totalAtSource) : "—"}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">
                {/* PN-003 گام ۴-۱ — توضیح متنی حذف شد؛ فقط وضعیت زندهٔ غنی‌سازی می‌ماند */}
                {enriching && (
                  <span className="inline-flex items-center gap-1 text-sec-m1-700">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> در حال تکمیل خودکار…
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">
                {faNumber(enrichment.complete)} / {faNumber(enrichment.total)} ({faNumber(coveragePct)}٪)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-l from-sec-m1-700 to-sec-m1-500 transition-all duration-500" style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فیلترها — تمام ستون‌های فهرست (گام ۱ بند ۲) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-bold w-full"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <Filter className="w-4 h-4 text-sec-m1-700" aria-hidden />
            فیلتر فهرست آگهی
            {anyFilterActive && <Badge variant="secondary" className="gap-1">فیلترها ({faNumber(activeFilterCount)})</Badge>}
            <span className="text-muted-foreground text-xs me-auto">{filtersOpen ? "بستن" : "باز کردن"}</span>
          </button>

          {filtersOpen && (
            <>
              {/* PN-009 مرحله C — گروه‌بندی منطقی فیلترها (قانون ۶.۱): وضعیت → دسته‌بندی → شناسه و اشخاص → قیمت و بازه */}
              <FilterGroup
                label="وضعیت آگهی (چندانتخابی — ده‌حالته)"
                hint={stateFilterActive ? `${faNumber(selectedStates.length)} حالت انتخاب شده — ${faNumber(rows.length)} آگهی مطابق` : undefined}
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
                <div className="flex flex-wrap gap-1.5" id="arm-listing-states-filter">
                  {LISTING_STATES.map((s) => (
                    <FilterChip
                      key={s.key}
                      label={s.label}
                      active={selectedStates.includes(s.key)}
                      onToggle={() => toggleState(s.key)}
                      title={s.hint}
                      softClass={listingStateBadgeClass(s.key)}
                      solidClass={listingStateBadgeClass(s.key)}
                    />
                  ))}
                </div>
              </FilterGroup>

              {/* دسته‌بندی — چندانتخابی (نکته ۴) */}
              <FilterGroup
                label="دسته‌بندی آگهی (چندانتخابی)"
                hint={selectedTrades.length > 0 ? `${faNumber(selectedTrades.length)} دسته انتخاب شده` : undefined}
              >
                <div className="flex flex-wrap gap-1.5" id="arm-listing-trades-filter">
                  {/* P6547/گام پنجم-ب-نکته ۱ — رنگ متمایز هر دسته از رجیستری (فروش=سبز روشن، پیش فروش=آبی، رهن و اجاره=بنفش، مشارکت=کهربایی) */}
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
                <div className="flex flex-wrap gap-1.5" id="arm-listing-property-types-filter">
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
                label="شعبهٔ کارشناس (چندانتخابی)"
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
                <div className="flex flex-wrap gap-1.5" id="arm-listing-branches-filter">
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
                    title="آگهی‌های بدون شعبهٔ مشخص"
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
              <FilterGroup label="شناسه و اشخاص">
                {/* PN-028/خامساً-ف (دستور مالک) — فیلدهای متنی دوتایی: هر ردیف دو فیلد روبروهم */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="arm-listing-code">کد آگهی</Label>
                  <Input
                    id="arm-listing-code"
                    value={filters.code}
                    onChange={(e) => setF("code", e.target.value)}
                    placeholder="نمونه: ۵۹۱۱۵"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-listing-realtor">کارشناس</Label>
                  <Input
                    id="arm-listing-realtor"
                    value={filters.realtorName}
                    onChange={(e) => setF("realtorName", e.target.value)}
                    placeholder="نمونه: شهریار بابایان"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-listing-owner">مالک (نام یا موبایل)</Label>
                  <Input
                    id="arm-listing-owner"
                    value={filters.ownerName}
                    onChange={(e) => setF("ownerName", e.target.value)}
                    placeholder="نمونه: علی محمدی یا ۰۹۱۴…"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arm-listing-address">آدرس ملک / منطقه</Label>
                  <Input
                    id="arm-listing-address"
                    value={filters.address}
                    onChange={(e) => setF("address", e.target.value)}
                    placeholder="نمونه: خاوران یا خیابان دانش"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                </div>
              </FilterGroup>
              {/* P6546/گام پنجم-ب-۲ — فیلد دوعاملی بازه‌ای روبروهم: قیمت: از … تا … */}
              <FilterGroup label="قیمت و بازهٔ فعالیت">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>قیمت (تومان)</Label>
                    <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="arm-listing-price-from"
                      aria-label="قیمت از (تومان)"
                      value={filters.priceFrom}
                      onChange={(e) => setF("priceFrom", e.target.value)}
                      placeholder="از ۹،۰۰۰،۰۰۰،۰۰۰"
                      inputMode="numeric"
                      autoComplete="off"
                      className="font-bold text-[11px]"
                    />
                    <Input
                      id="arm-listing-price-to"
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
                {/* بازهٔ آخرین فعالیت — روبروهم */}
                <div className="space-y-1.5">
                  <Label>آخرین فعالیت</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <JalaliDatePicker
                      value={filters.activityFrom}
                      onChange={(v) => setF("activityFrom", v)}
                      placeholder="از تاریخ"
                      id="arm-listing-activity-from"
                    />
                    <JalaliDatePicker
                      value={filters.activityTo}
                      onChange={(v) => setF("activityTo", v)}
                      placeholder="تا تاریخ"
                      id="arm-listing-activity-to"
                    />
                  </div>
                </div>
                </div>
              </FilterGroup>
                <div className="flex gap-2">
                  <Button type="submit" className="gap-2 flex-1 bg-sec-m1-500 hover:bg-sec-m1-500/90 text-sec-m1-fg">
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
                applied.code || applied.realtorName || applied.branch || applied.ownerName || applied.address ||
                applied.priceFrom || applied.priceTo || applied.activityFrom || applied.activityTo ||
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
          {/* P6525 — قانون فهرست: عنوان فهرست وسط‌چین (الگوی فهرست معاملات) */}
          {/* PN-028/خامساً-ب (دستور مالک) — چیدمان الزامی سربرگ فهرست:
              ردیف ۱: عنوان «فهرست آگهی» وسط‌چین
              ردیف ۲: «اکسل کل فهرست» (راست) + «بارگذاری اکسل» (چپ) */}
          <CardHeader className="py-4 flex flex-col items-center gap-2">
            <CardTitle className="text-base text-center">فهرست آگهی</CardTitle>
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
                  if (filters.code) p.set("code", filters.code);
                  if (filters.realtorName) p.set("realtorName", filters.realtorName);
                  if (filters.ownerName) p.set("ownerName", filters.ownerName);
                  if (filters.address) p.set("address", filters.address);
                  apiBlob(`/api/crm/export/listings?${p.toString()}`)
                    .then((blob) => {
                      downloadBlob(blob, `melka-listings-${new Date().toISOString().slice(0, 10)}.xlsx`);
                      toast({ title: "خروجی اکسل آماده شد", description: "کل فهرست آگهی‌ها (با فیلترهای فعال) دانلود شد." });
                    })
                    .catch((e) => toast({ title: "خروجی اکسل ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" }));
                }}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden /> اکسل کل فهرست
              </Button>
              {/* PN-003 گام ۴-۲ — بارگذاری اکسل کل فهرست (ایمپورت) */}
              <ExcelImportButton entity="listings" compact onImported={() => void load()} />
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
                    {/* جلسهٔ ۰۳۳ (دستور مالک — ثانیاً/ت): ترتیب ستون‌ها + حذف «آخرین فعالیت» */}
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead className="min-w-20">کد آگهی</TableHead>
                    <TableHead className="min-w-28">کارشناس</TableHead>
                    <TableHead className="min-w-24">شعبه</TableHead>
                    <TableHead className="min-w-24">نوع ملک</TableHead>
                    <TableHead className="min-w-24">دسته‌بندی</TableHead>
                    {/* PN-039 (گام ۵) — ستون «وضعیت آگهی» بعد از دسته‌بندی (دستور مالک) */}
                    <TableHead className="min-w-28">وضعیت آگهی</TableHead>
                    <TableHead className="min-w-36">مالک</TableHead>
                    {/* P6546/گام پنجم-ت-۴ — ستون قیمت با نام «قیمت» و قالب ۹،۰۰۰،۰۰۰،۰۰۰ */}
                    <TableHead className="min-w-32">قیمت</TableHead>
                    <TableHead className="min-w-28">قیمت هر متر</TableHead>
                    {/* PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست ARM */}
                    <TableHead className="min-w-20">رهن / اجاره</TableHead>
                    <TableHead className="min-w-44">آدرس ملک</TableHead>
                    {/* P6546/گام یک — ستون‌های غنی‌شده از ساختار ثبت آگهی ARM + سامانهٔ عمومی */}
                    <TableHead className="min-w-20">متراژ</TableHead>
                    <TableHead className="min-w-16">اتاق</TableHead>
                    <TableHead className="min-w-16">طبقه</TableHead>
                    <TableHead className="min-w-20">ساخت</TableHead>
                    <TableHead className="min-w-16">بازدید</TableHead>
                    <TableHead className="min-w-16">لینک</TableHead>
                    {/* PN-020/گام اول-الف بند ۴ + جلسهٔ ۰۳۳ — تاریخ وضعیت، آخرین ستون فهرست */}
                    <TableHead className="min-w-24">تاریخ وضعیت</TableHead>
                    {/* PN-039 (گام ۳) — تاریخ دقیق ایجاد آگهی در سامانه (createdAt) — بلافاصله پس از تاریخ وضعیت */}
                    <TableHead className="min-w-36">تاریخ ثبت</TableHead>
                    {/* PN-039 (گام ۴) — یادداشت مالک — آخرین ستون فهرست (دستور مالک) */}
                    <TableHead className="min-w-32">یادداشت</TableHead>
                  </TableRow>
                </TableHeader>
                {/* P6527 — رندر پنجره‌ای: تمام ردیف‌ها در یک اسکرول، فقط دیدنی‌ها در DOM */}
                <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
                  {(r, i) => {
                    // PN-020/گام اول-الف — stateKey/ستون وضعیت حذف شد؛ classify فقط در فیلتر/بینش (بالای فهرست) کار دارد
                    return (
                      <TableRow key={r.id}>
                        {/* ۱ — ردیف */}
                        <TableCell className="text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                        {/* ۲ — کد آگهی */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" dir="ltr">
                            <Hash className="w-3.5 h-3.5 text-sec-m1-700" aria-hidden />
                            {faDigits(r.propertyCode)}
                          </span>
                          {showTitles && r.title && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-44 truncate mx-auto">{r.title}</p>}
                        </TableCell>
                        {/* ۳ — کارشناس */}
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-bold">
                            <Landmark className="w-3.5 h-3.5 text-sec-m1-700 shrink-0" aria-hidden />
                            {r.realtorName ?? "ثبت نشده در سامانه"}
                          </span>
                        </TableCell>
                        {/* ۴ — شعبه (نکته ۲) */}
                        <TableCell>
                          {r.branch && r.branch !== BRANCH_UNSET ? (
                            <Badge variant="outline" className={`gap-1 text-[11px] border-0 ${branchBadgeClass(r.branch)}`} title="شعبهٔ کارشناس — از سامانهٔ PM">
                              <Network className="w-3 h-3" aria-hidden /> {r.branch}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">{BRANCH_UNSET}</span>
                          )}
                        </TableCell>
                        {/* ۵ — نوع ملک (P6546/گام یک — propertyTypeName از جزئیات + apu) */}
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
                        {/* ۶ — دسته‌بندی (نکته ۴) — PN-020/گام اول-الف: ستون «آخرین وضعیت» (status ده‌حالتهٔ ARM) به دستور مالک حذف شد؛
                            بینش توزیع وضعیت + فیلتر وضعیت بالای فهرست باقی است و دادهٔ status در API/خروجی اکسل دست‌نخورده است */}
                        <TableCell className="whitespace-nowrap">
                          {r.tradeTypeName ? (
                            <Badge variant="secondary" className={`gap-1 text-[11px] border-0 ${valueSoftClass(r.tradeTypeName)}`}>
                              <Tag className="w-3 h-3" aria-hidden /> {r.tradeTypeName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">در نوبت تکمیل</span>
                          )}
                        </TableCell>
                        {/* ۶-ب — PN-039 (گام ۵) — وضعیت آگهی: بعد از دسته‌بندی (دستور مالک) —
                            نگاشت قانون ده‌حالتهٔ P6530؛ خارج از ده‌گانه = متن خام با Badge خنثی */}
                        <TableCell className="whitespace-nowrap" data-listing-status-cell={r.id}>
                          {r.status ? (
                            <Badge
                              variant="secondary"
                              className={`gap-1 text-[10px] border-0 ${(() => {
                                const k = classifyListingStatus(r.status);
                                return k ? listingStateBadgeClass(k) : "";
                              })()}`}
                            >
                              <History className="w-2.5 h-2.5" aria-hidden /> {listingStatusLabel(r.status)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۷ — مالک: نام + موبایل زیر نام (نکته ۱ + نکته بسیار مهم ۴ — عین الگوی فروشنده/خریدار M3) */}
                        <TableCell className="whitespace-normal">
                          {r.ownerName ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1.5 truncate max-w-40 font-medium" title={r.ownerName}>
                                <CheckCircle2 className="w-3.5 h-3.5 text-sec-m1-700 shrink-0" aria-hidden /> {r.ownerName}
                              </span>
                              {r.ownerMobile ? (
                                <a
                                  href={`tel:${r.ownerMobile}`}
                                  dir="ltr"
                                  className="font-mono text-[11px] text-sec-m1-700 hover:underline w-fit tabular-nums"
                                  title={`تماس با مالک: ${faDigits(r.ownerMobile)}`}
                                >
                                  {faDigits(r.ownerMobile)}
                                </a>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">موبایل ثبت‌نشده</span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-sec-m1-700">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در نوبت تکمیل از سامانه
                            </span>
                          )}
                        </TableCell>
                        {/* ۸ — قیمت (P6546/گام پنجم-ت-۴: نام «قیمت» + قالب ۹،۰۰۰،۰۰۰،۰۰۰ بدون واحد) */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.price === "number" && r.price > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold tabular-nums text-[11px]" title={`${faAmountFull(r.price)} — تومان`}>
                              <Banknote className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faAmountFull(r.price, "")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">ثبت نشده</span>
                          )}
                        </TableCell>
                        {/* ۸-ب — قیمت هر متر (P6546/گام یک — از فهرست سامانهٔ عمومی + جزئیات ARM) */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.pricePerMeter === "number" && r.pricePerMeter > 0 ? (
                            <span className="inline-flex items-center gap-1 font-medium tabular-nums text-[11px]" title={`${faAmountFull(r.pricePerMeter)} — تومان هر مترمربع`}>
                              <TrendingUp className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faAmountFull(r.pricePerMeter, "")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۸-ب-002 گام ۱ — ستون‌های تازه */}
                        {/* ۹ — رهن / اجاره (آگهی‌های رهن‌واجاره‌ای) */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.depositPrice === "number" && r.depositPrice > 0 ? (
                            <span className="inline-flex flex-col items-center gap-0.5 tabular-nums text-[10px]" title={`رهن: ${faAmountFull(r.depositPrice)}${typeof r.rentPrice === "number" && r.rentPrice > 0 ? ` — اجاره: ${faAmountFull(r.rentPrice)}` : ""} — تومان`}>
                              <span className="font-bold">{faAmountFull(r.depositPrice, "")}</span>
                              {typeof r.rentPrice === "number" && r.rentPrice > 0 && <span className="text-muted-foreground">اجاره {faAmountFull(r.rentPrice, "")}</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">{r.isRental ? "اجاره‌ای" : "—"}</span>
                          )}
                        </TableCell>
                        {/* ۱۰ — آدرس ملک (منطقه، کوی، پلاک) */}
                        <TableCell className="whitespace-normal">
                          <span className="inline-flex items-start gap-1 leading-relaxed">
                            <MapPin className="w-3 h-3 text-sec-m1-700 mt-0.5 shrink-0" aria-hidden />
                            <span className="text-[11px]">
                              {r.address ?? "ثبت نشده در سامانه"}
                              {r.areaName && !r.address?.includes(r.areaName) ? (
                                <span className="text-muted-foreground"> ({r.areaName})</span>
                              ) : null}
                            </span>
                          </span>
                        </TableCell>
                        {/* ۱۰-ب — متراژ */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.meterage === "number" && r.meterage > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium" title="مترمربع">
                              <Ruler className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faNumber(r.meterage)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۰-پ — اتاق */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.rooms === "number" && r.rooms > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium">
                              <BedDouble className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faNumber(r.rooms)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۰-ت — طبقه */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.floor === "number" && r.floor > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium">
                              <Layers className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faNumber(r.floor)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۰-ث — سال ساخت (PN-020/گام اول-الف: بدون کاما — سال با جداکنندهٔ هزارگان «۱،۴۰۳» غلط است) */}
                        <TableCell className="whitespace-nowrap">
                          {typeof r.buildYear === "number" && r.buildYear > 0 ? (
                            <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium">
                              <CalendarDays className="w-3 h-3 text-sec-m1-700 shrink-0" aria-hidden />
                              {faDigits(r.buildYear)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۱ — بازدید (PN-020/گام اول-الف: ستون‌های «تصاویر» و «انتشار» پس از این حذف شدند) */}
                        <TableCell className="text-center">
                          {typeof r.viewCount === "number" ? (
                            <span className="inline-flex items-center gap-1 tabular-nums font-medium" title="تعداد بازدید آگهی در سامانه ARM">
                              <Eye className="w-3 h-3 text-sec-m1-700" aria-hidden /> {faNumber(r.viewCount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۲ — لینک عمومی آگهی */}
                        <TableCell className="text-center">
                          {r.publicUrl ? (
                            <a
                              href={`https://www.melketabriz.com${r.publicUrl.startsWith("/") ? "" : "/"}${r.publicUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              title="مشاهدهٔ آگهی در سامانهٔ عمومی ملک تبریز"
                              className="inline-flex items-center gap-1 text-sec-m1-700 hover:underline text-[10px]"
                            >
                              <ExternalLink className="w-3 h-3" aria-hidden /> مشاهده
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        {/* ۱۳ — تاریخ وضعیت (آخرین ستون — دستور جلسهٔ ۰۳۳) */}
                        <TableCell className="text-muted-foreground whitespace-nowrap text-[10px]">
                          {r.statusDate ? faDateTime(r.statusDate) : "—"}
                        </TableCell>
                        {/* ۱۴ — PN-039 (گام ۳) — تاریخ ثبت: دقیق‌ترین لحظهٔ ایجاد آگهی در سامانهٔ ملکا (createdAt) */}
                        <TableCell className="text-muted-foreground whitespace-nowrap text-[10px]" data-registered-at-cell={r.id}>
                          {r.createdAt ? faDateTime(r.createdAt) : "—"}
                        </TableCell>
                        {/* ۱۵ — PN-039 (گام ۴) — یادداشت مالک: آخرین ستون فهرست · قابل ویرایش inline */}
                        <TableCell className="whitespace-normal" data-owner-note-column-cell={r.id}>
                          <OwnerNoteCell
                            id={r.id}
                            entity="property"
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
              {faNumber(rows.length)} آگهی در یک صفحه — لیست تک‌صفحه‌ای و بی‌نهایت (بدون صفحه‌بندی)
              {stateFilterActive && ` · فیلتر وضعیت: ${selectedStates.map((k) => LISTING_STATE_BY_KEY.get(k)!.label).join(" + ")}`}
              {selectedTrades.length > 0 && ` · دسته‌بندی: ${selectedTrades.join(" + ")}`}
              {enrichment.pending > 0 && ` · ${faNumber(enrichment.pending)} آگهی در نوبت تکمیل اطلاعات مالک و آدرس`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default ArmListingsPage;
