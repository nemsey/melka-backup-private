"use client";

/**
 * جدول پوشش اطلاعات فهرست — مؤلفهٔ مشترک کاشی‌های چهارگانه (P6546/گام پنجم-الف-۲)
 * ------------------------------------------------------
 * «با داده های بینش پوشش اطلاعات فهرست در هر کاشی جدول پوشش اطلاعات فهرست آن کاشی
 *  را طراحی و ایجاد کن» — از /api/coverage می‌خواند و جدول جمع‌وجور ستون×پر/کل/درصد
 * با نوار پیشرفت و مسیر پر شدن هر ستون نشان می‌دهد.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Table2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { faNumber } from "@/lib/format";

export interface CoverageColumn {
  column: string;
  key: string;
  filled: number;
  total: number;
  percent: number;
  fillPath: string;
}

interface CoverageResponse {
  ok: boolean;
  generatedAt: string;
  tier: number;
  tiles: Record<string, { title: string; total: number; columns: CoverageColumn[] }>;
}

/** رنگ درصد بر اساس آستانه — سبز ≥۸۰ · فیروزه‌ای ≥۵۰ · کهربایی ≥۲۵ · سرخ <۲۵ */
function pctClass(p: number): string {
  if (p >= 80) return "bg-emerald-500";
  if (p >= 50) return "bg-teal-500";
  if (p >= 25) return "bg-amber-500";
  return "bg-rose-500";
}

export function TileCoverageTable({ tileKey, accentClass = "text-primary" }: { tileKey: "m1" | "m2" | "m3" | "m4"; accentClass?: string }) {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<CoverageResponse>("/api/coverage");
      setData(res);
    } catch (e) {
      setError((e as Error)?.message ?? "خطا در دریافت پوشش اطلاعات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const block = data?.tiles?.[tileKey];
  const overall = block && block.columns.length > 0 ? Math.round(block.columns.reduce((s, c) => s + c.percent, 0) / block.columns.length) : 0;

  return (
    <Card id={`coverage-table-${tileKey}`} data-testid={`coverage-table-${tileKey}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Table2 className={`w-5 h-5 shrink-0 ${accentClass}`} aria-hidden />
            <div className="min-w-0">
              {/* PN-003 گام ۴-۱ — توضیح زیر عنوان جدول حذف شد (دستور مالک) */}
              <p className="text-sm font-bold">جدول پوشش اطلاعات فهرست</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {block && (
              <Badge variant={overall >= 80 ? "default" : overall >= 50 ? "secondary" : "destructive"} className="gap-1">
                میانگین {faNumber(overall)}٪
              </Badge>
            )}
            <button type="button" className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1" onClick={() => void load()} aria-label="تازه‌سازی جدول پوشش">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : null}
              بروزرسانی
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        ) : block ? (
          <>
            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="p-2 text-start font-bold">ستون فهرست</th>
                      <th className="p-2 text-center font-bold w-20">پر</th>
                      <th className="p-2 text-center font-bold w-20">کل</th>
                      <th className="p-2 text-center font-bold w-16">درصد</th>
                      <th className="p-2 text-center font-bold w-24">نوار</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.columns.map((c) => (
                      <tr key={c.key} className="border-t hover:bg-muted/30" title={c.fillPath}>
                        {/* PN-011 رابعاً — توضیحات (مسیر پر شدن) زیر هر عنوان حذف شد (دستور مالک:
                            حفظ زیبایی بصری جدول) — مسیر همچنان با اشاره‌گر روی سطر قابل مشاهده است */}
                        <td className="p-2 font-medium">
                          {c.column}
                        </td>
                        <td className="p-2 text-center tabular-nums">{faNumber(c.filled)}</td>
                        <td className="p-2 text-center tabular-nums text-muted-foreground">{faNumber(c.total)}</td>
                        <td className="p-2 text-center tabular-nums font-bold">{faNumber(Math.round(c.percent))}٪</td>
                        <td className="p-2">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${pctClass(c.percent)} transition-all duration-500`} style={{ width: `${Math.min(100, c.percent)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* PN-003 گام ۴-۱ — پانوشت توضیحی زیر جدول حذف شد (دستور مالک) */}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
