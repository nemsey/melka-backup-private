"use client";

/**
 * کاشی «قراردادها و اسناد» — صفحه داخلی (بر پایه صورت وضعیت‌های واقعی سامانه ARM)
 * ------------------------------------------------------
 * • نمودار قیفی چرخه عمر ۹ مرحله‌ای (پیش‌نویس → در انتظار تنظیم سند)
 * • جدول قراردادها: هولوگرام/کد آگهی/کد درخواست، نوع، وضعیت، ثبت‌کننده
 * • دیالوگ جزئیات: تاریخ سند/قرارداد/تحویل، خریداران/فروشندگان، حق‌السهم مشاوران
 * • شناسایی گلوگاه اداری و قراردادهای راکد
 * رنگ‌های وضعیت عین خود سامانه: زرد انتظار / سبز تایید / قرمز رد
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, ScrollText, Filter, Eye, Clock, TrendingDown, Users } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { DataSourceAlert, type DataSourceInfo } from "@/components/app/shared";
import { KpiCard } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { CONTRACT_STATUS_FA, CONTRACT_STATUSES, type ContractFunnelStage, type CrmContract } from "@/lib/melk-api/types";
import { faNumber, faPercent, faJalaliShort } from "@/lib/format";

interface ContractsResponse {
  ok: boolean;
  rows: CrmContract[];
  total: number;
  summary: {
    totalCount: number;
    funnel: ContractFunnelStage[];
    rejectedTotal: number;
    payedCount: number;
    bottleneck: ContractFunnelStage | null;
    missingDocument: number;
  };
  dataSource: DataSourceInfo;
}

/** رنگ وضعیت — عین منطق خود سامانه ARM (زرد انتظار/سبز تایید/قرمز رد) */
function statusStyle(status: string): { label: string; style: string } {
  const label = (CONTRACT_STATUS_FA as Record<string, string>)[status] ?? status;
  if (status === "confirmedByFinance" || status === "payed") {
    return { label, style: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" };
  }
  if (status === "rejected" || status === "rejectedByFinance" || status === "rescission" || status === "deletedByFinance") {
    return { label, style: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" };
  }
  if (status === "finished") {
    return { label, style: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300" };
  }
  if (status.startsWith("waitingFor")) {
    return { label, style: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  }
  return { label, style: "bg-primary/10 text-primary" };
}

/** رنگ نوار قیف بر پایه مرحله */
function funnelBarTone(status: string): string {
  if (status === "preDefined") return "bg-gradient-to-l from-stone-500 to-stone-400";
  if (status === "waitingForAddRealtors") return "bg-gradient-to-l from-amber-600 to-amber-400";
  if (status === "waitingForRealtors") return "bg-gradient-to-l from-amber-600 to-amber-500";
  if (status === "waitingForFinance") return "bg-gradient-to-l from-rose-500 to-rose-400";
  if (status === "confirmedByFinance") return "bg-gradient-to-l from-teal-600 to-cyan-500";
  if (status === "waitingForDocument") return "bg-gradient-to-l from-teal-600 to-cyan-500";
  return "bg-gradient-to-l from-teal-700 to-cyan-500";
}

export function ContractsPage({ settings, onSettingsChange, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(String(settings.defaultStatus ?? "all"));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CrmContract | null>(null);
  const showFunnel = settings.showFunnel !== false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(settings.pageSize ?? 30));
      const res = await api<ContractsResponse>(`/api/crm/contracts?${params.toString()}`);
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت قراردادها", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, statusFilter, search, settings.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelMax = useMemo(
    () => Math.max(1, ...(data?.summary.funnel.map((f) => f.count) ?? [1])),
    [data]
  );

  const bottleneck = data?.summary.bottleneck ?? null;

  return (
    <div className="space-y-6">
      <AgentPanel tileId="contracts" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "کل قراردادها", value: data ? faNumber(data.summary.totalCount) : undefined, icon: ScrollText, tone: "bg-primary/10 text-primary" },
          { label: "گلوگاه اداری", value: bottleneck ? `${faNumber(bottleneck.count)} (${faPercent(bottleneck.sharePercent)})` : data ? "—" : undefined, icon: TrendingDown, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
          { label: "رد / فسخ‌شده", value: data ? faNumber(data.summary.rejectedTotal) : undefined, icon: Filter, tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
          { label: "اسناد ناقص", value: data ? faNumber(data.summary.missingDocument) : undefined, icon: Clock, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
            valueClassName="text-lg font-extrabold tabular-nums truncate"
          />
        ))}
      </div>

      {/* هشدار گلوگاه */}
      {bottleneck && bottleneck.count > 0 && (
        <Card className="border-s-4 border-s-amber-500/70">
          <CardContent className="p-4 flex items-start gap-3">
            <TrendingDown className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" aria-hidden />
            <div className="space-y-1.5">
              <p className="text-sm font-extrabold">گلوگاه چرخه عمر قراردادها</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {faPercent(bottleneck.sharePercent)} از کل قراردادها ({faNumber(bottleneck.count)} مورد) در مرحله «{bottleneck.label}» متوقف مانده‌اند —
                بیشترین تراکم بین مراحل انتظار. اختصاص پیگیری فعال به این مرحله، بیشترین افزایش سرعت نهایی‌شدن قراردادها را ایجاد می‌کند.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* شفافیت منبع داده */}
      <DataSourceAlert
        show={Boolean(data && !data.dataSource.cached)}
        error={data?.dataSource.liveError}
        fallback="پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."
      >
        صورت وضعیت‌ها (قراردادها) از «سامانه مدیریت آگهی و درخواست» (آرم) با توکن پرسنلی استخراج می‌شود.
      </DataSourceAlert>

      {/* نمودار قیفی چرخه عمر */}
      {showFunnel && data && data.summary.totalCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" aria-hidden />
              قیف چرخه عمر قراردادها — از پیش‌نویس تا تنظیم سند
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5" role="img" aria-label="نمودار قیفی مراحل چرخه عمر قراردادها">
              {data.summary.funnel.map((stage, i) => (
                <div key={stage.status} className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`مرحله ${faNumber(i + 1)}`}>
                    {faNumber(i + 1)}
                  </span>
                  <span className="text-xs font-bold w-36 sm:w-44 shrink-0 truncate" title={stage.label}>{stage.label}</span>
                  <div className="flex-1 h-7 rounded-lg bg-muted overflow-hidden flex items-center" dir="rtl">
                    <div
                      className={`h-full ${funnelBarTone(stage.status)} flex items-center justify-start px-2 transition-all`}
                      style={{ width: `${Math.max(6, (stage.count / funnelMax) * 100)}%` }}
                      title={`${stage.label}: ${stage.count} قرارداد (${stage.sharePercent}٪)`}
                    >
                      <span className="text-[10px] text-white font-bold tabular-nums drop-shadow">
                        {stage.count > 0 ? `${faNumber(stage.count)} · ${faPercent(stage.sharePercent)}` : ""}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-14 shrink-0 text-left">{faNumber(stage.count)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              قیف مراحل مثبت چرخه عمر است؛ وضعیت‌های رد/فسخ ({faNumber(data.summary.rejectedTotal)} مورد) و «پرداخت شده» ({faNumber(data.summary.payedCount)} مورد) جداگانه محاسبه می‌شوند.
            </p>
          </CardContent>
        </Card>
      )}

      {/* فیلتر و جدول قراردادها */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" aria-hidden />
              لیست صورت وضعیت‌ها
              {data && <Badge variant="secondary" className="tabular-nums">({faNumber(data.total)})</Badge>}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); onSettingsChange({ defaultStatus: v }); }}>
                <SelectTrigger className="w-44 h-9 text-xs">
                  <SelectValue placeholder="همه وضعیت‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="rejected">رد / فسخ‌شده‌ها</SelectItem>
                  {CONTRACT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{CONTRACT_STATUS_FA[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="جست‌وجوی هولوگرام / کد آگهی / کد درخواست…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 h-9 text-xs"
              />
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                بازخوانی
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : !data || data.rows.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <ScrollText className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
              <p className="text-sm text-muted-foreground">
                قراردادی یافت نشد. پس از ورود با «کد پرسنلی + پیامک»، صورت وضعیت‌های واقعی سامانه به‌طور خودکار استخراج می‌شود.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border max-h-[30rem] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-12">ردیف</TableHead>
                    <TableHead>هولوگرام / کد آگهی / کد درخواست</TableHead>
                    <TableHead>نوع قرارداد</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>ثبت‌کننده</TableHead>
                    <TableHead>تاریخ ثبت</TableHead>
                    <TableHead className="w-16">جزئیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((c, i) => {
                    const badge = statusStyle(c.status);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                            {faNumber(i + 1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">
                          {c.contractHolo ?? "—"} / {c.propertyCode ?? "—"} / {c.requestCode ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs font-bold">{c.contractType ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${badge.style}`}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{c.creatorName ?? "—"}</TableCell>
                        <TableCell className="text-xs tabular-nums">{c.createdAt ? faJalaliShort(c.createdAt) : "—"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelected(c)} aria-label={`جزئیات قرارداد ${c.contractHolo ?? c.id}`}>
                            <Eye className="w-4 h-4 text-primary" aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* دیالوگ جزئیات قرارداد */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  جزئیات قرارداد
                  {selected.contractHolo && <Badge variant="outline" className="tabular-nums" dir="ltr">{selected.contractHolo}</Badge>}
                </DialogTitle>
                <DialogDescription>
                  عین ساختار «جزئیات صورت وضعیت» خود سامانه ملک تبریز
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {[
                  { label: "شماره هولوگرام", value: selected.contractHolo ?? "(خالی)" },
                  { label: "کد آگهی", value: selected.propertyCode ?? "(خالی)" },
                  { label: "کد درخواست", value: selected.requestCode ?? "(خالی)" },
                  { label: "نوع قرارداد", value: selected.contractType ?? "(خالی)" },
                  { label: "وضعیت", value: statusStyle(selected.status).label },
                  { label: "تاریخ ثبت", value: selected.createdAt ? faJalaliShort(selected.createdAt) : "(خالی)" },
                  { label: "تاریخ قرارداد", value: selected.contractDate ? faJalaliShort(selected.contractDate) : "(خالی)" },
                  { label: "تاریخ سند", value: selected.documentDate ? faJalaliShort(selected.documentDate) : "(خالی)" },
                  { label: "تاریخ تحویل", value: selected.deliveryDate ? faJalaliShort(selected.deliveryDate) : "(خالی)" },
                  { label: "عنوان ملک", value: selected.propertyTitle ?? "(خالی)" },
                  { label: "آدرس ملک", value: selected.propertyAddress ?? "(خالی)" },
                  { label: "ثبت‌کننده", value: selected.creatorName ?? "(خالی)" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between border-b pb-2.5">
                    <span className="font-bold text-xs">{row.label}</span>
                    <span className="text-muted-foreground font-normal text-xs max-w-[60%] text-left" title={row.value}>{row.value}</span>
                  </div>
                ))}

                {/* خریداران */}
                {selected.buyers.length > 0 && (
                  <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 p-3 space-y-2">
                    <p className="text-xs font-extrabold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" aria-hidden /> خریدار / خریداران
                    </p>
                    {selected.buyers.map((b, i) => (
                      <div key={i} className="flex justify-between items-center bg-background/70 rounded-lg px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center justify-center w-5 h-5 min-w-5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 text-[10px] font-bold tabular-nums">{faNumber(i + 1)}</span>
                          {b.fullName}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{b.mobileNumber || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* فروشندگان */}
                {selected.sellers.length > 0 && (
                  <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 p-3 space-y-2">
                    <p className="text-xs font-extrabold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" aria-hidden /> فروشنده / فروشندگان
                    </p>
                    {selected.sellers.map((s, i) => (
                      <div key={i} className="flex justify-between items-center bg-background/70 rounded-lg px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center justify-center w-5 h-5 min-w-5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 text-[10px] font-bold tabular-nums">{faNumber(i + 1)}</span>
                          {s.fullName}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{s.mobileNumber || "—"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* حق‌السهم مشاوران */}
                {selected.realtorShares.length > 0 && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 space-y-2">
                    <p className="text-xs font-extrabold text-amber-800 dark:text-amber-300">حق‌السهم مشاوران</p>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>نام مشاور</TableHead>
                            <TableHead>حق‌السهم</TableHead>
                            <TableHead>تأیید</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.realtorShares.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs tabular-nums">{faNumber(i + 1)}</TableCell>
                              <TableCell className="text-xs">{s.name}</TableCell>
                              <TableCell className="text-xs font-bold tabular-nums">{faPercent(s.unitPercent)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={
                                    s.confirmation === "confirm"
                                      ? "text-xs bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                                      : s.confirmation === "reject"
                                        ? "text-xs bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                        : "text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  }
                                >
                                  {s.confirmation === "confirm" ? "تایید" : s.confirmation === "reject" ? "رد" : "در انتظار"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
