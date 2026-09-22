"use client";

/**
 * کاشی «کارشناسان» — صفحه داخلی (بازنویسی بر پایه ساختار واقعی سامانه ARM)
 * ------------------------------------------------------
 * عین «users-list» و «realtor-interactions» خود سامانه ملک تبریز:
 *   • شاخص‌ها: کل کاربران، فعال، پرتعامل‌ترین مشاور، جفت برتر همکاری
 *   • فیلترها: نام، موبایل، کد پرسنلی، نقش، کسب‌وکار (شعبه)، ثبت‌کننده، وضعیت
 *   • کارت/جدول: نام، موبایل، نقش، کسب‌وکار، ثبت‌کننده،
 *     تاریخ ثبت (هجری شمسی)، وضعیت، مجموع تعامل‌ها
 *   • بخش «تعاملات مشاوران با یکدیگر»: جدول مشاور درخواست × مشاور آگهی × تعداد
 *     + رتبه‌بندی درجه همکاری
 *   • شفافیت منبع داده
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Filter,
  RotateCcw,
  Search,
  Users,
  UserCheck,
  Phone,
  Building,
  Hash,
  Trophy,
  Network,
  ArrowLeftRight,
  ShieldCheck,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceWarning, useTileData, type DataSourceInfo } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { cooperationDegree, type CooperationDegree } from "@/core/agent/analyzers";
import { faNumber, faJalaliShort } from "@/lib/format";
import { faDigits } from "@/lib/jalali";

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
  /** مجموع تعامل‌ها (نقش درخواست‌دهنده + نقش آگهی‌گذار) */
  interactionTotal: number;
  /** P6.5-12 — کد پرسنلی واقعی از سامانهٔ PM (منبع حقیقت) */
  pmCode: string | null;
  /** P6.5-12 — تعداد معامله مبایعه‌نامه (انتساب شفاف) */
  saleCount: number;
  /** P6.5-12 — تعداد معامله اجاره‌نامه (از صورت‌وضعیت‌ها) */
  rentCount: number;
  /** P6.5-12 — شمار کل قراردادهای ثبت‌شده در سامانهٔ مالی (کل کسب‌وکار — ۱۰ برتر) */
  accContractCount: number | null;
}

interface InRow {
  id: string;
  requestRealtorName: string;
  propertyRealtorName: string;
  count: number;
}

interface Meta {
  roles: string[];
  businesses: string[];
  creators: string[];
}

const EMPTY = { fullName: "", mobile: "", personnelCode: "", role: "all", businessTitle: "all", creator: "all", active: "all" };
type Filters = typeof EMPTY;

