"use client";

/**
 * کاشی «شاخص قیمت روز مناطق» — صفحه داخلی
 * ------------------------------------------------------
 * • شاخص رسمی سامانه ARM (configs/current-prices) + مناطق تحت پوشش
 * • آمار واقعی بازار به تفکیک منطقه (میانه/چارک‌ها/کمینه/بیشینه هر متر)
 * • روند تغییر شاخص‌ها در زمان + هشدار جهش قیمتی
 * • پایش سلامت قیمت‌گذاری: آگهی‌های منحرف از شاخص منطقه
 */

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  RotateCcw,
  Gauge,
  MapPin,
  TrendingUp,
  Zap,
  HeartPulse,
  Database,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceAlert, useTileData } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { areaTrendMatrix } from "@/core/agent/analyzers";
import type { AreaPriceStat, DeviatingAd, PriceIndexConfig, PriceTrendPoint } from "@/lib/melk-api/types";
import type { AreaStatWithReliability } from "@/lib/melk-api/price-index";
import { faNumber, faPercent, faToman, faJalaliShortDateTime } from "@/lib/format";

interface IndexResponse {
  ok: boolean;
  indices: PriceIndexConfig[];
  areaStats: AreaStatWithReliability[];
  jumps: { areaName: string; changePercent: number; from: number; to: number }[];
  deviations: DeviatingAd[];
  overall: { medianPerMeter: number; coveredAreas: number; totalSamples: number } | null;
  trend: PriceTrendPoint[];
  categories: string[];
  dataSource: { real: boolean; liveIndices: boolean; marketSamples: number; liveError: string | null };
}

const CATEGORY_FA: Record<string, string> = {
  "apartment-sell": "آپارتمان (فروش)",
  "apartment-rent": "آپارتمان (اجاره)",
  "house-villa-sell": "خانه و ویلا (فروش)",
  "house-villa-rent": "خانه و ویلا (اجاره)",
  "office-commercial-sell": "اداری و تجاری (فروش)",
  "office-commercial-rent": "اداری و تجاری (اجاره)",
};

