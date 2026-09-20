"use client";

/**
 * کاشی «آگهی‌های ملک تبریز» — صفحه داخلی (P6.5-10)
 * ------------------------------------------------------
 * رجیستری کامل آگهی‌های سامانه ARM ملک تبریز در یک لیست تک‌صفحه‌ای:
 *   • ستون‌ها: کد آگهی، نام و نام خانوادگی کارشناس، نام و نام خانوادگی
 *     مالک ملک، شماره تماس مالک ملک، آدرس ملک (+ وضعیت و تاریخ فعالیت)
 *   • فیلترها: «کد آگهی» و «نام و نام خانوادگی کارشناس»
 *   • استخراج از سامانه ملک تبریز: دکمه بروزرسانی (لایه ۱ فهرست کامل +
 *     برش غنی‌سازی لایه ۲) + تکمیل خودکار برش‌به‌برش هنگام باز بودن کاشی
 *   • جست‌وجوی کدآگهی ⇒ غنی‌سازی زندهٔ همان ردیف‌ها در خود روت (سقف ۵)
 *   • ایجنت هوشمند یادگیرندهٔ مولتی‌بینش اختصاصی
 *   • تک‌صفحه‌ای و بی‌نهایت (P6.5-09): بدون صفحه‌بندی؛ رندر سنگین با
 *     content-visibility سبک می‌شود
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, Home, Users, Phone, MapPin, RefreshCw, Hash, CheckCircle2, Clock, Landmark, Building2,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber } from "@/lib/format";

interface ListingRow {
  id: string;
  propertyCode: string;
  title: string | null;
  status: string | null;
  realtorName: string | null;
  ownerName: string | null;
  ownerMobile: string | null;
  address: string | null;
  areaName: string | null;
  lineName: string | null;
  enrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
}

interface Enrichment {
  total: number;
  pending: number;
  complete: number;
}

interface ListingsResponse {
  rows: ListingRow[];
  total: number;
  enrichment: Enrichment;
}

const EMPTY_FILTERS = { code: "", realtorName: "" };

/** حداکثر برش‌های خودکار غنی‌سازی در هر باز شدن کاشی (هر برش = ۲۵ آگهی) */
const MAX_AUTO_SLICES = 10;
const AUTO_SLICE_ROWS = 25;

