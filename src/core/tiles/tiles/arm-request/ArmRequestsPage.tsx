"use client";

/**
 * کاشی «درخواست‌های ملک تبریز» — صفحه داخلی (P6.5-10 + P6521/M2)
 * ------------------------------------------------------
 * کاتالوگ کامل درخواست‌های سامانه ARM ملک تبریز در یک لیست تک‌صفحه‌ای:
 *   • ستون‌ها: کد درخواست، نام و نام خانوادگی کارشناس، متقاضی (نام + تماس)،
 *     منطقه (متن ساده — P6521/M2) (+ عنوان و وضعیت و تاریخ)
 *   • تغییر نام ستون‌ها (P6521/M2 — دستور ۰۲۰): «درخواست‌دهنده» → «متقاضی» و
 *     «شماره تماس درخواست‌دهنده» → «شماره تماس متقاضی» (واژگان خود ARM: applicant)
 *   • فیلترها: «کد درخواست» و «نام و نام خانوادگی کارشناس»
 *   • استخراج از سامانه ملک تبریز: دکمه بروزرسانی + تکمیل خودکار برش‌به‌برش
 *     (لایه ۲ جدید: منطقه‌های منتخب از requests/details)
 *   • جست‌وجوی کددرخواست ⇒ غنی‌سازی زندهٔ همان ردیف‌ها در خود روت (سقف ۵)
 *   • ایجنت هوشمند یادگیرندهٔ مولتی‌بینش اختصاصی
 *   • تک‌صفحه‌ای و بی‌نهایت (P6.5-09): بدون صفحه‌بندی؛ content-visibility
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RotateCcw, Search, ClipboardList, Users, Phone, RefreshCw, Hash, CheckCircle2, Clock, Landmark, Building2, MapPin,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber } from "@/lib/format";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه (رفع باگ تاریخی ۴/۵ در این صفحه)
import { normalizeFilterInput } from "@/lib/normalize-input";

interface RequestRow {
  id: string;
  requestCode: string;
  title: string | null;
  status: string | null;
  actorName: string | null;
  customerName: string | null;
  customerMobile: string | null;
  /** P6521/M2 — منطقه‌های منتخب (متن ساده) */
  areaNames: string[];
  enrichedAt: string | null;
  createdAt: string | null;
  updatedAt: string;
}

interface Enrichment {
  total: number;
  pending: number;
  complete: number;
}

interface RequestsResponse {
  rows: RequestRow[];
  total: number;
  enrichment: Enrichment;
}

const EMPTY_FILTERS = { code: "", realtorName: "" };

/** حداکثر برش‌های خودکار غنی‌سازی در هر باز شدن کاشی (هر برش = ۲۵ درخواست) */
const MAX_AUTO_SLICES = 10;
const AUTO_SLICE_ROWS = 25;

