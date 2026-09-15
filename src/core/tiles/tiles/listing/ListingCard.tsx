"use client";

/**
 * کارت فایل آگهی — شماره‌دار، با دو کلید انتقال (CRM / اینستاگرام) و جزییات
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Send, Instagram, FileText, UploadCloud, CheckCircle2, UserRound, Loader2 } from "lucide-react";
import { faNumber } from "@/lib/format";
import type { ListingRow } from "@/lib/listing/types";
import { faPriceText, extractPriceToman } from "@/lib/instagram/content";

export function ListingCard({
  listing,
  index,
  armToken,
  onDetails,
  onTransferCrm,
  onInstagram,
  busy,
}: {
  listing: ListingRow;
  index: number;
  armToken: boolean;
  onDetails: () => void;
  onTransferCrm: () => void;
  onInstagram: () => void;
  busy: string | null;
}) {
  const price = extractPriceToman(listing.inputs);
  const doneSteps = listing.completeness.filter((c) => c.done).length;
  const allDone = doneSteps === 5;
  const crmDone = Boolean(listing.crmTransferredAt);
  const igDone = Boolean(listing.instagramPublishedAt);

  return (
    <article
      className={`rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow p-4 space-y-3 ${
        allDone ? "border-emerald-300/60 dark:border-emerald-900" : "border-amber-300/60 dark:border-amber-900/60"
      }`}
    >
      {/* سربرگ: شماره فایل + منبع + وضعیت‌ها */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-400 text-white text-xs font-bold shadow" aria-hidden>
            {faNumber(index + 1)}
          </span>
          <h3 className="text-sm font-extrabold">فایل شمارة {faNumber(index + 1)}</h3>
          <Badge variant={listing.source === "manual" ? "default" : "secondary"} className="text-[10px] gap-1">
            {listing.source === "manual" ? (
              <>
                <UserRound className="w-3 h-3" aria-hidden /> ثبت دستی
              </>
            ) : (
              <>
                <Building2 className="w-3 h-3" aria-hidden /> از فایل‌یابی
              </>
            )}
          </Badge>
          {crmDone && (
            <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="w-3 h-3" aria-hidden /> منتقل به آرم
            </Badge>
          )}
          {igDone && (
            <Badge className="text-[10px] gap-1 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              <Instagram className="w-3 h-3" aria-hidden /> منتشر در اینستاگرام
            </Badge>
          )}
          {listing.isUrgent && <Badge className="text-[10px] bg-amber-500 text-amber-950">فوری</Badge>}
          {listing.isLuxury && <Badge variant="outline" className="text-[10px]">لوکس</Badge>}
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onDetails} aria-label={`جزییات فایل شماره ${faNumber(index + 1)}`}>
          <FileText className="w-3.5 h-3.5" aria-hidden /> جزییات
        </Button>
      </div>

      {/* مشخصات یک‌خطی */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {listing.propertyTypeName && <Badge variant="outline" className="text-[10px]">{listing.propertyTypeName}</Badge>}
        {listing.tradeTypeName && <Badge variant="outline" className="text-[10px]">{listing.tradeTypeName}</Badge>}
        {listing.lineName && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <MapPin className="w-3 h-3" aria-hidden /> {listing.lineName}
          </Badge>
        )}
        {listing.inputs["مساحت"] && <Badge variant="outline" className="text-[10px]">{faNumber(Number(listing.inputs["مساحت"]) || 0)} متر</Badge>}
        {price ? (
          <span className="rounded-full px-2.5 py-0.5 font-bold text-[11px] bg-gradient-to-l from-emerald-600 to-emerald-500 text-white shadow-sm">
            {faPriceText(price)}
          </span>
        ) : null}
      </div>

      {/* پیشرفت ۵ گامی */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>کامل‌بودن ۵ گام</span>
          <span className={allDone ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-amber-600 dark:text-amber-400 font-bold"}>
            {faNumber(doneSteps)} از ۵
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-l transition-all ${
              allDone ? "from-emerald-600 to-emerald-400" : "from-amber-500 to-amber-300"
            }`}
            style={{ width: `${(doneSteps / 5) * 100}%` }}
            role="progressbar"
            aria-valuenow={doneSteps}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-label="پیشرفت گام‌های فایل"
          />
        </div>
        <div className="flex gap-1">
          {listing.completeness.map((c) => (
            <span
              key={c.step}
              title={`گام ${faNumber(c.step)}: ${c.label}${c.done ? " (کامل)" : " (ناقص)"}`}
              className={`h-1.5 flex-1 rounded-full ${c.done ? "bg-emerald-500/70" : "bg-muted-foreground/20"}`}
            />
          ))}
        </div>
      </div>

      {/* دو کلید انتقال */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          size="sm"
          className="gap-1.5 h-9 text-xs bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow"
          onClick={onTransferCrm}
          disabled={!allDone || crmDone || busy === listing.id}
          aria-label="انتقال به سامانه CRM ملک تبریز"
        >
          {busy === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <UploadCloud className="w-3.5 h-3.5" aria-hidden />}
          {crmDone ? "منتقل شد" : "انتقال به CRM"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-9 text-xs border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          onClick={onInstagram}
          disabled={!listing.images.length && !listing.videos.length}
          aria-label="انتقال محتوا به اینستاگرام"
        >
          <Send className="w-3.5 h-3.5" aria-hidden />
          {igDone ? "انتشار مجدد" : "انتقال به اینستاگرام"}
        </Button>
      </div>
      {!armToken && !crmDone && (
        <p className="text-[10px] text-muted-foreground leading-4">انتقال به CRM نیازمند ورود با «کد پرسنلی + پیامک» (توکن آرم) است.</p>
      )}
      {!listing.images.length && !listing.videos.length && (
        <p className="text-[10px] text-muted-foreground leading-4">این فایل تصویر/ویدیو ندارد — برای انتشار اینستاگرام، نشانی تصویر را در دیالوگ انتشار وارد کنید.</p>
      )}
    </article>
  );
}
