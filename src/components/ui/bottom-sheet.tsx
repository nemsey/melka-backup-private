"use client";

/**
 * BottomSheet — صفحه‌گوشهٔ پایین (قانون ظاهر فاخر ملکا ۰۳۵-B — بخش ج/۹)
 * ----------------------------------------------------------------------
 * • روی همهٔ اندازه‌ها از پایین باز می‌شود (الگوی موبایل؛ روی دسکتاپ هم مجاز).
 * • دستگیرهٔ کشیدنیِ بصری + morevert حداکثر ۸۵vh + اسکرول داخلی + Safe-area.
 * • دسترس‌پذیری کامل ( Radix Dialog: aria + focus trap + Esc).
 */

import * as React from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto w-full max-w-2xl rounded-t-3xl border-t-2 border-primary/20 pb-[max(1rem,env(safe-area-inset-bottom))]",
          className
        )}
        aria-label={title}
      >
        {/* دستگیرهٔ کشیدنی */}
        <div aria-hidden className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="pb-2 text-right">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? <SheetDescription className="text-xs">{description}</SheetDescription> : null}
          <button
            type="button"
            aria-label="بستن"
            onClick={() => onOpenChange(false)}
            className="absolute top-3 start-3 rounded-full size-9 min-h-9 min-w-9 inline-flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </SheetHeader>
        <div className="overflow-y-auto max-h-[70vh] px-4 pb-2 text-sm" role="document" tabIndex={-1}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
