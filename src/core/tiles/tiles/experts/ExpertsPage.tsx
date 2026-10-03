"use client";

/**
 * کاشی «کارشناسان ملک تبریز» — صفحه داخلی (P6530/گام ۴ + P6546/گام چهارم)
 * ------------------------------------------------------
 * فهرست — عین دستور مالک (P6546/گام چهارم):
 *   ردیف · کارشناس (نام + موبایل زیر نام) · تاریخ استخدام (بلافاصله پس از نام —
 *   بند ۲) · کد پرسنلی (بدون کد = «-» — بند ۳) · شعبه · نقش پرسنلی ·
 *   مبایعه نامه (مجموع مبایعه‌نامه + پیش‌فروش) · اجاره نامه (اجاره + تمدید) ·
 *   آدرس کارشناس · وضعیت (فعال/غیرفعال)
 *
 * اولویت ترتیب قرارگیری (P6546/گام چهارم-۱):
 *   ۱. تعداد بالای معاملات مبایعه‌نامه (مجموع مبایعه‌نامه + پیش‌فروش)
 *   ۲. تعداد بالای معاملات اجاره‌نامه (مجموع اجاره‌نامه + تمدید اجاره)
 *   ۳. دارای کد پرسنلی و شعبه
 *
 * حذف‌های P6546/گام چهارم (بند ۶):
 *   · بینش «فعال‌ترین کارشناسان مبایعه‌نامه (۲۰ نفر برتر)»
 *   · بینش «شاهد سامانهٔ مالی — بیشترین قرارداد ثبت‌شده (کل کسب‌وکار)»
 *
 * فیلتر بر اساس تمام ستون‌ها + جدول پوشش تمام ستون‌ها (گام پنجم)
 * رنگ بخش: فیروزه‌ای #0891B2 (گام صفر — sec-m4)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, Users, UserCheck, Phone, RefreshCw, Hash, CheckCircle2,
  Network, Building2, Banknote, FileSignature, MapPin, Filter, History, IdCard, CalendarClock, BriefcaseBusiness,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceWarning, TileCoverageTable, useTileData, type DataSourceInfo } from "@/components/app/shared";
import { useTileFreshness } from "@/components/app/TileCard";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { faDigits } from "@/lib/jalali";
import { TABRIZ_BRANCHES, BRANCH_UNSET } from "@/lib/branches";
import { expertFamilyStats } from "@/core/agent/analyzers";

interface ExRow {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  role: string;
  businessTitle: string;
  creator: string | null;
  active: boolean;
  createdAt: string;
  /** P6.5-12 — کد پرسنلی واقعی از سامانهٔ PM (منبع حقیقت) */
  pmCode: string | null;
  /** مبایعه نامه = مجموع مبایعه‌نامه + پیش‌فروش (نکته ۳) */
  saleCount: number;
  /** اجاره نامه = مجموع اجاره + تمدید اجاره (نکته ۴) */
  rentCount: number;
  /** P6530/گام ۴ — شعبهٔ کارشناس (زنجیرهٔ تفکیک) */
  branch: string;
  /** P6530/گام ۴ — آدرس کارشناس */
  address: string | null;
  /** P6546/گام چهارم-۲ — تاریخ استخدام از سامانهٔ PM (personnelInfo) */
  hireDate: string | null;
  /** P6546/گام چهارم-۴ — نقش/عنوان شغلی پرسنلی از سامانهٔ PM */
  roleTitle: string | null;
}

interface ExResponse {
  rows: ExRow[];
  total: number;
  branches?: { registry: string[]; resolvedCount: number };
  dataSource: DataSourceInfo;
  lastUpdate?: { lastSuccessAt: string | null; lastSyncedAt: string | null; attempts: number } | null;
}

const EMPTY_FILTERS = {
  fullName: "",
  personnelCode: "",
  branch: "",
  saleFrom: "",
  saleTo: "",
  rentFrom: "",
  rentTo: "",
  address: "",
  active: "all",
};
type Filters = typeof EMPTY_FILTERS;