export function PriceIndexPage({ settings, onSettingsChange, userRole: _role, onBack: _back }: TilePageProps) {
  const [category, setCategory] = useState<string>(String(settings.defaultCategory ?? "all"));
  const showCharts = settings.showCharts !== false;

  const fetchIndex = useCallback(async () => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    return api<IndexResponse>(`/api/crm/price-index?${params.toString()}`);
  }, [category]);

  const { data, loading, reload } = useTileData(fetchIndex, { errorTitle: "خطا در محاسبه شاخص قیمت" });

  const maxMedian = useMemo(() => Math.max(1, ...(data?.areaStats.map((s) => s.medianPerMeter) ?? [1])), [data]);

  // سری روند برای نمودار خطی — گروه‌بندی ۵ منطقه برتر (منطق دامنه: analyzers) + فرمت تاریخ نمایش
  const trendChartData = useMemo(
    () =>
      areaTrendMatrix(data?.trend ?? []).map((r) => ({ ...r, date: faJalaliShortDateTime(`${r.date}T12:00:00`).split(" ")[0] })),
    [data]
  );

  return (
    <div className="space-y-6">
      <AgentPanel tileId="price-index" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "شاخص کل بازار", value: data?.overall ? faToman(data.overall.medianPerMeter) : undefined, sub: "(هر متر)", icon: Gauge, tone: "bg-primary/10 text-primary" },
          { label: "مناطق پوشش‌داده", value: data?.overall ? faNumber(data.overall.coveredAreas) : undefined, icon: MapPin, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "نمونه‌های بازار", value: data?.overall ? faNumber(data.overall.totalSamples) : undefined, icon: Database, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "هشدار جهش", value: data ? faNumber(data.jumps.length) : undefined, icon: Zap, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
            valueClassName="text-lg font-extrabold tabular-nums truncate"
            sub={kpi.sub}
          />
        ))}
      </div>

      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data)} error={data?.dataSource.liveError}>
        {data?.dataSource.liveIndices
          ? "پیکربندی شاخص‌های رسمی زنده از سامانه ARM (مناطق تحت پوشش و مشخصات فنی) دریافت شده است."
          : "پیکربندی شاخص رسمی در دسترس نیست؛ آمار بر پایه داده بازار محاسبه می‌شود."}
        {" "}آمار منطقه‌ای از {faNumber(data?.dataSource.marketSamples ?? 0)} آگهی واقعی بازار (با منطقه تطبیق‌شده) محاسبه می‌شود.
      </DataSourceAlert>

      {/* شاخص رسمی سامانه ARM */}
      {data && data.indices.length > 0 && (
        <Card className="border-s-4 border-s-primary/70">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" aria-hidden />
              شاخص رسمی سامانه ملک تبریز
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.indices.map((idx, i) => (
              <div key={idx.id} className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-extrabold">
                    <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums ml-2">{faNumber(i + 1)}</span>
                    {idx.tradeType} / {idx.buildingType} / {idx.propertyType} — {idx.city}
                  </p>
                  <div className="flex gap-1.5">
                    {idx.yearFrom && idx.yearTo && <Badge variant="outline" className="text-xs tabular-nums">{faNumber(idx.yearFrom)} — {faNumber(idx.yearTo)}</Badge>}
                    {idx.isRental && <Badge variant="secondary" className="text-xs">اجاره</Badge>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {faNumber(idx.areas.length)} منطقه تحت پوشش: {idx.areas.slice(0, 10).join("، ")}
                  {idx.areas.length > 10 ? ` و ${faNumber(idx.areas.length - 10)} منطقه دیگر` : ""}
                </p>
                {idx.details.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {idx.details.map((d) => (
                      <Badge key={d.label} variant="outline" className="text-[10px] font-normal">{d.label}: {d.value}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* هشدار جهش */}
      {data && data.jumps.length > 0 && (
        <Card className="border-s-4 border-s-amber-500/70">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" aria-hidden />
              هشدار تغییرات جهشی شاخص
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.jumps.map((j, i) => (
              <div key={j.areaName} className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-xs font-bold">
                  <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px] font-bold tabular-nums">{faNumber(i + 1)}</span>
                  {j.areaName}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-extrabold tabular-nums ${j.changePercent > 0 ? "text-rose-600 dark:text-rose-400" : "text-teal-600 dark:text-teal-400"}`}>
                  {j.changePercent > 0 ? <ArrowUpRight className="w-3.5 h-3.5" aria-hidden /> : <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />}
                  {faPercent(Math.abs(j.changePercent))} {j.changePercent > 0 ? "افزایش" : "کاهش"}
                  <span className="text-muted-foreground font-normal">({faToman(j.from)} ← {faToman(j.to)})</span>
                </span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-1">
              جهش = تغییر ≥ {faPercent(15)} شاخص منطقه نسبت به ثبت قبلی — پیش از مذاکره در این مناطق بازبینی قیمت‌های مشابه توصیه می‌شود.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="areas" dir="rtl">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
          <TabsTrigger value="areas" className="gap-1.5">مقایسه مناطق</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5">روند شاخص در زمان</TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5">پایش سلامت قیمت‌گذاری</TabsTrigger>
        </TabsList>

        {/* مقایسه مناطق */}
        <TabsContent value="areas" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" aria-hidden />
                  شاخص قیمت هر متر به تفکیک منطقه
                </span>
                <div className="flex items-center gap-2">
                  <Select value={category} onValueChange={(v) => { setCategory(v); onSettingsChange({ defaultCategory: v }); }}>
                    <SelectTrigger className="w-48 h-9 text-xs">
                      <SelectValue placeholder="همه دسته‌ها" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">همه دسته‌ها</SelectItem>
                      {data?.categories.map((c) => (
                        <SelectItem key={c} value={c}>{CATEGORY_FA[c] ?? c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                    بازخوانی
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !data || data.areaStats.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <MapPin className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    نمونه کافی برای آمار منطقه‌ای در دسترس نیست. با اجرای اسکن در کاشی «فایل‌یابی از دیوار»، آگهی‌های واقعی بازار جمع‌آوری و شاخص منطقه‌ای فعال می‌شود.
                  </p>
                </div>
              ) : (
                <div className="space-y-3" role="img" aria-label="مقایسه شاخص قیمت مناطق">
                  {data.areaStats.slice(0, 18).map((s, i) => (
                    <div key={`${s.areaName}-${s.category}`} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-bold">
                          <span className={`inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md ${s.reliable ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"} text-[10px] font-bold tabular-nums`}>{faNumber(i + 1)}</span>
                          {s.areaName}
                          {!s.reliable && (
                            <Badge variant="outline" className="text-[9px] font-normal text-muted-foreground">نمونه واحد</Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {faToman(s.medianPerMeter)}
                          {s.changePercent !== null && (
                            <span className={`ms-1.5 font-bold ${s.changePercent > 0 ? "text-rose-600 dark:text-rose-400" : "text-teal-600 dark:text-teal-400"}`}>
                              ({s.changePercent > 0 ? "+" : "−"}{faPercent(Math.abs(s.changePercent))})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden" dir="rtl">
                        <div
                          className={`h-full rounded-full ${
                            s.changePercent !== null && s.changePercent < -15
                              ? "bg-gradient-to-l from-teal-600 to-cyan-500"
                              : s.changePercent !== null && s.changePercent > 15
                                ? "bg-gradient-to-l from-rose-500 to-rose-400"
                                : "bg-gradient-to-l from-teal-600 to-cyan-500"
                          }`}
                          style={{ width: `${Math.max(6, (s.medianPerMeter / maxMedian) * 100)}%` }}
                          title={`${s.areaName}: میانه ${faToman(s.medianPerMeter)} · بازه ${faToman(s.p25PerMeter)} تا ${faToman(s.p75PerMeter)} · ${faNumber(s.sampleCount)} نمونه`}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        بازه چارکی: {faToman(s.p25PerMeter)} تا {faToman(s.p75PerMeter)} · {faNumber(s.sampleCount)} نمونه {category === "all" ? `· ${CATEGORY_FA[s.category] ?? s.category}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* روند شاخص در زمان */}
        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" aria-hidden />
                روند تغییر شاخص‌ها در زمان
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showCharts || trendChartData.length < 2 ? (
                <div className="py-10 text-center space-y-2">
                  <TrendingUp className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    روند زمانی با ثبت‌های بعدی شاخص (هر روز یک ثبت) ساخته می‌شود. امروز ثبت اول انجام شد؛ از فردا مقایسه زمانی فعال خواهد بود.
                  </p>
                </div>
              ) : (
                <div className="h-64" dir="rtl">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} reversed />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        orientation="right"
                        tickFormatter={(v: number) => (v >= 1_000_000 ? `${faNumber(Math.round(v / 1_000_000))}م` : faNumber(v))}
                      />
                      <RTooltip
                        contentStyle={{ direction: "rtl", borderRadius: "0.75rem", fontSize: "12px" }}
                        formatter={(v: number, name: string) => [faToman(v), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px", direction: "rtl" }} />
                      {Object.keys(trendChartData[0] ?? {})
                        .filter((k) => k !== "date")
                        .slice(0, 5)
                        .map((area, i, arr) => (
                          <Line
                            key={area}
                            type="monotone"
                            dataKey={area}
                            stroke={["#0d9488", "#f59e0b", "#e11d48", "#059669", "#78716c"][i % 5]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls
                          />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                هر ثبت روزانه، میانه قیمت هر متر منطقه را از آگهی‌های واقعی بازار محاسبه و به تاریخچه (فقط افزودنی) اضافه می‌کند — مبنای پایش جهش و روند بلندمدت.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* پایش سلامت قیمت‌گذاری */}
        <TabsContent value="health" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-primary" aria-hidden />
                پایش سلامت قیمت‌گذاری — انحراف از شاخص منطقه
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !data || data.deviations.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <HeartPulse className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    همه آگهی‌ها در بازه سالم شاخص منطقه خود قرار دارند (انحراف کمتر از {faPercent(30)} یا درون بازه چارکی) — قیمت‌گذاری کارشناسان سالم است.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border max-h-[26rem] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-12">ردیف</TableHead>
                          <TableHead>آگهی</TableHead>
                          <TableHead>منطقه</TableHead>
                          <TableHead>قیمت هر متر</TableHead>
                          <TableHead>شاخص منطقه</TableHead>
                          <TableHead>انحراف</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.deviations.map((d, i) => (
                          <TableRow key={d.token}>
                            <TableCell>
                              <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                                {faNumber(i + 1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs max-w-[16rem] truncate" title={d.title}>{d.title}</TableCell>
                            <TableCell className="text-xs">{d.areaName}</TableCell>
                            <TableCell className="text-xs tabular-nums">{faToman(d.pricePerMeter)}</TableCell>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">{faToman(d.medianPerMeter)}</TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-xs tabular-nums ${
                                  d.deviationPercent > 0
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                    : "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                                }`}
                              >
                                {d.deviationPercent > 0 ? "+" : "−"}{faPercent(Math.abs(d.deviationPercent))}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                    موارد قرمز (گران‌تر از شاخص + خارج از بازه چارکی) نیاز به بازنگری قیمت دارند؛ موارد سبز فرصت «زیر قیمت بازار» برای خریداران و ایجنت فایل‌یابی هستند.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
