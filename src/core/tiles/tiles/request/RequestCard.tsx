"use client";

/**
 * کارت درخواست ملک — شماره‌دار + نوار پیشرفت ۴ گامی + کلیدها:
 * «ویرایش» (بخش ت) + «ثبت رویداد» (بخش ت) + «ثبت در سامانه ARM» + «جزییات»
 */

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardList, MapPin, UserRound, Banknote, FileEdit, CalendarPlus, UploadCloud, Info, Building2,
} from "lucide-react";
import { faNumber } from "@/lib/format";
import type { RequestRow } from "@/lib/request/types";
import { locationLabel } from "@/lib/request/types";

const STEP_ICONS = [UserRound, MapPin, ClipboardList, Banknote];

export function RequestCard({
  request,
  index,
  showCompleteness,
  busy,
  onEdit,
  onEvent,
  onRegister,
  onDetails,
}: {
  request: RequestRow;
  index: number;
  showCompleteness: boolean;
  busy: boolean;
  onEdit: (r: RequestRow) => void;
  onEvent: (r: RequestRow) => void;
  onRegister: (r: RequestRow) => void;
  onDetails: (r: RequestRow) => void;
}) {
  const comp = request.completeness;
  const pct = Math.round((comp.completeCount / comp.total) * 100);

  return (
    <Card className="tile-pop shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* سربرگ کارت */}
        <div className="flex items-start gap-2.5">
          <span
            className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-teal-600/10 border border-teal-600/25 text-[10px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums shrink-0"
            aria-label={`درخواست ${faNumber(index + 1)}`}
            title={`ردیف ${faNumber(index + 1)}`}
          >
            {faNumber(index + 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="font-bold text-sm leading-5">{request.title}</h4>
              <Badge variant="outline" className="text-[9px]">{request.code}</Badge>
              {request.armRequestId ? (
                <Badge className="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1">
                  <UploadCloud className="w-3 h-3" aria-hidden /> ثبت‌شده در آرم
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[9px]">ثبت محلی</Badge>
              )}
              {request.status === "draft" && <Badge variant="outline" className="text-[9px] text-amber-700 dark:text-amber-300 border-amber-300">پیش‌نویس</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-5 truncate">
              <UserRound className="w-3 h-3 inline me-1" aria-hidden />
              {request.customerName} · <span dir="ltr">{request.customerMobile}</span>
              {request.eventCount > 0 && <> · {faNumber(request.eventCount)} رویداد</>}
            </p>
          </div>
        </div>

        {/* مشخصات کلیدی */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "نوع معامله", value: request.tradeTypeName, icon: ClipboardList },
            { label: "نوع ملک", value: `${request.propertyTypeName}`, icon: Building2 },
            { label: "بودجه", value: request.priceLabel, icon: Banknote },
            { label: "متراژ", value: request.spaceLabel, icon: MapPin },
          ].map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-lg bg-muted/50 px-2.5 py-1.5 min-w-0">
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <Icon className="w-2.5 h-2.5" aria-hidden /> {k.label}
                </p>
                <p className="text-[11px] font-bold truncate" title={k.value}>{k.value}</p>
              </div>
            );
          })}
        </div>

        {/* مکان + پرداخت/جدیت */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="truncate"><MapPin className="w-3 h-3 inline me-1" aria-hidden /> {locationLabel(request.areaNames, request.lineNames)}</span>
          <span><Banknote className="w-3 h-3 inline me-1" aria-hidden /> پرداخت {request.paymentMethodName} · جدیت {request.seriousnessName}</span>
        </div>

        {/* نوار پیشرفت ۴ گامی */}
        {showCompleteness && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>کامل‌بودن ۴ گام (عین فرم آرم)</span>
              <span className="tabular-nums">{faNumber(comp.completeCount)} از {faNumber(comp.total)}</span>
            </div>
            <Progress value={pct} indicatorClassName={pct === 100 ? "bg-gradient-to-l from-emerald-600 to-emerald-400" : "bg-gradient-to-l from-teal-600 to-teal-400"} />
            <div className="flex items-center gap-3 flex-wrap">
              {comp.steps.map((s, i) => {
                const Icon = STEP_ICONS[i];
                return (
                  <span key={s.step} className={`inline-flex items-center gap-1 text-[9px] ${s.complete ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`} title={s.label}>
                    <Icon className="w-2.5 h-2.5" aria-hidden /> {s.label}
                    {s.complete ? " ✓" : " ○"}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* کلیدها */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => onEdit(request)} disabled={busy}>
            <FileEdit className="w-3.5 h-3.5" aria-hidden /> ویرایش
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 border-teal-400 text-teal-700 hover:bg-teal-50 dark:text-teal-300" onClick={() => onEvent(request)} disabled={busy}>
            <CalendarPlus className="w-3.5 h-3.5" aria-hidden /> ثبت رویداد
          </Button>
          {!request.armRequestId && (
            <Button size="sm" className="gap-1.5 h-8 bg-gradient-to-l from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600" onClick={() => onRegister(request)} disabled={busy}>
              <UploadCloud className="w-3.5 h-3.5" aria-hidden /> ثبت در سامانه ARM
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5 h-8 ms-auto" onClick={() => onDetails(request)} disabled={busy}>
            <Info className="w-3.5 h-3.5" aria-hidden /> جزییات
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** نمایشگر رویداد (برای دیالوگ جزییات) */
export function EventChip({ eventName, date, hour, synced }: { eventName: string; date?: string | null; hour?: string | null; synced?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px]">
      <Checkbox checked={Boolean(synced)} className="pointer-events-none w-3 h-3" aria-hidden tabIndex={-1} />
      {eventName}
      {date && <span className="text-muted-foreground">{date}{hour ? ` ${hour}` : ""}</span>}
    </span>
  );
}
