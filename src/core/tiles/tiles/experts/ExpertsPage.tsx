"use client";

/**
 * کاشی «کارشناسان ملک تبریز» — صفحهٔ تازه (PN-008 ثانیاً — بازنویسی کامل ۱۴۰۵/۰۷/۱۶)
 * ---------------------------------------------------------------------------
 * نسل قدیمی (فهرست/فیلتر/بروزرسانی وابسته به کد ۰۰۰۰۰۰۰۰) حذف شد.
 * این صفحه عین کشف سرد سامانهٔ PM ساخته شد (شاهد: download/pn008/pm-exploration.json):
 *
 * ستون‌های الزامی مالک:
 *   کارشناس (موبایل زیر نام) · کدپرسنلی (مثل 410031320) · شعبه ·
 *   مبایعه نامه (تعداد + پیش‌فروش) · اجاره نامه (تعداد + تمدید) ·
 *   تاریخ استخدام · آدرس دقیق
 * ستون‌های کشف‌شده از PM: سمت پرسنلی · نوع همکاری · مدیر · تلفن ثابت ·
 *   کد پستی · شماره داخلی · شهر · وضعیت
 *
 * قواعد:
 *   · رکورد فاقد داده = «-» (لاغیر)
 *   · فیلتر بر اساس تمام ستون‌ها
 *   · بروزرسانی فهرست: زنجیرهٔ سه‌مرحله‌ای PM (رجیستری → عمق → شمارش) با گزارش صادقانه
 * رنگ بخش: فیروزه‌ای (sec-m4)
 */

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePullToRefresh, PtrIndicator } from "@/hooks/use-pull-to-refresh";
import { EmptyState } from "@/components/app/shared/list-states";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, Users, Network, Building2, Banknote, FileSignature, MapPin, Filter,
  RefreshCw, CheckCircle2, IdCard, CalendarClock, BriefcaseBusiness, FileSpreadsheet, UserCheck, Phone,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, TileCoverageTable, useTileData, FilterGroup, FilterChip, type DataSourceInfo } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, apiSync, apiBlob, downloadBlob } from "@/lib/client/api";
import { faNumber, faJalaliShort } from "@/lib/format";
import { branchBadgeClass, valueSoftClass, valueSolidClass } from "@/lib/value-colors";
import { faDigits } from "@/lib/jalali";
import { expertFamilyStats, expertWithBranchCount } from "@/core/agent/analyzers";

/** ردیف فهرست تازه — عین ExpertProfileRow سرور */
interface ExRow {
  id: string;
  personnelCode: string | null;
  fullName: string | null;
  mobile: string | null;
  roleTitle: string | null;
  branchTitle: string | null;
  hireDate: string | null;
  employmentType: number | null;
  employmentTypeFa: string | null;
  headManager: string | null;
  address: string | null;
  telephone: string | null;
  postalCode: string | null;
  voipExtension: string | null;
  city: string | null;
  state: string | null;
  businessTitle: string | null;
  active: boolean;
  saleCount: number;
  rentCount: number;
  syncedAt: string;
}

interface ExResponse {
  rows: ExRow[];
  total: number;
  filterOptions: { branches: string[]; employmentTypes: Array<{ value: number; label: string }>; managers: string[]; roles: string[]; cities: string[] };
  dataSource: DataSourceInfo & { coverage?: Record<string, string> };
}

interface SyncStage {
  registryRows: number;
  registryError: string | null;
  deepAttempted: number;
  deepEnriched: number;
  deepFailed: number;
  deepRemaining: number;
  counts: { sale: number; rent: number; attributedTx: number; contracts: number } | null;
  countsError: string | null;
  durationMs: number;
}

/** «-» — قاعدهٔ مالک: رکورد فاقد اطلاعات به صورت «-» درج گردد و لاغیر */
const dash = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === "" ? "-" : typeof v === "string" ? faDigits(v) : faNumber(v);

const EMPTY_FILTERS = {
  q: "",
  fullName: "",
  mobile: "",
  personnelCode: "",
  voipExtension: "",
  address: "",
  telephone: "",
  postalCode: "",
  hireFrom: "",
  hireTo: "",
  saleFrom: "",
  saleTo: "",
  rentFrom: "",
  rentTo: "",
};
type Filters = typeof EMPTY_FILTERS;