export function ExpertsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [syncing, setSyncing] = useState(false);
  const viewMode = String(settings.viewMode ?? "cards");

  const fetchExperts = useCallback(async (): Promise<ExResponse> => {
    const params = new URLSearchParams();
    if (applied.fullName) params.set("fullName", applied.fullName);
    if (applied.personnelCode) params.set("personnelCode", applied.personnelCode);
    if (applied.branch) params.set("branch", applied.branch);
    if (applied.address) params.set("address", applied.address);
    if (applied.saleFrom) params.set("saleFrom", applied.saleFrom);
    if (applied.saleTo) params.set("saleTo", applied.saleTo);
    if (applied.rentFrom) params.set("rentFrom", applied.rentFrom);
    if (applied.rentTo) params.set("rentTo", applied.rentTo);
    if (applied.active !== "all") params.set("active", applied.active);
    // بدون صفحه‌بندی: همهٔ کارشناسان در یک صفحه (سقف سرور ۵۰۰۰)
    params.set("limit", "5000");
    return api<ExResponse>(`/api/crm/experts?${params.toString()}`);
  }, [applied]);

  const { data, loading, reload } = useTileData(fetchExperts, {
    errorTitle: "خطا در دریافت کارشناسان",
    errorValue: (prev) => (prev ? { ...prev, rows: [] } : ({ rows: [], total: 0, dataSource: null } as unknown as ExResponse)),
  });

  // P6546/گام چهارم-۱ — اولویت ترتیب عین دستور مالک:
  //   ۱) مبایعه‌نامه (مجموع مبایعه‌نامه + پیش‌فروش) نزولی
  //   ۲) اجاره‌نامه (مجموع اجاره + تمدید) نزولی
  //   ۳) دارای کد پرسنلی و شعبه (سپس الفبای فارسی برای ثبات)
  const rows = useMemo(() => {
    const list = [...(data?.rows ?? [])];
    list.sort((a, b) => {
      if (b.saleCount !== a.saleCount) return b.saleCount - a.saleCount; // اولویت ۱
      if (b.rentCount !== a.rentCount) return b.rentCount - a.rentCount; // اولویت ۲
      const aHas = a.pmCode && a.branch !== BRANCH_UNSET ? 1 : 0; // اولویت ۳
      const bHas = b.pmCode && b.branch !== BRANCH_UNSET ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      return a.fullName.localeCompare(b.fullName, "fa"); // ثبات نمایش
    });
    return list;
  }, [data]);
  const total = data?.total ?? 0;
  const lastUpdate = data?.lastUpdate ?? null;
  const freshness = useTileFreshness("experts");

  // P6530/گام ۴ — محاسبهٔ خالص در analyzers (صفحه فقط فرمت می‌کند — قانون P1-02)
  const kpis = useMemo(() => expertFamilyStats(rows), [rows]);
  // P6546/گام سوم-۳ — بنر خطای استخراج زنده حذف شد؛ دادهٔ کش‌شدهٔ سالم سرو می‌شود

  /** بروزرسانی فهرست کارشناسان و کارکنان (بند ۴) — زنجیرهٔ ARM و PM */
  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api<{ ok: boolean; busy?: boolean; main?: { ok: boolean; experts?: number; error?: string } }>("/api/sync/all", { method: "POST" });
      if (res.busy) {
        toast({ title: "انتقال در حال اجراست", description: "پس از پایان اجرای جاری دوباره بزنید." });
        return;
      }
      toast({
        title: "بروزرسانی فهرست کارشناسان انجام شد",
        description: res.main?.ok
          ? `${faNumber(res.main.experts ?? 0)} کارشناس و کارمند از سامانه‌های ARM و PM خوانده شد — ادامه از آخرین نقطهٔ بروزرسانی قبلی.`
          : "خلاصه‌ای برای گزارش نیست — جزئیات در شاهد انتقال.",
      });
      await reload();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بروزرسانی ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [toast, reload]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const anyFilterActive = Object.values(applied).some((v) => v !== "" && v !== "all");

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="experts" />

      {/* شاخص‌ها — رنگ بخش M4 (فیروزه‌ای) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل کارشناسان و کارکنان" value={loading ? undefined : faNumber(total)} icon={Users} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="فعال" value={loading ? undefined : faNumber(kpis.active)} icon={UserCheck} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="مجموع مبایعه نامه" value={loading ? undefined : faNumber(kpis.saleTotal)} sub="شامل پیش‌فروش" icon={FileSignature} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
        <KpiCard label="مجموع اجاره نامه" value={loading ? undefined : faNumber(kpis.rentTotal)} sub="شامل تمدید اجاره" icon={Banknote} iconWrapperClassName="bg-sec-m4-50" iconColorClassName="text-sec-m4-700" />
      </div>

      {/* شفافیت منبع داده — P6546/گام سوم-۳: بنر خطای زنده حذف شد؛ کش سالم سرو می‌شود */}

      {/* P6546/گام پنجم-الف-۲ — جدول پوشش اطلاعات فهرست (تمام ستون‌ها) */}
      <TileCoverageTable tileKey="m4" accentClass="text-sec-m4-700" />

      {/* بخش بروزرسانی فهرست کارشناسان و کارکنان (بند ۴) */}
      <Card className="border-sec-m4-200 bg-sec-m4-50" id="m4-update-section">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Building2 className="w-5 h-5 shrink-0 mt-0.5 text-sec-m4-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">بروزرسانی فهرست کارشناسان و کارکنان از سامانه‌های ملک تبریز</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  نام، موبایل، کد پرسنلی و وضعیت هر کارشناس و کارمند با زنجیرهٔ عین خود سامانه‌های ARM و PM بروزرسانی می‌شود؛ شمارش مبایعه نامه (با پیش‌فروش) و اجاره نامه (با تمدید) از صورت‌وضعیت‌های واقعی سامانه محاسبه می‌شود.
                </p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-2 shrink-0 bg-sec-m4-500 hover:bg-sec-m4-500/90 text-sec-m4-fg">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>
          {/* بند ۴.۲ — تاریخ و ساعت دقیق آخرین بروزرسانی */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" id="m4-last-update">
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">آخرین بروزرسانی موفق</p>
              <p className="font-bold mt-0.5">
                {lastUpdate?.lastSuccessAt || freshness?.lastUpdatedAt
                  ? faDateTime((lastUpdate?.lastSuccessAt ?? freshness!.lastUpdatedAt) as string)
                  : "هنوز انجام نشده"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">رکوردهای کش‌شدهٔ کارشناسان</p>
              <p className="font-bold mt-0.5 tabular-nums">{freshness ? faNumber(freshness.recordCount) : "—"}</p>
            </div>
            <div className="rounded-lg border bg-card p-2.5">
              <p className="text-muted-foreground">منبع داده</p>
              <p className="font-bold mt-0.5">{freshness?.sourceLabel ?? "سامانه‌های ملک تبریز (ARM و PM)"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فیلترها — تمام ستون‌های فهرست (بند ۲) */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Filter className="w-4 h-4 text-sec-m4-700" aria-hidden />
              فیلتر فهرست کارشناسان و کارکنان — بر اساس تمام ستون‌ها
              {anyFilterActive && <Badge variant="secondary" className="gap-1">فیلتر فعال</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">{faNumber(rows.length)} ردیف</span>
          </div>
          <form
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...filters });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="m4-fullName">کارشناس (نام یا موبایل)</Label>
              <Input
                id="m4-fullName"
                value={filters.fullName}
                onChange={(e) => setF("fullName", e.target.value)}
                placeholder="نمونه: شهریار بابایان یا ۰۹۱۴…"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m4-personnelCode">کد پرسنلی</Label>
              <Input
                id="m4-personnelCode"
                value={filters.personnelCode}
                onChange={(e) => setF("personnelCode", e.target.value)}
                placeholder="نمونه: ۴۱۰۰۳۱۳۲۰"
                inputMode="numeric"
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
              <Label>وضعیت</Label>
              <Select value={filters.active} onValueChange={(v) => setF("active", v)}>
                <SelectTrigger aria-label="فیلتر وضعیت">
                  <SelectValue placeholder="همه" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="true">فعال</SelectItem>
                  <SelectItem value="false">غیرفعال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m4-sale-from">مبایعه نامه از (تعداد)</Label>
              <Input
                id="m4-sale-from"
                value={filters.saleFrom}
                onChange={(e) => setF("saleFrom", e.target.value)}
                placeholder="نمونه: ۵"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m4-sale-to">مبایعه نامه تا (تعداد)</Label>
              <Input
                id="m4-sale-to"
                value={filters.saleTo}
                onChange={(e) => setF("saleTo", e.target.value)}
                placeholder="نمونه: ۵۰"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m4-rent-from">اجاره نامه از (تعداد)</Label>
              <Input
                id="m4-rent-from"
                value={filters.rentFrom}
                onChange={(e) => setF("rentFrom", e.target.value)}
                placeholder="نمونه: ۲"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m4-rent-to">اجاره نامه تا (تعداد)</Label>
              <Input
                id="m4-rent-to"
                value={filters.rentTo}
                onChange={(e) => setF("rentTo", e.target.value)}
                placeholder="نمونه: ۳۰"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="m4-address">آدرس کارشناس</Label>
              <Input
                id="m4-address"
                value={filters.address}
                onChange={(e) => setF("address", e.target.value)}
                placeholder="نمونه: خیابان ارتش"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="flex gap-2 lg:col-span-2">
              <Button type="submit" className="gap-2 flex-1 bg-sec-m4-500 hover:bg-sec-m4-500/90 text-sec-m4-fg">
                <Search className="w-4 h-4" aria-hidden /> اعمال فیلتر
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setApplied(EMPTY_FILTERS);
                }}
                className="gap-2"
                aria-label="پاک کردن فیلترها"
              >
                <RotateCcw className="w-4 h-4" aria-hidden /> پاک کردن
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* فهرست هشت‌ستونی — تک‌صفحه‌ای */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Users className="w-10 h-10 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm font-bold">هیچ کارشناسی مطابق پیدا نشد</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {total === 0
                ? "هنوز فهرست کارشناسان از سامانه‌های ملک تبریز استخراج نشده است — دکمه «بروزرسانی از سامانه» را بزنید."
                : "فیلترها را تغییر دهید یا آن‌ها را پاک کنید."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="py-4 flex flex-col items-center gap-1">
            <CardTitle className="text-base text-center">فهرست کارشناسان و کارکنان — رجیستری سامانه‌های ARM و PM ملک تبریز</CardTitle>
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
                    <TableHead className="min-w-40">کارشناس</TableHead>
                    {/* P6546/گام چهارم-۲ — تاریخ استخدام بلافاصله پس از نام کارشناس */}
                    <TableHead className="min-w-24">تاریخ استخدام</TableHead>
                    <TableHead className="min-w-24">کد پرسنلی</TableHead>
                    <TableHead className="min-w-24">شعبه</TableHead>
                    {/* P6546/گام چهارم-۴ — نقش پرسنلی از ساختار سامانهٔ PM */}
                    <TableHead className="min-w-24">نقش پرسنلی</TableHead>
                    <TableHead className="min-w-24">مبایعه نامه</TableHead>
                    <TableHead className="min-w-24">اجاره نامه</TableHead>
                    <TableHead className="min-w-36">آدرس کارشناس</TableHead>
                    <TableHead className="min-w-20">وضعیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBodyVirtual rows={rows} rowKey={(r) => r.id}>
                  {(r, i) => (
                    <TableRow key={r.id}>
                      {/* ۱ — ردیف */}
                      <TableCell className="text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                      {/* ۲ — کارشناس: نام + موبایل زیر نام (نکته ۱ + مهم ۱ — عین الگوی فروشنده/خریدار M3) */}
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1.5 truncate max-w-44 font-bold" title={r.fullName}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-sec-m4-700 shrink-0" aria-hidden /> {r.fullName}
                          </span>
                          {r.mobile ? (
                            <a
                              href={`tel:${r.mobile}`}
                              dir="ltr"
                              className="font-mono text-[11px] text-sec-m4-700 hover:underline w-fit tabular-nums"
                              title={`تماس با کارشناس: ${faDigits(r.mobile)}`}
                            >
                              {faDigits(r.mobile)}
                            </a>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">موبایل ثبت‌نشده</span>
                          )}
                        </div>
                      </TableCell>
                      {/* ۳ — تاریخ استخدام (P6546/گام چهارم-۲ — بلافاصله پس از نام؛ از PM personnelInfo) */}
                      <TableCell className="whitespace-nowrap">
                        {r.hireDate ? (
                          <span className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium" title={r.hireDate}>
                            <CalendarClock className="w-3 h-3 text-sec-m4-700 shrink-0" aria-hidden />
                            {/\d{4}-\d{2}-\d{2}/.test(r.hireDate) ? faDateTime(r.hireDate) : faDigits(r.hireDate)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>
                      {/* ۴ — کد پرسنلی (منبع حقیقت: PM — بدون کد = «-» بند ۳) */}
                      <TableCell className="whitespace-nowrap">
                        {r.pmCode ?? r.personnelCode ? (
                          <span className="inline-flex items-center gap-1 font-bold tabular-nums" dir="ltr" title={r.pmCode ? `کد پرسنلی از سامانهٔ PM: ${faDigits(r.pmCode)}` : "کد پرسنلی از رجیستری کارشناسان ARM"}>
                            <IdCard className="w-3 h-3 text-sec-m4-700 shrink-0" aria-hidden />
                            {faDigits(r.pmCode ?? r.personnelCode)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-bold" title="این رکورد در سامانهٔ PM کد پرسنلی ندارد">-</span>
                        )}
                      </TableCell>
                      {/* ۵ — شعبه */}
                      <TableCell>
                        {r.branch && r.branch !== BRANCH_UNSET ? (
                          <Badge variant="outline" className="gap-1 text-[11px] border-sec-m4-200 bg-sec-m4-50 text-sec-m4-700">
                            <Network className="w-3 h-3" aria-hidden /> {r.branch}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">{BRANCH_UNSET}</span>
                        )}
                      </TableCell>
                      {/* ۵-ب — نقش پرسنلی (P6546/گام چهارم-۴ — از ساختار سامانهٔ PM) */}
                      <TableCell className="whitespace-nowrap">
                        {r.roleTitle ? (
                          <Badge variant="secondary" className="gap-1 text-[10px] border border-sec-m4-200 bg-sec-m4-50 text-sec-m4-700">
                            <BriefcaseBusiness className="w-2.5 h-2.5" aria-hidden /> {r.roleTitle}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>
                      {/* ۵ — مبایعه نامه = مبایعه‌نامه + پیش‌فروش (نکته ۳) */}
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" title="مجموع معاملات مبایعه‌نامه و پیش‌فروش">
                          <FileSignature className="w-3.5 h-3.5 text-sec-m4-700 shrink-0" aria-hidden />
                          {faNumber(r.saleCount)}
                        </span>
                      </TableCell>
                      {/* ۶ — اجاره نامه = اجاره + تمدید اجاره (نکته ۴) */}
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" title="مجموع معاملات اجاره و تمدید اجاره">
                          <Banknote className="w-3.5 h-3.5 text-sec-m4-700 shrink-0" aria-hidden />
                          {faNumber(r.rentCount)}
                        </span>
                      </TableCell>
                      {/* ۷ — آدرس کارشناس */}
                      <TableCell className="whitespace-normal">
                        <span className="inline-flex items-start gap-1.5 leading-relaxed">
                          <MapPin className="w-3.5 h-3.5 text-sec-m4-700 mt-0.5 shrink-0" aria-hidden />
                          <span className="text-xs">{r.address ?? "ثبت نشده در سامانه"}</span>
                        </span>
                      </TableCell>
                      {/* ۸ — وضعیت (فعال/غیرفعال — نکته ۵) */}
                      <TableCell>
                        {r.active ? (
                          <Badge className="gap-1 text-[11px] bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/30" variant="secondary">
                            <UserCheck className="w-3 h-3" aria-hidden /> فعال
                          </Badge>
                        ) : (
                          <Badge className="gap-1 text-[11px] bg-stone-500/15 text-stone-700 dark:text-stone-400 border border-stone-500/30" variant="secondary">
                            غیرفعال
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBodyVirtual>
              </Table>
            </div>
            <p className="p-3 text-xs text-muted-foreground text-center border-t">
              {faNumber(rows.length)} کارشناس و کارمند در یک صفحه — لیست تک‌صفحه‌ای و بی‌نهایت (بدون صفحه‌بندی)
              {" · مبایعه نامه = مبایعه‌نامه + پیش‌فروش · اجاره نامه = اجاره + تمدید اجاره"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
