"use client";

/**
 * کاشی M7 «پوشش اطلاعات ملک تبریز» — P6545/گام۲ BLOCK 2.3
 * ---------------------------------------------------------------------------
 * ۱) جدول پوشش هر ستون در ۴ کاشی M1-M4
 * ۲) نمودار میله‌ای درصد پوشش
 * ۳) فهرست رکوردهای ناقص
 * ۴) پیشنهاد پر کردن (مسیر پر شدن هر ستون)
 * ۵) نمایش Tier فعلی (بینش Tier-aware)
 * رنگ: آبی #2563EB (sec-m7)
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Database, RefreshCw, ShieldCheck } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api } from "@/lib/client/api";
import { faDigits } from "@/lib/format";

interface CoverageColumn { column: string; key: string; filled: number; total: number; percent: number; fillPath: string }
interface CoverageData {
  tier: number;
  tierBasis: { linkedOutcomes: number; distinctPeriods: number };
  tiles: Record<"m1" | "m2" | "m3" | "m4", { title: string; total: number; columns: CoverageColumn[] }>;
  incompleteRecords: {
    m1: Array<{ link: string; code: string; title: string | null; missing: string[] }>;
    m2: Array<{ link: string; title: string | null; missing: string[] }>;
  };
}

const pctColor = (p: number) => (p >= 95 ? "text-emerald-600" : p >= 70 ? "text-amber-600" : "text-red-600");

export function DataCoveragePage({ onBack }: TilePageProps) {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api<{ ok: boolean } & CoverageData>("/api/coverage");
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div data-negin="morvarid" className="space-y-4 p-4 md:p-6">
      {/* نگین (PN-024) — میلهٔ گوهر morvarid */}
      <div className="negin-bar" aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack ? <Button variant="outline" size="sm" onClick={onBack}>بازگشت</Button> : null}
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Database className="size-5 text-sec-m7-500" /> پوشش اطلاعات ملک تبریز</h2>
            <p className="text-xs text-muted-foreground">درصد پر بودن هر ستون در کاشی‌های M1-M4 + مسیر پر شدن + رکوردهای ناقص</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <Badge variant="outline" className="gap-1"><ShieldCheck className="size-3" /> Tier {faDigits(data.tier)} — بینش Tier-aware</Badge>
          ) : null}
          <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="size-4" /> بروزرسانی</Button>
        </div>
      </div>

      {loading && !data ? <Skeleton className="h-96 w-full" /> : null}

      {data ? (
        <>
          {(Object.keys(data.tiles) as Array<keyof CoverageData["tiles"]>).map((k) => {
            const tile = data.tiles[k];
            return (
              <Card key={k}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {tile.title} <Badge variant="outline" className="ml-1">{faDigits(tile.total)} ردیف</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Table>
                    <TableHeader><TableRow><TableHead>ستون</TableHead><TableHead>پر / کل</TableHead><TableHead>درصد پوشش</TableHead><TableHead>مسیر پر شدن</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {tile.columns.map((c) => (
                        <TableRow key={c.key}>
                          <TableCell className="text-xs">{c.column}</TableCell>
                          <TableCell className="text-xs tabular-nums">{faDigits(c.filled)} / {faDigits(c.total)}</TableCell>
                          <TableCell className="w-40">
                            <div className="flex items-center gap-2">
                              <Progress value={c.percent} className="h-1.5 flex-1" />
                              <span className={`text-xs tabular-nums font-medium ${pctColor(c.percent)}`}>{faDigits(c.percent)}٪</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground max-w-64">{c.fillPath}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {tile.columns.length > 0 ? (
                    <div className="h-40" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tile.columns.map((c) => ({ name: c.column, percent: c.percent }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="percent" name="درصد پوشش" fill="#2563eb" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">رکوردهای ناقص — نمونه (با لینک مستقیم)</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium">آگهی‌ها (M1)</p>
                <div className="space-y-1">
                  {data.incompleteRecords.m1.slice(0, 6).map((r) => (
                    <div key={r.code} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                      <span className="truncate">{faDigits(r.code)} — {r.title ?? "بدون عنوان"}</span>
                      <span className="flex gap-1">{r.missing.map((m) => <Badge key={m} variant="destructive" className="text-[9px]">{m}</Badge>)}</span>
                    </div>
                  ))}
                  {data.incompleteRecords.m1.length === 0 ? <p className="text-xs text-muted-foreground">نمونهٔ ناقصی نیست.</p> : null}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium">درخواست‌ها (M2)</p>
                <div className="space-y-1">
                  {data.incompleteRecords.m2.slice(0, 6).map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                      <span className="truncate">{r.title ?? "بدون عنوان"}</span>
                      <span className="flex gap-1">{r.missing.map((m) => <Badge key={m} variant="destructive" className="text-[9px]">{m}</Badge>)}</span>
                    </div>
                  ))}
                  {data.incompleteRecords.m2.length === 0 ? <p className="text-xs text-muted-foreground">نمونهٔ ناقصی نیست.</p> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default DataCoveragePage;
