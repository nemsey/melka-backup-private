"use client";

/**
 * کاشی «باشگاه مشتریان» — صفحه داخلی
 * ------------------------------------------------------
 * • جامعه مشتریان از داده واقعی: معاملات + قراردادها + مشاوران
 * • مشتریان تکراری (خریدار و فروشنده همزمان) — برنامه وفادارسازی
 * • رشد جامعه مشتریان در زمان (هجری شمسی)
 * • فهرست‌های مرجع زنده سامانه ARM: شخصیت / شغل / نقش / جدیت
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Users, Repeat, TrendingUp, Briefcase, Heart, Fingerprint, Building2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { AgentPanel } from "@/components/app/AgentPanel";
import { DataSourceAlert, type DataSourceInfo } from "@/components/app/shared";
import { KpiCard } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import type { CustomerClubMember, CustomerClubSummary, RefListItem } from "@/lib/melk-api/types";
import { faNumber, faPercent, faMonthLabel } from "@/lib/format";

interface ClubResponse {
  ok: boolean;
  summary: CustomerClubSummary;
  repeatMembers: CustomerClubMember[];
  branches: { branch: string; consultantCount: number }[];
  dataSource: DataSourceInfo & { catalogsLive: boolean };
}

function roleBadge(role: "BUYER" | "SELLER" | "EXPERT"): { label: string; style: string } {
  if (role === "BUYER") return { label: "خریدار", style: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" };
  if (role === "SELLER") return { label: "فروشنده", style: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" };
  return { label: "مشاور", style: "bg-primary/10 text-primary" };
}

export function CustomerClubPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [data, setData] = useState<ClubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const showCharts = settings.showCharts !== false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ClubResponse>("/api/crm/customer-club");
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در تحلیل باشگاه مشتریان", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const s = data?.summary;
  const growthData = (s?.growthSeries ?? []).map((g) => ({ month: faMonthLabel(g.key), count: g.count }));
  const catalog: { key: keyof CustomerClubSummary["catalogs"]; label: string; icon: typeof Users; tone: string; items: RefListItem[] }[] = s
    ? [
        { key: "characters", label: "شخصیت مشتریان", icon: Fingerprint, tone: "text-rose-600 bg-rose-100 dark:bg-rose-950 dark:text-rose-300", items: s.catalogs.characters },
        { key: "jobs", label: "شغل مشتریان", icon: Briefcase, tone: "text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300", items: s.catalogs.jobs },
        { key: "roles", label: "نقش مشتریان", icon: Users, tone: "text-teal-600 bg-teal-100 dark:bg-teal-950 dark:text-teal-300", items: s.catalogs.roles },
        { key: "seriousness", label: "جدیت مشتریان", icon: Heart, tone: "text-teal-600 bg-teal-100 dark:bg-teal-950 dark:text-teal-300", items: s.catalogs.seriousness },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AgentPanel tileId="customer-club" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "اعضای جامعه", value: s ? faNumber(s.totalMembers) : undefined, icon: Users, tone: "bg-primary/10 text-primary" },
          { label: "مشتریان تکراری", value: s ? `${faNumber(s.repeatCustomers)} (${faPercent(s.totalMembers > 0 ? Math.round((s.repeatCustomers / s.totalMembers) * 100) : 0)})` : undefined, icon: Repeat, tone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
          { label: "خریداران", value: s ? faNumber(s.buyers) : undefined, icon: TrendingUp, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "فروشندگان", value: s ? faNumber(s.sellers) : undefined, icon: Building2, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
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

      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data && (data.dataSource.catalogsLive || !data.dataSource.cached))} error={data?.dataSource.liveError}>
        {data?.dataSource.catalogsLive
          ? "فهرست‌های مرجع (شخصیت/شغل/نقش/جدیت) زنده از سامانه ARM دریافت می‌شوند."
          : "فهرست‌های مرجع در دسترس نیست؛ داده کش‌شده نمایش داده می‌شود."}
        {data?.dataSource.cached
          ? " جامعه مشتریان از معاملات و قراردادهای همگام‌شده محاسبه می‌شود."
          : " پس از ورود با کد پرسنلی و پیامک، جامعه مشتریان از معاملات واقعی ساخته می‌شود."}
      </DataSourceAlert>

      {/* نمودار رشد جامعه */}
      {showCharts && growthData.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" aria-hidden />
              رشد جامعه مشتریان در زمان (هجری شمسی)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" dir="rtl">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clubGrowth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} reversed />
                  <YAxis tick={{ fontSize: 10 }} orientation="right" allowDecimals={false} />
                  <RTooltip
                    contentStyle={{ direction: "rtl", borderRadius: "0.75rem", fontSize: "12px" }}
                    formatter={(v: number) => [`${faNumber(v)} مشتری جدید`, undefined]}
                  />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#clubGrowth)" name="مشتریان جدید" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              هر نقطه، تعداد مشتریانی است که برای اولین‌بار در آن ماه وارد معاملات ملک تبریز شده‌اند — شاخص سلامت قیف جذب.
            </p>
          </CardContent>
        </Card>
      )}

      {/* تب‌های تحلیل جامعه */}
      <Tabs defaultValue="repeat" dir="rtl">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
          <TabsTrigger value="repeat" className="gap-1.5">مشتریان تکراری</TabsTrigger>
          <TabsTrigger value="top" className="gap-1.5">پرکارترین مشتریان</TabsTrigger>
          <TabsTrigger value="catalogs" className="gap-1.5">فهرست‌های مرجع سامانه</TabsTrigger>
        </TabsList>

        {/* مشتریان تکراری */}
        <TabsContent value="repeat" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-rose-600" aria-hidden />
                  مشتریان تکراری — خریدار و فروشنده همزمان
                </span>
                <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                  بازخوانی
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !data || data.repeatMembers.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Repeat className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    مشتری دوطرفه‌ای هنوز شناسایی نشده است. با ثبت معاملات جدید، خریدارانی که بعدها فروشنده شوند به‌طور خودکار شناسایی می‌شوند.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border max-h-[24rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-12">ردیف</TableHead>
                        <TableHead>نام مشتری</TableHead>
                        <TableHead>نقش‌ها</TableHead>
                        <TableHead>خرید</TableHead>
                        <TableHead>فروش</TableHead>
                        <TableHead>آخرین حضور</TableHead>
                        <TableHead>تماس</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.repeatMembers.map((m, i) => (
                        <TableRow key={m.name}>
                          <TableCell>
                            <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                              {faNumber(i + 1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-bold">{m.name}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {m.roles.map((r) => {
                                const b = roleBadge(r);
                                return <Badge key={r} variant="secondary" className={`text-[10px] ${b.style}`}>{b.label}</Badge>;
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">{faNumber(m.buyerCount)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{faNumber(m.sellerCount)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.lastSeen ? faMonthLabel(new Date(m.lastSeen).toISOString().slice(0, 7)) : "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums" dir="ltr">{m.mobile ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                این گروه اعتماد دوطرفه‌ای به برند ملک تبریز دارند — بهترین مخاطب برنامه وفادارسازی، پیشنهاد اختصاصی و معرفی خدمات جدید.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* پرکارترین مشتریان */}
        <TabsContent value="top" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" aria-hidden />
                پرکارترین مشتریان جامعه
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !s || s.topCustomers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">پس از همگام‌سازی معاملات، پرکارترین مشتریان نمایش داده می‌شوند.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {s.topCustomers.map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center justify-center w-6 h-6 min-w-6 rounded-lg bg-gradient-to-b from-teal-600 to-cyan-500 text-white text-[10px] font-bold tabular-nums">
                          {faNumber(i + 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{m.name}</p>
                          <p className="text-[10px] text-muted-foreground">{faNumber(m.buyerCount + m.sellerCount)} حضور در معاملات</p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {m.roles.map((r) => {
                          const b = roleBadge(r);
                          return <Badge key={r} variant="secondary" className={`text-[10px] ${b.style}`}>{b.label}</Badge>;
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* فهرست‌های مرجع سامانه ARM */}
        <TabsContent value="catalogs" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {catalog.map((c) => (
              <Card key={c.key}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <c.icon className={`w-5 h-5 p-0.5 rounded-md ${c.tone}`} aria-hidden />
                      {c.label}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">({faNumber(c.items.length)})</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {c.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">فهرست در دسترس نیست — پس از اتصال سامانه دریافت می‌شود.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {c.items.map((item, i) => (
                        <Badge key={item.id} variant="outline" className="text-xs gap-1 font-normal">
                          <span className="text-[9px] text-muted-foreground tabular-nums">{faNumber(i + 1)}</span>
                          {item.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
