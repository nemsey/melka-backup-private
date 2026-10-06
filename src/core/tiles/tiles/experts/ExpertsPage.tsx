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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePullToRefresh, PtrIndicator } from "@/hooks/use-pull-to-refresh";
import { EmptyState } from "@/components/app/shared/list-states";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, Users, Network, Building2, Banknote, FileSignature, MapPin, Filter,
  RefreshCw, CheckCircle2, IdCard, CalendarClock, BriefcaseBusiness, FileSpreadsheet, UserCheck, Phone,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, TileCoverageTable, useTileData, type DataSourceInfo } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, apiSync, apiBlob, downloadBlob } from "@/lib/client/api";
import { faNumber, faJalaliShort } from "@/lib/format";
import { branchBadgeClass } from "@/lib/value-colors";
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
  branchTitle: "",
  roleTitle: "",
  employmentType: "all",
  headManager: "",
  address: "",
  telephone: "",
  postalCode: "",
  voipExtension: "",
  city: "",
  active: "all",
  hireFrom: "",
  hireTo: "",
  saleFrom: "",
  saleTo: "",
  rentFrom: "",
  rentTo: "",
};
type Filters = typeof EMPTY_FILTERS;

export function ExpertsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState<SyncStage | null>(null);
  const viewMode = String(settings.viewMode ?? "table");

  const fetchExperts = useCallback(async (): Promise<ExResponse> => {
    const params = new URLSearchParams();
    const set = (k: keyof Filters, v: string) => { if (v && v !== "all") params.set(k, v); };
    set("q", applied.q);
    set("fullName", applied.fullName);
    set("mobile", applied.mobile);
    set("personnelCode", applied.personnelCode);
    set("branchTitle", applied.branchTitle);
    set("roleTitle", applied.roleTitle);
    set("employmentType", applied.employmentType);
    set("headManager", applied.headManager);
    set("address", applied.address);
    set("telephone", applied.telephone);
    set("postalCode", applied.postalCode);
    set("voipExtension", applied.voipExtension);
    set("city", applied.city);
    set("active", applied.active);
    set("hireFrom", applied.hireFrom);
    set("hireTo", applied.hireTo);
    set("saleFrom", applied.saleFrom);
    set("saleTo", applied.saleTo);
    set("rentFrom", applied.rentFrom);
    set("rentTo", applied.rentTo);
    params.set("limit", "5000");
    return api<ExResponse>(`/api/experts?${params.toString()}`);
  }, [applied]);

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
  const anyFilterActive = Object.values(applied).some((v) => v !== "" && v !== "all");

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
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };

  const { ptrRef, refreshing: ptrSpinning } = usePullToRefresh(() => void reload());

  return (
    <div className="space-y-6">
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
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-1.5">
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

      {/* ─── فیلتر فهرست (تمام ستون‌ها) ─── */}
      <Card className="border-sec-m4-200" id="m4-filter-section">
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4 text-sec-m4-700" aria-hidden /> فیلتر فهرست کارشناسان و کارکنان</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* جستجوی آزاد + متن‌ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="exf-q">جستجو در همهٔ ستون‌ها</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="exf-q" value={filters.q} onChange={(e) => setF("q", e.target.value)} placeholder="نام، موبایل، کدپرسنلی، آدرس…" className="ps-8" />
              </div>
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="exf-voip">شماره داخلی</Label>
              <Input id="exf-voip" value={filters.voipExtension} onChange={(e) => setF("voipExtension", e.target.value)} placeholder="داخلی" dir="ltr" />
            </div>
          </div>
          {/* انتخابی‌ها از دادهٔ زندهٔ ستون‌ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>شعبه</Label>
              <Select value={filters.branchTitle || "all"} onValueChange={(v) => setF("branchTitle", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="همهٔ شعب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ شعب</SelectItem>
                  {options.branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>سمت پرسنلی</Label>
              <Select value={filters.roleTitle || "all"} onValueChange={(v) => setF("roleTitle", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="همهٔ سمت‌ها" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ سمت‌ها</SelectItem>
                  {options.roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>نوع همکاری</Label>
              <Select value={filters.employmentType} onValueChange={(v) => setF("employmentType", v)}>
                <SelectTrigger><SelectValue placeholder="همهٔ انواع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ انواع</SelectItem>
                  {options.employmentTypes.map((e) => <SelectItem key={e.value} value={String(e.value)}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>مدیر</Label>
              <Select value={filters.headManager || "all"} onValueChange={(v) => setF("headManager", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="همهٔ مدیران" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ مدیران</SelectItem>
                  {options.managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>شهر</Label>
              <Select value={filters.city || "all"} onValueChange={(v) => setF("city", v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="همهٔ شهرها" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ شهرها</SelectItem>
                  {options.cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>وضعیت</Label>
              <Select value={filters.active} onValueChange={(v) => setF("active", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="true">فعال</SelectItem>
                  <SelectItem value="false">غیرفعال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* بازهٔ تاریخ استخدام */}
            <div className="space-y-1.5">
              <Label htmlFor="exf-hire-from">استخدام از</Label>
              <Input id="exf-hire-from" type="date" value={filters.hireFrom} onChange={(e) => setF("hireFrom", e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exf-hire-to">استخدام تا</Label>
              <Input id="exf-hire-to" type="date" value={filters.hireTo} onChange={(e) => setF("hireTo", e.target.value)} dir="ltr" />
            </div>
          </div>
          {/* بازهٔ شمارش‌ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exf-sale-from">مبایعه‌نامه از</Label>
              <Input id="exf-sale-from" inputMode="numeric" value={filters.saleFrom} onChange={(e) => setF("saleFrom", e.target.value)} placeholder="حداقل" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exf-sale-to">مبایعه‌نامه تا</Label>
              <Input id="exf-sale-to" inputMode="numeric" value={filters.saleTo} onChange={(e) => setF("saleTo", e.target.value)} placeholder="حداکثر" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exf-rent-from">اجاره‌نامه از</Label>
              <Input id="exf-rent-from" inputMode="numeric" value={filters.rentFrom} onChange={(e) => setF("rentFrom", e.target.value)} placeholder="حداقل" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exf-rent-to">اجاره‌نامه تا</Label>
              <Input id="exf-rent-to" inputMode="numeric" value={filters.rentTo} onChange={(e) => setF("rentTo", e.target.value)} placeholder="حداکثر" dir="ltr" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={applyFilters} className="gap-1.5"><Search className="w-3.5 h-3.5" aria-hidden /> اعمال فیلتر</Button>
            <Button size="sm" variant="outline" onClick={clearFilters} className="gap-1.5" disabled={!anyFilterActive}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden /> پاک‌کردن
            </Button>
            <span className="text-xs text-muted-foreground">{anyFilterActive ? `نمایش ${faNumber(rows.length)} از ${faNumber(total)} ردیف` : `${faNumber(total)} ردیف`}</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── فهرست کارشناسان ─── */}
      <Card>
        <CardHeader className="py-4 flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <CardTitle className="text-base text-center">فهرست کارشناسان و کارکنان</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-[11px]"
              onClick={() => {
                const params = new URLSearchParams();
                const set = (k: string, v: string) => { if (v && v !== "all") params.set(k, v); };
                set("q", applied.q); set("fullName", applied.fullName); set("mobile", applied.mobile);
                set("personnelCode", applied.personnelCode); set("branchTitle", applied.branchTitle);
                set("roleTitle", applied.roleTitle); set("headManager", applied.headManager);
                set("address", applied.address); set("active", applied.active);
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
                    {/* سمت پرسنلی */}
                    <TableCell className="whitespace-nowrap">
                      {r.roleTitle ? (
                        <Badge variant="secondary" className="gap-1 text-[10px] border border-sec-m4-200 bg-sec-m4-50 text-sec-m4-700">
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
