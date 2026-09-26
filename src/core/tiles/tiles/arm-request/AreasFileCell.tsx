"use client";

/**
 * سلول «فایل مناطق» — ستون مناطق فهرست درخواست‌ها (P6526/ب)
 * ---------------------------------------------------------------------------
 * دستور مالک: «در ستون مناطق، فهرست درخواست برخی از رکوردها دارای مناطق
 * زیادی هستند؛ لذا رکوردهای ستون مناطق بصورت یک فایل نمایش داده شود.»
 *
 * رفتار:
 *   • ۰ منطقه            → جای‌نگهدار شفاف «در نوبت تکمیل از سامانه»
 *   • ۱ تا ۳ منطقه        → متن سادهٔ درون‌خطی (فشرده — ردیف کشیده نمی‌شود)
 *   • بیش از ۳ منطقه      → چیپ «فایل مناطق (N منطقه)» که با کلیک، «فایل»
 *                            مناطق را در دیالوگ سندمانند باز می‌کند: سرصفحهٔ
 *                            سند (کد درخواست)، شمار مناطق، و فهرست شماره‌دار
 *                            تمام مناطق با اسکرول داخلی.
 *
 * قانون فهرست (AGENTS.md §6): سلول‌های جدول همیشه text-xs — فونت یکدست؛
 * این سلول نیز از همان قانون پیروی می‌کند (فونت درشت در سلول وجود ندارد).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, MapPin } from "lucide-react";
import { faDigits, faNumber } from "@/lib/format";

/** آستانهٔ فایل‌شدن — بیش از این تعداد، مناطق به شکل «فایل» نمایش داده می‌شوند */
export const AREAS_FILE_THRESHOLD = 3;

export function AreasFileCell({ requestCode, areaNames }: { requestCode: string; areaNames: string[] }) {
  const [open, setOpen] = useState(false);

  // هنوز از سامانه تکمیل نشده — جای‌نگهدار شفاف
  if (!areaNames || areaNames.length === 0) {
    return <span className="text-muted-foreground">در نوبت تکمیل از سامانه</span>;
  }

  // تعداد کم — متن سادهٔ درون‌خطی (قانون فهرست: فشرده و یک‌خطی حداکثر)
  if (areaNames.length <= AREAS_FILE_THRESHOLD) {
    return (
      <span className="inline-flex items-start gap-1.5 leading-relaxed">
        <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" aria-hidden />
        {areaNames.join("، ")}
      </span>
    );
  }

  // تعداد زیاد — نمایش فایل‌گونه (دستور ب): چیپ + دیالوگ سند مناطق
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs font-bold"
          data-testid="areas-file-button"
          aria-label={`فایل مناطق درخواست کد ${faDigits(requestCode)} — ${faNumber(areaNames.length)} منطقه`}
        >
          <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" aria-hidden />
          فایل مناطق
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums">
            {faNumber(areaNames.length)}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-md" data-testid="areas-file-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-teal-600 shrink-0" aria-hidden />
            فایل مناطق — درخواست کد {faDigits(requestCode)}
          </DialogTitle>
          <DialogDescription>
            {faNumber(areaNames.length)} منطقهٔ منتخب این درخواست — عین دادهٔ سامانه ARM ملک تبریز؛
            برای بستن فایل، دکمهٔ بستن یا کلید Esc را بزنید.
          </DialogDescription>
        </DialogHeader>
        {/* سند مناطق — فهرست شماره‌دار با اسکرول داخلی (سند بلند، ردیف جدول را نمی‌کشد) */}
        <div
          className="rounded-lg border bg-muted/20 max-h-[60vh] overflow-y-auto"
          data-testid="areas-file-list"
          role="document"
          aria-label={`سند فهرست ${faNumber(areaNames.length)} منطقهٔ منتخب`}
        >
          <ol className="divide-y">
            {areaNames.map((name, i) => (
              <li key={`${name}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <span
                  className="w-6 h-6 min-w-6 inline-flex items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-[10px] tabular-nums"
                  aria-hidden
                >
                  {faNumber(i + 1)}
                </span>
                <span className="font-medium leading-relaxed">{name}</span>
                <MapPin className="w-3 h-3 text-rose-500 ms-auto shrink-0" aria-hidden />
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground text-center border-t pt-2">
          پایان فایل — {faNumber(areaNames.length)} منطقه در این سند ثبت شده است.
        </p>
      </DialogContent>
    </Dialog>
  );
}
