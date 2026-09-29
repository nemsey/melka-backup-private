"use client";

/**
 * کاشی «کارشناسان ملک تبریز» — صفحه داخلی (P6530/گام ۴ — دستور مالک ۱۴۰۵/۰۷/۹)
 * ------------------------------------------------------
 * فهرست هشت‌ستونی عین دستور مالک (بند الف):
 *   ردیف · کارشناس (نام + موبایل «زیر نام» — نکته ۱) · کد پرسنلی · شعبه ·
 *   مبایعه نامه (مجموع مبایعه‌نامه + پیش‌فروش — نکته ۳) ·
 *   اجاره نامه (مجموع اجاره + تمدید اجاره — نکته ۴) ·
 *   آدرس کارشناس · وضعیت (فعال/غیرفعال — نکته ۵)
 *
 * حذف‌های دستور:
 *   · ستون تعامل (نکته ۲) و تب/بخش تعاملات (بند ۳)
 *   · دو بینش ترکیب نقش‌ها و مشاوران بدون تعامل (بند ۵)
 *   · شاهد سامانهٔ مالی کل کسب‌وکار (بند ۶)
 *
 * فیلتر بر اساس تمام ستون‌ها (بند ۲): کارشناس (نام/موبایل) · کد پرسنلی ·
 *   شعبه (چهار شعبه + تعیین‌نشده) · مبایعه‌نامه از/تا · اجاره‌نامه از/تا ·
 *   آدرس · وضعیت
 *
 * بخش «بروزرسانی فهرست کارشناسان و کارکنان» (بند ۴): زنجیرهٔ عین سامانه‌های
 * ARM و PM + تاریخ و ساعت دقیق آخرین بروزرسانی + ازسرگیری از آخرین نقطه.
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
  Network, Building2, Banknote, FileSignature, MapPin, Filter, History, IdCard,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceWarning, useTileData, type DataSourceInfo } from "@/components/app/shared";
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
  /** P6530/گام ۴ — آدرس کارشناس (تا ارائهٔ داده توسط ARM/PM: ثبت نشده) */
  address: string | null;
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

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastUpdate = data?.lastUpdate ?? null;
  const freshness = useTileFreshness("experts");

  // P6530/گام ۴ — محاسبهٔ خالص در analyzers (صفحه فقط فرمت می‌کند — قانون P1-02)
  const kpis = useMemo(() => expertFamilyStats(rows), [rows]);
  const source = data?.dataSource ?? null;

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

      {/* شفافیت منبع داده */}
      {source && <DataSourceWarning source={source} />}

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
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead className="min-w-44">کارشناس</TableHead>
                    <TableHead className="min-w-28">کد پرسنلی</TableHead>
                    <TableHead className="min-w-28">شعبه</TableHead>
                    <TableHead className="min-w-28">مبایعه نامه</TableHead>
                    <TableHead className="min-w-28">اجاره نامه</TableHead>
                    <TableHead className="min-w-40">آدرس کارشناس</TableHead>
                    <TableHead className="min-w-24">وضعیت</TableHead>
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
                      {/* ۳ — کد پرسنلی (منبع حقیقت: PM) */}
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-bold tabular-nums" dir="ltr" title={r.pmCode ? `کد پرسنلی از سامانهٔ PM: ${faDigits(r.pmCode)}` : "کد پرسنلی از رجیستری کارشناسان ARM"}>
                          <IdCard className="w-3.5 h-3.5 text-sec-m4-700 shrink-0" aria-hidden />
                          {faDigits(r.pmCode ?? r.personnelCode)}
                        </span>
                      </TableCell>
                      {/* ۴ — شعبه */}
                      <TableCell>
                        {r.branch && r.branch !== BRANCH_UNSET ? (
                          <Badge variant="outline" className="gap-1 text-[11px] border-sec-m4-200 bg-sec-m4-50 text-sec-m4-700">
                            <Network className="w-3 h-3" aria-hidden /> {r.branch}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">{BRANCH_UNSET}</span>
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