export function ArmListingsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const autoSliceCount = useRef(0);
  const autoSliceBusy = useRef(false);
  const showTitles = settings.showTitles !== false;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (applied.code) params.set("code", applied.code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۵۴۶۷۸۹".indexOf(d))));
    if (applied.realtorName) params.set("realtorName", applied.realtorName);
    try {
      const res = await api<ListingsResponse>(`/api/crm/arm-catalog/listings?${params.toString()}`);
      setData(res);
    } catch {
      setData({ rows: [], total: 0, enrichment: { total: 0, pending: 0, complete: 0 } });
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  /** برش خودکار غنی‌سازی — تا MAX_AUTO_SLICES برش در هر باز شدن کاشی */
  const autoEnrichSlice = useCallback(async (): Promise<void> => {
    if (autoSliceBusy.current || autoSliceCount.current >= MAX_AUTO_SLICES) return;
    autoSliceBusy.current = true;
    autoSliceCount.current += 1;
    setEnriching(true);
    try {
      await api("/api/crm/arm-catalog/sync", {
        method: "POST",
        body: { entity: "listings", mode: "enrich", maxRows: AUTO_SLICE_ROWS },
      });
      await load();
    } catch {
      /* برش خودکار بهترین-تلاش است */
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

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api<{ lists: Array<{ fetched: number; totalAtSource: number; ok: boolean }>; enrich?: Array<{ enriched: number; remaining: number }> }>(
        "/api/crm/arm-catalog/sync",
        { method: "POST", body: { entity: "listings", mode: "both", maxRows: 150 } }
      );
      const list = res.lists?.[0];
      toast({
        title: "بروزرسانی از سامانه ملک تبریز انجام شد",
        description: list
          ? `${faNumber(list.fetched)} آگهی از مجموع ${faNumber(list.totalAtSource)} آگهی سامانه ARM خوانده شد و برش غنی‌سازی تماس مالکان هم اجرا شد.`
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
  const coveragePct = enrichment.total > 0 ? Math.round((enrichment.complete / enrichment.total) * 100) : 0;
  const todayCount = rows.filter((r) => r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 86400_000).length;
  const activeRealtors = new Set(rows.map((r) => r.realtorName).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند یادگیرنده مولتی‌بینش */}
      <AgentPanel tileId="arm-listings" />

      {/* شاخص‌ها */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل آگهی‌های ملک تبریز" value={loading ? undefined : faNumber(data?.total ?? 0)} icon={Home} iconWrapperClassName="bg-amber-500/10" iconColorClassName="text-amber-600" />
        <KpiCard label="تماس مالک تکمیل‌شده" value={loading ? undefined : `${faNumber(coveragePct)}٪`} sub={loading ? undefined : `${faNumber(enrichment.complete)} از ${faNumber(enrichment.total)}`} icon={Phone} iconWrapperClassName="bg-teal-500/10" iconColorClassName="text-teal-600" />
        <KpiCard label="آگهی امروز" value={loading ? undefined : faNumber(todayCount)} icon={Clock} iconWrapperClassName="bg-rose-500/10" iconColorClassName="text-rose-600" />
        <KpiCard label="کارشناسان فعال" value={loading ? undefined : faNumber(activeRealtors)} icon={Users} iconWrapperClassName="bg-primary/10" iconColorClassName="text-primary" />
      </div>

      {/* نوار پیشرفت غنی‌سازی + بروزرسانی */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Building2 className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">رجیستری آگهی‌های سامانه ARM ملک تبریز</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  فهرست کامل (کد، کارشناس، وضعیت، موقعیت) همیشه کامل است؛ نام و شماره تماس مالک و آدرس دقیق، برش‌به‌برش با زنجیرهٔ عین خود سامانه تکمیل می‌شود.
                </p>
              </div>
            </div>
            <Button onClick={() => void doSync()} disabled={syncing} className="gap-2 shrink-0">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">
                تکمیل اطلاعات تماس مالک و آدرس دقیق
                {enriching && (
                  <span className="inline-flex items-center gap-1 text-amber-600 ms-2">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> در حال تکمیل خودکار…
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums">
                {faNumber(enrichment.complete)} / {faNumber(enrichment.total)} ({faNumber(coveragePct)}٪)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={coveragePct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-l from-amber-500 to-teal-500 transition-all duration-500" style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* فیلترها */}
      <Card>
        <CardContent className="p-4">
          <form
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ code: filters.code.trim(), realtorName: filters.realtorName.trim() });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="arm-listing-code">کد آگهی</Label>
              <Input
                id="arm-listing-code"
                value={filters.code}
                onChange={(e) => setFilters((f) => ({ ...f, code: e.target.value }))}
                placeholder="نمونه: ۵۹۱۱۵"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arm-listing-realtor">نام و نام خانوادگی کارشناس</Label>
              <Input
                id="arm-listing-realtor"
                value={filters.realtorName}
                onChange={(e) => setFilters((f) => ({ ...f, realtorName: e.target.value }))}
                placeholder="نمونه: شهریار بابایان"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="gap-2 flex-1">
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

      {/* لیست تک‌صفحه‌ای */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <Home className="w-10 h-10 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm font-bold">هیچ آگهی مطابق پیدا نشد</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data?.total === 0
                ? "هنوز کاتالوگ آگهی‌های ملک تبریز استخراج نشده است — دکمه «بروزرسانی از سامانه» را بزنید تا کل آگهی‌های سامانه ARM استخراج شود."
                : "فیلترها را تغییر دهید یا آن‌ها را پاک کنید تا همهٔ آگهی‌ها دیده شوند."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead className="min-w-24">کد آگهی</TableHead>
                    <TableHead className="min-w-36">کارشناس</TableHead>
                    <TableHead className="min-w-32">مالک ملک</TableHead>
                    <TableHead className="min-w-32">شماره تماس مالک</TableHead>
                    <TableHead className="min-w-48">آدرس ملک</TableHead>
                    <TableHead className="min-w-28">وضعیت</TableHead>
                    <TableHead className="min-w-28">آخرین فعالیت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id} className="cv-row">
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" dir="ltr">
                          <Hash className="w-3.5 h-3.5 text-amber-600" aria-hidden />
                          {faDigits(r.propertyCode)}
                        </span>
                        {showTitles && r.title && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-44 truncate">{r.title}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                          <Landmark className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                          {r.realtorName ?? "ثبت نشده در سامانه"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-bold">
                        {r.ownerName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden /> {r.ownerName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در نوبت تکمیل از سامانه
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.ownerMobile ? (
                          <a
                            href={`tel:${r.ownerMobile}`}
                            dir="ltr"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary hover:bg-primary/20 transition-colors tabular-nums"
                          >
                            <Phone className="w-3.5 h-3.5" aria-hidden />
                            {faDigits(r.ownerMobile)}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">در نوبت تکمیل از سامانه</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="inline-flex items-start gap-1.5 leading-relaxed">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" aria-hidden />
                          {r.address ?? "ثبت نشده در سامانه"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.status ? (
                          <Badge variant="secondary" className="text-[11px]">{r.status}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.createdAt ? faDateTime(r.createdAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="p-3 text-xs text-muted-foreground text-center border-t">
              {faNumber(rows.length)} آگهی در یک صفحه — لیست تک‌صفحه‌ای و بی‌نهایت (بدون صفحه‌بندی)
              {enrichment.pending > 0 && ` · ${faNumber(enrichment.pending)} آگهی در نوبت تکمیل اطلاعات تماس مالک`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