/** برچسب/رنگ درجه همکاری — نگاشت نمایشی روی درجه دامنه‌ای (آستانه‌ها: analyzers) */
const COOPERATION_UI: Record<CooperationDegree, { label: string; style: string }> = {
  CORE: { label: "محور همکاری", style: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  FREQUENT: { label: "همکار پرتکرار", style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  RARE: { label: "کم‌تعامل", style: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
  NONE: { label: "بدون تعامل", style: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
};

function cooperationLevel(total: number): { label: string; style: string } {
  return COOPERATION_UI[cooperationDegree(total)];
}

/** داده ترکیبی دو روت کارشناسان + تعاملات — شیء یگانه داده هوک */
interface ExData {
  rows: ExRow[];
  total: number;
  dataSource: DataSourceInfo | null;
  interactions: InRow[];
  topRealtors: { name: string; total: number }[];
  /** P6.5-12 (بند پ) — فعال‌ترین کارشناسان: ۲۰ مبایعه‌نامه + ۲۰ اجاره‌نامه + شاهد ACC */
  topExperts: {
    topSale: { name: string; count: number; pmCode: string | null }[];
    topRent: { name: string; count: number; pmCode: string | null }[];
    accTop: { tradeOverviewsCount: number; realtorId: string; realtorFullName: string }[];
    coverage: { salesTotal: number; salesAttributed: number };
  } | null;
}

const EMPTY_DATA: ExData = { rows: [], total: 0, dataSource: null, interactions: [], topRealtors: [], topExperts: null };

export function ExpertsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [meta, setMeta] = useState<Meta | null>(null);
  const viewMode = String(settings.viewMode ?? "cards");

  useEffect(() => {
    api<Meta>("/api/crm/meta")
      .then(setMeta)
      .catch(() => setMeta({ roles: [], businesses: [], creators: [] }));
  }, []);

  const fetchExperts = useCallback(async (): Promise<ExData> => {
    const params = new URLSearchParams();
    if (applied.fullName) params.set("fullName", applied.fullName);
    if (applied.mobile) params.set("mobile", applied.mobile.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    if (applied.personnelCode) params.set("personnelCode", applied.personnelCode.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    if (applied.role !== "all") params.set("role", applied.role);
    if (applied.businessTitle !== "all") params.set("businessTitle", applied.businessTitle);
    if (applied.creator !== "all") params.set("creator", applied.creator);
    if (applied.active !== "all") params.set("active", applied.active);
    // P6.5-09 — بدون صفحه‌بندی: همهٔ کارشناسان در یک صفحه (سقف سرور ۵۰۰۰)
    params.set("limit", "5000");

    const [exRes, inRes] = await Promise.all([
      api<{ rows: ExRow[]; total: number; dataSource: DataSourceInfo; topExperts: ExData["topExperts"] }>(`/api/crm/experts?${params.toString()}`),
      api<{ rows: InRow[]; total: number; topRealtors: { name: string; total: number }[] }>("/api/crm/interactions"),
    ]);
    return {
      rows: exRes.rows,
      total: exRes.total,
      dataSource: exRes.dataSource,
      interactions: inRes.rows,
      topRealtors: inRes.topRealtors,
      topExperts: exRes.topExperts ?? null,
    };
  }, [applied]);

  const { data, loading } = useTileData(fetchExperts, {
    errorTitle: "خطا در دریافت کارشناسان",
    // عین رفتار قبلی: خطا → rows و interactions خالی؛ total/source/topRealtors قبلی می‌ماند
    errorValue: (prev) => (prev ? { ...prev, rows: [], interactions: [] } : { ...EMPTY_DATA }),
  });

  const rows = data?.rows ?? null;
  const total = data?.total ?? 0;
  const source = data?.dataSource ?? null;
  const interactions = data?.interactions ?? null;
  const topRealtors = data?.topRealtors ?? [];
  // P6.5-12 (بند پ) — فعال‌ترین کارشناسان (۲۰ مبایعه‌نامه + ۲۰ اجاره‌نامه + شاهد مالی)
  const topExpertsData = data?.topExperts ?? null;

  const kpis = useMemo(() => {
    if (!rows) return null;
    const active = rows.filter((r) => r.active).length;
    const best = [...rows].sort((a, b) => b.interactionTotal - a.interactionTotal)[0];
    const bestPair = interactions && interactions.length > 0 ? interactions[0] : null;
    return { count: rows.length, active, best, bestPair };
  }, [rows, interactions]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="experts" />

      {/* شاخص‌ها */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="کل کاربران"
            value={faNumber(kpis.count)}
            icon={Users}
            iconAs="div"
            iconWrapperClassName="bg-primary/10"
            iconColorClassName="text-primary"
          />
          <KpiCard
            label="کاربران فعال"
            value={faNumber(kpis.active)}
            icon={UserCheck}
            iconAs="div"
            iconWrapperClassName="bg-teal-100 dark:bg-teal-950"
            iconColorClassName="text-teal-600 dark:text-teal-400"
          />
          <KpiCard
            label="پرتعامل‌ترین مشاور"
            value={kpis.best && kpis.best.interactionTotal > 0 ? kpis.best.fullName : "—"}
            icon={Trophy}
            iconAs="div"
            iconWrapperClassName="bg-amber-100 dark:bg-amber-950"
            iconColorClassName="text-amber-600"
            labelClassName="text-xs text-muted-foreground truncate"
            valueClassName="text-sm font-extrabold truncate"
          />
          <KpiCard
            label="جفت همکاری برتر"
            value={kpis.bestPair ? `${kpis.bestPair.requestRealtorName} ↔ ${kpis.bestPair.propertyRealtorName}` : "—"}
            icon={ArrowLeftRight}
            iconAs="div"
            iconWrapperClassName="bg-teal-100 dark:bg-teal-950"
            iconColorClassName="text-teal-600"
            labelClassName="text-xs text-muted-foreground truncate"
            valueClassName="text-[11px] font-bold truncate leading-tight"
          />
        </div>
      )}

      {/* P6.5-12 (بند پ) — فعال‌ترین کارشناسان بر اساس تعداد معامله */}
      {topExpertsData && (topExpertsData.topSale.length > 0 || topExpertsData.accTop.length > 0) && (
        <Card className="border-teal-500/20 bg-gradient-to-l from-teal-600/[0.05] to-transparent">
          <CardHeader className="py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden /> فعال‌ترین کارشناسان بر اساس تعداد معامله
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ۲۰ برتر مبایعه‌نامه */}
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-bold mb-2 text-teal-700 dark:text-teal-300">۲۰ کارشناس برتر — مبایعه‌نامه</p>
              <ol className="space-y-1 max-h-64 overflow-y-auto text-[11px]">
                {topExpertsData.topSale.length > 0 ? topExpertsData.topSale.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 border-b border-border/40 last:border-0 pb-0.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4.5 h-4.5 min-w-4.5 inline-flex items-center justify-center rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold text-[10px]">{faNumber(i + 1)}</span>
                      <span className="truncate" title={`${r.name}${r.pmCode ? ` — ${r.pmCode}` : ""}`}>{r.name}</span>
                    </span>
                    <span className="font-extrabold text-teal-700 dark:text-teal-300 shrink-0">{faNumber(r.count)}</span>
                  </li>
                )) : <li className="text-muted-foreground">هنوز معامله‌ای انتساب نشده است</li>}
              </ol>
            </div>
            {/* ۲۰ برتر اجاره‌نامه */}
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-bold mb-2 text-amber-700 dark:text-amber-300">۲۰ کارشناس برتر — اجاره‌نامه</p>
              <ol className="space-y-1 max-h-64 overflow-y-auto text-[11px]">
                {topExpertsData.topRent.length > 0 ? topExpertsData.topRent.map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 border-b border-border/40 last:border-0 pb-0.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4.5 h-4.5 min-w-4.5 inline-flex items-center justify-center rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-[10px]">{faNumber(i + 1)}</span>
                      <span className="truncate" title={`${r.name}${r.pmCode ? ` — ${r.pmCode}` : ""}`}>{r.name}</span>
                    </span>
                    <span className="font-extrabold text-amber-700 dark:text-amber-300 shrink-0">{faNumber(r.count)}</span>
                  </li>
                )) : <li className="text-muted-foreground leading-relaxed">قرارداد اجاره‌نامه‌ای در دامنهٔ دسترسی حساب فعلی ARM ثبت نشده است — شمارش از صورت‌وضعیت‌های سامانه</li>}
              </ol>
            </div>
            {/* شاهد کل کسب‌وکار (سامانهٔ مالی) */}
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" aria-hidden />
                شاهد سامانهٔ مالی — کل کسب‌وکار
              </p>
              <ol className="space-y-1 max-h-64 overflow-y-auto text-[11px]">
                {topExpertsData.accTop.length > 0 ? topExpertsData.accTop.map((r, i) => (
                  <li key={r.realtorId} className="flex items-center justify-between gap-2 border-b border-border/40 last:border-0 pb-0.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4.5 h-4.5 min-w-4.5 inline-flex items-center justify-center rounded bg-primary/10 text-primary font-bold text-[10px]">{faNumber(i + 1)}</span>
                      <span className="truncate" title={r.realtorFullName}>{r.realtorFullName}</span>
                    </span>
                    <span className="font-extrabold text-primary shrink-0">{faNumber(r.tradeOverviewsCount)}</span>
                  </li>
                )) : <li className="text-muted-foreground">در دسترس نیست</li>}
              </ol>
              {topExpertsData.coverage.salesTotal > 0 && (
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  پوشش انتساب مبایعه‌نامه: {faNumber(topExpertsData.coverage.salesAttributed)} از {faNumber(topExpertsData.coverage.salesTotal)} معامله
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* شفافیت منبع داده */}
      <DataSourceWarning source={source} emptyText="هنوز هیچ داده‌ای از سامانه استخراج نشده است." />

      {/* دو تب: کاربران / تعاملات */}
      <Tabs defaultValue="experts" dir="rtl">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="experts" className="gap-1.5">
            <Users className="w-4 h-4" aria-hidden /> کاربران و مشاوران
          </TabsTrigger>
          <TabsTrigger value="interactions" className="gap-1.5">
            <Network className="w-4 h-4" aria-hidden /> تعاملات مشاوران
          </TabsTrigger>
        </TabsList>

        {/* ================== تب کاربران ================== */}
        <TabsContent value="experts" className="space-y-6 mt-4">
          {/* فیلترها */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="w-5 h-5 text-primary" aria-hidden /> فیلترهای کاربران
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
                  <Label htmlFor="f-name">نام و نام خانوادگی</Label>
                  <Input id="f-name" placeholder="نمونه: سید نعمت اله" value={filters.fullName} onChange={(e) => setF("fullName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-mobile">شماره موبایل</Label>
                  <Input id="f-mobile" inputMode="numeric" placeholder="نمونه: ۰۹۱۴۱۲۳۴۵۶۷" value={filters.mobile} onChange={(e) => setF("mobile", e.target.value.replace(/[^\d۰-۹]/g, ""))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-code">کد پرسنلی</Label>
                  <Input id="f-code" inputMode="numeric" placeholder="نمونه: ۴۱۰۰۳۱۳۲۰" value={filters.personnelCode} onChange={(e) => setF("personnelCode", e.target.value.replace(/[^\d۰-۹]/g, ""))} />
                </div>
                <div className="space-y-1.5">
                  <Label>نقش</Label>
                  <Select value={filters.role} onValueChange={(v) => setF("role", v)}>
                    <SelectTrigger aria-label="نقش">
                      <SelectValue placeholder="همه نقش‌ها" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه نقش‌ها</SelectItem>
                      {meta?.roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>کسب‌وکار (شعبه)</Label>
                  <Select value={filters.businessTitle} onValueChange={(v) => setF("businessTitle", v)}>
                    <SelectTrigger aria-label="کسب‌وکار">
                      <SelectValue placeholder="همه کسب‌وکارها" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه کسب‌وکارها</SelectItem>
                      {meta?.businesses.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ثبت‌کننده</Label>
                  <Select value={filters.creator} onValueChange={(v) => setF("creator", v)}>
                    <SelectTrigger aria-label="ثبت‌کننده">
                      <SelectValue placeholder="همه ثبت‌کنندگان" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه ثبت‌کنندگان</SelectItem>
                      {meta?.creators.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>وضعیت</Label>
                  <Select value={filters.active} onValueChange={(v) => setF("active", v)}>
                    <SelectTrigger aria-label="وضعیت">
                      <SelectValue placeholder="همه وضعیت‌ها" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                      <SelectItem value="true">فعال</SelectItem>
                      <SelectItem value="false">غیرفعال</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 lg:col-span-4">
                  <Button type="submit" className="gap-2" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                    اعمال فیلتر
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setFilters(EMPTY);
                      setApplied(EMPTY);
                    }}
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden /> پاک‌سازی
                  </Button>
                  {total > 0 && (
                    <Badge variant="secondary" className="mb-1">
                      {faNumber(total)} کاربر
                    </Badge>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* فهرست کاربران */}
          {rows === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm leading-relaxed">
                {loading
                  ? "در حال دریافت…"
                  : rows.length === 0 && source?.cached === false
                    ? "هنوز کاربری از سامانه ملک تبریز استخراج نشده است. با بازیابی پایگاه داده سامانه، داده‌ها به‌صورت خودکار همگام می‌شوند یا از تنظیمات، «همگام‌سازی داده‌ها» را بزنید."
                    : "هیچ کاربری با این فیلترها یافت نشد."}
              </CardContent>
            </Card>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rows.map((e, i) => {
                const coop = cooperationLevel(e.interactionTotal);
                return (
                  <Card key={e.id} className="tile-pop" style={{ animationDelay: `${i * 0.03}s` }}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-4">
                        <Avatar className="w-14 h-14 shrink-0">
                          <AvatarFallback className="bg-primary/15 text-primary font-bold text-base">
                            {e.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-extrabold text-primary tabular-nums shrink-0" aria-label={`ردیف ${faNumber(i + 1)}`} title={`ردیف ${faNumber(i + 1)}`}>
                              {faNumber(i + 1)}
                            </span>
                            <h4 className="font-bold text-sm sm:text-base">{e.fullName}</h4>
                            <Badge className={`${coop.style} text-[11px]`}>{coop.label}</Badge>
                            {!e.active && <Badge variant="destructive" className="text-[11px]">غیرفعال</Badge>}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              <span className="font-mono">{faDigits(e.pmCode ?? (e.personnelCode.startsWith("بدون-کد-") ? "—" : e.personnelCode))}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              <span className="font-mono">{faDigits(e.mobile)}</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              {e.role}
                            </span>
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Building className="w-3.5 h-3.5 shrink-0" aria-hidden />
                              {e.businessTitle}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1 border-t items-center">
                            <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[11px]" title="تعداد معامله مبایعه‌نامه (بند ت)">
                              مبایعه‌نامه: {faNumber(e.saleCount)}
                            </Badge>
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[11px]" title="تعداد معامله اجاره‌نامه (بند ت)">
                              اجاره‌نامه: {faNumber(e.rentCount)}
                            </Badge>
                            {e.accContractCount !== null && (
                              <Badge variant="outline" className="text-[11px] gap-1" title="شمار کل قراردادهای ثبت‌شده در سامانهٔ مالی — کل کسب‌وکار">
                                <Trophy className="w-3 h-3 text-amber-600" aria-hidden /> مالی کل کسب‌وکار: {faNumber(e.accContractCount)}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[11px]">
                              {faNumber(e.interactionTotal)} تعامل
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              ثبت: {faJalaliShort(e.createdAt)}
                            </span>
                            {e.creator && (
                              <span className="text-[11px] text-muted-foreground mr-auto" title="ثبت‌کننده">
                                توسط: {e.creator}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="text-right">نام</TableHead>
                      <TableHead className="text-right">کد پرسنلی</TableHead>
                      <TableHead className="text-right">موبایل</TableHead>
                      <TableHead className="text-right hidden md:table-cell">نقش</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">کسب‌وکار</TableHead>
                      <TableHead className="text-right">مبایعه‌نامه</TableHead>
                      <TableHead className="text-right">اجاره‌نامه</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">ثبت</TableHead>
                      <TableHead className="text-right">وضعیت</TableHead>
                      <TableHead className="text-right">تعامل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-medium whitespace-nowrap">{e.fullName}</TableCell>
                        <TableCell className="text-xs font-mono">{faDigits(e.pmCode ?? (e.personnelCode.startsWith("بدون-کد-") ? "—" : e.personnelCode))}</TableCell>
                        <TableCell className="text-xs font-mono">{faDigits(e.mobile)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs">{e.role}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs">{e.businessTitle}</TableCell>
                        <TableCell className="text-xs font-bold text-teal-700 dark:text-teal-300">{faNumber(e.saleCount)}</TableCell>
                        <TableCell className="text-xs font-bold text-amber-700 dark:text-amber-300">{faNumber(e.rentCount)}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs whitespace-nowrap">{faJalaliShort(e.createdAt)}</TableCell>
                        <TableCell className="text-xs">
                          {e.active ? <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">فعال</Badge> : <Badge variant="destructive">غیرفعال</Badge>}
                        </TableCell>
                        <TableCell className="text-xs font-bold">{faNumber(e.interactionTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================== تب تعاملات ================== */}
        <TabsContent value="interactions" className="space-y-4 mt-4">
          {interactions === null ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : interactions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm leading-relaxed">
                هنوز تعاملی از «گزارش تعاملات مشاوران» سامانه ملک تبریز استخراج نشده است. این گزارش پس از
                همگام‌سازی موفق در دسترس قرار می‌گیرد.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* رتبه‌بندی درجه همکاری */}
              {topRealtors.length > 0 && (
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden /> درجه همکاری مشاوران (مجموع طرف درخواست + طرف آگهی)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {topRealtors.map((r, i) => (
                      <div key={r.name} className="rounded-lg border bg-card p-2.5 text-center min-w-0">
                        <div className="text-[10px] text-muted-foreground">رتبه {faNumber(i + 1)}</div>
                        <div className="text-xs font-bold truncate" title={r.name}>{r.name}</div>
                        <div className="text-xs text-primary font-extrabold mt-0.5">{faNumber(r.total)} تعامل</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* جدول تعاملات — عین ستون‌های خود سامانه */}
              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="w-5 h-5 text-primary" aria-hidden /> تعاملات مشاوران با یکدیگر
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[26rem]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="text-right">مشاور درخواست</TableHead>
                          <TableHead className="text-right">مشاور آگهی</TableHead>
                          <TableHead className="text-right">تعداد همکاری</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* P6.5-09 — بدون سقف: همهٔ تعاملات در یک صفحه (عین لیست کاربران) */}
                        {interactions.map((r) => (
                          <TableRow key={r.id} className="hover:bg-muted/30">
                            <TableCell className="text-xs font-medium">{r.requestRealtorName}</TableCell>
                            <TableCell className="text-xs font-medium">{r.propertyRealtorName}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="secondary" className="font-bold">{faNumber(r.count)}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        داده‌ها عین «فهرست کاربران» و «گزارش تعاملات مشاوران» سامانه ملک تبریز استخراج می‌شوند. تاریخ‌های عضویت
        و ثبت با تقویم هجری شمسی نمایش داده می‌شوند.
      </p>
    </div>
  );
}