/** فیلترهای چندانتخابی چیپی — PN-011 ثالثاً (همانند دسته‌بندی؛ اعمال خودکار) */
interface ChipFilters {
  branchTitle: string[];
  roleTitle: string[];
  employmentType: string[];
  active: string[];
  headManager: string[];
  city: string[];
}
const EMPTY_CHIPS: ChipFilters = {
  branchTitle: [],
  roleTitle: [],
  employmentType: [],
  active: [],
  headManager: [],
  city: [],
};

export function ExpertsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back, tenantId }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  // PN-011 ثالثاً — فیلترهای چندانتخابی چیپی (اعمال خودکار با هر کلیک)
  const [chips, setChips] = useState<ChipFilters>(EMPTY_CHIPS);
  const toggleChip = useCallback((k: keyof ChipFilters, v: string) => {
    setChips((prev) => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter((x) => x !== v) : [...prev[k], v] }));
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState<SyncStage | null>(null);
  // PN-009 مرحله F — آکاردئون موبایل (پیش‌فرض بسته) · همیشه باز در دسکتاپ — الگوی مشترک M1/M2 (قانون ۶.۱)
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );
  const viewMode = String(settings.viewMode ?? "table");

  const fetchExperts = useCallback(async (): Promise<ExResponse> => {
    const params = new URLSearchParams();
    // PN-044/فاز ۴ — فیلتر چند-مستأجری: داشبورد ملکتون فقط دادهٔ ملکتون می‌بیند
    params.set("tenantId", tenantId ?? "tabriz");
    const set = (k: keyof Filters, v: string) => { if (v) params.set(k, v); };
    set("q", applied.q);
    set("fullName", applied.fullName);
    set("mobile", applied.mobile);
    set("personnelCode", applied.personnelCode);
    set("address", applied.address);
    set("telephone", applied.telephone);
    set("postalCode", applied.postalCode);
    set("voipExtension", applied.voipExtension);
    set("hireFrom", applied.hireFrom);
    set("hireTo", applied.hireTo);
    set("saleFrom", applied.saleFrom);
    set("saleTo", applied.saleTo);
    set("rentFrom", applied.rentFrom);
    set("rentTo", applied.rentTo);
    // PN-011 ثالثاً — فیلترهای چندانتخابی چیپی (تکرار پارامتر = OR درون گروه)
    for (const b of chips.branchTitle) params.append("branchTitle", b);
    for (const r of chips.roleTitle) params.append("roleTitle", r);
    for (const e of chips.employmentType) params.append("employmentType", e);
    for (const a of chips.active) params.append("active", a);
    for (const m of chips.headManager) params.append("headManager", m);
    for (const c of chips.city) params.append("city", c);
    params.set("limit", "5000");
    return api<ExResponse>(`/api/experts?${params.toString()}`);
  }, [applied, chips, tenantId]);

  const { data, loading, reload } = useTileData(fetchExperts, {
    errorTitle: "خطا در دریافت فهرست کارشناسان",
    errorValue: (prev) => (prev ? { ...prev, rows: [] } : ({ rows: [], total: 0, filterOptions: { branches: [], employmentTypes: [], managers: [], roles: [], cities: [] }, dataSource: null } as unknown as ExResponse)),
  });

  /** اولویت ترتیب عین دستور پیشین مالک: مبایعه ↓ · اجاره ↓ · دارای کدپرسنلی+شعبه · نام */
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    list.sort((a, b) => {
      if (b.saleCount !== a.saleCount) return b.saleCount - a.saleCount;
      if (b.rentCount !== a.rentCount) return b.rentCount - a.rentCount;
      const aHas = a.personnelCode && a.branchTitle ? 1 : 0;
      const bHas = b.personnelCode && b.branchTitle ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return (a.fullName ?? "").localeCompare(b.fullName ?? "", "fa");
    });
    return list;
  }, [data?.rows]);

  const total = data?.total ?? 0;
  const kpis = useMemo(
    () => ({ ...expertFamilyStats(rows), withBranch: expertWithBranchCount(rows) }),
    [rows]
  );
  const options = data?.filterOptions ?? { branches: [], employmentTypes: [], managers: [], roles: [], cities: [] };
  const anyFilterActive = Object.values(applied).some((v) => v !== "") || Object.values(chips).some((a) => a.length > 0);
  // PN-009 مرحله F — شمارندهٔ فیلترهای فعال (الگوی [فیلترها ۵] بند ۶.۱) + چیپ‌های PN-011
  const activeFilterCount = Object.values(applied).filter((v) => v !== "").length + Object.values(chips).reduce((s, a) => s + a.length, 0);

  /** بروزرسانی فهرست — زنجیرهٔ سه‌مرحله‌ای PM با گزارش صادقانهٔ هر مرحله */
  const doSync = useCallback(async () => {
    setSyncing(true);
    setSyncStage(null);
    try {
      const res = await apiSync<{ ok: boolean; stage: SyncStage }>("/api/experts/sync", { method: "POST" });
      setSyncStage(res.stage);
      const s = res.stage;
      toast({
        title: "بروزرسانی فهرست کارشناسان انجام شد",
        description: s.registryError
          ? `رجیستری PM خطا داد: ${s.registryError.slice(0, 90)}`
          : `رجیستری: ${faNumber(s.registryRows)} نفر · عمق تازه: ${faNumber(s.deepEnriched)} نفر (باقی‌مانده: ${faNumber(s.deepRemaining)}) · شمارش: مبایعه ${faNumber(s.counts?.sale ?? 0)} / اجاره ${faNumber(s.counts?.rent ?? 0)}`,
      });
      await reload();
    } catch (e) {
      toast({ title: "بروزرسانی ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [toast, reload]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const applyFilters = () => setApplied(filters);
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setChips(EMPTY_CHIPS); };

  const { ptrRef, refreshing: ptrSpinning } = usePullToRefresh(() => void reload());

  return (
    <div data-negin="yaghut-kabud" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر yaghut-kabud */}
      <div className="negin-bar" aria-hidden />
      <PtrIndicator innerRef={ptrRef} spinning={ptrSpinning} />
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="experts" />

      {/* شاخص‌ها — رنگ بخش M4 (فیروزه‌ای) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل کارشناسان و کارکنان" value={loading ? undefined : faNumber(total)} icon={Users} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="دارای شعبه" value={loading ? undefined : faNumber(kpis.withBranch)} icon={Network} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="مجموع مبایعه نامه" value={loading ? undefined : faNumber(kpis.saleTotal)} sub="شامل پیش‌فروش" icon={FileSignature} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="مجموع اجاره نامه" value={loading ? undefined : faNumber(kpis.rentTotal)} sub="شامل تمدید اجاره" icon={Banknote} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
      </div>

      {/* جدول پوشش اطلاعات فهرست (تمام ستون‌ها) */}
      <TileCoverageTable tileKey="m4" accentClass="text-sec-m4-700" />

      {/* ─── بروزرسانی فهرست (زنجیرهٔ سه‌مرحله‌ای PM) ─── */}
      <Card className="border-sec-m4-200 bg-sec-m4-50" id="m4-update-section">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Building2 className="w-5 h-5 shrink-0 mt-0.5 text-sec-m4-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">بروزرسانی فهرست کارشناسان از سامانهٔ پرسنلی ملک تبریز</p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-1.5 shrink-0 bg-sec-m4-500 hover:bg-sec-m4-500/90 text-sec-m4-fg">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              {syncing ? "در حال بروزرسانی…" : "بروزرسانی فهرست"}
            </Button>
          </div>
          {syncStage && (
            <div className="rounded-md border border-sec-m4-200 bg-card p-3 text-xs space-y-1.5" data-testid="m4-sync-stage">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>رجیستری PM: <b>{faNumber(syncStage.registryRows)} نفر</b>{syncStage.registryError ? <span className="text-destructive"> — خطا: {syncStage.registryError}</span> : null}</span>
                <span>عمق تازه (استخدام/شعبه/آدرس): <b>{faNumber(syncStage.deepEnriched)}</b> از {faNumber(syncStage.deepAttempted)} — باقی‌مانده: <b>{faNumber(syncStage.deepRemaining)}</b></span>
                <span>شمارش: مبایعه <b>{faNumber(syncStage.counts?.sale ?? 0)}</b> · اجاره <b>{faNumber(syncStage.counts?.rent ?? 0)}</b></span>
                <span>مدت: <b>{faNumber(Math.round(syncStage.durationMs / 100) / 10)} ثانیه</b></span>
              </div>
              {syncStage.deepFailed > 0 && <p className="text-muted-foreground">{faNumber(syncStage.deepFailed)} ردیف در این برش پاسخ نداد — برش بعدی خودکار دوباره تلاش می‌کند.</p>}
              {syncStage.countsError && <p className="text-destructive">خطای شمارش: {syncStage.countsError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── فیلتر فهرست (تمام ستون‌ها) — PN-009 مرحله F: گروه‌بندی منطقی + آکاردئون موبایل ─── */}
      <Card className="border-sec-m4-200" id="m4-filter-section">
        <CardHeader className="py-4">
          <button
            type="button"
            className="flex items-center gap-2 text-base font-bold w-full"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            <Filter className="w-4 h-4 text-sec-m4-700" aria-hidden />
            فیلتر فهرست کارشناسان و کارکنان
            {anyFilterActive && <Badge variant="secondary" className="gap-1">فیلترها ({faNumber(activeFilterCount)})</Badge>}
            <span className="text-muted-foreground text-xs me-auto">{filtersOpen ? "بستن" : "باز کردن"}</span>
          </button>
        </CardHeader>
        {filtersOpen && (
        <CardContent className="p-4 pt-0 space-y-4">
          {/* جستجوی آزاد — گروه مستقل با عرض کامل */}
          <FilterGroup label="جستجو">
            <div className="relative">
              <Search className="w-4 h-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="exf-q" value={filters.q} onChange={(e) => setF("q", e.target.value)} placeholder="نام، موبایل، کدپرسنلی، آدرس…" className="ps-8" />
            </div>
          </FilterGroup>
          {/* هویت پرسنلی */}
          <FilterGroup label="هویت پرسنلی">
            {/* PN-028/خامساً-ف (دستور مالک) — فیلدهای متنی دوتایی: هر ردیف دو فیلد روبروهم */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exf-name">کارشناس (نام)</Label>
                <Input id="exf-name" value={filters.fullName} onChange={(e) => setF("fullName", e.target.value)} placeholder="نام کارشناس" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exf-mobile">موبایل</Label>
                <Input id="exf-mobile" value={filters.mobile} onChange={(e) => setF("mobile", e.target.value)} placeholder="موبایل" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exf-code">کدپرسنلی</Label>
                <Input id="exf-code" value={filters.personnelCode} onChange={(e) => setF("personnelCode", e.target.value)} placeholder="مثل 410031320" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exf-voip">شماره داخلی</Label>
                <Input id="exf-voip" value={filters.voipExtension} onChange={(e) => setF("voipExtension", e.target.value)} placeholder="داخلی" dir="ltr" />
              </div>
            </div>
          </FilterGroup>
          {/* سازمانی — PN-011 ثالثاً: فیلترهای چندگانه به شکل چیپ (همانند دسته‌بندی — دستور مالک) */}
          <FilterGroup
            label="سازمانی (چندانتخابی)"
            hint={chips.branchTitle.length + chips.roleTitle.length + chips.employmentType.length > 0 ? "اعمال خودکار با هر کلیک" : undefined}
          >
            <div className="space-y-2" id="exf-org-chips">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground w-14 shrink-0">شعبه:</span>
                {options.branches.map((b) => (
                  <FilterChip
                    key={`b:${b}`}
                    label={b}
                    active={chips.branchTitle.includes(b)}
                    onToggle={() => toggleChip("branchTitle", b)}
                    softClass={branchBadgeClass(b)}
                    solidClass={valueSolidClass(b)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground w-14 shrink-0">سمت:</span>
                {options.roles.map((r) => (
                  <FilterChip
                    key={`r:${r}`}
                    label={r}
                    active={chips.roleTitle.includes(r)}
                    onToggle={() => toggleChip("roleTitle", r)}
                    softClass={valueSoftClass(r)}
                    solidClass={valueSolidClass(r)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground w-14 shrink-0">همکاری:</span>
                {options.employmentTypes.map((e) => (
                  <FilterChip
                    key={`e:${e.value}`}
                    label={e.label}
                    active={chips.employmentType.includes(String(e.value))}
                    onToggle={() => toggleChip("employmentType", String(e.value))}
                    softClass={valueSoftClass(e.label)}
                    solidClass={valueSolidClass(e.label)}
                  />
                ))}
                <FilterChip
                  label="فعال"
                  active={chips.active.includes("true")}
                  onToggle={() => toggleChip("active", "true")}
                  softClass={valueSoftClass("فروش")}
                  solidClass={valueSolidClass("فروش")}
                />
                <FilterChip
                  label="غیرفعال"
                  active={chips.active.includes("false")}
                  onToggle={() => toggleChip("active", "false")}
                  softClass={valueSoftClass("تعیین نشده")}
                  solidClass={valueSolidClass("تعیین نشده")}
                />
              </div>
              {options.managers.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground w-14 shrink-0">مدیر:</span>
                  {options.managers.map((m) => (
                    <FilterChip
                      key={`m:${m}`}
                      label={m}
                      active={chips.headManager.includes(m)}
                      onToggle={() => toggleChip("headManager", m)}
                      softClass={valueSoftClass(m)}
                      solidClass={valueSolidClass(m)}
                    />
                  ))}
                </div>
              ) : null}
              {options.cities.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground w-14 shrink-0">شهر:</span>
                  {options.cities.map((c) => (
                    <FilterChip
                      key={`c:${c}`}
                      label={c}
                      active={chips.city.includes(c)}
                      onToggle={() => toggleChip("city", c)}
                      softClass={valueSoftClass(c)}
                      solidClass={valueSolidClass(c)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </FilterGroup>
          {/* تماس و نشانی */}
          <FilterGroup label="تماس و نشانی">
            {/* PN-028/خامساً-ف — دوتایی */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exf-address">آدرس</Label>
                <Input id="exf-address" value={filters.address} onChange={(e) => setF("address", e.target.value)} placeholder="بخشی از آدرس" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exf-tel">تلفن ثابت</Label>
                <Input id="exf-tel" value={filters.telephone} onChange={(e) => setF("telephone", e.target.value)} placeholder="تلفن" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exf-postal">کد پستی</Label>
                <Input id="exf-postal" value={filters.postalCode} onChange={(e) => setF("postalCode", e.target.value)} placeholder="کد پستی" dir="ltr" />
              </div>
            </div>
          </FilterGroup>
          {/* بازهٔ استخدام + شمارش قرارداد */}
          <FilterGroup label="بازهٔ استخدام و شمارش قرارداد">
            {/* PN-028/خامساً-ف — دوتایی */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>استخدام</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input id="exf-hire-from" type="date" value={filters.hireFrom} onChange={(e) => setF("hireFrom", e.target.value)} dir="ltr" aria-label="استخدام از" />
                  <Input id="exf-hire-to" type="date" value={filters.hireTo} onChange={(e) => setF("hireTo", e.target.value)} dir="ltr" aria-label="استخدام تا" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>مبایعه‌نامه</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input id="exf-sale-from" inputMode="numeric" value={filters.saleFrom} onChange={(e) => setF("saleFrom", e.target.value)} placeholder="از" dir="ltr" aria-label="مبایعه‌نامه از" />
                  <Input id="exf-sale-to" inputMode="numeric" value={filters.saleTo} onChange={(e) => setF("saleTo", e.target.value)} placeholder="تا" dir="ltr" aria-label="مبایعه‌نامه تا" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>اجاره‌نامه</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input id="exf-rent-from" inputMode="numeric" value={filters.rentFrom} onChange={(e) => setF("rentFrom", e.target.value)} placeholder="از" dir="ltr" aria-label="اجاره‌نامه از" />
                  <Input id="exf-rent-to" inputMode="numeric" value={filters.rentTo} onChange={(e) => setF("rentTo", e.target.value)} placeholder="تا" dir="ltr" aria-label="اجاره‌نامه تا" />
                </div>
              </div>
            </div>
          </FilterGroup>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={applyFilters} className="gap-1.5 bg-sec-m4-500 hover:bg-sec-m4-500/90 text-sec-m4-fg"><Search className="w-3.5 h-3.5" aria-hidden /> اعمال فیلتر</Button>
            <Button size="sm" variant="outline" onClick={clearFilters} className="gap-1.5" disabled={!anyFilterActive}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden /> پاک‌کردن
            </Button>
            <span className="text-xs text-muted-foreground">{anyFilterActive ? `نمایش ${faNumber(rows.length)} از ${faNumber(total)} ردیف` : `${faNumber(total)} ردیف`}</span>
          </div>
        </CardContent>
        )}
      </Card>

      {/* ─── فهرست کارشناسان ─── */}
      <Card>
        {/* PN-028/خامساً-ب (دستور مالک) — چیدمان الزامی سربرگ فهرست:
            ردیف ۱: عنوان وسط‌چین · ردیف ۲: اکسل کل فهرست */}
        <CardHeader className="py-4 flex flex-col items-center gap-2">
          <CardTitle className="text-base text-center">فهرست کارشناسان و کارکنان</CardTitle>
          <div className="w-full flex items-center justify-between gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-[11px]"
              onClick={() => {
                const params = new URLSearchParams();
                // PN-044/فاز ۴ — خروجی اکسل هم tenant همین رندر را می‌گیرد
                params.set("tenantId", tenantId ?? "tabriz");
                const set = (k: string, v: string) => { if (v && v !== "all") params.set(k, v); };
                set("q", applied.q); set("fullName", applied.fullName); set("mobile", applied.mobile);
                set("personnelCode", applied.personnelCode);
                set("address", applied.address);
                // PN-011 ثالثاً — خروجی اکسل نیز فیلترهای چیپی فعال را رعایت می‌کند
                for (const b of chips.branchTitle) params.append("branchTitle", b);
                for (const r of chips.roleTitle) params.append("roleTitle", r);
                for (const a of chips.active) params.append("active", a);
                for (const m of chips.headManager) params.append("headManager", m);
                for (const e of chips.employmentType) params.append("employmentType", e);
                for (const c of chips.city) params.append("city", c);
                apiBlob(`/api/experts/export?${params.toString()}`)
                  .then((blob) => {
                    downloadBlob(blob, `melka-experts-${new Date().toISOString().slice(0, 10)}.xlsx`);
                    toast({ title: "خروجی اکسل آماده شد", description: "فهرست کارشناسان با تمام ستون‌ها دانلود شد." });
                  })
                  .catch((e) => toast({ title: "خروجی اکسل ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" }));
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden /> اکسل کل فهرست
            </Button>
          </div>
          {rows.length > 0 && <Badge variant="secondary">{faNumber(rows.length)} ردیف — تک‌صفحه‌ای</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">ردیف</TableHead>
                  <TableHead className="min-w-40">کارشناس</TableHead>
                  <TableHead className="min-w-24">کد پرسنلی</TableHead>
                  <TableHead className="min-w-24">شعبه</TableHead>
                  <TableHead className="min-w-24">مبایعه نامه</TableHead>
                  <TableHead className="min-w-24">اجاره نامه</TableHead>
                  <TableHead className="min-w-24">تاریخ استخدام</TableHead>
                  <TableHead className="min-w-36">آدرس کارشناس</TableHead>
                  <TableHead className="min-w-24">سمت پرسنلی</TableHead>
                  <TableHead className="min-w-24">نوع همکاری</TableHead>
                  <TableHead className="min-w-24">مدیر</TableHead>
                  <TableHead className="min-w-24">تلفن ثابت</TableHead>
                  <TableHead className="min-w-20">کد پستی</TableHead>
                  <TableHead className="min-w-16">داخلی</TableHead>
                  <TableHead className="min-w-20">وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
                {(r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                    {/* کارشناس — نام + موبایل زیر نام (الزامی مالک) */}
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1.5 truncate max-w-44 font-bold" title={r.fullName ?? undefined}>
                          {r.active ? <CheckCircle2 className="w-3.5 h-3.5 text-sec-m4-700 shrink-0" aria-hidden /> : <UserCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />} {dash(r.fullName)}
                        </span>
                        {r.mobile ? (
                          <a href={`tel:${r.mobile}`} dir="ltr" className="font-mono text-[11px] text-sec-m4-700 hover:underline w-fit tabular-nums" title={`تماس با کارشناس: ${faDigits(r.mobile)}`}>
                            {faDigits(r.mobile)}
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    {/* کدپرسنلی (الزامی مالک — مثل 410031320) */}
                    <TableCell className="whitespace-nowrap">
                      {r.personnelCode ? (
                        <span className="inline-flex items-center gap-1 font-bold tabular-nums" dir="ltr" title="کد پرسنلی از سامانهٔ PM (realtors/list — code)">
                          <IdCard className="w-3 h-3 text-sec-m4-700 shrink-0" aria-hidden /> {faDigits(r.personnelCode)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-bold">-</span>
                      )}
                    </TableCell>
                    {/* شعبه (الزامی مالک — عین PM personnelInfo.branchId.title) */}
                    <TableCell>
                      {r.branchTitle ? (
                        <Badge variant="outline" className={`gap-1 text-[11px] border-0 ${branchBadgeClass(r.branchTitle)}`} title="شعبهٔ عین سامانهٔ PM (personnelInfo.branchId.title)">
                          <Network className="w-3 h-3" aria-hidden /> {r.branchTitle}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground font-bold">-</span>
                      )}
                    </TableCell>
                    {/* مبایعه نامه = تعداد + پیش‌فروش (الزامی مالک) */}
                    <TableCell className="text-center font-bold tabular-nums">
                      <span className={r.saleCount > 0 ? "text-sec-m4-700" : "text-muted-foreground"}>{faNumber(r.saleCount)}</span>
                    </TableCell>
                    {/* اجاره نامه = تعداد + تمدید (الزامی مالک) */}
                    <TableCell className="text-center font-bold tabular-nums">
                      <span className={r.rentCount > 0 ? "text-sec-m4-700" : "text-muted-foreground"}>{faNumber(r.rentCount)}</span>
                    </TableCell>
                    {/* تاریخ استخدام (الزامی مالک) */}
                    <TableCell className="whitespace-nowrap">
                      {r.hireDate && /\d{4}-\d{2}-\d{2}/.test(r.hireDate) ? (
                        <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium" title={r.hireDate}>
                          <CalendarClock className="w-3 h-3 text-sec-m4-700 shrink-0" aria-hidden /> {faJalaliShort(r.hireDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-bold">-</span>
                      )}
                    </TableCell>
                    {/* آدرس (الزامی مالک — دقیق) */}
                    <TableCell className="whitespace-normal text-xs max-w-52">
                      {r.address ? (
                        <span className="inline-flex items-start gap-1" title={r.address}>
                          <MapPin className="w-3 h-3 mt-0.5 text-sec-m4-700 shrink-0" aria-hidden /> <span className="line-clamp-2">{r.address}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-bold">-</span>
                      )}
                    </TableCell>
                    {/* سمت پرسنلی — PN-011 ثانیاً: رنگ از رجیستری (قانون ۱۲: هر سمت رنگ یکتا در ستون) */}
                    <TableCell className="whitespace-nowrap">
                      {r.roleTitle ? (
                        <Badge variant="secondary" className={`gap-1 text-[10px] border-0 ${valueSoftClass(r.roleTitle)}`}>
                          <BriefcaseBusiness className="w-2.5 h-2.5" aria-hidden /> {r.roleTitle}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground font-bold">-</span>
                      )}
                    </TableCell>
                    {/* نوع همکاری */}
                    <TableCell className="whitespace-nowrap text-[11px]">{dash(r.employmentTypeFa)}</TableCell>
                    {/* مدیر */}
                    <TableCell className="whitespace-nowrap text-xs">{dash(r.headManager)}</TableCell>
                    {/* تلفن ثابت */}
                    <TableCell className="whitespace-nowrap text-xs tabular-nums" dir="ltr">{dash(r.telephone)}</TableCell>
                    {/* کد پستی */}
                    <TableCell className="whitespace-nowrap text-xs tabular-nums" dir="ltr">{dash(r.postalCode)}</TableCell>
                    {/* داخلی */}
                    <TableCell className="whitespace-nowrap text-xs tabular-nums" dir="ltr">{dash(r.voipExtension)}</TableCell>
                    {/* وضعیت */}
                    <TableCell>
                      <Badge variant={r.active ? "default" : "secondary"} className="text-[10px]">{r.active ? "فعال" : "غیرفعال"}</Badge>
                    </TableCell>
                  </TableRow>
                )}
              </TableBodyVirtual>
            </Table>
          </div>
          {loading && rows.length === 0 && (
            <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          )}
          {!loading && rows.length === 0 && <EmptyState hasFilters={anyFilterActive} onClearFilters={clearFilters} />}
          {viewMode === "cards" && rows.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center pt-2">{faNumber(rows.length)} ردیف — نمایش جدولی</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ExpertsPage;