export function ArmRequestsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const autoSliceCount = useRef(0);
  const autoSliceBusy = useRef(false);
  const showTitles = settings.showTitles !== false;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    // P6525 — نرمال‌سازی مرکزی: نتیجهٔ ارقام فارسی/عربی/لاتین همیشه یکسان (رفع باگ ۴/۵)
    if (applied.code) params.set("code", normalizeFilterInput(applied.code));
    if (applied.realtorName) params.set("realtorName", normalizeFilterInput(applied.realtorName));
    try {
      const res = await api<RequestsResponse>(`/api/crm/arm-catalog/requests?${params.toString()}`);
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
        body: { entity: "requests", mode: "enrich", maxRows: AUTO_SLICE_ROWS },
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
        { method: "POST", body: { entity: "requests", mode: "both", maxRows: 150 } }
      );
      const list = res.lists?.[0];
      toast({
        title: "بروزرسانی از سامانه ملک تبریز انجام شد",
        description: list
          ? `${faNumber(list.fetched)} درخواست از مجموع ${faNumber(list.totalAtSource)} درخواست سامانه ARM خوانده شد و برش غنی‌سازی تماس درخواست‌دهندگان هم اجرا شد.`
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
  const activeActors = new Set(rows.map((r) => r.actorName).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند یادگیرنده مولتی‌بینش */}
      <AgentPanel tileId="arm-requests" />

      {/* شاخص‌ها */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="کل درخواست‌های ملک تبریز" value={loading ? undefined : faNumber(data?.total ?? 0)} icon={ClipboardList} iconWrapperClassName="bg-teal-500/10" iconColorClassName="text-teal-600" />
        <KpiCard label="تماس متقاضی تکمیل‌شده" value={loading ? undefined : `${faNumber(coveragePct)}٪`} sub={loading ? undefined : `${faNumber(enrichment.complete)} از ${faNumber(enrichment.total)}`} icon={Phone} iconWrapperClassName="bg-amber-500/10" iconColorClassName="text-amber-600" />
        <KpiCard label="درخواست امروز" value={loading ? undefined : faNumber(todayCount)} icon={Clock} iconWrapperClassName="bg-rose-500/10" iconColorClassName="text-rose-600" />
        <KpiCard label="کارشناسان فعال" value={loading ? undefined : faNumber(activeActors)} icon={Users} iconWrapperClassName="bg-primary/10" iconColorClassName="text-primary" />
      </div>

      {/* نوار پیشرفت غنی‌سازی + بروزرسانی */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Building2 className="w-5 h-5 text-teal-600 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">کاتالوگ درخواست‌های سامانه ARM ملک تبریز</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  فهرست کامل (کد، عنوان، کارشناس، وضعیت، نام خانوادگی متقاضی) همیشه کامل است؛ نام کامل و شماره موبایل متقاضی و منطقه‌های منتخب برش‌به‌برش با زنجیرهٔ عین خود سامانه تکمیل می‌شود.
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
                تکمیل نام کامل و شماره تماس متقاضیان و منطقه‌های منتخب
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
              <div className="h-full rounded-full bg-gradient-to-l from-teal-500 to-amber-500 transition-all duration-500" style={{ width: `${coveragePct}%` }} />
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
              <Label htmlFor="arm-request-code">کد درخواست</Label>
              <Input
                id="arm-request-code"
                value={filters.code}
                onChange={(e) => setFilters((f) => ({ ...f, code: e.target.value }))}
                placeholder="نمونه: ۵۲۳۷۸"
                inputMode="numeric"
                autoComplete="off"
                className="font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arm-request-realtor">نام و نام خانوادگی کارشناس</Label>
              <Input
                id="arm-request-realtor"
                value={filters.realtorName}
                onChange={(e) => setFilters((f) => ({ ...f, realtorName: e.target.value }))}
                placeholder="نمونه: پیام عبدی"
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
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm font-bold">هیچ درخواستی مطابق پیدا نشد</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data?.total === 0
                ? "هنوز کاتالوگ درخواست‌های ملک تبریز استخراج نشده است — دکمه «بروزرسانی از سامانه» را بزنید تا کل درخواست‌های سامانه ARM استخراج شود."
                : "فیلترها را تغییر دهید یا آن‌ها را پاک کنید تا همهٔ درخواست‌ها دیده شوند."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* P6525 — قانون فهرست: عنوان فهرست وسط‌چین (الگوی فهرست معاملات) */}
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
                    <TableHead className="min-w-36">متقاضی</TableHead>
                    <TableHead className="min-w-32">شماره تماس متقاضی</TableHead>
                    <TableHead className="min-w-32">منطقه</TableHead>
                    <TableHead className="min-w-28">وضعیت</TableHead>
                    <TableHead className="min-w-28">تاریخ ثبت</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground tabular-nums">{faNumber(i + 1)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums" dir="ltr">
                          <Hash className="w-3.5 h-3.5 text-teal-600" aria-hidden />
                          {faDigits(r.requestCode)}
                        </span>
                        {showTitles && r.title && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-48 truncate mx-auto">{r.title}</p>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 font-bold">
                          <Landmark className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
                          {r.actorName ?? "ثبت نشده در سامانه"}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold">
                        {r.customerName ? (
                          <span className="inline-flex items-center gap-1.5">
                            {r.enrichedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden /> : null}
                            {r.customerName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در نوبت تکمیل از سامانه
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.customerMobile ? (
                          <a
                            href={`tel:${r.customerMobile}`}
                            dir="ltr"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 font-bold text-primary hover:bg-primary/20 transition-colors tabular-nums"
                          >
                            <Phone className="w-3.5 h-3.5" aria-hidden />
                            {faDigits(r.customerMobile)}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">در نوبت تکمیل از سامانه</span>
                        )}
                      </TableCell>
                      {/* P6521/M2 — ستون منطقه: متن سادهٔ منطقه‌های منتخب درخواست */}
                      <TableCell className="whitespace-normal" id="arm-request-area-cell">
                        {r.areaNames && r.areaNames.length > 0 ? (
                          <span className="inline-flex items-start gap-1.5 leading-relaxed">
                            <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" aria-hidden />
                            {r.areaNames.join("، ")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">در نوبت تکمیل از سامانه</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status ? (
                          <Badge variant="secondary" className="text-[11px]">{r.status}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{r.createdAt ? faDateTime(r.createdAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="p-3 text-xs text-muted-foreground text-center border-t">
              {faNumber(rows.length)} درخواست در یک صفحه — لیست تک‌صفحه‌ای و بی‌نهایت (بدون صفحه‌بندی)
              {enrichment.pending > 0 && ` · ${faNumber(enrichment.pending)} درخواست در نوبت تکمیل اطلاعات تماس`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
