"use client";

/**
 * جدول رتبه‌بندی ده‌گانه — مؤلفهٔ مشترک کاشی‌های چهارگانه (P6546/گام یک/دوم)
 * ------------------------------------------------------
 * «جدول ۱۰ کارشناسان پرآگهی» و «جدول ۱۰ قطب‌های عرضه» (و همتاهای درخواستی)
 * — رتبه · عنوان (کارشناس/منطقه) · تعداد · سهم ٪ + نوار نسبی؛ جمع‌وجور و رنگی.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { faNumber } from "@/lib/format";

export interface RankRow {
  label: string;
  count: number;
}

/** رنگ مدال سه رتبهٔ نخست */
const MEDAL_CLASS = ["bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", "bg-stone-500/15 text-stone-600 dark:text-stone-300 border-stone-500/30", "bg-orange-700/15 text-orange-800 dark:text-orange-300 border-orange-700/30"];

export function TopRankingTable({
  title,
  description,
  rows,
  countLabel,
  icon: Icon,
  accentClass = "text-primary",
  emptyText = "داده‌ای برای رتبه‌بندی موجود نیست — پس از بروزرسانی فهرست دوباره بررسی کنید.",
  id,
}: {
  title: string;
  /** PN-002 گام ۶-۱ — توضیح زیر عنوان حذف شد (دستور مالک)؛ فقط در صورت نیاز صریح */
  description?: string;
  rows: RankRow[];
  countLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass?: string;
  emptyText?: string;
  id?: string;
}) {
  const top = rows.slice(0, 10);
  const max = top[0]?.count ?? 0;
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card id={id} data-testid={id ? `${id}-card` : undefined}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${accentClass}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold">{title}</p>
            {description ? <p className="text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
          </div>
        </div>

        {top.length === 0 ? (
          <p className="text-xs text-muted-foreground leading-relaxed p-2 rounded-lg border border-dashed">{emptyText}</p>
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-center font-bold w-10">رتبه</th>
                    <th className="p-2 text-start font-bold">{countLabel}</th>
                    <th className="p-2 text-center font-bold w-16">تعداد</th>
                    <th className="p-2 text-center font-bold w-16">سهم</th>
                    <th className="p-2 text-center font-bold w-20">نوار</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r, i) => {
                    const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
                    const width = max > 0 ? Math.round((r.count / max) * 100) : 0;
                    return (
                      <tr key={r.label} className="border-t hover:bg-muted/30">
                        <td className="p-2 text-center">
                          {i < 3 ? (
                            <Badge variant="outline" className={`text-[10px] px-1.5 ${MEDAL_CLASS[i]}`}>
                              {faNumber(i + 1)}
                            </Badge>
                          ) : (
                            <span className="tabular-nums text-muted-foreground font-bold">{faNumber(i + 1)}</span>
                          )}
                        </td>
                        <td className="p-2 font-medium truncate max-w-40" title={r.label}>
                          {r.label}
                        </td>
                        <td className="p-2 text-center tabular-nums font-bold">{faNumber(r.count)}</td>
                        <td className="p-2 text-center tabular-nums text-muted-foreground">{faNumber(share)}٪</td>
                        <td className="p-2">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${i < 3 ? "bg-gradient-to-l from-amber-500 to-amber-400" : "bg-gradient-to-l from-teal-600 to-teal-400"} transition-all duration-500`} style={{ width: `${width}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {faNumber(top.length)} رتبهٔ برتر از مجموع {faNumber(rows.length)} مورد — محاسبه از دادهٔ زندهٔ فهرست همین کاشی.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
