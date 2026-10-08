"use client";

/**
 * سلول «فایل جهات» — ستون جهت/سمت فهرست درخواست‌ها (PN-020/گام اول-ب)
 * ---------------------------------------------------------------------------
 * دستور مالک (بند ۱ + ۳ بند ب):
 *   ۱. «ستون سمت به صورت رنگی شود» — هر جهت رنگ یکتای خود را از رجیستری
 *      رنگ معنایی ملکا دارد (شمال=آسمان · جنوب=سبز · شرق=بنفش · غرب=سرخ …)
 *   ۳. «در ستون جهت رکوردهایی که دارای موارد زیاد هستند بصورت فایل ارائه شود» —
 *      عین الگوی فایل مناطق (P6526/ب): تا ۳ جهت نشان رنگی درون‌خطی؛ بیش از آن
 *      چیپ «فایل جهات (N جهت)» که سند شماره‌دارِ رنگی را در صفحه‌گوشهٔ پایین باز می‌کند.
 *
 * دادهٔ خام sideNames رشتهٔ جداشده با «،» یا «,» است (مثال DB واقعی:
 * «شمال، جنوب، غرب، شرق، شمال غربی، …» — ۱۶٬۷۹۴ ردیف دارای جهت؛ ۱۲٬۰۰۰+ ردیف ≥۴ جهت).
 * تجزیه در این سلول انجام می‌شود (لایهٔ نمایش — قانون دادهٔ مقدس: هیچ تغییری در داده نیست).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { FileText, Compass } from "lucide-react";
import { faDigits, faNumber } from "@/lib/format";
import { valueSoftClass } from "@/lib/value-colors";

/** آستانهٔ فایل‌شدن — بیش از این تعداد جهت، نمایش فایل‌گونه است (عین الگوی مناطق) */
export const SIDES_FILE_THRESHOLD = 3;

/** تجزیهٔ رشتهٔ چندمقداری خام → آرایهٔ تمیز (جداکنندهٔ «،» فارسی و «,» لاتین)
 *  نیم‌فاصلهٔ درون‌واژه‌ای (مثل «سه‌در») عین منبع حفظ می‌شود — فقط فاصله‌های معمولی فشرده می‌شوند
 *  برای هر دو ستون «جهت» و «نوع ساخت» — دادهٔ خام عین DB است */
export function parseNameList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[،,]/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** نام مستعار معنایی برای ستون جهت (سمت) */
export const parseSideNames = parseNameList;

/** یک جهت — نشان رنگی از رجیستری (رنگ پایدار و یکتا برای هر جهت) */
function SideBadge({ side }: { side: string }) {
  return (
    <Badge variant="secondary" className={`gap-1 text-[10px] border-0 ${valueSoftClass(side)}`} title={`جهت ${side} — مورد پذیرش متقاضی`}>
      <Compass className="w-2.5 h-2.5" aria-hidden /> {side}
    </Badge>
  );
}

export function SideFileCell({ requestCode, sideNames }: { requestCode: string; sideNames: string | null }) {
  const [open, setOpen] = useState(false);
  const sides = parseSideNames(sideNames);

  // هنوز از سامانه تکمیل نشده — جای‌نگهدار شفاف
  if (sides.length === 0) {
    return <span className="text-muted-foreground text-[10px]">—</span>;
  }

  // تعداد کم — نشان‌های رنگی درون‌خطی (قانون فهرست: فشرده)
  if (sides.length <= SIDES_FILE_THRESHOLD) {
    return (
      <span className="inline-flex flex-wrap items-center justify-center gap-1 leading-relaxed">
        {sides.map((s, i) => (
          <SideBadge key={`${s}-${i}`} side={s} />
        ))}
      </span>
    );
  }

  // تعداد زیاد — نمایش فایل‌گونه (دستور ۳): چیپ + سند شماره‌دار رنگی
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs font-bold"
        data-testid="sides-file-button"
        aria-label={`فایل جهات درخواست کد ${faDigits(requestCode)} — ${faNumber(sides.length)} جهت`}
        onClick={() => setOpen(true)}
      >
        <FileText className="w-3.5 h-3.5 text-sec-m2-700 shrink-0" aria-hidden />
        فایل جهات
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums">
          {faNumber(sides.length)}
        </Badge>
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`فایل جهات — درخواست کد ${faDigits(requestCode)}`}
        description={`${faNumber(sides.length)} جهتِ مورد پذیرش متقاضی — عین دادهٔ سامانه ARM ملک تبریز (هر جهت با رنگ یکتای خود)`}
      >
        {/* سند جهات — فهرست شماره‌دار رنگی با اسکرول داخلی (ردیف جدول را نمی‌کشد) */}
        <div
          className="rounded-lg border bg-muted/20 overflow-y-auto"
          data-testid="sides-file-list"
          role="document"
          aria-label={`سند فهرست ${faNumber(sides.length)} جهتِ مورد پذیرش`}
        >
          <ol className="divide-y">
            {sides.map((s, i) => (
              <li key={`${s}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <span
                  className="w-6 h-6 min-w-6 inline-flex items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-[10px] tabular-nums"
                  aria-hidden
                >
                  {faNumber(i + 1)}
                </span>
                <SideBadge side={s} />
                <Compass className="w-3 h-3 text-sec-m2-700 ms-auto shrink-0" aria-hidden />
              </li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-muted-foreground text-center border-t pt-2 mt-2">
          پایان فایل — {faNumber(sides.length)} جهت در این سند ثبت شده است.
        </p>
      </BottomSheet>
    </>
  );
}
