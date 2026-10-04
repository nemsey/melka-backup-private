"use client";

/**
 * کاشی M6 «شاخص بازار ملک تبریز» — P6545/گام۲ BLOCK 2.2
 * ---------------------------------------------------------------------------
 * ۱) روند قیمت ماهانهٔ معاملات (شمسی — از فروردین ۱۴۰۴)
 * ۲) قیمت هر متر به تفکیک منطقه (۱۰ منطقهٔ پرتقاضا)
 * ۳) قیمت به تفکیک نوع ملک (آپارتمان/ویلا/زمین/مغازه)
 * ۴) مقایسهٔ معاملات واقعی با آگهی‌های فعال
 * ۵) نمودار سه‌سری: معاملات، آگهی‌ها، درخواست‌ها
 * داده: ۷۳۹ معاملهٔ واقعی + ۱۱٬۴۵۶ آگهی + ۷٬۳۹۹ درخواست — زنده از دیتابیس
 * رنگ: سبز لیمویی #65A30D (sec-m6)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TrendingUp, Building2, Landmark, ArrowLeftRight, RefreshCw } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, CartesianGrid } from "recharts";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { faDigits } from "@/lib/format";

interface MarketIndexData {
  dataSources: { transactions: number; transactionsWithPrice: number; listings: number; activeListings: number; requests: number };
  monthlyTrend: Array<{ month: string; monthLabel: string; medianPriceMilionToman: number; transactions: number }>;
  byArea: Array<{ area: string; listings: number; medianPricePerMeterMilionToman: number }>;
  byType: Array<{ type: string; listings: number; medianPricePerMeterMilionToman: number }>;
  txVsListing: { transactions: { count: number; medianTotalPriceMilionToman: number }; activeListings: { count: number; medianPricePerMeterMilionToman: number } };
  volume: Array<{ month: string; monthLabel: string; transactions: number; listings: number; requests: number }>;
}

export function MarketIndexPage({ onBack }: TilePageProps) {
  const [data, setData] = useState<MarketIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean } & MarketIndexData>("/api/market-index");
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای بارگذاری");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack ? <Button variant="outline" size="sm" onClick={onBack}>بازگشت</Button> : null}
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="size-5 text-sec-m6-500" /> شاخص بازار ملک تبریز</h2>
            <p className="text-xs text-muted-foreground">
              {data ? `${faDigits(data.dataSources.transactionsWithPrice)} معاملهٔ دارای قیمت · ${faDigits(data.dataSources.listings)} آگهی · ${faDigits(data.dataSources.requests)} درخواست` : "روند قیمت، مناطق، انواع ملک و حجم بازار"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="size-4" /> بروزرسانی</Button>
      </div>

      {loading && !data ? <Skeleton className="h-96 w-full" /> : null}
      {error ? <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card> : null}

      {data ? (
        <>
          {/* ۱) روند ماهانه */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">روند قیمت ماهانهٔ معاملات (میلیون تومان — میانه)</CardTitle></CardHeader>
            <CardContent>
              {data.monthlyTrend.length > 0 ? (
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="medianPriceMilionToman" name="میانهٔ قیمت (م تومان)" stroke="#65a30d" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-xs text-muted-foreground">داده‌ای برای این بازه نیست.</p>}
            </CardContent>
          </Card>

          {/* ۲ و ۳) منطقه و نوع */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Landmark className="size-4 text-sec-m6-500" /> قیمت هر متر — ۱۰ منطقهٔ پرتقاضا (م تومان)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byArea} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="area" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="medianPricePerMeterMilionToman" name="میانهٔ هر متر (م تومان)" fill="#65a30d" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="size-4 text-sec-m6-500" /> قیمت هر متر بر اساس نوع ملک (م تومان)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>نوع ملک</TableHead><TableHead>تعداد آگهی</TableHead><TableHead>میانهٔ هر متر</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.byType.map((t) => (
                      <TableRow key={t.type}>
                        <TableCell>{t.type}</TableCell>
                        <TableCell>{faDigits(t.listings)}</TableCell>
                        <TableCell>{t.listings > 0 ? `${faDigits(t.medianPricePerMeterMilionToman.toLocaleString("en-US"))} م` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* ۴) معامله در برابر آگهی */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ArrowLeftRight className="size-4 text-sec-m6-500" /> معاملات واقعی در برابر آگهی‌های فعال</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">معاملات واقعی ثبت‌شده</p>
                <p className="text-xl font-bold text-sec-m6-700">{faDigits(data.txVsListing.transactions.count)}</p>
                <p className="text-xs">میانهٔ قیمت کل: {faDigits(data.txVsListing.transactions.medianTotalPriceMilionToman.toLocaleString("en-US"))} میلیون تومان</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">آگهی‌های فعال (منتشر شده)</p>
                <p className="text-xl font-bold text-sec-m6-700">{faDigits(data.txVsListing.activeListings.count)}</p>
                <p className="text-xs">میانهٔ هر متر: {faDigits(data.txVsListing.activeListings.medianPricePerMeterMilionToman.toLocaleString("en-US"))} میلیون تومان</p>
              </div>
            </CardContent>
          </Card>

          {/* ۵) سری سه‌گانهٔ حجم */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">حجم ماهانه: معاملات · آگهی‌ها · درخواست‌ها</CardTitle></CardHeader>
            <CardContent>
              {data.volume.length > 0 ? (
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.volume}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="transactions" name="معاملات" stroke="#65a30d" strokeWidth={2} />
                      <Line type="monotone" dataKey="listings" name="آگهی‌ها" stroke="#2563eb" strokeWidth={2} />
                      <Line type="monotone" dataKey="requests" name="درخواست‌ها" stroke="#dc2626" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-xs text-muted-foreground">داده‌ای برای این بازه نیست.</p>}
              <p className="mt-2 text-[10px] text-muted-foreground">
                منبع: صورت‌وضعیت و کاتالوگ سامانه ARM ملک تبریز — اعداد زنده از دیتابیس؛ واحدها میلیون تومان
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default MarketIndexPage;
